// Überträgt das View-Model in die Panels.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hm = iso => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const dm = iso => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(iso + 'T12:00:00Z'));
const num = n => new Intl.NumberFormat('de-DE').format(n);
const LOG_STATUS = { erledigt: 'Erledigt', aktiv: 'Aktiv', offen: 'Offen', pruefen: 'Prüfen' };

function kv(el, rows, empty) {
  el.innerHTML = rows.length
    ? rows.map(([k, v, tone]) => `<span>${esc(k)}</span><b class="${tone || ''}">${esc(v)}</b>`).join('')
    : `<span class="empty">${esc(empty)}</span>`;
}
function chip(el, text, tone) {
  el.hidden = !text;
  el.textContent = text || '';
  el.className = tone || '';
}

export function renderAll(v) {
  // Statusleiste
  chip($('chipMission'), v.mission.label, v.mission.tone === 'g' ? 'g' : 'r');
  chip($('chipWeek'), v.mission.week, v.mission.weekSent >= v.mission.weekGoal ? 'g' : 'y');
  chip($('chipDue'), v.due.level === 'gelb' ? '' : v.due.label, v.due.level === 'none' ? '' : 'r2');
  $('chipNet').textContent = v.system[0][1] === 'Offline' ? 'OFFLINE · LETZTER STAND' : 'VERBINDUNG VERSCHLÜSSELT';
  document.body.classList.toggle('due-today', v.due.level === 'heute');

  // Bewerbungsnetz
  $('appCount').textContent = v.apps.length ? `${v.apps.length} ERFASST` : 'LEER';
  kv($('appList'), v.apps.slice(0, 5).map(a => [`${a.city ? a.city + ' · ' : ''}${a.company}`, a.label, a.tone]), 'Noch keine Bewerbungen erfasst.');
  window.JarvisScene?.setPlaces(v.places);

  // Lageanalyse
  kv($('situation'), v.situation, '');
  window.JarvisScene?.setProtein(v.proteinWeek);
  $('proAvg').textContent = v.proteinAvg == null ? 'Noch keine Ernährungsdaten' : `Ø Protein · ${v.proteinWeek.length} Tage · ${v.proteinAvg} g`;

  // Systemstatus
  const run = v.system[1][1];
  kv($('system'), [
    ['J.A.R.V.I.S.-Kern', 'Online', ''],
    v.system[0],
    ['Briefing-Lauf', run ? `${dm(run.slice(0, 10))} ${hm(run)}` : 'Ausstehend', run ? 'n' : 'w'],
    ['Sprachmodul', 'speechSynthesis' in window ? 'Bereit' : 'Nur Text', 'speechSynthesis' in window ? '' : 'w'],
  ], '');

  // Körperstatus
  const b = v.body;
  $('ring').setAttribute('stroke-dasharray', `${Math.round(239 * b.pct / 100)} 239`);
  $('ringPct').textContent = `${b.pct}%`;
  $('weight').textContent = b.weight ? `${String(b.weight).replace('.', ',')} KG` : '';
  kv($('body'), [
    ['Protein', `${b.protein} / ${b.target} g`, 'n'],
    ['Kalorien', num(b.kcal), 'n'],
    ...b.supps.map(s => [s.name.replace(/\s*\(.*\)/, ''), s.done ? '✓' : 'offen', s.done ? '' : 'w']),
  ], '');

  // Training
  $('trainType').textContent = v.training.type;
  $('trainWhen').textContent = v.training.today ? 'HEUTE ERLEDIGT' : 'NÄCHSTE EINHEIT';
  $('trainSub').textContent = v.training.type === 'Pause' ? 'Regeneration' : `${v.training.exercises.length} Übungen`;
  kv($('trainList'), v.training.exercises.slice(0, 3).map(e => [e.name.replace(/\s*\(.*\)/, ''), e.lastKg ? `${String(e.lastKg).replace('.', ',')} kg` : `${(e.reps || []).join('–')} Wdh`, '']), '');

  // Protokoll
  $('log').innerHTML = v.log.length
    ? v.log.map(l => `<time>${hm(l.ts)}</time><span>${esc(l.text)}</span><i>– ${LOG_STATUS[l.status] || ''}</i>`).join('')
    : '<span class="empty">Noch keine Aktivität.</span>';

  // Briefing-Zeitstempel
  const st = $('stamp');
  st.textContent = v.briefing.stamp ? `Briefing · ${v.briefing.stamp}${v.briefing.stale ? ' · veraltet' : ''}` : '';
  st.classList.toggle('stale', v.briefing.stale && !!v.briefing.stamp);

  renderCase(v);
}

const SLOTS = [[19, 25], [80, 25], [20, 74], [80, 74], [36, 12], [64, 12]];
function renderCase(v) {
  const cards = [`<div class="card" style="left:50%;top:46%;--r:-1deg"><b>HAUPTZIEL</b>Pflichtpraktikum im internationalen B2B-Vertrieb, Raum Nordwest / Bremen<span class="meta">Wochenziel ${v.mission.weekSent} / ${v.mission.weekGoal} Bewerbungen</span><span class="stamp${v.mission.offer ? ' g' : ''}">${v.mission.offer ? 'ZUSAGE' : 'PRIORITÄT'}</span></div>`];
  const lines = [];
  v.apps.slice(0, SLOTS.length).forEach((a, i) => {
    const [x, y] = SLOTS[i];
    const r = ((i * 37) % 7) - 3;
    cards.push(`<div class="card" style="left:${x}%;top:${y}%;--r:${r}deg"><b>${esc(a.company.toUpperCase())}${a.city ? ' · ' + esc(a.city.toUpperCase()) : ''}</b>${esc(a.role || '')}${a.next_step ? `<span class="meta">Nächster Schritt: ${esc(a.next_step)}</span>` : ''}<span class="stamp${['gesendet', 'zusage'].includes(a.status) ? ' g' : ''}">${esc(a.label.toUpperCase())}</span></div>`);
    lines.push(`<path d="M80 42 Q${(80 + x * 1.6) / 2} ${y < 50 ? 28 : 58} ${x * 1.6} ${y * .9}"/>`);
  });
  const t = v.due.task;
  if (t) {
    cards.push(`<div class="card" style="left:50%;top:86%;--r:1deg"><b>FRIST</b>${esc(t.title)} bis ${dm(t.due_date)}<span class="stamp">${v.due.level === 'heute' ? 'HEUTE' : 'OFFEN'}</span></div>`);
    lines.push('<path d="M80 42 L80 76"/>');
  }
  $('cards').innerHTML = cards.join('');
  $('strings').innerHTML = `<g stroke="#b3141e" stroke-width=".35" fill="none" opacity=".9">${lines.join('')}</g>`;
}

export function renderWeather(w) {
  if (!w) return;
  $('wxT').textContent = `${w.temp}°C`;
  $('wxS').textContent = `OVIEDO · ${w.text}`;
}
