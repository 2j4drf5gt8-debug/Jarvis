# Jarvis Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leons persönliches Jarvis-Cockpit im Höhlen-Look mit echten Daten (Coach, Mails, Bewerbungen, Fristen), Hintergrund-Briefing durch Claude und Live-Antworten per Sprache – zu 0 € Betriebskosten.

**Architecture:** Statische PWA (Vanilla-JS-Module, Three.js) auf Netlify liest mit Leons Supabase-Login direkt aus dem Projekt „Coach“. Neue `jarvis_`-Tabellen werden von einer geplanten Claude-Aufgabe (Gmail lesen → Zusammenfassungen) und von der App selbst beschrieben. Eine Edge Function `jarvis-ask` beantwortet Fragen über Gemini Flash; reine Logik liegt in testbaren JS-Modulen.

**Tech Stack:** HTML/CSS/ES-Module, Three.js r128 (jsDelivr), supabase-js 2.45.4 (UMD, jsDelivr), Supabase Postgres + Edge Functions (Deno), Gemini API (`gemini-2.5-flash`, über REST), Open-Meteo, Node 22 `node:test` für Tests, Netlify.

**Spec:** `docs/superpowers/specs/2026-10-19-jarvis-cockpit-design.md`

## Global Constraints

- Supabase-Projekt: `rxwomtelcddkhyrilhsq` („Coach“). Bestehende Tabellen `days`, `settings`, `notes`, `reports`, `push_subscriptions`, `reminder_log`, `private_config` werden **nicht** verändert.
- Neue Tabellen nur mit Präfix `jarvis_`, RLS aktiv, Policy „nur angemeldet“ für Rolle `authenticated` (wie Coach).
- Coach-Datenformat: `days.id` = `YYYY-MM-DD`, `days.data` = `{date, meals:[{name,time,kcal,protein,carbs,fat}], supps:{<name>:bool}, weight, waist, training:{type, sets:[{name,kg,sets,detail:[{kg,reps}]}]}}`; `settings.id='main'`, `settings.data` = `{plan:{U1:[…],U2:[…]}, cycle:["U1","U2","Pause"], proteinTarget:160, supplements:[…], goalDate, goalLabel}`. Es gibt **kein** kcal-Ziel und **keine** Wasser-Erfassung → kcal ohne Ziel anzeigen, Wasser-Anzeige entfällt.
- Zeitzone für alle Datumslogik: `Europe/Madrid`. Wochenbeginn: Montag.
- Wochenziel Bewerbungen: **3**. Nachfassen nach **10** Tagen auf `gesendet`. Schärferer Ton ab **1. Dezember** ohne Zusage.
- Fristwarnung: ≤ 7 Tage = `gelb`, ≤ 2 Tage = `rot`, heute/überfällig = `heute`; Vollalarm nur per Befehl `alarm`.
- Erlaubte KI-Aktionen: `add_task`, `complete_task`, `mark_mail_done`, `set_application_status` (letzteres nur mit `confirmed: true`). Alles andere wird abgewiesen.
- Gemini erhält nie Mail-Volltexte; der Schlüssel liegt nur als Secret `GEMINI_API_KEY`.
- Anrede in allen Jarvis-Texten: „Master Leon“, Siezen.
- Keine geschützten Markenelemente (Fledermaus-Logo, Batsuit, Batmobil, Wayne/Gotham).
- Look = `design/stilprototyp-v12.html` (Höhlenfoto, Globus, Panels, Fledermäuse, Blitze, Befehle, Ton). Detektivmodus bleibt entfernt.

## Review Focus

- **Tag ohne Coach-Eintrag** (kein `days`-Datensatz für heute): Panels zeigen 0 g / 0 kcal statt Fehler. → Test in Task 2 (`coachToday` mit `undefined`).
- **Leere Jarvis-Tabellen beim ersten Start**: Briefing-Leiste zeigt „Noch kein Briefing – der erste Lauf erfolgt um 07:00.“, Listen zeigen Leerzustände. → Test in Task 2 (`briefingStatus(null)`), Leerzustände in Task 5.
- **Gemini antwortet mit kaputtem oder umzäuntem JSON** (```json …```): wird bereinigt; sonst Text als `say` ohne Aktion. → Test in Task 3.
- **Aufgabe ohne Datum / Datum in der Vergangenheit**: `deadlineLevel` liefert `none` bzw. `heute`. → Test in Task 2.
- **Unbekannter Ort einer Bewerbung**: Karte überspringt den Punkt, Liste zeigt ihn trotzdem. → Test in Task 2 (`coordsFor`).

