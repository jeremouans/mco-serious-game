# Spec — Phases 4 & 5 · Engagements 2030 le Quizz LIVE

Spec destinée à Claude Code. Prérequis : Phases 0–3 livrées (schéma + RLS, auth animateur,
lobby, boucle quizz temps réel, bilan). Mêmes règles que `CLAUDE.md` :
modèle **écran-animateur fait autorité** + **Supabase Realtime**, **joueurs anonymes**
(aucun accès direct aux tables ; tout passe par Realtime, l'animateur écrit les logs),
**RLS** stricte, **région UE**, charte MGEN reprise de `reference/`.

---

# PHASE 4 — Manches participatives sur mobile

Porter les deux manches du jeu d'origine vers le multi-écran : chacun saisit **et vote depuis son téléphone**.
Le **mode masqué disparaît** (plus aucune saisie par l'animateur), l'**anonymat devient natif**.

## 4.1 Objectif
Transformer la compréhension en **production collective** : faire émerger des idées (créativité) et
des engagements individuels (passage à l'action), avec vote du groupe, en gardant l'esprit du jeu d'origine.

## 4.2 Périmètre
**Inclus :** manche « L'idée en Or » (idea), manche « Mes engagements » (engage), saisie + vote mobile,
scoring, anonymisation, intégration au bilan (Phase 3), logs.
**Exclus :** édition de ces manches dans un éditeur (réutiliser/étendre l'éditeur existant plus tard),
modération avancée (Phase 5 : sanitation de base seulement).

## 4.3 Manche « L'idée en Or » (idea)

### Déroulé
1. **Annonce** — l'animateur lance la manche ; le serveur/host diffuse `round:idea:prompt`
   { challenge (texte du défi), endsAt (fin de saisie) }. Écran + mobiles affichent le défi + compte à rebours.
2. **Saisie** — chaque joueur écrit **une** idée sur son mobile (`submit:idea` { text }). L'écran animateur
   montre un compteur `n/N idées` (sans le contenu). Fin = endsAt atteint **ou** tous ont soumis.
3. **Vote** — l'animateur (host) **mélange et anonymise** les idées, puis diffuse `round:idea:vote`
   { items:[{tempId, text}] } (sans auteur). Chaque joueur vote pour **sa préférée** (`vote:idea` { tempId }).
   On **ne peut pas voter pour sa propre idée** (le host filtre par auteur). Compte à rebours de vote.
4. **Révélation** — le host comptabilise, diffuse `round:idea:reveal`
   { ranking:[{tempId, text, author, votes}], goldTempId }. L'écran couronne **l'idée en or** (confettis MGEN),
   dé-anonymise, attribue les points. Mobiles affichent leur résultat.

### Scoring (paramétrable dans `settings`)
- `ideaVotePoints` (défaut 100) : points à l'auteur **par vote reçu**.
- `ideaGoldBonus` (défaut 300) : bonus à l'auteur de l'idée la plus votée.
- Égalité : co-gagnants, chacun reçoit le bonus.

## 4.4 Manche « Mes engagements » (engage)

> Amélioration LIVE assumée : le jeu d'origine faisait passer les joueurs **à tour de rôle** (contrainte mono-écran).
> En multi-mobile, on passe en **saisie parallèle** (tout le monde en même temps) — plus rapide et plus vivant.

### Déroulé
1. **Annonce** — `round:engage:prompt` { categories:[…] (liste éditable, ~8 du plan), endsAt }.
2. **Saisie** — chaque joueur **choisit une catégorie** d'engagement + rédige sa phrase
   « Je m'engage à… » (`submit:engage` { category, text }). Compteur `n/N` côté écran.
3. **Vote multi-critères** — pour chaque engagement (anonymisé, présenté en carrousel), chaque joueur
   sélectionne les critères qu'il estime remplis : 🎯 Concret · ✅ Aligné · ✨ Inspirant · 🚀 Impact
   (`vote:engage` { tempId, criteria:[…] }). On ne vote pas pour le sien.
4. **Bonus animateur** — l'animateur peut ajouter un bonus à un engagement (`engage:bonus` { tempId, value }).
5. **Révélation** — `round:engage:reveal` { perSubmission:[{tempId, author, category, text, criteriaCounts, bonus, points}] }.
   Écran affiche les engagements, leurs scores et le total par personne.

### Scoring (paramétrable)
- `engageCriterionPoints` (défaut 50) : points à l'auteur **par vote-critère reçu** (un votant peut cocher 0–4 critères).
- `engageBonusMax` (défaut 200) : plafond du bonus animateur.

## 4.5 Modèle de données — migration `0003_participatory.sql`
```sql
-- Soumissions (idées + engagements) — écrites par l'animateur (host) qui collecte via Realtime
create table if not exists public.submissions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  round_key   text not null,                         -- identifiant de la manche dans le quizz
  kind        text not null check (kind in ('idea','engage')),
  author_id   uuid not null references public.players(id) on delete cascade,
  text        text not null,
  category    text,                                  -- pour 'engage'
  points      int not null default 0,
  is_gold     boolean not null default false,        -- pour 'idea'
  created_at  timestamptz not null default now()
);
create index if not exists idx_submissions_session on public.submissions(session_id);

-- Votes (un vote = une ligne) — anonymisation gérée à l'affichage
create table if not exists public.votes (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references public.sessions(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  voter_id      uuid not null references public.players(id) on delete cascade,
  criterion     text,                                -- null pour 'idea' ; 'concret'|'aligne'|'inspirant'|'impact' pour 'engage'
  created_at    timestamptz not null default now()
);
create index if not exists idx_votes_submission on public.votes(submission_id);

alter table public.submissions enable row level security;
alter table public.votes       enable row level security;

create policy "submissions_host_all" on public.submissions
  for all to authenticated
  using (public.is_session_host(session_id)) with check (public.is_session_host(session_id));
create policy "votes_host_all" on public.votes
  for all to authenticated
  using (public.is_session_host(session_id)) with check (public.is_session_host(session_id));
-- Toujours aucune policy 'anon' : joueurs via Realtime uniquement.
```

## 4.6 Realtime — événements (canal `session:{CODE}`)
- Host → joueurs : `round:idea:prompt`, `round:idea:vote`, `round:idea:reveal`,
  `round:engage:prompt`, `round:engage:vote`, `round:engage:reveal`.
- Joueurs → host : `submit:idea`, `submit:engage`, `vote:idea`, `vote:engage`.
- Compteurs de progression : `host:submitted` { n, total }, `host:voted` { n, total }.

## 4.7 UI
**Joueur (mobile)** : champ de saisie (idée), sélecteur de catégorie + champ (engagement),
interface de vote (idea = choix unique ; engage = carrousel + cases critères). États « envoyé », « en attente ».
**Animateur (écran projeté)** : défi + compte à rebours ; compteur de soumissions/votes (sans contenu pendant la saisie) ;
liste anonymisée pour le vote ; tally en direct ; écran de révélation (couronnement idée en or, confettis MGEN ;
tableau des engagements + scores). Reprendre la charte de `reference/`.

## 4.8 Intégration bilan (Phase 3)
Les idées produites (avec votes, idée en or) et les engagements pris (catégorie + phrase) **alimentent le
bilan d'appropriation** et l'export PDF. Réutiliser les sections « idées produites » / « engagements pris » du jeu d'origine.

## 4.9 Cas limites
- 0 ou 1 soumission → sauter le vote, message clair, pas de couronnement.
- Joueur qui ne soumet pas / ne vote pas → ignoré, pas de blocage du groupe.
- Texte vide, trop long (cap 280) → rejet côté host + message.
- Anti-auto-vote → le host filtre par `author_id`.
- Late join pendant une manche participative → peut voter mais pas soumettre si la saisie est close.
- Égalités → co-gagnants gérés.

## 4.10 Critères d'acceptation
- [ ] Une manche idea complète fonctionne de bout en bout (saisie → vote anonyme → couronnement) sur ≥ 3 mobiles.
- [ ] Une manche engage avec vote multi-critères + bonus animateur attribue des points cohérents.
- [ ] Aucune fuite d'auteur avant la révélation (vérifier les payloads Realtime).
- [ ] `submissions` et `votes` loguées ; RLS : aucun accès `anon`.
- [ ] Idées + engagements présents dans le bilan et l'export PDF.

---

# PHASE 5 — Polish, robustesse & conformité

Rendre le produit fiable, installable, sécurisé et « défendable RGPD » pour un usage réel MGEN.

## 5.1 PWA & ergonomie
- Manifeste + service worker : **installable** (« Ajouter à l'écran d'accueil »), icônes MGEN, écran de démarrage.
- **Plein écran** côté animateur (pour la projection) ; orientation et tailles adaptées mobile.
- **Accessibilité** : contrastes AA, cibles tactiles ≥ 44 px, libellés ARIA, respect de `prefers-reduced-motion`.
- Micro-soin : sons (option mute), confettis MGEN, transitions reprises de `reference/`.

## 5.2 Robustesse temps réel
- **Reconnexion** fiable host **et** joueur : jeton de session en `localStorage`, re-souscription au canal,
  **resynchronisation** de l'état courant (phase, question/manche, score) à la reconnexion.
- **Reprise animateur** : si l'onglet se ferme, la session doit pouvoir être reprise (au minimum message clair +
  ré-attache au canal ; idéalement état reconstituable depuis la base).
- **Tolérance réseau** : réponses/votes hors `endsAt` ignorés proprement ; idempotence (pas de double-compte si renvoi).
- **Charge** : valider ~50 joueurs simultanés ; surveiller les quotas Realtime du plan Supabase.

## 5.3 Sécurité (durcissement)
- **Realtime Authorization** : passer les canaux en **privé** + RLS sur `realtime.messages`
  (seuls l'hôte et les joueurs inscrits à la session peuvent lire/émettre sur `session:{CODE}`).
- **Sanitation des entrées** (idées, engagements, pseudos) : longueur max, échappement (anti-XSS à l'affichage),
  option filtre anti-grossièretés.
- **Anti-abus** : plafond de joueurs par session, throttling des soumissions/votes, codes de session à durée de vie limitée.
- **Secrets** : jamais de `service_role` côté client ; vérifier qu'aucun secret n'est committé.
- **MCP** : repasser le serveur Supabase en `read_only` dès qu'il y a des données réelles.

## 5.4 Conformité RGPD (finalisation — contexte MGEN)
- **Rétention auto** : activer `pg_cron` et la purge des sessions > 365 j (bloc commenté de `0001_init.sql`).
- **Page mentions/consentement** : finalité (jeu d'acculturation), base légale (intérêt légitime),
  durée de conservation, **sous-traitants listés (Supabase, AWS)**, droits des personnes.
- **DPA Supabase** signé ; **registre des traitements** renseigné ; **TIA** léger archivé.
- Confirmer **région UE** et **pseudos uniquement** (aucune donnée sensible, aucun email joueur).

## 5.5 Contrôles animateur (confort)
- **Ajustement des scores** : pouvoir **retirer/ajouter des points** à n'importe quel joueur à tout moment
  (reprendre la fonction du jeu d'origine ; pas configurable obligatoire mais utile pour corriger).
- Contrôles de partie : passer/rejouer une question, ré-ouvrir une question, sauter une manche, mettre en pause.

## 5.6 Observabilité & exploitation
- Journalisation minimale côté serveur (erreurs, fins de partie) ; gestion d'erreurs propre côté client.
- Écran « **mes parties** » (historique) pour l'animateur (s'appuie sur Phase 3).
- Surveillance des quotas Supabase (free tier) ; documenter le passage au plan Pro si la charge augmente.

## 5.7 Critères d'acceptation
- [ ] App installable (PWA) sur iOS et Android ; plein écran animateur OK.
- [ ] Coupure/reconnexion d'un joueur en pleine partie → il retrouve l'état sans perdre son score.
- [ ] Canaux Realtime privés : un non-participant ne peut ni lire ni émettre sur la session.
- [ ] Entrées assainies (test XSS sur une idée) ; plafond de joueurs respecté.
- [ ] Purge RGPD active ; page mentions en ligne ; région UE confirmée.
- [ ] L'animateur peut corriger un score (±) en cours de partie.

## 5.8 Risques / points d'attention
- **Reprise animateur** : en host-authoritative pur, la fermeture d'onglet est le point faible →
  si la résilience devient critique, envisager de déplacer une partie de l'état côté serveur (Edge Function).
- **Quotas Realtime** free tier au-delà de ~50 joueurs → tester tôt.
- **Anonymat** : vérifier qu'aucun payload Realtime ne révèle l'auteur avant la révélation.

---

## Découpage des PR conseillé
- `phase-4a-idea` : manche L'idée en Or (saisie → vote → couronnement) + migration `0003`.
- `phase-4b-engage` : manche Mes engagements (saisie parallèle → vote multi-critères → scores).
- `phase-4c-bilan` : intégration idées/engagements au bilan + PDF.
- `phase-5a-pwa-a11y` · `phase-5b-realtime-resilience` · `phase-5c-securite-realtime-prive`
  · `phase-5d-rgpd-retention` · `phase-5e-controles-animateur`.
