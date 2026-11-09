# Architecture: Finanz-App (Arbeitsname) – eigener Nachbau der Finanzguru-Kernfunktionen

Stand: 2026-11-09 · Basis: recon.md, features.csv (2026-11-08) · Nur Eigennutzung

## Entscheidung Bankanbindung (das Hauptrisiko aus der Recon)

| Option | Ergebnis | Quelle |
| --- | --- | --- |
| GoCardless Bank Account Data | nimmt seit Juli 2025 keine Neukunden → raus | https://actualbudget.org/docs/advanced/bank-sync/gocardless/ |
| **Enable Banking** | **gewählt.** Laut AGB ist die Production-Umgebung für „personal use of private individuals“ mit eigenen *Linked Accounts* erlaubt und kostenlos. Nicht erlaubt: fremde Konten, kommerzielle Nutzung. Anzahl Linked Accounts „may be limited“, Request-Quoten möglich. | https://enablebanking.com/terms/ |
| FinTS direkt | Produktregistrierung bei der Deutschen Kreditwirtschaft nötig (aktuell kostenfrei, 10–15 Werktage). Ob Privatpersonen sie bekommen, steht nicht auf der FAQ-Seite → ungeklärt. Zudem braucht FinTS einen Server, der Ihre Bank-PIN kennt → schlechter. | https://www.fints.org/de/hersteller/faq-produktregistrierung |
| CSV-Import | immer als Fallback und für den Start (ohne jede Abhängigkeit) | – |

Offen/ungeprüft: ob **Ihre** Bank bei Enable Banking gelistet ist (wird beim Anlegen der App im Control Panel sichtbar) und wie lange der Consent bei Ihrer Bank gilt (PSD2 üblich bis 180 Tage, dann neu bestätigen).

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Statische HTML/JS-PWA ohne Build-Tool, eigener Ordner `finanzen/` im Repo `2j4drf5gt8-debug/Jarvis` | gleiches Muster wie Coach/Cockpit, das Sie schon betreiben |
| styling | eigenes CSS mit Tokens aus `replica-design` (Dark Mode default) | kein Build-Schritt nötig |
| database | Supabase Postgres, **Projekt rxwomtelcddkhyrilhsq**, Tabellen-Prefix `fin_` | ein Login, Jarvis-Integration (Fristen → `jarvis_tasks`) direkt per SQL, Claude kann weiter eintragen |
| auth | Supabase Auth (bestehender Account) | existiert schon |
| Bank (PSD2) | Enable Banking API, aufgerufen nur aus Supabase Edge Function | API braucht signiertes JWT mit privatem Schlüssel → darf nie in die PWA |
| secrets | Supabase Edge-Function-Secrets (`EB_APP_ID`, `EB_PRIVATE_KEY`) | Schlüssel tippen Sie selbst ein |
| jobs | `pg_cron` + `pg_net` ruft Edge Functions | in Supabase enthalten |
| push | vorhandene `push_subscriptions` (Web Push, iOS ab 16.4 als Home-Screen-App) | schon im Projekt angelegt |
| email (Kündigung) | `mailto:`-Link öffnet Ihre Mail-App mit fertigem Text | kein Mail-Dienst, kein Absender-Setup; Versand bleibt bei Ihnen |
| KI-Kategorisierung | Stufe 1: Regeln + gelernte Regeln. Stufe 2 (optional): Claude im Chat ordnet „unkategorisiert“ per Supabase zu | kein API-Key/Kosten nötig; eigener LLM-Call nur, wenn Sie das später wollen |
| payments | – | Eigennutzung |
| hosting | GitHub Pages (Branch gh-pages) | wie Coach |

## Schema

Tables: 11 (siehe `schema.sql`, gegen die echte DB in einer zurückgerollten Transaktion fehlerfrei getestet). Access rules: **RLS**, jede Zeile `user_id = auth.uid()`. `fin_bank_connections` und `fin_sync_runs` sind für den Client nur lesbar; schreiben nur Edge Functions mit service_role.