---

### Task 1: Datenbank-Tabellen

**Files:**
- Create: `supabase/migrations/20261019120000_jarvis_tables.sql`

**Interfaces:**
- Produces: Tabellen `jarvis_briefings(id uuid pk default gen_random_uuid(), created_at timestamptz default now(), slot text check in ('morning','afternoon','manual'), text text not null)`, `jarvis_mails(id text pk, received_at timestamptz, from_name text, subject text, summary text, category text check in ('praktikum','uni','erasmus','sonstiges'), priority text check in ('hoch','normal'), done bool default false, created_at timestamptz default now())`, `jarvis_applications(id uuid pk, company text not null, role text, city text, lat double precision, lon double precision, status text check in ('entwurf','gesendet','in_pruefung','gespraech','zusage','absage') default 'entwurf', sent_at date, next_step text, notes text, updated_at timestamptz default now())`, `jarvis_tasks(id uuid pk, title text not null, due_date date, source text check in ('jarvis','leon') default 'leon', source_mail_id text, done bool default false, created_at timestamptz default now())`, `jarvis_log(id uuid pk, ts timestamptz default now(), text text not null, status text check in ('erledigt','aktiv','offen','pruefen') default 'erledigt')`. Trigger: `updated_at` bei Update von `jarvis_applications`; `sent_at = current_date` beim ersten Wechsel auf `gesendet`.

- [ ] **Step 1:** SQL schreiben (Tabellen, Checks, RLS an, Policy `nur angemeldet` `for all to authenticated using (true) with check (true)` je Tabelle, beide Trigger).
- [ ] **Step 2:** Per `apply_migration` auf `rxwomtelcddkhyrilhsq` anwenden.
- [ ] **Step 3: Verifizieren:** `select tablename, rowsecurity from pg_tables where tablename like 'jarvis_%'` → 5 Zeilen, alle `true`; `pg_policies` → 5 Policies; Test-Insert in `jarvis_applications` mit `status='gesendet'` → `sent_at = current_date`; Testzeile löschen.
- [ ] **Step 4:** Startdaten: BBC Chartering (Leer, `in_pruefung`, Rolle „Chartering / Account Management“) als einzige echte Bewerbung eintragen (aus Leons Angaben); keine erfundenen Firmen.
- [ ] **Step 5:** Commit.

### Task 2: Reine Logik der App (`derive.js`)

**Files:**
- Create: `app/js/core/derive.js`, `app/js/core/geo.js`
- Test: `tests/derive.test.mjs`

**Interfaces:**
- Produces (`derive.js`):
  - `todayISO(now: Date, tz='Europe/Madrid') -> 'YYYY-MM-DD'`
  - `coachToday(day: object|undefined, settings: object) -> {protein, proteinTarget, kcal, supps:[{name, done}], trainingType, weight}`
  - `nextSession(days: object[], settings) -> {type:'U1'|'U2'|'Pause', exercises:[{name, sets, reps:[min,max], note, lastKg}]}` – letzter Tag mit `training.type` ≠ '' bestimmt Position im `cycle`; ist heute bereits trainiert, gilt heutiger Typ.
  - `deadlineLevel(due: string|null, today: string) -> 'none'|'gelb'|'rot'|'heute'`
  - `mission(apps: object[], today: string) -> {offer: bool, active: number, weekSent: number, weekGoal: 3, urgent: bool}` (`urgent` = kein Angebot und today ≥ 12-01 des laufenden Jahres oder Monat ∈ {1,2})
  - `briefingStatus(b: object|null, now: Date) -> {text, stamp, stale: bool}` – stale, wenn älter als der letzte Slot (07:00 bzw. 17:00 Madrid).
  - `parseCommand(input: string) -> {cmd:'scan'|'fallakte'|'alarm'|'signal'|'ton'|'hilfe'|'neu laden'} | null`
- Produces (`geo.js`): `coordsFor(app: {city, lat, lon}) -> [lon, lat] | null` mit fester Tabelle für Leer, Emden, Bremen, Bremerhaven, Oldenburg, Aurich, Papenburg, Wilhelmshaven, Hamburg, Moormerland, Oviedo.

