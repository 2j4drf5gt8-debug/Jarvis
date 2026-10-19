import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayISO, coachToday, nextSession, deadlineLevel, mission, briefingStatus, parseCommand } from '../app/js/core/derive.js';
import { coordsFor } from '../app/js/core/geo.js';

const settings = {
  proteinTarget: 160,
  supplements: ['Kreatin (5 g)', 'D3'],
  cycle: ['U1', 'U2', 'Pause'],
  plan: {
    U1: [{ name: 'Klimmzug', sets: 2, reps: [6, 10], note: 'Ab 2 × 10 mit Zusatzgewicht' }],
    U2: [{ name: 'Preacher Curl (Maschine)', sets: 2, reps: [6, 10] }],
  },
};
const day1018 = {
  date: '2026-10-18',
  meals: [
    { kcal: 715, protein: 25 }, { kcal: 250, protein: 30 }, { kcal: 1300, protein: 55 },
    { kcal: 715, protein: 25 }, { kcal: 146, protein: 20 },
  ],
  supps: { 'Kreatin (5 g)': true },
  weight: 83,
  training: { type: 'U2', sets: [{ name: 'Preacher Curl (Maschine)', kg: 64, detail: [{ kg: 64, reps: 10 }] }] },
};

test('todayISO uses Madrid time', () => {
  assert.equal(todayISO(new Date('2026-10-19T22:30:00Z')), '2026-10-20');
  assert.equal(todayISO(new Date('2026-10-19T12:00:00Z')), '2026-10-19');
});

test('coachToday without a day record returns zeros', () => {
  const r = coachToday(undefined, { proteinTarget: 160, supplements: ['Kreatin (5 g)'] });
  assert.equal(r.protein, 0);
  assert.equal(r.kcal, 0);
  assert.equal(r.proteinTarget, 160);
  assert.deepEqual(r.supps, [{ name: 'Kreatin (5 g)', done: false }]);
});

test('coachToday sums meals and maps supplements', () => {
  const r = coachToday(day1018, settings);
  assert.equal(r.protein, 155);
  assert.equal(r.kcal, 3126);
  assert.equal(r.weight, 83);
  assert.equal(r.trainingType, 'U2');
  assert.deepEqual(r.supps, [{ name: 'Kreatin (5 g)', done: true }, { name: 'D3', done: false }]);
});

test('nextSession follows the cycle after the last trained type', () => {
  assert.equal(nextSession([day1018], settings, '2026-10-19').type, 'Pause');
  const u1 = { date: '2026-10-17', training: { type: 'U1', sets: [] } };
  const s = nextSession([u1], settings, '2026-10-19');
  assert.equal(s.type, 'U2');
  assert.equal(s.exercises[0].name, 'Preacher Curl (Maschine)');
});

test('nextSession returns today type when trained today, with lastKg', () => {
  const today = { ...day1018, date: '2026-10-19' };
  const s = nextSession([today], settings, '2026-10-19');
  assert.equal(s.type, 'U2');
  assert.equal(s.exercises[0].lastKg, 64);
});

test('deadlineLevel staging', () => {
  const t = '2026-10-19';
  assert.equal(deadlineLevel('2026-10-26', t), 'gelb');
  assert.equal(deadlineLevel('2026-10-21', t), 'rot');
  assert.equal(deadlineLevel('2026-10-19', t), 'heute');
  assert.equal(deadlineLevel('2026-10-10', t), 'heute');
  assert.equal(deadlineLevel(null, t), 'none');
  assert.equal(deadlineLevel('2026-11-30', t), 'none');
});

test('mission counts sends this week and urgency', () => {
  const apps = [{ status: 'gesendet', sent_at: '2026-10-20' }, { status: 'in_pruefung' }, { status: 'absage' }];
  const m = mission(apps, '2026-10-21');
  assert.deepEqual(m, { offer: false, active: 2, weekSent: 1, weekGoal: 3, urgent: false });
  assert.equal(mission(apps, '2026-12-02').urgent, true);
  assert.equal(mission(apps, '2027-01-15').urgent, true);
  const won = mission([...apps, { status: 'zusage' }], '2026-12-02');
  assert.equal(won.offer, true);
  assert.equal(won.urgent, false);
});

test('mission ignores sends from last week', () => {
  assert.equal(mission([{ status: 'gesendet', sent_at: '2026-10-18' }], '2026-10-19').weekSent, 0);
});

test('briefingStatus empty and stale', () => {
  assert.equal(briefingStatus(null, new Date('2026-10-19T10:00:00Z')).text,
    'Noch kein Briefing – der erste Lauf erfolgt um 07:00.');
  const morning = { text: 'Hallo', created_at: '2026-10-19T05:00:00Z' };
  assert.equal(briefingStatus(morning, new Date('2026-10-19T10:00:00Z')).stale, false);
  assert.equal(briefingStatus(morning, new Date('2026-10-19T16:00:00Z')).stale, true);
  assert.match(briefingStatus(morning, new Date('2026-10-19T10:00:00Z')).stamp, /07:00/);
});

test('parseCommand recognises local commands only', () => {
  assert.deepEqual(parseCommand('/Scan'), { cmd: 'scan' });
  assert.deepEqual(parseCommand('  Fallakte '), { cmd: 'fallakte' });
  assert.deepEqual(parseCommand('neu laden'), { cmd: 'neu laden' });
  assert.equal(parseCommand('wie viel protein?'), null);
  assert.equal(parseCommand('scanne meine mails nach fristen'), null);
});

test('coordsFor looks up cities, prefers explicit coordinates', () => {
  assert.deepEqual(coordsFor({ city: 'Leer' }), [7.45, 53.23]);
  assert.deepEqual(coordsFor({ city: 'leer (ostfriesland)' }), [7.45, 53.23]);
  assert.equal(coordsFor({ city: 'Nirgendwo' }), null);
  assert.equal(coordsFor({}), null);
  assert.deepEqual(coordsFor({ city: 'Leer', lat: 1, lon: 2 }), [2, 1]);
});
