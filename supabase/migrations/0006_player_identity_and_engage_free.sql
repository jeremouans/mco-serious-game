-- 0006_player_identity_and_engage_free.sql
--
-- Ajoute l'identité étendue des participants (email pro + manager) sur les
-- tables `players` et `submissions` pour permettre :
--   - la saisie côté mobile (prénom + email pro + manager)
--   - les exports CSV côté admin (idées, engagements, engagements libres)
--
-- Toutes les colonnes sont NULLABLE pour préserver la rétro-compatibilité
-- des sessions existantes.

alter table public.players
  add column if not exists email   text,
  add column if not exists manager text;

alter table public.submissions
  add column if not exists author_email   text,
  add column if not exists author_manager text;

-- Utile pour le filtre date des exports admin (déjà couvert par
-- l'index par défaut sur session_id mais on ajoute pour clarté).
create index if not exists idx_submissions_kind_created on public.submissions(kind, created_at);
