// Baut aus den Rohdaten das, was die Panels anzeigen. Rein, ohne DOM.
import { todayISO, coachToday, nextSession, deadlineLevel, mission, briefingStatus } from './derive.js';
import { coordsFor } from './geo.js';

export const STATUS_LABEL = {
  entwurf: 'Entwurf', gesendet: 'Gesendet', in_pruefung: 'In Prüfung',
  gespraech: 'Gespräch', zusage: 'Zusage', absage: 'Absage',
};
const STATUS_TONE = { entwurf: 'n', gesendet: '', in_pruefung: 'w', gespraech: 'w', zusage: '', absage: 'r' };
const RANK = { heute: 3, rot: 2, gelb: 1, none: 0 };
const DAY = 864e5;

function daysUntil(due, today) {
  return Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / DAY);
}

export function viewModel(m, now = new Date()) {
  const today = todayISO(now);
  const days = m.days || [];
  const settings = m.settings || {};
  const coach = coachToday(days.find(d => d.date === today), settings);
  const session = nextSession(days, settings, today);
  const mi = mission(m.apps || [], today);

  // Fristen
  const open = (m.tasks || []).filter(t => !t.done);
  let worst = { level: 'none', task: null };
  for (const t of open) {
    const lv = deadlineLevel(t.due_date, today);
    if (RANK[lv] > RANK[worst.level] || (RANK[lv] === RANK[worst.level] && lv !== 'none' && t.due_date < worst.task.due_date)) worst = { level: lv, task: t };
  }
  let dueLabel = '';
  if (worst.task) {
    const n = daysUntil(worst.task.due_date, today);
    const title = worst.task.title.toUpperCase();
    dueLabel = n <= 0 ? `FRIST ${n < 0 ? 'ÜBERFÄLLIG' : 'HEUTE'} · ${title}` : `FRIST IN ${n} ${n === 1 ? 'TAG' : 'TAGEN'} · ${title}`;
  }
  const within7 = open.filter(t => deadlineLevel(t.due_date, today) !== 'none').length;

  // Protein-Verlauf der letzten 7 Tage (alt → neu)
  const proteinWeek = days
    .filter(d => d.date && d.date <= today && daysUntil(today, d.date) < 7)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(d => coachToday(d, settings).protein);
  const avg = proteinWeek.length ? Math.round(proteinWeek.reduce((a, b) => a + b, 0) / proteinWeek.length) : null;

  const apps = (m.apps || []).map(a => ({ ...a, label: STATUS_LABEL[a.status] || a.status, tone: STATUS_TONE[a.status] ?? 'n' }));
  const places = [];
  for (const a of m.apps || []) {
    if (a.status === 'absage') continue;
    const c = coordsFor(a);
    if (c) places.push({ name: a.city || a.company, lon: c[0], lat: c[1] });
  }

  const highMails = (m.mails || []).filter(x => x.priority === 'hoch').length;
  const lastRun = (m.log || []).find(l => /Lauf abgeschlossen/.test(l.text));

  return {
    today,
    briefing: briefingStatus(m.briefing, now),
    mission: {
      label: mi.offer ? 'PRAKTIKUM · ZUSAGE ✓' : 'PRAKTIKUM · NOCH KEINE ZUSAGE',
      tone: mi.offer ? 'g' : 'r',
      week: `BEWERBUNGEN DIESE WOCHE ${mi.weekSent} / ${mi.weekGoal}`,
      ...mi,
    },
    due: { level: worst.level, label: dueLabel, task: worst.task },
    apps, places,
    situation: [
      ['Praktikum', mi.offer ? 'Zusage' : 'Keine Zusage', mi.offer ? '' : 'r'],
      ['Bewerbungen Woche', `${mi.weekSent} / ${mi.weekGoal}`, mi.weekSent >= mi.weekGoal ? '' : 'w'],
      ['Fristen ≤ 7 Tage', String(within7), within7 ? 'w' : ''],
      ['Offene Mails', `${(m.mails || []).length}${highMails ? ` · ${highMails} wichtig` : ''}`, highMails ? 'w' : ''],
      ['Nächstes Training', session.type, 'n'],
    ],
    proteinWeek, proteinAvg: avg,
    body: {
      protein: coach.protein, target: coach.proteinTarget, kcal: coach.kcal, weight: coach.weight,
      pct: coach.proteinTarget ? Math.min(100, Math.round(coach.protein / coach.proteinTarget * 100)) : 0,
      supps: coach.supps,
    },
    training: { type: session.type, today: coach.trainingType, exercises: session.exercises },
    log: (m.log || []).slice(0, 4),
    system: [
      ['Coach-Datenbank', m.online === false ? 'Offline' : 'Online', m.online === false ? 'r' : ''],
      ['Letzter Briefing-Lauf', lastRun ? lastRun.ts : null, ''],
    ],
    mails: m.mails || [],
    tasks: open,
  };
}