fin_accounts · fin_bank_connections · fin_categories · fin_category_rules · fin_contracts · fin_cancellations · fin_collections · fin_collection_items · fin_transactions · fin_budgets · fin_sync_runs

Harte Constraints aus der Recon:
- Doppelte Buchungen (Sync zweimal, CSV überlappt): `unique (account_id, dedupe_hash)` → Import ist idempotent.
- Split: Teile verweisen per `parent_id`; Elternbuchung `is_split_parent` wird in Summen ausgeschlossen.
- Gehalt an wechselndem Tag: `fin_contracts.due_day_tolerance` (Standard ±3 Tage) statt fixem Datum.
- Vierwöchentlicher Turnus: `interval = '4weekly'` (fehlt im Original).
- Bargeld: Konto-Typ `bargeld`, manuelle Buchungen (fehlt im Original).

## API

Fast alles läuft direkt per Supabase-Client gegen die Tabellen (RLS schützt). Eigene Endpunkte nur, wo ein Geheimnis oder Rechenlogik nötig ist.

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST fn `bank-start` | Bankliste holen bzw. Auth-Session bei Enable Banking starten | angemeldet | bank, land | Redirect-URL zur Bank | F01 |
| GET fn `bank-callback` | Code von der Bank gegen Session tauschen, Konten anlegen, Erst-Sync | Redirect der Bank (state-geprüft) | code, state | Redirect zurück in die App | F01 |
| POST fn `bank-sync` | Salden + Umsätze aller aktiven Verbindungen holen, deduplizieren, kategorisieren | angemeldet oder Cron | connection_id? | {inserted, skipped} | F01 |
| POST fn `csv-import` | CSV parsen (Profile: Sparkasse, Volksbank, ING, DKB, N26, generisch), dedupen, kategorisieren | angemeldet | Datei, account_id | {inserted, skipped, errors} | F01 |
| POST fn `categorize` | Regeln auf unkategorisierte Buchungen anwenden | intern / angemeldet | transaction_ids? | Anzahl | F02 |
| POST rpc `fin_learn_rule` | nach manueller Korrektur Regel anlegen und auf ähnliche Buchungen anwenden | angemeldet | transaction_id, category_id, scope | Anzahl geändert | F02 |
| POST fn `detect-contracts` | wiederkehrende Buchungen finden → Vorschläge `status='suggested'` | Cron / angemeldet | – | Vorschläge | F03 |
| POST rpc `fin_contract_to_jarvis` | Kündigungsfrist als Aufgabe in `jarvis_tasks` | angemeldet / Trigger | contract_id | task_id | F03 |
| GET rpc `fin_free_to_spend` | Saldo – offene Vertragsabbuchungen bis nächstem Gehalt | angemeldet | Datum | {frei, bis, offen[]} | F04 |
| GET rpc `fin_forecast` | Tages-Saldoverlauf aus Verträgen für N Tage | angemeldet | tage | Reihe | F04 |
| GET rpc `fin_budget_status` | Ausgaben je Budget im Zeitraum (monatlich oder Gehalt-zu-Gehalt) | angemeldet | zeitraum | Liste | F05 |
| GET rpc `fin_export_csv` | alle Buchungen als CSV | angemeldet | zeitraum | Datei | S15 |
| CRUD Tabellen | Konten, Buchungen (Notiz, Split), Kategorien, Budgets, Sammlungen, Verträge | angemeldet (RLS) | – | – | alle |

Webhooks in: nur der OAuth-Redirect `bank-callback`. Webhooks out: keine.
Jobs (pg_cron):
- `bank-sync` 2× täglich (06:30, 18:30 Europe/Berlin) – innerhalb der PSD2-Grenze von 4 Abrufen/Tag ohne Ihre Anwesenheit.
- `detect-contracts` täglich nach dem Morgen-Sync.
- `consent-check` täglich: Consent läuft in ≤ 7 Tagen ab → Push + Jarvis-Aufgabe „Bank neu verbinden“.
- `contract-reminder` täglich: Kündigungsfrist in ≤ 14 Tagen → Push (Vertragswecker).