- [ ] **Step 1: Failing tests** (`node --test tests/`):
  - `coachToday(undefined, {proteinTarget:160, supplements:['Kreatin (5 g)']})` → `protein 0, kcal 0, supps [{name:'Kreatin (5 g)', done:false}]`.
  - Tag 2026-10-18 aus Coach (Mahlzeiten-Protein 25+30+55+25+20) → `protein 155`, `kcal 3126`.
  - `nextSession` mit letztem Training `U2` → `type 'Pause'`; mit `U1` → `U2`; `lastKg` aus letztem Satz gleichen Namens.
  - `deadlineLevel('2026-10-26','2026-10-19')='gelb'`, `('2026-10-21',…)='rot'`, `('2026-10-19',…)='heute'`, `('2026-10-10',…)='heute'`, `(null,…)='none'`, `('2026-11-30',…)='none'`.
  - `mission([{status:'gesendet',sent_at:'2026-10-20'},{status:'in_pruefung'}],'2026-10-21')` → `weekSent 1, active 2, offer false, urgent false`; mit `'2026-12-02'` → `urgent true`; mit Zusage → `offer true, urgent false`.
  - `briefingStatus(null, …)` → `text 'Noch kein Briefing – der erste Lauf erfolgt um 07:00.'`.
  - `parseCommand('/Scan')` → `{cmd:'scan'}`; `parseCommand('wie viel protein?')` → `null`.
  - `coordsFor({city:'Leer'})` → `[7.45,53.23]`; `coordsFor({city:'Nirgendwo'})` → `null`; explizite `lat/lon` haben Vorrang.
- [ ] **Step 2:** Tests laufen lassen → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Commit.

### Task 3: Kern der Live-Antworten (`ask-core.js`)

**Files:**
- Create: `supabase/functions/jarvis-ask/core.js`
- Test: `tests/ask-core.test.mjs`

**Interfaces:**
- Produces:
  - `buildContext({today, coach, session, briefing, tasks, apps, mails}) -> string` – kompakter deutscher Text; Mails nur `from_name`, `subject`, `summary`.
  - `buildPrompt(context: string, question: string) -> string` – Systemrolle Butler „Jarvis“, Anrede „Master Leon“, Siezen, max. 3 Sätze, Antwort **nur** als JSON `{"say": string, "action"?: {...}}`, Liste der erlaubten Aktionen mit Feldern: `add_task{title, due_date?}`, `complete_task{id}`, `mark_mail_done{id}`, `set_application_status{id, status, confirmed}`.
  - `parseReply(raw: string) -> {say: string, action: object|null}` – entfernt ```-Zäune, parst JSON; bei Fehler `{say: raw.trim(), action: null}`.
  - `validateAction(action, {taskIds:Set, mailIds:Set, appIds:Set}) -> {ok: bool, reason?: string}`.

- [ ] **Step 1: Failing tests:**
  - `parseReply('```json\n{"say":"Hi"}\n```')` → `{say:'Hi', action:null}`; `parseReply('kein json')` → `{say:'kein json', action:null}`.
  - `validateAction({type:'delete_all'})` → `ok false`; `set_application_status` ohne `confirmed:true` → `ok false, reason 'bestaetigung'`; mit unbekannter `id` → `ok false`; `add_task` ohne `title` → `ok false`; gültiges `complete_task` → `ok true`.
  - `buildContext` enthält „Protein 92/160 g“ bei Protein 92 und keine Felder außer `summary` aus Mails (Test: Mail mit `body:'GEHEIM'` → Kontext enthält nicht „GEHEIM“).
  - `buildPrompt` enthält „Master Leon“ und alle vier Aktionsnamen.
- [ ] **Step 2–4:** FAIL → implementieren → PASS.
- [ ] **Step 5:** Commit.

### Task 4: Edge Function `jarvis-ask`

**Files:**
- Create: `supabase/functions/jarvis-ask/index.ts`

**Interfaces:**
- Consumes: `core.js` (Task 3), Tabellen (Task 1), Coach-Tabellen.
- Produces: `POST /functions/v1/jarvis-ask` mit Header `Authorization: Bearer <user JWT>`, Body `{question: string}` → `200 {say: string, action: object|null, applied: bool}`; `401` ohne gültigen Login; Antwort `{say:'Mein Sprachkontingent ist für heute erschöpft, Master Leon.', applied:false}` bei Gemini-429; `{say:'Mir fehlt noch der Gemini-Schlüssel, Master Leon.', applied:false}` ohne Secret. CORS für die Netlify-Domain und `*` in der Vorschau.

- [ ] **Step 1:** Implementieren: Supabase-Client mit dem Nutzer-JWT (RLS greift), Daten laden, `buildContext` → `buildPrompt` → Gemini REST (`generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, `responseMimeType: application/json`) → `parseReply` → `validateAction` → Aktion ausführen (+ `jarvis_log`-Eintrag) → Antwort.
- [ ] **Step 2:** Deploy per `deploy_edge_function` (`verify_jwt: true`).
- [ ] **Step 3: Verifizieren:** Aufruf ohne Token → 401; Aufruf mit Token ohne Secret → Schlüssel-Hinweis (Antwort prüfen).
- [ ] **Step 4:** Commit.

