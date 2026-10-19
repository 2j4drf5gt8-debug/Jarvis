# Jarvis – Bauplan (Design-Spezifikation)

Stand: 19.10.2026 · Status: **zur Freigabe durch Leon**

## 1. Ziel

Ein persönliches Cockpit („Jarvis“) für Uni, Karriere, Training und Alltag, das
- beim Öffnen alles Wichtige auf einen Blick zeigt (Briefing, Mails, Bewerbungen, Fristen, Training, Ernährung),
- per Sprache oder Text Fragen beantwortet und einfache Aufgaben erledigt,
- im abgestimmten Höhlen-Look aussieht (Stilprototyp v12, siehe `design/stilprototyp-v12.html`),
- **0 € pro Monat** kostet.

**Erfolgskriterien**
- Leon öffnet Jarvis morgens und sieht ein aktuelles Briefing (nicht älter als der letzte geplante Lauf).
- Neue wichtige Mails, Bewerbungsstände und Fristen erscheinen ohne manuelle Eingabe.
- Fragen wie „Wie viel Protein fehlt mir noch?“ werden mit echten Daten beantwortet.
- Läuft am Mac (Vollbild-Cockpit) und am iPhone (kompakte Homescreen-App).

**Nicht im Umfang (bewusst weggelassen)**
- Dauerhaftes Zuhören („Hey Jarvis“), Kalender-Anbindung (Leon hat keine Termine), Mailversand, kostenpflichtige Stimme (ElevenLabs – später optional), Detektivmodus.
- Geschützte Marken-Elemente (Fledermaus-Logo, Batsuit, Batmobil, Wayne/Gotham).

## 2. Entscheidungen (von Leon bestätigt)

| Thema | Entscheidung |
|---|---|
| Umfang | Komplettes Cockpit: Uni, Karriere, Training, Termine/To-dos, Sprach-Chat |
| Interaktion | Anzeigen + Chat + Sprache |
| Geräte | Mac und iPhone gleichwertig (eine responsive Web-App) |
| Budget | 0 € |
| Lösungsweg | Hybrid: Claude als Hintergrund-Gehirn, Gemini Flash (Gratis-Stufe) für Live-Antworten |
| Termine | keine Kalender-Anbindung; Termine + To-dos = ein Baustein „Heute“ |
| Datenbank | gleiches Supabase-Projekt wie die Coach-App („Coach“), eigene `jarvis_`-Tabellen |
| Look | Höhlen-Kommandostand mit Leons eigenem KI-Höhlenbild, Holo-Globus, monochrome Glas-Panels |
| Fristwarnung | gestaffelt (siehe 7.3), Vollalarm nur auf Befehl |

## 3. Architektur

```
 [Gmail] ──┐
           ├──► CLAUDE – geplante Aufgabe 07:00 + 17:00 ──► SUPABASE „Coach“
[Coach-DB]─┘     Mails lesen, Briefing, Fristen, Bewerbungen        │
                                                                    ▼
 Leon (Mac/iPhone) ◄────────────────────────────── JARVIS-APP (Netlify, PWA)
        │                                                      ▲
        └─ Sprache/Text ─► Edge Function `jarvis-ask` ─► Gemini Flash
```

**Bausteine**
1. **Jarvis-App** – statische Web-App (HTML/JS, Three.js für den Globus) auf Netlify, als PWA installierbar. Liest Daten direkt aus Supabase mit Leons Login.
2. **Supabase „Coach“** – bestehende Tabellen bleiben unverändert; neue Tabellen mit Präfix `jarvis_`.
3. **Hintergrund-Gehirn** – geplante Claude-Aufgabe, liest Gmail (nur lesend) und schreibt Zusammenfassungen in Supabase.
4. **Edge Function `jarvis-ask`** – nimmt Fragen entgegen, prüft den Login, sammelt Kontext, fragt Gemini, führt erlaubte Aktionen aus. Gemini-Schlüssel liegt nur als Secret auf dem Server.
5. **Zugang** – Supabase-Login (derselbe Account wie Coach). Neue Registrierungen müssen deaktiviert sein.

## 4. Datenmodell

