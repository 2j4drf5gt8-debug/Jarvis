// Reine Logik für das Jarvis-Cockpit. Keine DOM- oder Netzwerkzugriffe.
export const TZ = 'Europe/Madrid';
export const WEEK_GOAL = 3;

const DAY = 864e5;

export function todayISO(now = new Date(), tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function hhmm(d, tz = TZ) {
  return new Intl.DateTimeFormat('de-DE', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

function dayDiff(a, b) {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY);
}

function sum(list, key) {
  return (list || []).reduce((s, m) => s + (Number(m?.[key]) || 0), 0);
}

export function coachToday(day, settings = {}) {
  const supps = day?.supps || {};
  return {
    protein: Math.round(sum(day?.meals, 'protein')),
    proteinTarget: Number(settings.proteinTarget) || 0,
    kcal: Math.round(sum(day?.meals, 'kcal')),
    supps: (settings.supplements || []).map(name => ({ name, done: !!supps[name] })),
    trainingType: day?.training?.type || '',
    weight: day?.weight ?? null,
  };
}

export function nextSession(days = [], settings = {}, today) {
  const cycle = settings.cycle?.length ? settings.cycle : ['U1', 'U2', 'Pause'];
  const trained = days
    .filter(d => d?.training?.type)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  let type;
  if (trained[0] && trained[0].date === today) type = trained[0].training.type;
  else if (trained[0]) type = cycle[(cycle.indexOf(trained[0].training.type) + 1) % cycle.length];
  else type = cycle[0];
  const lastKg = name => {
    for (const d of trained) {
      const s = (d.training.sets || []).find(x => x.name === name);
      if (s) return Number(s.kg) || null;
    }
    return null;
  };
  const exercises = (settings.plan?.[type] || []).map(e => ({
    name: e.name, sets: e.sets, reps: e.reps, note: e.note || '', lastKg: lastKg(e.name),
  }));
  return { type, exercises };
}

export function deadlineLevel(due, today) {
  if (!due) return 'none';
  const d = dayDiff(due, today);
  if (d <= 0) return 'heute';
  if (d <= 2) return 'rot';
  if (d <= 7) return 'gelb';
  return 'none';
}

function weekStart(today) {
  const t = Date.parse(today + 'T00:00:00Z');
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Mo = 0
  return new Date(t - dow * DAY).toISOString().slice(0, 10);
}

export function mission(apps = [], today) {
  const offer = apps.some(a => a.status === 'zusage');
  const active = apps.filter(a => ['gesendet', 'in_pruefung', 'gespraech'].includes(a.status)).length;
  const ws = weekStart(today);
  const weekSent = apps.filter(a => a.sent_at && a.sent_at >= ws && a.sent_at <= today).length;
  const month = Number(today.slice(5, 7));
  const urgent = !offer && (month === 12 || month <= 2);
  return { offer, active, weekSent, weekGoal: WEEK_GOAL, urgent };
}

export function lastSlot(now = new Date(), tz = TZ) {
  // Zeitpunkt des letzten geplanten Laufs (07:00 oder 17:00 Ortszeit) als Date.
  const today = todayISO(now, tz);
  const offsetMin = (() => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now)
      .find(x => x.type === 'timeZoneName').value; // "GMT+2"
    const m = p.match(/GMT([+-]\d+)(?::(\d+))?/);
    return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] || 0) : 0;
  })();
  const at = (iso, h) => new Date(Date.parse(`${iso}T${String(h).padStart(2, '0')}:00:00Z`) - offsetMin * 6e4);
  for (const h of [17, 7]) { const d = at(today, h); if (d <= now) return d; }
  const y = new Date(Date.parse(today + 'T00:00:00Z') - DAY).toISOString().slice(0, 10);
  return at(y, 17);
}

export function briefingStatus(b, now = new Date()) {
  if (!b) return { text: 'Noch kein Briefing – der erste Lauf erfolgt um 07:00.', stamp: '', stale: true };
  const created = new Date(b.created_at);
  // 10 Minuten Toleranz vor dem Slot, weil der Lauf kurz vorher startet
  const stale = created.getTime() < lastSlot(now).getTime() - 10 * 6e4;
  const sameDay = todayISO(created) === todayISO(now);
  const stamp = (sameDay ? 'heute' : new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' }).format(created))
    + ', ' + hhmm(created);
  return { text: b.text, stamp, stale };
}

const COMMANDS = ['scan', 'fallakte', 'alarm', 'signal', 'ton', 'hilfe', 'neu laden'];
export function parseCommand(input) {
  const v = String(input || '').trim().toLowerCase().replace(/^\//, '').replace(/\s+/g, ' ');
  return COMMANDS.includes(v) ? { cmd: v } : null;
}