### Task 5: App – Gerüst, Login, Daten, Panels

**Files:**
- Create: `app/index.html`, `app/css/jarvis.css`, `app/js/config.js`, `app/js/data.js`, `app/js/render.js`, `app/js/main.js`, `app/js/scene/cave.js`, `app/js/scene/globe.js`, `app/js/scene/bats.js`, `app/js/scene/sound.js`, `app/assets/cave.jpg`, `netlify.toml`
- Source: `design/stilprototyp-v12.html` (Markup, Styles und Szenen-Code werden dorthin aufgeteilt)

**Interfaces:**
- Consumes: Task 1–2.
- Produces:
  - `config.js`: `SUPABASE_URL`, `SUPABASE_KEY` (Publishable Key), `ASK_URL`.
  - `data.js`: `signIn(email)` (Magic Link), `session()`, `loadAll() -> {days, settings, briefing, mails, apps, tasks, log}`, `completeTask(id)`, `markMailDone(id)`, `addTask(title, due)`, `ask(question) -> {say, action, applied}`.
  - `render.js`: `renderAll(model, now)` füllt: Untertitel (Briefing), Statusleiste (Mission Praktikum, Fristen-Hinweis), Bewerbungsnetz (Karte + Liste aus `coordsFor`), Lageanalyse (offene Mails, Fristen ≤ 7 Tage, nächste Einheit), Systemstatus (Supabase ok, letzter Lauf aus `jarvis_log`), Körperstatus (Protein/Ziel-Ring, kcal, Supplemente), Training (`nextSession`), Letzte Aktivität (4 neueste Log-Zeilen), Fallakte (aus `jarvis_applications` + Tasks), Wetter (Open-Meteo Oviedo `43.36,-5.85`).
  - Szenen-Module exportieren je `start(canvas, state)`; `state` = `{listen, talk}` wird von `main.js` gesetzt.
- [ ] **Step 1:** Prototyp in Module zerlegen; Höhlenbild als Datei statt Base64; Beispieldaten und Hinweis „Stilprototyp“ entfernen; Wasser-Anzeige und Satelliten-Feed-Text an echte Daten anpassen (Feed bleibt Deko); Statusleiste: `PRAKTIKUM · NOCH KEINE ZUSAGE` (rot) bzw. `PRAKTIKUM · ZUSAGE ✓`, dazu `BEWERBUNGEN DIESE WOCHE n / 3`.
- [ ] **Step 2:** Login-Overlay im Höhlen-Look (E-Mail-Feld, „Zugangslink senden“), danach `loadAll` + `renderAll`, Aktualisierung alle 5 Minuten und bei Befehl `neu laden`.
- [ ] **Step 3:** Leerzustände: keine Bewerbungen → „Noch keine Bewerbungen erfasst.“; keine Mails → „Keine offenen Übertragungen.“; kein Log → „Noch keine Aktivität.“
- [ ] **Step 4:** Fristwarnung nach `deadlineLevel`: `rot` → roter Statushinweis + einmal täglich gesprochen (Merker in `localStorage` mit try/catch); `heute` → Klasse `due-today` am Body (pulsierender roter Rand, dezenter als `alarm`).
- [ ] **Step 5: Verifizieren:** lokal mit `npx serve app` + Playwright/Chromium: Seite lädt ohne Konsolenfehler, Login-Overlay sichtbar; nach Login (Leon) echte Werte sichtbar. Screenshot Desktop 1440×900 und Mobil 390×844 ansehen.
- [ ] **Step 6:** Commit.

### Task 6: Sprache und Befehle

**Files:**
- Create: `app/js/voice.js`
- Modify: `app/js/main.js`

