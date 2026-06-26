# Engagements 2030 — le Quizz **LIVE**

Brief projet pour Claude Code. Lis-le avant d'agir.

## Le projet
Version temps réel (type Kahoot) du serious game MGEN « Engagements 2030, le Quizz ».
L'animateur diffuse les questions sur un écran ; les participants répondent depuis leur **mobile**
via un **code de session**. Points attribués **automatiquement**, **toutes les parties loguées**.

## Décisions actées (ne pas re-débattre sans raison)
- **Backend : Supabase managé**, projet en **région UE (Paris/Francfort)** — exigence RGPD.
- **Modèle « écran-animateur fait autorité »** : la logique de jeu vit dans le navigateur de
  l'animateur ; **Supabase Realtime** sert de relais. Avantage : la bonne réponse ne part
  jamais vers les mobiles avant la révélation (anti-triche).
- **Joueurs anonymes** (code + pseudo). **Aucun mode masqué** (les gens saisissent sur leur tel).
- **Front : PWA vanilla JS** (réutilise ~80 % d'un front déjà écrit ; remplacer la couche
  Socket.IO par `@supabase/supabase-js` Realtime). Hébergement front : Vercel/Netlify/Cloudflare (UE).

## Stack
- Supabase : **Postgres** (données + logs), **Realtime** (Broadcast + Presence), **Auth** (animateur, lien magique).
- Front statique PWA.

## Modèle de données (voir `supabase/migrations/0001_init.sql`)
`quizzes` (owner) · `sessions` (code, host, status, settings) · `players` (pseudo, score) ·
`answers` (log par réponse) · `results` (classement final).

## Posture RLS (sécurité = thème central du projet)
- RLS activée partout. **L'animateur authentifié possède** ses quizz/sessions, et est le **seul**
  à lire/écrire players/answers/results de ses sessions (via `is_session_host()`).
- **Le rôle `anon` n'a AUCUNE policy** → zéro accès direct aux tables pour les joueurs.
  Les joueurs n'utilisent que Realtime ; l'animateur écrit les logs.
- Ne jamais utiliser la **service_role key** côté navigateur. L'animateur agit avec son JWT user.

## Design temps réel (à implémenter en Phase 1-2)
- Un canal par session : `session:{CODE}`.
- **Presence** : lobby live (qui rejoint/part).
- **Broadcast animateur → joueurs** : `question:show` { index, total, text, options, endsAt },
  puis `question:reveal`, `scoreboard`, `game:ended`.
- **Broadcast joueurs → animateur** : `answer` { tempId, value, clientTs }.
- **Minuteur** : `endsAt` (timestamp absolu) diffusé par l'animateur → tous les mobiles calent
  leur compte à rebours dessus (synchro même avec latence). Réponses après `endsAt` ignorées.
- **Durcissement** (à prévoir) : passer les canaux Realtime en **privé** + Realtime Authorization
  (RLS sur `realtime.messages`) une fois le flux fonctionnel.

## Contraintes RGPD (contexte MGEN — « défendable »)
- Région UE ; **pseudos uniquement** (pas d'email joueur, pas de donnée sensible).
- Signer le **DPA Supabase** ; lister sous-traitants (Supabase, AWS) dans les mentions.
- **Rétention** : purge des sessions > 365 j (bloc pg_cron commenté dans la migration).
- Prévoir une **page consentement/mentions** + une ligne au **registre des traitements**.

## Sécurité du MCP Supabase
- URL **scopée au projet** (`project_ref=…`) ✓. Garder « valider chaque appel d'outil » activé.
- Écriture OK tant qu'il n'y a **pas de vraies données**. Dès qu'il y a des pseudos réels :
  passer le MCP en **`read_only=true`** (ou bosser sur une *branch* Supabase).

## État d'avancement
- [x] **Phase 0** — schéma + RLS : `supabase/migrations/0001_init.sql` (à appliquer).
- [ ] **Phase 1** — Auth animateur + création de session (code + QR) + lobby (Presence).
- [ ] **Phase 2** — Boucle quizz temps réel (broadcast, minuteur `endsAt`, scoring auto, reveal, scoreboard, logs).
- [ ] **Phase 3** — Historique « mes parties » + bilan d'appropriation (export PDF).
- [ ] **Phase 4** — Manches participatives mobiles (« L'idée en Or », « Mes engagements » : saisie + vote sur tel).
- [ ] **Phase 5** — Polish PWA, reconnexion, Realtime privé, rétention auto.

## Conventions
- **UI en français**, ton fun-mais-on-brand MGEN.
- Charte MGEN : Evergreen `#113124`, MGEN green `#6AA517`, bright `#8CC63F`, Maya blue `#86BFEB`,
  cream `#F1E9D2`, gold `#F4C84A`. Police **Outfit**. Logo : carré vert + « mgen » + étoile.
- Format d'une question : `{ id, type:"choice"|"truefalse", text, options:[…], correct:<index>, points?, timer? }`.