Nur offizielle, öffentliche APIs mit Ihren eigenen Schlüsseln. Keine Finanzguru-Endpunkte.

## The parts that bite

- **Zeitzonen:** Buchungstag als `date` (Bank-Lokaldatum), Zeitstempel als `timestamptz`. Monats- und Gehaltsgrenzen in Europe/Berlin rechnen, nicht in UTC – sonst rutschen Buchungen vom 1. um 00:30 in den Vormonat.
- **Idempotenz:** Sync und CSV laufen über `dedupe_hash`; derselbe Import zweimal = 0 neue Zeilen. Vorgemerkte Buchungen (`pending`) ändern sich beim Buchen → per `external_id` ersetzen statt doppeln.
- **Races:** zwei Syncs gleichzeitig (Cron + Knopf) → `pg_advisory_xact_lock` pro Verbindung.
- **Rate limits:** PSD2 erlaubt ohne Ihre Anwesenheit i. d. R. 4 Abrufe/Tag; Enable Banking kann Quoten setzen → Sync-Knopf drosseln.
- **Consent-Ablauf:** spätestens nach ~180 Tagen neu verbinden (s. Job). Ohne das stoppen die Daten still.
- **Vertragserkennung:** Fehlerkennungen sind sicher (auch das Original hat sie). Deshalb nur Vorschläge, die Sie bestätigen oder verwerfen; verworfene Muster werden nicht neu vorgeschlagen.
- **Prognose:** hängt an sauber markiertem Gehalt (`is_income`). Ohne bestätigtes Gehalt zeigt die App „Gehalt festlegen“ statt einer falschen Zahl.
- **Sicherheit/Datenschutz:** Bankdaten sind hochsensibel. Keine volle IBAN im Client, privater Enable-Banking-Schlüssel nur als Secret, Anon-Key allein gibt dank RLS nichts preis. Bank-PIN/TAN tippen Sie nur bei Ihrer Bank, nie in der App.
- **Offline:** Service Worker cached nur die App-Hülle und den letzten Stand (lesend); Schreiben braucht Netz.
- **Löschen:** „Alles löschen“ in den Einstellungen = Verbindung bei Enable Banking widerrufen + `on delete cascade` ab fin_accounts.

## Build order

1. **Vertical slice** (beweist den Stack, noch hässlich): Login → CSV hochladen → Buchungsliste mit Saldo.
   Screens S01, S04, S05 · Tabellen fin_accounts, fin_transactions, fin_categories · fn `csv-import`.
2. **Must-haves**
   - a) Kategorien + Regeln + „Regel merken“: S05, S06 · fin_category_rules · `categorize`, `fin_learn_rule`
   - b) Virtuelles Konto + **Bargeld**: S03 · manuelle Buchungen
   - c) **PSD2 über Enable Banking**: S02 · fin_bank_connections, fin_sync_runs · `bank-start`, `bank-callback`, `bank-sync`, Cron
   - d) Verträge erkennen + Ordner + Vertragswecker + **Jarvis-Fristen**: S07, S08 · fin_contracts · `detect-contracts`, `fin_contract_to_jarvis`, Push
   - e) Frei verfügbar bis Gehalt: S10 · `fin_free_to_spend`
3. **Should-haves:** Split + Notiz (S06), Prognose (S11), Budgets inkl. Gehalt-zu-Gehalt (S12), Analysen (S13), eigene Kategorien, Kündigungsschreiben per mailto (S09, fin_cancellations), volle Historie (ohnehin, kein Limit).
4. **Could-haves:** Sammlungen (S14), CSV/Excel-Export (S15), 4-wöchentlicher Turnus (im Schema schon drin), Depot/Aktien-Übersicht.
5. **Fixes aus replica-entrepreneur**, wenn der Schritt gelaufen ist.
