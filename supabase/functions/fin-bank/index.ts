// fin-bank: Bankanbindung der Finanz-App über Enable Banking (PSD2, nur eigene Konten).
// Aktionen (POST, angemeldet): status | setup | aspsps | start | sync | disconnect
// GET mit ?code&state: Rücksprung von der Bank.  POST mit x-cron-secret: Hintergrund-Sync aller Verbindungen.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const EB = "https://api.enablebanking.com";
const FN_URL = `${SB_URL}/functions/v1/fin-bank`;
const APP_URL = "https://2j4drf5gt8-debug.github.io/Jarvis/finanzen/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function cfg(): Promise<Record<string, string>> {
  const { data } = await sb.from("private_config").select("key,value");
  return Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
}

/* ---------- JWT (RS256) ---------- */
const b64url = (b: Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : b;
  let s = ""; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
function derLen(n: number) { if (n < 128) return [n]; const o = []; while (n > 0) { o.unshift(n & 255); n >>= 8; } return [0x80 | o.length, ...o]; }
function pkcs1ToPkcs8(pkcs1: Uint8Array) {
  const algo = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const oct = [0x04, ...derLen(pkcs1.length), ...pkcs1];
  const body = [0x02, 0x01, 0x00, ...algo, ...oct];
  return new Uint8Array([0x30, ...derLen(body.length), ...body]);
}
async function importKey(pem: string) {
  const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  let der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (isPkcs1) der = pkcs1ToPkcs8(der);
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}
async function makeJwt(appId: string, pem: string) {
  const iat = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const body = b64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp: iat + 3600 }));
  const key = await importKey(pem);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

