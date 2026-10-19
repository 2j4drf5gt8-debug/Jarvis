-- Jarvis: eigene Tabellen im Projekt "Coach". Bestehende Tabellen bleiben unverändert.

create table if not exists public.jarvis_briefings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  slot text not null default 'manual' check (slot in ('morning','afternoon','manual')),
  text text not null
);

create table if not exists public.jarvis_mails (
  id text primary key,
  received_at timestamptz,
  from_name text,
  subject text,
  summary text,
  category text not null default 'sonstiges' check (category in ('praktikum','uni','erasmus','sonstiges')),
  priority text not null default 'normal' check (priority in ('hoch','normal')),
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.jarvis_applications (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  role text,
  city text,
  lat double precision,
  lon double precision,
  status text not null default 'entwurf' check (status in ('entwurf','gesendet','in_pruefung','gespraech','zusage','absage')),
  sent_at date,
  next_step text,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date date,
  source text not null default 'leon' check (source in ('jarvis','leon')),
  source_mail_id text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.jarvis_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  text text not null,
  status text not null default 'erledigt' check (status in ('erledigt','aktiv','offen','pruefen'))
);

create index if not exists jarvis_briefings_created_idx on public.jarvis_briefings (created_at desc);
create index if not exists jarvis_log_ts_idx on public.jarvis_log (ts desc);
create index if not exists jarvis_tasks_open_idx on public.jarvis_tasks (done, due_date);

-- updated_at + sent_at automatisch pflegen
create or replace function public.jarvis_applications_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'gesendet' and new.sent_at is null then
    new.sent_at := (now() at time zone 'Europe/Madrid')::date;
  end if;
  return new;
end $$;

drop trigger if exists jarvis_applications_touch on public.jarvis_applications;
create trigger jarvis_applications_touch
  before insert or update on public.jarvis_applications
  for each row execute function public.jarvis_applications_touch();

-- RLS: nur angemeldet (wie die Coach-Tabellen)
do $$
declare t text;
begin
  foreach t in array array['jarvis_briefings','jarvis_mails','jarvis_applications','jarvis_tasks','jarvis_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "nur angemeldet" on public.%I', t);
    execute format('create policy "nur angemeldet" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
