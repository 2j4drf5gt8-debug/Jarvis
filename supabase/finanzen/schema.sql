-- Schema: Finanz-App (eigener Nachbau der Finanzguru-Kernfunktionen)
-- Ziel: Supabase-Projekt rxwomtelcddkhyrilhsq (gleiches Projekt wie Jarvis), Prefix fin_
-- Geld: integer Cent + currency. Zeiten: timestamptz (UTC), Buchungstage: date.
-- Zugriff: RLS, jede Zeile gehoert user_id = auth.uid(). Edge Functions nutzen service_role.
-- NOCH NICHT ANGEWENDET.

-- ---------- Konten ----------
create table fin_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,                              -- "Giro Sparkasse", "Bargeld"
  bank_name text,
  iban_masked text,                                -- nur DE12 **** 3456, nie volle IBAN im Client
  type text not null default 'giro'
    check (type in ('giro','tagesgeld','kredit','depot','krypto','bargeld','virtual')),
  source text not null default 'manual'
    check (source in ('psd2','csv','manual')),
  balance_cents bigint not null default 0,
  currency text not null default 'EUR',
  include_in_total boolean not null default true,
  archived boolean not null default false,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on fin_accounts (user_id);

-- PSD2-Verbindung (Enable Banking). Getrennt, damit Tokens nie im Client landen.
create table fin_bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'enable_banking',
  aspsp_name text not null,                        -- Bankname beim Aggregator
  aspsp_country text not null default 'DE',
  session_id text,                                 -- Enable-Banking-Session
  status text not null default 'pending'
    check (status in ('pending','active','expired','revoked','error')),
  consent_valid_until timestamptz,                 -- PSD2-Consent, i. d. R. 90-180 Tage
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on fin_bank_connections (user_id);
create index on fin_bank_connections (consent_valid_until);

alter table fin_accounts
  add column connection_id uuid references fin_bank_connections(id) on delete set null,
  add column provider_account_id text;             -- Konto-UID beim Aggregator
create unique index on fin_accounts (connection_id, provider_account_id)
  where provider_account_id is not null;

-- ---------- Kategorien & Regeln ----------
create table fin_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid references fin_categories(id) on delete set null,
  name text not null,
  icon text,
  kind text not null default 'expense' check (kind in ('expense','income','transfer')),
  is_custom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, parent_id, name)
);
create index on fin_categories (user_id);
create index on fin_categories (parent_id);

create table fin_category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references fin_categories(id) on delete cascade,
  field text not null default 'counterparty' check (field in ('counterparty','purpose','iban')),
  pattern text not null,                           -- case-insensitive "enthaelt"
  amount_sign smallint check (amount_sign in (-1, 1)),
  priority int not null default 100,
  source text not null default 'user' check (source in ('user','learned','system')),
  hits int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on fin_category_rules (user_id, priority);
create index on fin_category_rules (category_id);

-- ---------- Vertraege ----------
create table fin_contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null,
  counterparty_pattern text,                       -- zum Zuordnen kuenftiger Buchungen
  category_id uuid references fin_categories(id) on delete set null,
  amount_cents bigint not null,                    -- negativ = Ausgabe, positiv = Einnahme (Gehalt)
  currency text not null default 'EUR',
  interval text not null
    check (interval in ('weekly','4weekly','monthly','2monthly','quarterly','halfyearly','yearly')),
  is_income boolean not null default false,        -- Gehalt/BAfoeG fuer "frei verfuegbar"
  next_due_on date,
  due_day_tolerance smallint not null default 3,   -- Gehalt am 29./30./31.
  notice_period_days int,
  min_term_end_on date,
  customer_number text,
  cancel_address text,                             -- selbst eingetragen (keine Anbieter-DB)
  cancel_email text,
  status text not null default 'suggested'
    check (status in ('suggested','active','cancel_sent','cancelled','dismissed')),
  detection_confidence numeric(3,2),               -- 0-1, nur bei Auto-Erkennung
  jarvis_task_id uuid,                             -- Verknuepfung zu jarvis_tasks (Kuendigungsfrist)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on fin_contracts (user_id, status);