**Interfaces:**
- Consumes: `parseCommand` (Task 2), `ask` (Task 5), Edge Function (Task 4).
- Produces: `voice.js`: `listen() -> Promise<string>` (Web Speech API, `de-DE`, Push-to-talk; Fehler → Promise reject mit `'nicht-unterstuetzt'`), `speak(text)` (speechSynthesis, deutsche Stimme bevorzugt, Ton-Schalter respektiert).
- [ ] **Step 1:** Eingabe-Fluss: Text/Sprache → `parseCommand` → lokaler Befehl, sonst `ask` → Untertitel tippen + `speak`. Bei `action` mit `applied:true` → `loadAll` + `renderAll`. Bei `set_application_status` ohne Bestätigung → Rückfrage „Soll ich den Status wirklich ändern?“ mit Ja/Nein in der Leiste.
- [ ] **Step 2:** Ohne Spracherkennung (z. B. iPhone-PWA) → Mikrofon-Symbol öffnet Tastatur, Hinweis einmalig.
- [ ] **Step 3: Verifizieren:** Befehle `scan`, `fallakte`, `alarm`, `signal`, `ton`, `hilfe`, `neu laden` im Browser auslösen; Frage ohne Gemini-Schlüssel → Schlüssel-Hinweis erscheint.
- [ ] **Step 4:** Commit.

### Task 7: PWA, Offline, Deploy

**Files:**
- Create: `app/manifest.webmanifest`, `app/sw.js`, `app/icons/icon-192.png`, `app/icons/icon-512.png`
- Modify: `app/index.html`, `app/js/data.js`

**Interfaces:**
- Produces: installierbare PWA „Jarvis“; Service Worker cached App-Shell + Höhlenbild (cache-first) und Supabase-Antworten nicht; `data.js` speichert das letzte `loadAll`-Ergebnis in `localStorage` (try/catch) und zeigt es offline mit Systemstatus `OFFLINE`.
- [ ] **Step 1:** Manifest, Icons (eigenes Kern-Symbol, kein Fremdlogo), Service Worker.
- [ ] **Step 2:** Netlify-Site anlegen und deployen (`publish = "app"`); Auth-Redirect-URL der Site in Supabase eintragen lassen bzw. prüfen.
- [ ] **Step 2b:** Prüfen, ob Registrierungen deaktiviert sind (`GET <SUPABASE_URL>/auth/v1/settings` → `disable_signup: true`); falls nicht, Leon die Einstellung in Supabase → Authentication → Sign In / Providers nennen.
- [ ] **Step 3: Verifizieren:** Live-URL lädt; Lighthouse-PWA-Check bzw. Manifest im Browser sichtbar; Offline-Reload zeigt letzte Daten.
- [ ] **Step 4:** Commit.

### Task 8: Hintergrund-Gehirn (geplante Aufgabe)

**Files:**
- Create: `brain/brain-prompt.md`

**Interfaces:**
- Consumes: Gmail-Connector (nur Lesewerkzeuge), Supabase-Connector `execute_sql` auf `rxwomtelcddkhyrilhsq`, Tabellen (Task 1).
- Produces: geplante Aufgabe „Jarvis Briefing“, `CRON_TZ=Europe/Madrid 52 6,16 * * *` (06:52 und 16:52, damit das Briefing pünktlich zu 07:00/17:00 steht).
- [ ] **Step 1:** Prompt schreiben (Ablauf exakt nach Spec Abschnitt 6, inkl. Nachfassen nach 10 Tagen, Wochenziel, Dezember-Ton, Verbot von Senden/Löschen/Labeln, nur Zusammenfassungen speichern, SQL-Werte korrekt escapen, Abschluss-Logzeile `Lauf abgeschlossen`).
- [ ] **Step 2:** Einen Probelauf in dieser Sitzung mit genau diesem Prompt durchführen.
- [ ] **Step 3: Verifizieren:** `jarvis_briefings` hat 1 Zeile, `jarvis_log` mit `Lauf abgeschlossen`; Stichprobe: keine Volltexte in `jarvis_mails.summary` (Länge ≤ 300 Zeichen).
- [ ] **Step 4:** Geplante Aufgabe anlegen; Genehmigungsmodus Leon mitteilen.
- [ ] **Step 5:** Commit.

### Task 9: Abschluss

- [ ] **Step 1:** `node --test tests/` → alles PASS.
- [ ] **Step 2:** Gesamtreview gegen Spec (frischer Reviewer).
- [ ] **Step 3:** Leon: Link, Login-Anleitung, Gemini-Schlüssel-Anleitung (Google AI Studio → Secret `GEMINI_API_KEY`), offene Punkte.
- [ ] **Step 4:** Obsidian-Notiz, sobald `~/Documents` freigegeben ist.
