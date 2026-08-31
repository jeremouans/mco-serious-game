-- 0008_submissions_open_kind.sql
--
-- Nouveau type de question « Question ouverte » (kind = 'open') :
-- une question est posée, les participants répondent en texte libre,
-- les réponses s'affichent à l'écran. Aucun point, aucun vote.
--
-- Les réponses sont loguées dans `submissions` avec :
--   kind      = 'open'
--   round_key = id de la QUESTION (et non de la manche, contrairement aux
--               manches participatives) → une ligne par participant et par
--               question ouverte.
--
-- Sans cette migration, la contrainte CHECK rejette les inserts et les
-- réponses ouvertes disparaissent des bilans / exports.

alter table public.submissions
  drop constraint if exists submissions_kind_check;

alter table public.submissions
  add constraint submissions_kind_check
  check (kind = any (array['idea'::text, 'engage'::text, 'engage-free'::text, 'open'::text]));

-- Les bilans / exports filtrent souvent par (session_id, round_key).
create index if not exists idx_submissions_session_round
  on public.submissions(session_id, round_key);
