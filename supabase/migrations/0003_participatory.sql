-- Soumissions (idées + engagements) — écrites par l'animateur après révélation
create table if not exists public.submissions (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions(id) on delete cascade,
  round_key     text not null,
  kind          text not null check (kind in ('idea','engage')),
  author_tempid text not null,
  author_name   text not null,
  text          text not null,
  category      text,
  points        int  not null default 0,
  is_gold       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_submissions_session on public.submissions(session_id);

create table if not exists public.votes (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references public.sessions(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  voter_tempid  text not null,
  voter_name    text not null,
  criterion     text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_votes_submission on public.votes(submission_id);

alter table public.submissions enable row level security;
alter table public.votes       enable row level security;

create policy "submissions_host_all" on public.submissions
  for all to authenticated
  using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

create policy "votes_host_all" on public.votes
  for all to authenticated
  using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));
