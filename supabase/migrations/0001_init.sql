-- Engagements 2030 — le Quizz LIVE · Migration Phase 0
-- Modèle : "écran-animateur fait autorité" + Supabase Realtime (région UE).
-- Animateur = utilisateur authentifié (Supabase Auth), propriétaire de ses quizz/sessions/logs.
-- Joueurs = ANONYMES : aucun accès direct aux tables. Ils passent par Realtime (broadcast/presence) ;
--           c'est l'animateur qui valide les réponses et écrit les logs. RLS = défense par défaut.
-- (gen_random_uuid() est disponible nativement sur Supabase.)

-- ───────────── Tables ─────────────
create table if not exists public.quizzes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  config     jsonb not null default '{"questions":[]}',   -- { questions:[{id,type,text,options,correct,points,timer}] }
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,                         -- ex "7KQ3PA" (généré côté app)
  host_id    uuid not null references auth.users(id) on delete cascade,
  quiz_id    uuid references public.quizzes(id) on delete set null,
  status     text not null default 'lobby' check (status in ('lobby','playing','ended')),
  settings   jsonb not null default '{"timer":20,"speedBonus":true}',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at   timestamptz
);
create index if not exists idx_sessions_code on public.sessions(code);
create index if not exists idx_sessions_host on public.sessions(host_id);

create table if not exists public.players (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name       text not null,                                -- pseudo uniquement (RGPD)
  score      int  not null default 0,
  joined_at  timestamptz not null default now()
);
create index if not exists idx_players_session on public.players(session_id);

create table if not exists public.answers (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  question_id text not null,
  value       text,
  is_correct  boolean,
  time_ms     int,
  points      int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_answers_session  on public.answers(session_id);
create index if not exists idx_answers_question on public.answers(session_id, question_id);

create table if not exists public.results (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  player_name text not null,
  final_score int not null,
  rank        int not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_results_session on public.results(session_id);

-- ───────────── Row Level Security ─────────────
alter table public.quizzes  enable row level security;
alter table public.sessions enable row level security;
alter table public.players  enable row level security;
alter table public.answers  enable row level security;
alter table public.results  enable row level security;

-- L'animateur gère ses propres quizz
create policy "quizzes_owner_all" on public.quizzes
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- L'animateur gère ses propres sessions
create policy "sessions_owner_all" on public.sessions
  for all to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

-- Helper : l'utilisateur courant est-il l'hôte de cette session ?
create or replace function public.is_session_host(sid uuid)
returns boolean
language sql security invoker stable
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = sid and s.host_id = auth.uid()
  );
$$;

-- players / answers / results : accessibles uniquement par l'hôte de la session
create policy "players_host_all" on public.players
  for all to authenticated
  using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

create policy "answers_host_all" on public.answers
  for all to authenticated
  using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

create policy "results_host_all" on public.results
  for all to authenticated
  using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

-- IMPORTANT : aucune policy pour le rôle 'anon'.
-- → Les joueurs anonymes ne lisent/écrivent AUCUNE table. RLS bloque par défaut.
--   Toute la synchro joueurs se fait via Realtime ; les écritures passent par l'animateur.

-- ───────────── Rétention RGPD (optionnel — à activer après pg_cron) ─────────────
-- Database → Extensions → activer "pg_cron", puis :
-- select cron.schedule(
--   'purge-old-sessions', '0 3 * * *',
--   $$ delete from public.sessions where created_at < now() - interval '365 days' $$
-- );
