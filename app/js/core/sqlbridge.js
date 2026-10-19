// Brücke zum Supabase-Connector in Claude: Antwort parsen, sicher quoten, IDs prüfen.
export const PROJECT = 'rxwomtelcddkhyrilhsq';

export function parseSqlPayload(p) {
  if (Array.isArray(p)) return p;
  const text = typeof p === 'string' ? p : typeof p?.result === 'string' ? p.result : null;
  if (text == null) throw new Error('Unerwartete Antwort der Datenbank');
  const open = text.match(/<untrusted-data-([0-9a-f-]+)>/);
  let body = text;
  if (open) {
    const end = text.lastIndexOf(`</untrusted-data-${open[1]}>`);
    body = text.slice(open.index + open[0].length, end < 0 ? undefined : end);
  }
  try {
    const rows = JSON.parse(body.trim());
    if (Array.isArray(rows)) return rows;
  } catch { /* unten */ }
  throw new Error('Datenbankantwort nicht lesbar: ' + text.slice(0, 120));
}

export function quote(s) {
  const text = String(s);
  let tag;
  do tag = '$j' + Math.random().toString(36).slice(2, 8) + '$'; while (text.includes(tag));
  return tag + text + tag;
}

export const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
export const isMailId = s => /^[A-Za-z0-9_-]{1,80}$/.test(String(s));
export const isIsoDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s));

export function modelQuery(since) {
  if (!isIsoDate(since)) throw new Error('Ungültiges Datum');
  return `select json_build_object(
  'days', (select coalesce(json_agg(data order by id desc), '[]') from days where id >= '${since}'),
  'settings', (select data from settings where id = 'main'),
  'briefing', (select row_to_json(b) from (select text, created_at from jarvis_briefings order by created_at desc limit 1) b),
  'mails', (select coalesce(json_agg(m order by m.received_at desc), '[]') from (select id, from_name, subject, summary, category, priority, received_at from jarvis_mails where not done order by received_at desc limit 20) m),
  'apps', (select coalesce(json_agg(a order by a.updated_at desc), '[]') from jarvis_applications a),
  'tasks', (select coalesce(json_agg(t order by t.due_date nulls last), '[]') from jarvis_tasks t where not done),
  'log', (select coalesce(json_agg(l order by l.ts desc), '[]') from (select ts, text, status from jarvis_log order by ts desc limit 8) l)
) as m;`;
}
