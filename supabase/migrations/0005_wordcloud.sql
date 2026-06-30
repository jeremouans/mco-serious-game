-- Migration 0005 : Votes nuage de mots + colonnes joueurs + notation étoiles

-- Votes wordcloud (animateur collecte via Realtime)
CREATE TABLE IF NOT EXISTS public.wordcloud_votes (
  id           bigint generated always as identity primary key,
  session_id   uuid not null references public.sessions(id) on delete cascade,
  round_key    text not null,
  voter_tempid text not null,
  word         text not null,
  created_at   timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_wordcloud_votes_session ON public.wordcloud_votes(session_id, round_key);

ALTER TABLE public.wordcloud_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wordcloud_votes_host_all" ON public.wordcloud_votes
  FOR ALL TO authenticated
  USING (public.is_session_host(session_id))
  WITH CHECK (public.is_session_host(session_id));

CREATE POLICY "wordcloud_votes_admin_read" ON public.wordcloud_votes
  FOR SELECT TO authenticated USING (public.is_admin());

-- Notation étoiles sur les votes d'engagement (1-5)
ALTER TABLE public.votes
  ADD COLUMN IF NOT EXISTS rating int CHECK (rating BETWEEN 1 AND 5);

-- Prénom + nom sur les joueurs (en plus de name pour compatibilité)
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text;
