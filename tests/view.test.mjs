import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewModel, STATUS_LABEL } from '../app/js/core/view.js';

const now = new Date('2026-10-19T10:00:00Z'); // 12:00 Madrid
const base = {
  days: [{ date: '2026-10-19', meals: [{ protein: 40, kcal: 800 }], supps: { 'Kreatin (5 g)': true }, weight: 83, training: { type: '', sets: [] } },
    { date: '2026-10-18', meals: [{ protein: 150, kcal: 2900 }], training: { type: 'U2', sets: [] } }],
  settings: { proteinTarget: 160, supplements: ['Kreatin (5 g)'], cycle: ['U1', 'U2', 'Pause'], plan: { U1: [], U2: [] } },
  briefing: null, mails: [], apps: [], tasks: [], log: [], online: true,
};

test('empty data yields empty states, no crash', () => {
  const v = viewModel(base, now);
  assert.equal(v.briefing.text, 'Noch kein Briefing – der erste Lauf erfolgt um 07:00.');
  assert.equal(v.apps.length, 0);
  assert.equal(v.mission.label, 'PRAKTIKUM · NOCH KEINE ZUSAGE');
  assert.equal(v.mission.week, 'BEWERBUNGEN DIESE WOCHE 0 / 3');
  assert.equal(v.due.level, 'none');
  assert.deepEqual(v.situation[0], ['Praktikum', 'Keine Zusage', 'r']);
  assert.deepEqual(v.situation[1], ['Bewerbungen Woche', '0 / 3', 'w']);
});

test('body and training come from coach data', () => {
  const v = viewModel(base, now);
  assert.equal(v.body.protein, 40);
  assert.equal(v.body.pct, 25);
  assert.equal(v.training.type, 'Pause');
  assert.deepEqual(v.proteinWeek, [150, 40]);
});

test('worst open deadline drives warning', () => {
  const v = viewModel({ ...base, tasks: [
    { id: 'a', title: 'Später', due_date: '2026-10-25', done: false },
    { id: 'b', title: 'Learning Agreement', due_date: '2026-10-21', done: false },
  ] }, now);
  assert.equal(v.due.level, 'rot');
  assert.equal(v.due.label, 'FRIST IN 2 TAGEN · LEARNING AGREEMENT');
  assert.equal(v.situation.find(r => r[0] === 'Fristen ≤ 7 Tage')[1], '2');
});

test('due today sets heute level', () => {
  const v = viewModel({ ...base, tasks: [{ id: 'c', title: 'Abgabe', due_date: '2026-10-19' }] }, now);
  assert.equal(v.due.level, 'heute');
  assert.equal(v.due.label, 'FRIST HEUTE · ABGABE');
});

test('applications map to labels and coordinates', () => {
  const v = viewModel({ ...base, apps: [{ id: 'x', company: 'BBC Chartering', city: 'Leer', status: 'in_pruefung' }] }, now);
  assert.equal(v.apps[0].label, STATUS_LABEL.in_pruefung);
  assert.deepEqual(v.places, [{ name: 'Leer', lon: 7.45, lat: 53.23 }]);
});

test('offer turns mission green', () => {
  const v = viewModel({ ...base, apps: [{ id: 'x', company: 'A', status: 'zusage' }] }, now);
  assert.equal(v.mission.label, 'PRAKTIKUM · ZUSAGE ✓');
  assert.equal(v.mission.tone, 'g');
});
