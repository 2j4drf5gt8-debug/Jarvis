// Steuerung der Claude-Version (angeheftetes Artefakt): kein Login, Daten über Connector, Antworten von Claude.
import { loadAll, ask, completeTask, setApplicationStatus, cachedModel, freshBriefing, DataError } from './data-claude.js';
import { viewModel } from './core/view.js';
import { parseCommand } from './core/derive.js';
import { renderAll } from './render.js';
import { speak } from './voice.js';

const S = () => window.JarvisScene;
const $ = id => document.getElementById(id);
let view = null;
let busy = false;
let pendingConfirm = null;
let voiceOn = true;

function store(key, val) { try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch { return null; } }

function reply(text, { voice = true } = {}) {
  S()?.setMode('ANTWORT');
  S()?.type(`„${text}“`, () => S()?.setMode('BEREIT'));
  speak(text, voice && voiceOn);
}

function show(m) {
  view = viewModel(m);
  renderAll(view);
}

async function refresh({ say = true } = {}) {
  try {
    const m = await loadAll();
    show(m);
    if (say) S()?.type(view.briefing.text);
    S()?.setMode('BEREIT');
    return true;
  } catch (e) {
    console.error(e);
    S()?.setMode(e instanceof DataError && e.code === 'no_mcp' ? 'OFFLINE' : 'WARTE');
    S()?.type(e.message || 'Ich kann die Daten gerade nicht laden, Master Leon.');
    return false;
  }
}

function announceDueOnce() {
  if (!view || !['rot', 'heute'].includes(view.due.level)) return;
  const key = 'jarvis-due-spoken';
  if (store(key) === view.today) return;
  store(key, view.today);
  const t = view.due.task;
  reply(view.due.level === 'heute'
    ? `Master Leon, die Frist für ${t.title} läuft heute ab.`
    : `Master Leon, die Frist für ${t.title} läuft in Kürze ab.`);
}

async function runCommand(cmd) {
  const sc = S();
  switch (cmd) {
    case 'hilfe': return reply('Befehle, Master Leon: briefing, scan, fallakte, alarm, signal, ton und neu laden. Alles andere beantworte ich als Frage.', { voice: false });
    case 'briefing': {
      if (busy) return;
      busy = true; S()?.setMode('ANALYSIERE');
      try { const t = await freshBriefing(); await refresh({ say: false }); reply(t); }
      catch (e) { reply(e.message || 'Das Briefing ist mir misslungen, Master Leon.', { voice: false }); }
      finally { busy = false; }
      return;
    }
    case 'scan': sc.scan(); return reply(`Scan abgeschlossen. ${view?.mission.active ?? 0} aktive Bewerbungen, ${view?.mails.length ?? 0} offene Nachrichten.`);
    case 'fallakte': sc.openCase(true); return reply('Fallakte Praktikum geöffnet.', { voice: false });
    case 'alarm': { const on = !sc.isAlarm(); sc.setAlarm(on); return reply(on ? 'Alarmstufe Rot.' : 'Alarm aufgehoben.'); }
    case 'signal': sc.signal(); return reply('Signal gesendet, Master Leon.');
    case 'ton': voiceOn = !voiceOn; sc.setSound(voiceOn); store('jarvis-voice', voiceOn ? '1' : '0'); return reply(voiceOn ? 'Akustik aktiviert.' : 'Akustik deaktiviert.', { voice: false });
    case 'neu laden': S()?.setMode('LADE'); if (await refresh({ say: false })) reply('Daten aktualisiert.', { voice: false }); return;
  }
}

async function handle(input) {
  const text = input.trim();
  if (!text || busy) return;
  if (/^briefing$/i.test(text)) return runCommand('briefing');
  const c = parseCommand(text);
  if (c) return runCommand(c.cmd);
  busy = true;
  S()?.setMode('ANALYSIERE');
  try {
    const r = await ask(text);
    if (r.action?.rejected === 'bestaetigung' && r.action.type === 'set_application_status') {
      const app = view?.apps.find(a => a.id === r.action.id);
      askConfirm(`Status von ${app?.company || 'Bewerbung'} auf „${r.action.status.replace('_', ' ')}“ setzen?`, async () => {
        try { await setApplicationStatus(r.action.id, r.action.status); await refresh({ say: false }); reply('Erledigt, Master Leon.'); }
        catch (e) { console.error(e); reply('Die Änderung ist fehlgeschlagen, Master Leon.', { voice: false }); }
      });
    }
    reply(r.say || 'Dazu habe ich keine Antwort, Master Leon.');
    if (r.applied) await refresh({ say: false });
  } finally { busy = false; }
}

function askConfirm(text, onYes) {
  pendingConfirm = onYes;
  $('confirmText').textContent = text;
  $('confirm').hidden = false;
}
$('yes').addEventListener('click', async () => { $('confirm').hidden = true; const f = pendingConfirm; pendingConfirm = null; if (f) await f(); });
$('no').addEventListener('click', () => { $('confirm').hidden = true; pendingConfirm = null; reply('Verstanden, keine Änderung.', { voice: false }); });

// In Claude gibt es kein Mikrofon für Seiten: Globus/Mikro führen ins Eingabefeld.
function talk() {
  announceDueOnce();
  $('q').focus();
  if (!store('jarvis-claude-noasr')) {
    store('jarvis-claude-noasr', '1');
    reply('In Claude tippen Sie Ihre Frage bitte, Master Leon. Ich lese die Antwort vor.', { voice: false });
  }
}
for (const el of [$('gl'), $('mic')]) {
  el.addEventListener('click', talk);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); talk(); } });
}
$('ask').addEventListener('submit', e => { e.preventDefault(); announceDueOnce(); const v = $('q').value; $('q').value = ''; S()?.blip(660); handle(v); });
$('snd').addEventListener('click', () => runCommand('ton'));
document.querySelectorAll('[data-cmd]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); runCommand(a.dataset.cmd); }));

$('todo').addEventListener('click', async e => {
  const b = e.target.closest('[data-done]');
  if (!b) return;
  b.disabled = true;
  try { await completeTask(b.dataset.done); S()?.blip(880); await refresh({ say: false }); reply('Erledigt, Master Leon.', { voice: false }); }
  catch (err) { console.error(err); b.disabled = false; reply('Das konnte ich nicht abhaken, Master Leon.', { voice: false }); }
});

async function start() {
  voiceOn = store('jarvis-voice') !== '0';
  const cached = cachedModel();
  if (cached) { show(cached); S()?.type(view.briefing.text); }
  else S()?.type('Verbinde mit der Datenbank, Master Leon …');
  await refresh({ say: !cached });
  setInterval(() => refresh({ say: false }), 5 * 60e3);
}
start();