Alle neuen Tabellen: RLS aktiv, Policy „nur angemeldet“ (wie bei Coach).

**`jarvis_briefings`** – `id` (uuid), `created_at` (timestamptz), `slot` (`morning` | `afternoon` | `manual`), `text` (Briefing, 3–5 Sätze).

**`jarvis_mails`** – `id` (Gmail-Message-ID, PK), `received_at`, `from_name`, `subject`, `summary` (1–2 Sätze, keine Volltexte), `category` (`praktikum` | `uni` | `erasmus` | `sonstiges`), `priority` (`hoch` | `normal`), `done` (bool, Standard false), `created_at`.

**`jarvis_applications`** – `id` (uuid), `company`, `role`, `city`, `status` (`entwurf` | `gesendet` | `in_pruefung` | `gespraech` | `zusage` | `absage`), `next_step` (Text, optional), `updated_at`, `notes`.

**`jarvis_tasks`** – `id` (uuid), `title`, `due_date` (date, optional), `source` (`jarvis` | `leon`), `source_mail_id` (optional), `done` (bool), `created_at`.

**`jarvis_log`** – `id` (uuid), `ts`, `text`, `status` (`erledigt` | `aktiv` | `offen` | `pruefen`).

**Gelesen aus Coach (unverändert):** `days` (pro Datum: `meals`, `supps`, `training`, `weight`, `waist`), `settings` (Ziele).

## 5. Panels → Datenquellen

| Panel | Quelle |
|---|---|
| Untertitel-Leiste / Begrüßung | letztes `jarvis_briefings` |
| Bewerbungsnetz (Karte + Liste), Fallakte | `jarvis_applications` |
| Lageanalyse | offene `jarvis_mails`, `jarvis_tasks` mit Frist ≤ 7 Tage, Trainingsplan aus `days` |
| Körperstatus | heutiges `days` + Ziele aus `settings` |
| Training | heutiges `days.training` |
| Letzte Aktivität | `jarvis_log` (neueste 4) |
| Systemstatus | Erreichbarkeit Supabase / Edge Function, Zeitpunkt letzter Lauf |
| Wetter | Open-Meteo (kostenlos, ohne Schlüssel), Standort Oviedo |
| Satelliten-Feed | Deko (keine Daten) |
| Countdown | festes Datum Praktikumsstart (aktuell angenommen: 01.03.2027 – von Leon zu bestätigen) |

## 6. Hintergrund-Gehirn (geplante Aufgabe)

**Zeitplan:** täglich 07:00 und 17:00 (Europe/Madrid). Ein Zusatzlauf wird über die Claude-App ausgelöst (die Jarvis-App selbst kann keinen Claude-Lauf starten).
**Genehmigung:** Aufgabe braucht „automatisch genehmigen“, sonst bleibt der Lauf stehen.

**Ablauf je Lauf**
1. Gmail: Nachrichten seit dem letzten Lauf, ohne Werbung/Social. Nur lesen – nichts senden, löschen, verschieben, labeln.
2. Relevante Mails → `jarvis_mails` (Upsert per Message-ID) mit Kategorie, Priorität (hoch = Antwort erwartet oder Frist), Zusammenfassung.
3. Fristen mit Handlungsbedarf → `jarvis_tasks` (`source = jarvis`, Verweis auf Mail).
4. Bewerbungen: eindeutige Fälle automatisch (Einladung → `gespraech`, Absage → `absage`, Eingangsbestätigung → `in_pruefung`); unklare Fälle nur als Log-Eintrag mit Status `pruefen`.
5. Briefing (3–5 Sätze, Butler-Ton, Anrede „Master Leon“) → `jarvis_briefings`. Inhalt: Neues, Dringendes heute, Training/Ernährung des Tages.
6. Jeder Schritt → `jarvis_log`.

**Datenschutz:** In der Datenbank landen nur Zusammenfassungen. Gemini erhält nie Mail-Volltexte.

## 7. App-Verhalten

### 7.1 Sprache
- Eingabe: Mikrofon-Symbol oder Globus antippen → Browser-Spracherkennung (de-DE). Push-to-talk, kein Daueraufnahme.
- Ausgabe: Systemstimme (speechSynthesis), deutsche Stimme wählbar.
- iPhone: Spracherkennung als Erstes testen; falls unzuverlässig → Texteingabe, Antwort wird trotzdem vorgelesen.

