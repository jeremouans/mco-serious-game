-- 0007_submissions_engage_free_kind.sql
--
-- La contrainte `submissions.kind` limitait les valeurs à ('idea','engage').
-- On y ajoute le nouveau kind 'engage-free' introduit par la manche
-- "Engagement libre" (choix personnel/équipe + texte libre), sinon les
-- inserts en jeu échouent silencieusement côté host.

alter table public.submissions
  drop constraint if exists submissions_kind_check;

alter table public.submissions
  add constraint submissions_kind_check
  check (kind = any (array['idea'::text, 'engage'::text, 'engage-free'::text]));
