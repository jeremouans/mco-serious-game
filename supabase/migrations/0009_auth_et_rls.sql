-- 0009_auth_et_rls.sql
--
-- Passage aux comptes nominatifs + fermeture de l'accès anonyme aux tables.
--
-- AVANT cette migration, les 11 tables portaient des politiques `USING (true)`
-- accordées au rôle `public` : n'importe qui, avec la seule clé publique
-- présente dans le source du front, pouvait LIRE et ÉCRIRE toutes les données
-- (119 participants avec leurs emails, 110 sessions, tous les engagements).
-- Vérifié : un DELETE anonyme sur `sessions` renvoyait HTTP 200.
--
-- APRÈS : plus aucune politique pour `anon`. Les joueurs n'en sont pas
-- affectés — /join ne fait aucun appel base, uniquement du Realtime.
--
-- Rôles : `admin_emails` = admin (tout) · `host_whitelist` = animateur.
-- Retour arrière : supabase/migrations/0009_rollback_rls_ouvert.sql

-- ── Fonctions d'autorisation ────────────────────────────────────────────────
-- Toutes en SECURITY DEFINER : elles interrogent des tables elles-mêmes
-- protégées par RLS, et seraient donc bloquées si elles s'exécutaient avec les
-- droits de l'appelant (récursion de politique).

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.admin_emails where email = auth.email());
$fn$;

create or replace function public.is_host()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.host_whitelist where email = auth.email())
      or exists (select 1 from public.admin_emails  where email = auth.email());
$fn$;

-- Un admin est considéré hôte de toutes les sessions (bilans, exports, support)
create or replace function public.is_session_host(sid uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.sessions s where s.id = sid and s.host_id = auth.uid())
      or exists (select 1 from public.admin_emails where email = auth.email());
$fn$;

-- Lu par le front au démarrage pour savoir quoi afficher
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $fn$
  select case
    when auth.uid() is null then 'anon'
    when exists (select 1 from public.admin_emails  where email = auth.email()) then 'admin'
    when exists (select 1 from public.host_whitelist where email = auth.email()) then 'host'
    else 'none'
  end;
$fn$;

grant execute on function public.my_role() to authenticated;
grant execute on function public.is_host() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ── Remise à plat des politiques ────────────────────────────────────────────
do $do$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $do$;

-- Toutes les politiques ci-dessous ciblent explicitement `authenticated`.
-- `anon` n'en reçoit AUCUNE : accès direct aux tables impossible.

-- Quiz : lisibles par tout animateur, modifiables par les admins seuls
create policy "quizzes_select" on public.quizzes for select to authenticated using (public.is_host());
create policy "quizzes_insert" on public.quizzes for insert to authenticated with check (public.is_admin());
create policy "quizzes_update" on public.quizzes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "quizzes_delete" on public.quizzes for delete to authenticated using (public.is_admin());

-- Sessions : chaque animateur gère les siennes, l'admin voit tout
create policy "sessions_select" on public.sessions for select to authenticated using (host_id = auth.uid() or public.is_admin());
create policy "sessions_insert" on public.sessions for insert to authenticated with check (host_id = auth.uid() and public.is_host());
create policy "sessions_update" on public.sessions for update to authenticated using (host_id = auth.uid() or public.is_admin()) with check (host_id = auth.uid() or public.is_admin());
create policy "sessions_delete" on public.sessions for delete to authenticated using (host_id = auth.uid() or public.is_admin());

-- Données de partie : réservées à l'hôte de la session concernée (ou admin)
create policy "players_all"         on public.players         for all to authenticated using (public.is_session_host(session_id)) with check (public.is_session_host(session_id));
create policy "answers_all"         on public.answers         for all to authenticated using (public.is_session_host(session_id)) with check (public.is_session_host(session_id));
create policy "results_all"         on public.results         for all to authenticated using (public.is_session_host(session_id)) with check (public.is_session_host(session_id));
create policy "submissions_all"     on public.submissions     for all to authenticated using (public.is_session_host(session_id)) with check (public.is_session_host(session_id));
create policy "votes_all"           on public.votes           for all to authenticated using (public.is_session_host(session_id)) with check (public.is_session_host(session_id));
create policy "wordcloud_votes_all" on public.wordcloud_votes for all to authenticated using (public.is_session_host(session_id)) with check (public.is_session_host(session_id));

-- Gestion des accès : admins uniquement
create policy "admin_emails_all"   on public.admin_emails   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "host_whitelist_all" on public.host_whitelist for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profils : chacun le sien, l'admin voit tout
create policy "host_profiles_select" on public.host_profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "host_profiles_insert" on public.host_profiles for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
create policy "host_profiles_update" on public.host_profiles for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "host_profiles_delete" on public.host_profiles for delete to authenticated using (public.is_admin());
