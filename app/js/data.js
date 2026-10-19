import { SUPABASE_URL, SUPABASE_KEY, ASK_URL, WEATHER_URL } from './config.js';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
const CACHE = 'jarvis-last-model';

export async function session() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message.includes('Invalid') ? 'E-Mail oder Passwort stimmt nicht.' : 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
}
export async function signOut() { await sb.auth.signOut(); }

function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export async function loadAll() {
  const since = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  try {
    const [days, settings, briefing, mails, apps, tasks, log] = await Promise.all([
      sb.from('days').select('data').gte('id', since).order('id', { ascending: false }),
      sb.from('settings').select('data').eq('id', 'main').maybeSingle(),
      sb.from('jarvis_briefings').select('text,created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('jarvis_mails').select('id,from_name,subject,summary,category,priority,received_at').eq('done', false).order('received_at', { ascending: false }).limit(20),
      sb.from('jarvis_applications').select('*').order('updated_at', { ascending: false }),
      sb.from('jarvis_tasks').select('*').eq('done', false).order('due_date', { ascending: true, nullsFirst: false }),
      sb.from('jarvis_log').select('ts,text,status').order('ts', { ascending: false }).limit(8),
    ]);
    const model = {
      days: (must(days, 'Coach-Tage') || []).map(r => r.data),
      settings: must(settings, 'Einstellungen')?.data || {},
      briefing: must(briefing, 'Briefing'),
      mails: must(mails, 'Mails') || [],
      apps: must(apps, 'Bewerbungen') || [],
      tasks: must(tasks, 'Aufgaben') || [],
      log: must(log, 'Protokoll') || [],
      online: true,
      loadedAt: new Date().toISOString(),
    };
    try { localStorage.setItem(CACHE, JSON.stringify(model)); } catch { /* Speicher nicht verfügbar */ }
    return model;
  } catch (e) {
    console.error(e);
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { /* ignorieren */ }
    if (cached) return { ...cached, online: false };
    throw e;
  }
}

export async function completeTask(id) { must(await sb.from('jarvis_tasks').update({ done: true }).eq('id', id), 'Aufgabe'); }
export async function addTask(title, due_date = null) { must(await sb.from('jarvis_tasks').insert({ title, due_date, source: 'leon' }), 'Aufgabe'); }
export async function setApplicationStatus(id, status) {
  must(await sb.from('jarvis_applications').update({ status }).eq('id', id), 'Bewerbung');
  await sb.from('jarvis_log').insert({ text: `Bewerbungsstatus geändert: ${status.replace('_', ' ')}`, status: 'erledigt' });
}

export async function ask(question) {
  const s = await session();
  if (!s) return { say: 'Bitte melden Sie sich zuerst an, Master Leon.', action: null, applied: false };
  try {
    const r = await fetch(ASK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}`, apikey: SUPABASE_KEY },
      body: JSON.stringify({ question }),
    });
    if (r.status === 401) return { say: 'Ihre Sitzung ist abgelaufen, Master Leon. Bitte neu anmelden.', action: null, applied: false };
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch (e) {
    console.error(e);
    return { say: 'Ich erreiche meinen Server gerade nicht, Master Leon.', action: null, applied: false };
  }
}

const WX = { 0: 'KLAR', 1: 'HEITER', 2: 'WOLKIG', 3: 'BEDECKT', 45: 'NEBEL', 48: 'NEBEL', 51: 'NIESEL', 53: 'NIESEL', 55: 'NIESEL', 61: 'REGEN', 63: 'REGEN', 65: 'STARKREGEN', 80: 'SCHAUER', 81: 'SCHAUER', 82: 'SCHAUER', 95: 'GEWITTER' };
export async function weather() {
  try {
    const d = await (await fetch(WEATHER_URL)).json();
    return { temp: Math.round(d.current.temperature_2m), text: WX[d.current.weather_code] || 'OVIEDO' };
  } catch { return null; }
}
