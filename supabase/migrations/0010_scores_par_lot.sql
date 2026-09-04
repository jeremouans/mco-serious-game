-- 0010_scores_par_lot.sql
--
-- persistScores() émettait UNE requête HTTP par joueur à chaque affichage du
-- classement. Mesuré en base : 1000 mises à jour individuelles = 10,5 s de
-- travail serveur (hors latence réseau), contre 65 ms pour une seule requête
-- groupée. À 1000 participants et 14 questions, cela représentait 14 000
-- requêtes HTTP par partie.
--
-- security invoker : la RLS de `players` s'applique normalement, seul l'hôte
-- de la session (ou un admin) peut donc écrire.

create or replace function public.set_player_scores(
  p_session uuid, p_ids uuid[], p_scores int[]
) returns int
language plpgsql security invoker set search_path = public as $fn$
declare n int;
begin
  if p_ids is null or p_scores is null or array_length(p_ids,1) is distinct from array_length(p_scores,1) then
    raise exception 'ids et scores doivent avoir la même longueur';
  end if;
  update public.players p
     set score = s.score
    from (select unnest(p_ids) as id, unnest(p_scores) as score) s
   where p.id = s.id and p.session_id = p_session;
  get diagnostics n = row_count;
  return n;
end $fn$;

grant execute on function public.set_player_scores(uuid, uuid[], int[]) to authenticated;
