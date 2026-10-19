import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, buildPrompt, parseReply, validateAction, ACTIONS } from '../supabase/functions/jarvis-ask/core.js';

const ids = { taskIds: new Set(['t1']), mailIds: new Set(['m1']), appIds: new Set(['a1']) };

test('parseReply strips code fences', () => {
  assert.deepEqual(parseReply('```json\n{"say":"Hi"}\n```'), { say: 'Hi', action: null });
});

test('parseReply falls back to plain text', () => {
  assert.deepEqual(parseReply('kein json'), { say: 'kein json', action: null });
  assert.deepEqual(parseReply('{"foo":1}'), { say: '{"foo":1}', action: null });
});

test('parseReply keeps an action object', () => {
  const r = parseReply('{"say":"Erledigt","action":{"type":"complete_task","id":"t1"}}');
  assert.equal(r.action.type, 'complete_task');
});

test('validateAction rejects unknown types', () => {
  assert.equal(validateAction({ type: 'delete_all' }, ids).ok, false);
});

test('validateAction requires confirmation for status changes', () => {
  const r = validateAction({ type: 'set_application_status', id: 'a1', status: 'zusage' }, ids);
  assert.deepEqual(r, { ok: false, reason: 'bestaetigung' });
  assert.equal(validateAction({ type: 'set_application_status', id: 'a1', status: 'zusage', confirmed: true }, ids).ok, true);
  assert.equal(validateAction({ type: 'set_application_status', id: 'a1', status: 'egal', confirmed: true }, ids).ok, false);
});

test('validateAction checks ids and fields', () => {
  assert.equal(validateAction({ type: 'complete_task', id: 'nope' }, ids).ok, false);
  assert.equal(validateAction({ type: 'mark_mail_done', id: 'm1' }, ids).ok, true);
  assert.equal(validateAction({ type: 'add_task' }, ids).ok, false);
  assert.equal(validateAction({ type: 'add_task', title: 'X', due_date: '22.10.' }, ids).ok, false);
  assert.equal(validateAction({ type: 'add_task', title: 'X', due_date: '2026-10-22' }, ids).ok, true);
  assert.equal(validateAction({ type: 'complete_task', id: 't1' }, ids).ok, true);
});

test('buildContext includes protein and never mail bodies', () => {
  const ctx = buildContext({
    today: '2026-10-19',
    coach: { protein: 92, proteinTarget: 160, kcal: 1840, supps: [{ name: 'Kreatin (5 g)', done: true }] },
    session: { type: 'U1', exercises: [{ name: 'Klimmzug', sets: 2, reps: [6, 10], lastKg: null }] },
    briefing: { text: 'Guten Morgen.' },
    tasks: [{ id: 't1', title: 'LA unterschreiben', due_date: '2026-10-22' }],
    apps: [{ id: 'a1', company: 'BBC Chartering', status: 'entwurf', city: 'Leer' }],
    mails: [{ id: 'm1', from_name: 'Uni', subject: 'LA', summary: 'Bitte unterschreiben', body: 'GEHEIM' }],
    mission: { offer: false, weekSent: 1, weekGoal: 3 },
  });
  assert.match(ctx, /Protein 92\/160 g/);
  assert.match(ctx, /Bitte unterschreiben/);
  assert.match(ctx, /t1/);
  assert.doesNotMatch(ctx, /GEHEIM/);
});

test('buildPrompt sets butler tone and lists all actions', () => {
  const p = buildPrompt('KONTEXT', 'Wie viel Protein fehlt?');
  assert.match(p, /Master Leon/);
  for (const a of ACTIONS) assert.ok(p.includes(a), a);
  assert.match(p, /Wie viel Protein fehlt\?/);
});