create index on fin_contracts (next_due_on);
create index on fin_contracts (category_id);

create table fin_cancellations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contract_id uuid not null references fin_contracts(id) on delete cascade,
  letter_text text not null,
  channel text not null default 'email' check (channel in ('email','letter','portal')),
  sent_at timestamptz,
  confirmed_at timestamptz,
  status text not null default 'draft' check (status in ('draft','sent','confirmed','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on fin_cancellations (contract_id);
create index on fin_cancellations (user_id);

-- ---------- Sammlungen ----------
create table fin_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on fin_collections (user_id);

-- ---------- Buchungen ----------
create table fin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references fin_accounts(id) on delete cascade,
  booked_on date not null,
  value_on date,
  amount_cents bigint not null,                    -- negativ = Ausgabe
  currency text not null default 'EUR',
  counterparty text,
  counterparty_iban_masked text,
  purpose text,                                    -- Verwendungszweck
  category_id uuid references fin_categories(id) on delete set null,
  category_source text check (category_source in ('rule','learned','ai','manual')),
  contract_id uuid references fin_contracts(id) on delete set null,
  parent_id uuid references fin_transactions(id) on delete cascade,  -- Split-Teile
  is_split_parent boolean not null default false,
  note text,
  status text not null default 'booked' check (status in ('booked','pending')),
  external_id text,                                -- ID vom Aggregator
  dedupe_hash text not null,                       -- sha256(account|datum|betrag|empfaenger|zweck|n)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_cents <> 0 or parent_id is not null)
);
create unique index on fin_transactions (account_id, dedupe_hash);
create index on fin_transactions (user_id, booked_on desc);
create index on fin_transactions (account_id, booked_on desc);
create index on fin_transactions (category_id);
create index on fin_transactions (contract_id);
create index on fin_transactions (parent_id);
create index on fin_transactions using gin (to_tsvector('german', coalesce(counterparty,'') || ' ' || coalesce(purpose,'')));

create table fin_collection_items (
  collection_id uuid not null references fin_collections(id) on delete cascade,
  transaction_id uuid not null references fin_transactions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (collection_id, transaction_id)
);
create index on fin_collection_items (transaction_id);

-- ---------- Budgets ----------
create table fin_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references fin_categories(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  period text not null default 'monthly' check (period in ('monthly','payday','yearly')),
  carry_over boolean not null default false,       -- Ruecklage fuer unregelmaessige Ausgaben
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, period)
);
create index on fin_budgets (category_id);

-- ---------- Sync-Log ----------
create table fin_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references fin_bank_connections(id) on delete cascade,
  source text not null check (source in ('psd2','csv')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  inserted int not null default 0,
  skipped int not null default 0,
  error text
);
create index on fin_sync_runs (user_id, started_at desc);

-- ---------- updated_at-Trigger ----------
create or replace function fin_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['fin_accounts','fin_bank_connections','fin_categories','fin_category_rules',
    'fin_contracts','fin_cancellations','fin_collections','fin_transactions','fin_budgets'] loop
    execute format('create trigger %I_touch before update on %I for each row execute function fin_touch()', t, t);
  end loop; end $$;

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['fin_accounts','fin_bank_connections','fin_categories','fin_category_rules',
    'fin_contracts','fin_cancellations','fin_collections','fin_collection_items','fin_transactions',
    'fin_budgets','fin_sync_runs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy own_rows on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop; end $$;

-- Verbindungen und Sync-Laeufe: Client darf nur lesen, schreiben nur Edge Functions (service_role).
drop policy own_rows on fin_bank_connections;
create policy read_own on fin_bank_connections for select to authenticated using (user_id = auth.uid());
drop policy own_rows on fin_sync_runs;
create policy read_own on fin_sync_runs for select to authenticated using (user_id = auth.uid());
