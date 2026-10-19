import { session, signIn, signOut, loadAll, ask, completeTask, setApplicationStatus, weather } from './data.js';
import { viewModel } from './core/view.js';
import { parseCommand } from './core/derive.js';
import { renderAll, renderWeather } from './render.js';
import { listen, stopListening, speak, canListen } from './voice.js';

const S = () => window.JarvisScene;
const $ = id => document.getElementById(id);
let view = null;
let busy = false;
let pendingConfirm = null;

function store(key, val) { try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch { return null; } }

function reply(text, { voice = true } = {}) {
  S()?.setMode('ANTWORT');
  S()?.type(`„${text}“`, () => S()?.setMode('BEREIT'));
  speak(text, voice);
}

async function refresh() {
  try {
    const m = await loadAll();
    view = viewModel(m);
    renderAll(view);
    S()?.type(view.briefing.text);
    if (!m.online) S()?.setMode('OFFLINE');
  } catch (e) {
    console.error(e);
    S()?.type('Ich kann die Daten gerade nicht laden, Master Leon.');
  }
}

// Frist ≤ 2 Tage: einmal pro Tag ansagen (beim ersten Tippen, weil Browser Sprache erst nach einer Geste erlauben)
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
    case 'hilfe': return reply('Verfügbare Befehle, Master Leon: scan, fallakte, alarm, signal, ton und neu laden. Alles andere beantworte ich als Frage.', { voice: false });
    case 'scan': sc.scan(); return reply(`Scan abgeschlossen. ${view?.mission.active ?? 0} aktive Bewerbungen, ${view?.mails.length ?? 0} offene Nachrichten.`);
    case 'fallakte': sc.openCase(true); return reply('Fallakte Praktikum geöffnet.', { voice: false });
    case 'alarm': { const on = !sc.isAlarm(); sc.setAlarm(on); return reply(on ? 'Alarmstufe Rot.' : 'Alarm aufgehoben.'); }
    case 'signal': sc.signal(); return reply('Signal gesendet, Master Leon.');
    case 'ton': sc.setSound(!sc.soundOn()); return reply(sc.soundOn() ? 'Akustik aktiviert.' : 'Akustik deaktiviert.', { voice: false });
    case 'neu laden': S()?.setMode('LADE'); await refresh(); return reply('Daten aktualisiert.', { voice: false });
  }
}

async function handle(input) {
  const text = input.trim();
  if (!text || busy) return;
  const c = parseCommand(text);
  if (c) return runCommand(c.cmd);
  busy = true;
  S()?.setMode('ANALYSIERE');
  try {
    const r = await ask(text);
    if (r.action?.rejected === 'bestaetigung' && r.action.type === 'set_application_status') {
      const app = view?.apps.find(a => a.id === r.action.id);
      askConfirm(`Status von ${app?.company || 'Bewerbung'} auf „${r.action.status.replace('_', ' ')}“ setzen?`, async () => {
        await setApplicationStatus(r.action.id, r.action.status);
        await refresh();
        reply('Erledigt, Master Leon.');
      });
    }
    reply(r.say || 'Dazu habe ich keine Antwort, Master Leon.');
    if (r.applied) await refresh();
  } finally { busy = false; }
}

function askConfirm(text, onYes) {
  pendingConfirm = onYes;
  $('confirmText').textContent = text;
  $('confirm').hidden = false;
}
$('yes').addEventListener('click', async () => { $('confirm').hidden = true; const f = pendingConfirm; pendingConfirm = null; if (f) await f(); });
$('no').addEventListener('click', () => { $('confirm').hidden = true; pendingConfirm = null; reply('Verstanden, keine Änderung.', { voice: false }); });

// Sprache
let listening = false;
async function talk() {
  announceDueOnce();
  if (!canListen) {
    $('q').focus();
    if (!store('jarvis-noasr')) { store('jarvis-noasr', '1'); reply('Spracheingabe wird auf diesem Gerät nicht unterstützt. Bitte tippen Sie Ihre Frage, ich lese die Antwort vor.', { voice: false }); }
    return;
  }
  if (listening) { stopListening(); return; }
  listening = true; S()?.setListening(true); S()?.setMode('HÖRE ZU'); S()?.blip(780);
  try { const said = await listen(); $('q').value = ''; await handle(said); }
  catch (e) { if (e.message !== 'keine-eingabe') reply('Ich habe Sie nicht verstanden, Master Leon.', { voice: false }); else S()?.setMode('BEREIT'); }
  finally { listening = false; S()?.setListening(false); }
}
for (const el of [$('gl'), $('mic')]) {
  el.addEventListener('click', talk);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); talk(); } });
}
$('ask').addEventListener('submit', e => { e.preventDefault(); announceDueOnce(); const v = $('q').value; $('q').value = ''; S()?.blip(660); handle(v); });
$('snd').addEventListener('click', () => { S()?.setSound(!S()?.soundOn()); S()?.blip(990); });
document.querySelectorAll('[data-cmd]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); runCommand(a.dataset.cmd); }));
$('logout').addEventListener('click', async e => { e.preventDefault(); await signOut(); location.reload(); });

// Login
async function start() {
  if (!(await session())) {
    $('login').hidden = false;
    $('email').focus();
    return;
  }
  $('login').hidden = true;
  await refresh();
  weather().then(renderWeather);
  setInterval(refresh, 5 * 60e3);
  setInterval(() => weather().then(renderWeather), 30 * 60e3);
}
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('loginErr').textContent = '';
  try { await signIn($('email').value.trim(), $('pw').value); await start(); }
  catch (err) { $('loginErr').textContent = err.message; }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
start();
