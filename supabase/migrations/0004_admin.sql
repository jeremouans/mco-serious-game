-- Migration 0004 : Admin, whitelist hosts, profils host

-- Email whitelist : seuls ces emails peuvent se connecter comme animateur
CREATE TABLE IF NOT EXISTS public.host_whitelist (
  email      text primary key,
  added_at   timestamptz not null default now()
);

-- Emails admin (accès lecture toutes les sessions)
CREATE TABLE IF NOT EXISTS public.admin_emails (
  email      text primary key,
  added_at   timestamptz not null default now()
);

-- Profils host (prénom + nom)
CREATE TABLE IF NOT EXISTS public.host_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name  text not null default '',
  updated_at timestamptz not null default now()
);

-- Fonction is_admin() : vrai si l'email courant est dans admin_emails
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_emails WHERE email = auth.email()
  );
$$;

-- RLS
ALTER TABLE public.host_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_emails   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_profiles  ENABLE ROW LEVEL SECURITY;

-- host_whitelist : seul l'admin peut gérer
CREATE POLICY "whitelist_admin_all" ON public.host_whitelist
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- admin_emails : lecture seule pour les admins (bootstrap par MCP/studio)
CREATE POLICY "admin_emails_read" ON public.admin_emails
  FOR SELECT TO authenticated USING (public.is_admin());

-- host_profiles : chaque host gère son propre profil, admin lit tous
CREATE POLICY "host_profiles_own" ON public.host_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "host_profiles_admin_read" ON public.host_profiles
  FOR SELECT TO authenticated USING (public.is_admin());

-- Lecture admin sur toutes les tables existantes (pour historique global)
CREATE POLICY "sessions_admin_read" ON public.sessions
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "players_admin_read" ON public.players
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "answers_admin_read" ON public.answers
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "results_admin_read" ON public.results
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "submissions_admin_read" ON public.submissions
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "votes_admin_read" ON public.votes
  FOR SELECT TO authenticated USING (public.is_admin());

-- Quizzes : tous les hosts authentifiés peuvent lire (pour choisir une config)
CREATE POLICY "quizzes_read_all" ON public.quizzes
  FOR SELECT TO authenticated USING (true);

-- Admin peut tout faire sur quizzes
CREATE POLICY "quizzes_admin_write" ON public.quizzes
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed : insérer l'email admin par défaut
INSERT INTO public.admin_emails (email) VALUES ('admin@mgen.fr') ON CONFLICT DO NOTHING;
