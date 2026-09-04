-- 0011_rls_initplan_et_index.sql
--
-- L'audit de performance Supabase signale 6 avertissements « Auth RLS
-- Initialization Plan » sur les politiques introduites en 0009 : `auth.uid()`
-- et `is_admin()` y sont réévalués POUR CHAQUE LIGNE. Les envelopper dans un
-- `(select ...)` les transforme en InitPlan, évalué une seule fois par requête.
-- Sans effet visible sur 110 sessions, mais déterminant à l'échelle.
--
-- Ajoute aussi l'index manquant sur answers.player_id : une session de 1000
-- participants génère 1000 lignes par question, et la clé étrangère vers
-- players n'était couverte par aucun index.

-- ── Sessions ────────────────────────────────────────────────────────────────
drop policy if exists "sessions_select" on public.sessions;
drop policy if exists "sessions_insert" on public.sessions;
drop policy if exists "sessions_update" on public.sessions;
drop policy if exists "sessions_delete" on public.sessions;

create policy "sessions_select" on public.sessions for select to authenticated
  using (host_id = (select auth.uid()) or (select public.is_admin()));
create policy "sessions_insert" on public.sessions for insert to authenticated
  with check (host_id = (select auth.uid()) and (select public.is_host()));
create policy "sessions_update" on public.sessions for update to authenticated
  using (host_id = (select auth.uid()) or (select public.is_admin()))
  with check (host_id = (select auth.uid()) or (select public.is_admin()));
create policy "sessions_delete" on public.sessions for delete to authenticated
  using (host_id = (select auth.uid()) or (select public.is_admin()));

-- ── Profils ─────────────────────────────────────────────────────────────────
drop policy if exists "host_profiles_select" on public.host_profiles;
drop policy if exists "host_profiles_insert" on public.host_profiles;
drop policy if exists "host_profiles_update" on public.host_profiles;
drop policy if exists "host_profiles_delete" on public.host_profiles;

create policy "host_profiles_select" on public.host_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "host_profiles_insert" on public.host_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "host_profiles_update" on public.host_profiles for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "host_profiles_delete" on public.host_profiles for delete to authenticated
  using ((select public.is_admin()));

-- ── Quiz et gestion des accès : même traitement ─────────────────────────────
drop policy if exists "quizzes_select" on public.quizzes;
drop policy if exists "quizzes_insert" on public.quizzes;
drop policy if exists "quizzes_update" on public.quizzes;
drop policy if exists "quizzes_delete" on public.quizzes;

create policy "quizzes_select" on public.quizzes for select to authenticated using ((select public.is_host()));
create policy "quizzes_insert" on public.quizzes for insert to authenticated with check ((select public.is_admin()));
create policy "quizzes_update" on public.quizzes for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "quizzes_delete" on public.quizzes for delete to authenticated using ((select public.is_admin()));

drop policy if exists "admin_emails_all" on public.admin_emails;
drop policy if exists "host_whitelist_all" on public.host_whitelist;
create policy "admin_emails_all" on public.admin_emails for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "host_whitelist_all" on public.host_whitelist for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ── Index manquant sur la clé étrangère la plus sollicitée ──────────────────
create index if not exists idx_answers_player on public.answers(player_id);
