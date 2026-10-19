// Reine Logik für jarvis-ask – läuft in Deno (Edge Function) und Node (Tests).
export const ACTIONS = ['add_task', 'complete_task', 'mark_mail_done', 'set_application_status'];
export const STATUSES = ['entwurf', 'gesendet', 'in_pruefung', 'gespraech', 'zusage', 'absage'];

export function buildContext({ today, coach, session, briefing, tasks = [], apps = [], mails = [], mission }) {
  const L = [];
  L.push(`Heute: ${today}`);
  if (coach) {
    L.push(`Ernährung heute: Protein ${coach.protein}/${coach.proteinTarget} g, ${coach.kcal} kcal (kein kcal-Ziel).`);
    if (coach.supps?.length) L.push('Supplemente: ' + coach.supps.map(s => `${s.name} ${s.done ? '✓' : 'offen'}`).join(', '));
  }
  if (session) {
    L.push(`Nächste Trainingseinheit: ${session.type}` + (session.exercises?.length
      ? ' – ' + session.exercises.map(e => `${e.name} ${e.sets}×${(e.reps || []).join('–')}${e.lastKg ? ` (zuletzt ${e.lastKg} kg)` : ''}`).join('; ')
      : ''));
  }
  if (mission) L.push(`Mission Praktikum: ${mission.offer ? 'Zusage vorhanden' : 'noch keine Zusage'}, Bewerbungen diese Woche ${mission.weekSent}/${mission.weekGoal}.`);
  if (briefing?.text) L.push(`Letztes Briefing: ${briefing.text}`);
  L.push('Offene Aufgaben:' + (tasks.length ? '' : ' keine'));
  for (const t of tasks) L.push(`- [${t.id}] ${t.title}${t.due_date ? ` (fällig ${t.due_date})` : ''}`);
  L.push('Bewerbungen:' + (apps.length ? '' : ' keine'));
  for (const a of apps) L.push(`- [${a.id}] ${a.company}${a.city ? `, ${a.city}` : ''}: ${a.status}${a.next_step ? ` – nächster Schritt: ${a.next_step}` : ''}`);
  L.push('Offene wichtige Mails (nur Zusammenfassungen):' + (mails.length ? '' : ' keine'));
  for (const m of mails) L.push(`- [${m.id}] ${m.from_name || '?'}: ${m.subject || ''} – ${m.summary || ''}`);
  return L.join('\n');
}

export function buildPrompt(context, question) {
  return `Du bist Jarvis, der persönliche Assistent von Leon – im Ton eines höflichen, trockenen Butlers.
Sprich ihn mit „Master Leon“ an und sieze ihn. Antworte auf Deutsch, höchstens 3 kurze Sätze, nur mit Fakten aus dem Kontext.
Wenn etwas nicht im Kontext steht, sag ehrlich, dass du es nicht weißt.

Antworte AUSSCHLIESSLICH mit JSON: {"say": "<Antworttext>", "action": <optional>}
Erlaubte Aktionen (nur wenn Leon ausdrücklich darum bittet):
- {"type":"add_task","title":"…","due_date":"YYYY-MM-DD" (optional)}
- {"type":"complete_task","id":"<Aufgaben-ID>"}
- {"type":"mark_mail_done","id":"<Mail-ID>"}
- {"type":"set_application_status","id":"<Bewerbungs-ID>","status":"${STATUSES.join('|')}","confirmed":false}
  (confirmed nur true, wenn Leon die Änderung in dieser Frage ausdrücklich bestätigt hat)
Keine anderen Aktionen. Nichts senden, nichts löschen.

KONTEXT:
${context}

FRAGE VON LEON:
${question}`;
}

export function parseReply(raw) {
  const text = String(raw ?? '');
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const o = JSON.parse(cleaned);
    if (o && typeof o.say === 'string') {
      return { say: o.say, action: o.action && typeof o.action === 'object' ? o.action : null };
    }
  } catch { /* fällt auf Text zurück */ }
  return { say: text.trim(), action: null };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function validateAction(action, { taskIds = new Set(), mailIds = new Set(), appIds = new Set() } = {}) {
  if (!action || !ACTIONS.includes(action.type)) return { ok: false, reason: 'unbekannt' };
  switch (action.type) {
    case 'add_task':
      if (!action.title || typeof action.title !== 'string') return { ok: false, reason: 'titel' };
      if (action.due_date != null && !ISO.test(action.due_date)) return { ok: false, reason: 'datum' };
      return { ok: true };
    case 'complete_task':
      return taskIds.has(action.id) ? { ok: true } : { ok: false, reason: 'id' };
    case 'mark_mail_done':
      return mailIds.has(action.id) ? { ok: true } : { ok: false, reason: 'id' };
    case 'set_application_status':
      if (!appIds.has(action.id)) return { ok: false, reason: 'id' };
      if (!STATUSES.includes(action.status)) return { ok: false, reason: 'status' };
      if (action.confirmed !== true) return { ok: false, reason: 'bestaetigung' };
      return { ok: true };
  }
  return { ok: false, reason: 'unbekannt' };
}
