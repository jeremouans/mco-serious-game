-- 0009_rollback_rls_ouvert.sql — RETOUR ARRIÈRE UNIQUEMENT
--
-- Restaure exactement les politiques telles qu'elles étaient avant
-- 0009_auth_et_rls.sql. À n'appliquer QUE si le verrouillage casse la
-- production et qu'il faut rétablir le service en urgence.
--
-- ⚠️ Cet état laisse la base ENTIÈREMENT OUVERTE en lecture ET en écriture
--    à n'importe quel anonyme muni de la clé publique du front. Ne le laisser
--    en place que le temps de corriger.

drop function if exists public.my_role();
drop function if exists public.is_host();

do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy "admin_emails_read"        on public.admin_emails    for select using (auth.role() = 'authenticated');
create policy "answers_read_all"         on public.answers         for select using (true);
create policy "answers_write_all"        on public.answers         for all    using (true) with check (true);
create policy "host_profiles_read_all"   on public.host_profiles   for select using (true);
create policy "host_profiles_write_all"  on public.host_profiles   for all    using (true) with check (true);
create policy "whitelist_read_all"       on public.host_whitelist  for select using (true);
create policy "whitelist_write_auth"     on public.host_whitelist  for all    using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "players_read_all"         on public.players         for select using (true);
create policy "players_write_all"        on public.players         for all    using (true) with check (true);
create policy "quizzes_read_all"         on public.quizzes         for select using (true);
create policy "quizzes_write_all"        on public.quizzes         for all    using (true) with check (true);
create policy "results_read_all"         on public.results         for select using (true);
create policy "results_write_all"        on public.results         for all    using (true) with check (true);
create policy "sessions_read_all"        on public.sessions        for select using (true);
create policy "sessions_write_all"       on public.sessions        for all    using (true) with check (true);
create policy "submissions_read_all"     on public.submissions     for select using (true);
create policy "submissions_write_all"    on public.submissions     for all    using (true) with check (true);
create policy "votes_read_all"           on public.votes           for select using (true);
create policy "votes_write_all"          on public.votes           for all    using (true) with check (true);
create policy "wordcloud_votes_read_all" on public.wordcloud_votes for select using (true);
create policy "wordcloud_votes_write_all" on public.wordcloud_votes for all   using (true) with check (true);

create or replace function public.is_session_host(sid uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.sessions s where s.id = sid and s.host_id = auth.uid());
$$;
