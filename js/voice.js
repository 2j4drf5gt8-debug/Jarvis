// Spracheingabe (Push-to-talk) und Sprachausgabe über die Browser-APIs.
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!Rec;
let rec = null;

export function listen() {
  return new Promise((resolve, reject) => {
    if (!Rec) return reject(new Error('nicht-unterstuetzt'));
    rec = new Rec();
    rec.lang = 'de-DE';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let done = false;
    rec.onresult = e => { done = true; resolve(e.results[0][0].transcript); };
    rec.onerror = e => { done = true; reject(new Error(e.error || 'fehler')); };
    rec.onend = () => { if (!done) reject(new Error('keine-eingabe')); };
    rec.start();
  });
}
export function stopListening() { try { rec?.stop(); } catch { /* bereits beendet */ } }

let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => v.lang?.toLowerCase().startsWith('de'));
  voice = vs.find(v => /anna|markus|helena|yannick|google deutsch/i.test(v.name)) || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

export function speak(text, enabled = true) {
  if (!enabled || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[„“"]/g, ''));
  u.lang = 'de-DE';
  if (voice) u.voice = voice;
  u.rate = 1.02;
  u.pitch = 0.9;
  speechSynthesis.speak(u);
}
