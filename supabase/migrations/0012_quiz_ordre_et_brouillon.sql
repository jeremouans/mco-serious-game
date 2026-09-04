-- 0012_quiz_ordre_et_brouillon.sql
--
-- Deux besoins de l'administration :
--   • ordonner les quiz (l'animateur les voyait dans l'ordre de création)
--   • mettre un quiz en brouillon pour qu'il n'apparaisse pas côté animateur
--
-- Le filtrage est porté par la RLS, pas seulement par l'interface : un
-- animateur ne doit pas pouvoir lire un brouillon en contournant le front.
-- Les admins continuent de voir et d'éditer tous les quiz.

alter table public.quizzes
  add column if not exists status     text not null default 'published',
  add column if not exists sort_order int  not null default 0;

alter table public.quizzes drop constraint if exists quizzes_status_check;
alter table public.quizzes
  add constraint quizzes_status_check check (status in ('draft','published'));

-- Ordre initial : celui de création, pour ne rien bousculer
update public.quizzes q
   set sort_order = t.rang
  from (select id, row_number() over (order by created_at) as rang from public.quizzes) t
 where t.id = q.id and q.sort_order = 0;

create index if not exists idx_quizzes_ordre on public.quizzes(sort_order, created_at);

-- Lecture : les admins voient tout, les animateurs seulement les quiz publiés
drop policy if exists "quizzes_select" on public.quizzes;
create policy "quizzes_select" on public.quizzes for select to authenticated
  using (
    (select public.is_admin())
    or (status = 'published' and (select public.is_host()))
  );
