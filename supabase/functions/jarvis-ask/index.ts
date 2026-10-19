import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildContext, buildPrompt, parseReply, validateAction } from "./core.js";
import { coachToday, nextSession, mission, todayISO } from "./derive.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODELS = (Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash,gemini-3.1-flash-lite").split(",").map((s) => s.trim());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const say = (text: string) => json({ say: text, action: null, applied: false });

async function askGemini(key: string, prompt: string): Promise<{ text?: string; quota?: boolean }> {
  let quota = false;
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 400 },
      }),
    });
    if (r.status === 429) { quota = true; continue; }
    if (r.status === 404) continue;
    if (!r.ok) throw new Error(`Gemini ${r.status}`);
    const d = await r.json();
    const text = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    return { text };
  }
  return { quota };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: user } = await sb.auth.getUser();
  if (!user?.user) return json({ error: "unauthorized" }, 401);

  let question = "";
  try { question = String((await req.json())?.question || "").slice(0, 600).trim(); } catch { /* leer */ }
  if (!question) return say("Ich habe keine Frage verstanden, Master Leon.");

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return say("Mir fehlt noch der Gemini-Schlüssel, Master Leon.");

  const today = todayISO(new Date());
  const since = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  const [days, settings, briefing, tasks, apps, mails] = await Promise.all([
    sb.from("days").select("data").gte("id", since).order("id", { ascending: false }),
    sb.from("settings").select("data").eq("id", "main").maybeSingle(),
    sb.from("jarvis_briefings").select("text,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("jarvis_tasks").select("id,title,due_date").eq("done", false).order("due_date", { ascending: true, nullsFirst: false }).limit(30),
    sb.from("jarvis_applications").select("id,company,city,status,next_step,sent_at"),
    sb.from("jarvis_mails").select("id,from_name,subject,summary").eq("done", false).order("received_at", { ascending: false }).limit(15),
  ]);
  const dayList = (days.data || []).map((r: { data: Record<string, unknown> }) => r.data);
  const st = (settings.data?.data || {}) as Record<string, unknown>;
  const ctx = buildContext({
    today,
    coach: coachToday(dayList.find((d: { date?: string }) => d.date === today), st),
    session: nextSession(dayList, st, today),
    briefing: briefing.data,
    tasks: tasks.data || [],
    apps: apps.data || [],
    mails: mails.data || [],
    mission: mission(apps.data || [], today),
  });

  let reply;
  try {
    const g = await askGemini(key, buildPrompt(ctx, question));
    if (g.text === undefined) {
      return say(g.quota ? "Mein Sprachkontingent ist für heute erschöpft, Master Leon." : "Das Sprachmodell ist gerade nicht erreichbar, Master Leon.");
    }
    reply = parseReply(g.text);
  } catch (e) {
    console.error(e);
    return say("Das Sprachmodell ist gerade nicht erreichbar, Master Leon.");
  }

  let applied = false;
  const action = reply.action;
  if (action) {
    const check = validateAction(action, {
      taskIds: new Set((tasks.data || []).map((t: { id: string }) => t.id)),
      mailIds: new Set((mails.data || []).map((m: { id: string }) => m.id)),
      appIds: new Set((apps.data || []).map((a: { id: string }) => a.id)),
    });
    if (check.ok) {
      let res;
      if (action.type === "add_task") res = await sb.from("jarvis_tasks").insert({ title: action.title, due_date: action.due_date || null, source: "leon" });
      if (action.type === "complete_task") res = await sb.from("jarvis_tasks").update({ done: true }).eq("id", action.id);
      if (action.type === "mark_mail_done") res = await sb.from("jarvis_mails").update({ done: true }).eq("id", action.id);
      if (action.type === "set_application_status") res = await sb.from("jarvis_applications").update({ status: action.status }).eq("id", action.id);
      applied = !res?.error;
      if (applied) await sb.from("jarvis_log").insert({ text: `Sprachbefehl: ${action.type.replace(/_/g, " ")}`, status: "erledigt" });
    }
    return json({ say: reply.say, action: check.ok ? action : { ...action, rejected: check.reason }, applied });
  }
  return json({ say: reply.say, action: null, applied });
});