class EbError extends Error { status: number; constructor(m: string, s: number) { super(m); this.status = s; } }
async function eb(c: Record<string, string>, path: string, init: RequestInit = {}, psu?: Record<string, string>) {
  if (!c.eb_app_id || !c.eb_private_key) throw new EbError("Enable Banking ist noch nicht eingerichtet.", 412);
  const jwt = await makeJwt(c.eb_app_id, c.eb_private_key);
  const r = await fetch(EB + path, { ...init, headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", ...(psu || {}), ...(init.headers || {}) } });
  const t = await r.text();
  let d: any = null; try { d = t ? JSON.parse(t) : null; } catch { d = { raw: t }; }
  if (!r.ok) throw new EbError(d?.message || d?.detail || d?.error || `Enable Banking antwortet mit ${r.status}`, r.status);
  return d;
}

/* ---------- Sync ---------- */
const BAL_ORDER = ["ITBD", "CLBD", "ITAV", "CLAV", "XPCD", "OPBD", "OTHR", "INFO", "VALU"];
const cents = (a: string | number) => Math.round(parseFloat(String(a)) * 100);
async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
const mask = (iban?: string) => { const s = (iban || "").replace(/\s/g, ""); return s.length >= 8 ? `${s.slice(0, 4)} **** ${s.slice(-4)}` : (s || null); };
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Zahlungsdienstleister, hinter denen der eigentliche Händler steckt
const PROCESSORS = /landesbank hessen|paypal|adyen|nexi|sumup|klarna|sg-vr payment|stripe|worldline|concardis|payone|wirecard|lastschrift aus kartenzahlung/i;
function describe(t: any, debit: boolean) {
  const party = debit ? t.creditor : t.debtor;
  const ultimate = debit ? t.ultimate_creditor : t.ultimate_debtor;
  const rem = Array.isArray(t.remittance_information) ? t.remittance_information.join(" ") : (t.remittance_information || "");
  const extra = [t.note, t.bank_transaction_code?.description, t.merchant_category_code ? `MCC ${t.merchant_category_code}` : ""].filter(Boolean).join(" · ");
  let purpose = (rem || extra || "").trim() || null;
  let name = (party?.name || "").trim();
  const ult = (ultimate?.name || "").trim();
  if (ult && (!name || PROCESSORS.test(name))) name = ult;
  if (/paypal/i.test(name) && purpose) {
    const m = purpose.match(/Ihr Einkauf bei\s+([^,]+?)\s*$/i) || purpose.match(/\.\s*([^,.]{2,40}),\s*Ihr Einkauf/i);
    if (m && m[1].trim()) name = `${m[1].trim()} (PayPal)`;
  }
  if (!name && !rem && extra) name = extra.split(" · ")[0];
  return { counterparty: name || null, purpose };
}

function categorize(t: any, rules: any[]) {
  const sign = t.amount_cents < 0 ? -1 : 1;
  for (const r of rules) {
    if (r.amount_sign && r.amount_sign !== sign) continue;
    const hay = (r.field === "purpose" ? t.purpose : r.field === "iban" ? t.counterparty_iban_masked : t.counterparty) || "";
    if (hay.toLowerCase().includes(String(r.pattern).toLowerCase())) return r.category_id;
  }
  return null;
}

async function syncConnection(c: Record<string, string>, conn: any, psu?: Record<string, string>, reparse = false) {
  const run = await sb.from("fin_sync_runs").insert({ user_id: conn.user_id, connection_id: conn.id, source: "psd2" }).select("id").single();
  let inserted = 0, skipped = 0; const errors: string[] = [];
  try {
    if (conn.consent_valid_until && new Date(conn.consent_valid_until) < new Date()) {
      await sb.from("fin_bank_connections").update({ status: "expired" }).eq("id", conn.id);
      throw new Error("Die Freigabe der Bank ist abgelaufen. Bitte neu verbinden.");
    }
    const { data: accounts } = await sb.from("fin_accounts").select("*").eq("connection_id", conn.id).eq("archived", false);
    const { data: rules } = await sb.from("fin_category_rules").select("*").eq("user_id", conn.user_id).order("priority");
    for (const acc of accounts || []) {
      // Saldo
      try {
        const b = await eb(c, `/accounts/${acc.provider_account_id}/balances`, {}, psu);
        const list = b?.balances || [];
        const pick = BAL_ORDER.map((t) => list.find((x: any) => x.balance_type === t)).find(Boolean) || list[0];
        if (pick) await sb.from("fin_accounts").update({ balance_cents: cents(pick.balance_amount.amount), currency: pick.balance_amount.currency || "EUR" }).eq("id", acc.id);
      } catch (e) { errors.push(`${acc.name}: Saldo – ${(e as Error).message}`); }

      // Umsätze
      const { data: last } = await sb.from("fin_transactions").select("booked_on").eq("account_id", acc.id).eq("status", "booked").order("booked_on", { ascending: false }).limit(1);
      const from = last?.length && !reparse ? new Date(Date.parse(last[0].booked_on) - 10 * 864e5) : new Date(Date.now() - 730 * 864e5);
      const rows: any[] = []; let key: string | null = null; let page = 0;
      let dateFrom = isoDay(from);
      do {
        const qs = new URLSearchParams({ date_from: dateFrom });
        if (key) qs.set("continuation_key", key);
        let d: any;
        try { d = await eb(c, `/accounts/${acc.provider_account_id}/transactions?${qs}`, {}, psu); }
        catch (e) {
          // Erstabruf: manche Banken geben nur 90 Tage her
          if ((!last?.length || reparse) && page === 0 && !key && dateFrom !== isoDay(new Date(Date.now() - 89 * 864e5))) { dateFrom = isoDay(new Date(Date.now() - 89 * 864e5)); continue; }
          errors.push(`${acc.name}: Umsätze – ${(e as Error).message}`); break;
        }
        rows.push(...(d?.transactions || []));
        key = d?.continuation_key || null; page++;
      } while (key && page < 50);

      const seen: Record<string, number> = {};
      const seenOld: Record<string, number> = {};
      const out: any[] = [];
      for (const t of rows) {
        const st = t.status === "BOOK" ? "booked" : t.status === "PDNG" ? "pending" : null;
        if (!st) continue;
        const debit = t.credit_debit_indicator === "DBIT";
        const amount = Math.abs(cents(t.transaction_amount?.amount ?? 0)) * (debit ? -1 : 1);
        if (!amount) continue;
        const day = t.booking_date || t.value_date || t.transaction_date;
        if (!day) continue;
        const { counterparty, purpose } = describe(t, debit);
        const iban = debit ? t.creditor_account?.iban : t.debtor_account?.iban;
        const ext = t.entry_reference || t.transaction_id || null;
        const base = [acc.id, day, amount, (counterparty || "").toLowerCase(), (purpose || "").toLowerCase().replace(/\s+/g, " ")].join("|");
        seen[base] = (seen[base] || 0) + 1;
        const row: any = {
          user_id: conn.user_id, account_id: acc.id, booked_on: day, value_on: t.value_date || null,
          amount_cents: amount, currency: t.transaction_amount?.currency || "EUR",
          counterparty, counterparty_iban_masked: mask(iban), purpose, status: st, external_id: ext, raw: t,
          dedupe_hash: st === "pending" ? "p:" + (await sha(base + "|" + seen[base])) : (ext ? "x:" + ext : await sha(base + "|" + seen[base])),
        };
        const cat = categorize(row, rules || []);
        row.category_id = cat; row.category_source = cat ? "rule" : null;
        if (reparse && st === "booked") {
          // alte Kennung (erste Version: nur creditor/debtor + remittance) finden und Zeile aktualisieren
          const oldCp = ((debit ? t.creditor?.name : t.debtor?.name) || "").toLowerCase();
          const oldPur = ((Array.isArray(t.remittance_information) ? t.remittance_information.join(" ") : t.remittance_information) || "").toLowerCase().replace(/\s+/g, " ");
          const oldBase = [acc.id, day, amount, oldCp, oldPur].join("|");
          seenOld[oldBase] = (seenOld[oldBase] || 0) + 1;
          const oldHash = ext ? "x:" + ext : await sha(oldBase + "|" + seenOld[oldBase]);
          const upd: any = { counterparty: row.counterparty, purpose: row.purpose, raw: t, dedupe_hash: row.dedupe_hash };
          const { data: hit } = await sb.from("fin_transactions").update(upd).eq("account_id", acc.id).eq("dedupe_hash", oldHash).select("id,category_source");
          if (hit?.length) {
            if (cat && hit[0].category_source !== "manual") await sb.from("fin_transactions").update({ category_id: cat, category_source: "rule" }).eq("id", hit[0].id).is("category_id", null);
            continue;
          }
        }
        out.push(row);
      }
      // Vorgemerkte Buchungen werden bei jedem Abruf neu gesetzt
      await sb.from("fin_transactions").delete().eq("account_id", acc.id).eq("status", "pending");
      for (let i = 0; i < out.length; i += 500) {
        const { data, error } = await sb.from("fin_transactions").upsert(out.slice(i, i + 500), { onConflict: "account_id,dedupe_hash", ignoreDuplicates: true }).select("id");
        if (error) { errors.push(`${acc.name}: Speichern – ${error.message}`); break; }
        inserted += (data || []).length;
      }
      skipped += out.length - inserted;
      await sb.from("fin_accounts").update({ last_sync_at: new Date().toISOString() }).eq("id", acc.id);
    }
    await sb.from("fin_bank_connections").update({ last_error: errors.length ? errors.join("; ").slice(0, 900) : null }).eq("id", conn.id);
  } catch (e) {
    errors.push((e as Error).message);
    await sb.from("fin_bank_connections").update({ last_error: (e as Error).message }).eq("id", conn.id);
  }
  await sb.from("fin_sync_runs").update({ finished_at: new Date().toISOString(), inserted, skipped, error: errors.join("; ") || null }).eq("id", run.data?.id);
  return { connection: conn.aspsp_name, inserted, errors };
}

/* ---------- Rücksprung von der Bank ---------- */
async function callback(url: URL) {
  const back = (p: Record<string, string>) => Response.redirect(APP_URL + "?" + new URLSearchParams(p), 302);
  const state = url.searchParams.get("state") || "";
  const { data: conn } = await sb.from("fin_bank_connections").select("*").eq("id", state).eq("status", "pending").maybeSingle();
  if (!conn) return back({ bank: "error", msg: "Unbekannte oder schon verwendete Anfrage." });
  if (!url.searchParams.get("code")) {
    const msg = url.searchParams.get("error_description") || url.searchParams.get("error") || "Abgebrochen";
    await sb.from("fin_bank_connections").update({ status: "error", last_error: msg }).eq("id", conn.id);
    return back({ bank: "error", msg });
  }
  const c = await cfg();
  try {
    const s = await eb(c, "/sessions", { method: "POST", body: JSON.stringify({ code: url.searchParams.get("code") }) });
    await sb.from("fin_bank_connections").update({ status: "active", session_id: s.session_id, consent_valid_until: s.access?.valid_until || conn.consent_valid_until, last_error: null }).eq("id", conn.id);
    const accs = s.accounts || [];
    if (!accs.length) {
      await sb.from("fin_bank_connections").update({ last_error: "Die Bank hat keine Konten freigegeben. Ist das Konto im Enable-Banking-Control-Panel verknüpft?" }).eq("id", conn.id);
      return back({ bank: "empty", name: conn.aspsp_name });
    }
    for (const a of accs) {
      const uid = typeof a === "string" ? a : a.uid;
      const iban = typeof a === "string" ? null : a.account_id?.iban;
      const isTR = /trade republic/i.test(conn.aspsp_name);
      const name = (typeof a !== "string" && (a.name || a.product)) || (isTR ? "Verrechnungskonto" : "Girokonto");
      const { data: ex } = await sb.from("fin_accounts").select("id").eq("user_id", conn.user_id).eq("provider_account_id", uid).maybeSingle();
      if (ex) await sb.from("fin_accounts").update({ connection_id: conn.id, archived: false }).eq("id", ex.id);
      else await sb.from("fin_accounts").insert({
        user_id: conn.user_id, connection_id: conn.id, provider_account_id: uid, name, bank_name: conn.aspsp_name,
        iban_masked: mask(iban), type: isTR ? "tagesgeld" : "giro", source: "psd2", currency: (typeof a !== "string" && a.currency) || "EUR",
      });
    }
    const { data: fresh } = await sb.from("fin_bank_connections").select("*").eq("id", conn.id).single();
    const r = await syncConnection(c, fresh);
    await sb.rpc("fin_detect_contracts").then(() => null, () => null);
    return back({ bank: "ok", name: conn.aspsp_name, n: String(r.inserted) });
  } catch (e) {
    await sb.from("fin_bank_connections").update({ status: "error", last_error: (e as Error).message }).eq("id", conn.id);
    return back({ bank: "error", msg: (e as Error).message });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.has("state")) return callback(url);

  const c = await cfg();
  // Hintergrund-Sync (pg_cron)
  if (req.headers.get("x-cron-secret")) {
    if (req.headers.get("x-cron-secret") !== c.cron_secret) return json({ error: "unauthorized" }, 401);
    const { data: conns } = await sb.from("fin_bank_connections").select("*").eq("status", "active");
    const cb = await req.json().catch(() => ({}));
    const out = [];
    for (const conn of conns || []) out.push(await syncConnection(c, conn, undefined, !!cb.reparse));
    if (cb.detect !== false) await sb.rpc("fin_detect_contracts").then(() => null, () => null);
    return json({ synced: out });
  }

  // Angemeldeter Nutzer
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await sb.auth.getUser(token);
  const user = u?.user;
  if (!user) return json({ error: "Nicht angemeldet." }, 401);
  // Nur der Besitzer darf die Bankfunktion nutzen – auch wenn sich jemand anders registrieren könnte.
  if (!c.owner_user_id || user.id !== c.owner_user_id) return json({ error: "Kein Zugriff." }, 403);
  const body = await req.json().catch(() => ({}));
  const psu = { "Psu-Ip-Address": (req.headers.get("x-forwarded-for") || "").split(",")[0].trim(), "Psu-User-Agent": req.headers.get("user-agent") || "Finanzen" };

  try {
    switch (body.action) {
      case "status": {
        return json({ configured: !!(c.eb_app_id && c.eb_private_key), redirect_url: FN_URL });
      }
      case "setup": {
        const appId = String(body.app_id || "").trim(); const pem = String(body.pem || "").trim();
        if (!/^[0-9a-f-]{36}$/i.test(appId)) return json({ error: "Die App-ID sieht nicht richtig aus (Format aaaaaaaa-bbbb-…)." }, 400);
        if (!pem.includes("PRIVATE KEY")) return json({ error: "Das ist keine .pem-Schlüsseldatei." }, 400);
        await eb({ eb_app_id: appId, eb_private_key: pem }, "/aspsps?country=DE"); // Test: Schlüssel gültig?
        await sb.from("private_config").upsert([{ key: "eb_app_id", value: appId }, { key: "eb_private_key", value: pem }], { onConflict: "key" });
        return json({ ok: true });
      }
      case "aspsps": {
        const d = await eb(c, `/aspsps?country=${encodeURIComponent(body.country || "DE")}&psu_type=personal`);
        return json({ aspsps: (d.aspsps || []).map((a: any) => ({ name: a.name, country: a.country, max: a.maximum_consent_validity, beta: a.beta })) });
      }
      case "start": {
        const name = String(body.name || ""); const country = String(body.country || "DE");
        const max = Math.min(Number(body.max) || 180 * 86400, 180 * 86400);
        const validUntil = new Date(Date.now() + (max - 3600) * 1000).toISOString();
        const { data: conn, error } = await sb.from("fin_bank_connections").insert({ user_id: user.id, aspsp_name: name, aspsp_country: country, consent_valid_until: validUntil }).select("id").single();
        if (error) throw error;
        const r = await eb(c, "/auth", { method: "POST", body: JSON.stringify({ access: { valid_until: validUntil }, aspsp: { name, country }, state: conn.id, redirect_url: FN_URL, psu_type: "personal" }) });
        return json({ url: r.url });
      }
      case "sync": {
        let q = sb.from("fin_bank_connections").select("*").eq("user_id", user.id).eq("status", "active");
        if (body.connection_id) q = q.eq("id", body.connection_id);
        const { data: conns } = await q;
        const out = [];
        for (const conn of conns || []) out.push(await syncConnection(c, conn, psu));
        await sb.rpc("fin_detect_contracts").then(() => null, () => null);
        return json({ synced: out });
      }
      case "disconnect": {
        const { data: conn } = await sb.from("fin_bank_connections").select("*").eq("id", body.connection_id).eq("user_id", user.id).maybeSingle();
        if (!conn) return json({ error: "Verbindung nicht gefunden." }, 404);
        if (conn.session_id) await eb(c, `/sessions/${conn.session_id}`, { method: "DELETE" }).catch(() => null);
        await sb.from("fin_bank_connections").update({ status: "revoked" }).eq("id", conn.id);
        return json({ ok: true });
      }
      default: return json({ error: "Unbekannte Aktion." }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, (e as EbError).status && (e as EbError).status < 500 ? 400 : 500);
  }
});