### 7.2 Live-Fragen (`jarvis-ask`)
- Eingabe: Text + Login-Token. Kontext: heutige Coach-Daten, Ziele, letztes Briefing, offene Tasks, Bewerbungen, offene Mail-Zusammenfassungen.
- Gemini liefert JSON `{ say, action? }`.
- **Erlaubte Aktionen:** Task anlegen/abhaken · Mail als erledigt markieren · Bewerbungsstatus ändern (**nur nach Bestätigung durch Leon**). Alles andere wird abgelehnt.
- Lokale Befehle ohne KI: `scan`, `fallakte`, `alarm`, `signal`, `ton`, `hilfe`, `neu laden` (lädt nur die Daten aus Supabase neu).

### 7.3 Fristwarnung (gestaffelt)
| Fällig in | Verhalten |
|---|---|
| ≤ 7 Tage | gelb in Lageanalyse, Erwähnung im Briefing |
| ≤ 2 Tage | roter Hinweis in der Statusleiste; Jarvis spricht es beim ersten Öffnen des Tages an |
| heute / überfällig | zusätzlich dezent pulsierender roter Rand bis zum Abhaken |
| Vollalarm mit Sirene | nur auf Befehl `alarm` |

### 7.4 Fehlerfälle
- Gemini-Kontingent erschöpft → Hinweis per Stimme/Text; Anzeigen und lokale Befehle laufen weiter.
- Offline → zuletzt geladene Daten (Service-Worker-Cache) + Hinweis „OFFLINE“.
- Briefing älter als der letzte geplante Lauf → Zeitstempel sichtbar („Stand: gestern, 17:00“).
- Edge Function nicht erreichbar → Systemstatus zeigt Störung, Antwort-Hinweis statt Absturz.

## 8. Sicherheit
- Login über Supabase Auth (Account der Coach-App); Registrierungen deaktiviert (prüfen, ggf. abschalten).
- RLS auf allen `jarvis_`-Tabellen; Gemini-Schlüssel nur als Edge-Function-Secret.
- Hintergrund-Gehirn hat nur Lesezugriff auf Gmail.
- Bestehende Coach-Tabellen werden nicht verändert.

## 9. Tests
- Edge Function: automatische Tests für Kontextaufbau, JSON-Auswertung der Gemini-Antwort und Ablehnung nicht erlaubter Aktionen.
- Datenbank: Migration auf Supabase-Branch bzw. lokal prüfen, RLS-Test (ohne Login kein Zugriff).
- Hintergrund-Gehirn: ein manueller Probelauf, Ergebnis in den Tabellen kontrollieren.
- App: Checkliste am Mac (Chrome/Safari) und iPhone (Safari, Homescreen) – Laden, Login, Panels, Sprache, Offline.

## 10. Etappen
1. **Fundament** – Tabellen + RLS, App im Höhlen-Look mit Login und echten Coach-Daten, Deploy auf Netlify.
2. **Hintergrund-Gehirn** – geplante Aufgabe, Briefing, Mails, Bewerbungen, Fristen, Fristwarnung.
3. **Stimme** – Edge Function `jarvis-ask`, Gemini, Sprache rein/raus, erlaubte Aktionen.
4. **Feinschliff** – iPhone-Layout, PWA-Symbol, Offline-Modus, Performance.

Jede Etappe ist für sich nutzbar und wird vor der nächsten von Leon geprüft.

## 11. Offene Punkte / Annahmen
- **Praktikumsstart** für den Countdown: angenommen 01.03.2027 – von Leon zu bestätigen.
- **Gemini-Gratis-Stufe:** genaue Limits und Datennutzung vor Etappe 3 bei Google prüfen.
- **„Automatisch genehmigen“** für geplante Aufgaben: Verfügbarkeit erst beim Einrichten sichtbar.
- **iPhone-Spracherkennung:** Zuverlässigkeit im Homescreen-Modus unbekannt – wird zuerst getestet.
