// La bibliothèque est servie depuis notre propre domaine (src/lib/vendor/),
// et non depuis un CDN externe : sur un réseau d'entreprise filtrant, une
// requête vers esm.sh reste suspendue, le module ES n'est jamais évalué et
// l'application ne démarre pas du tout — sans la moindre erreur JS.
// Bundle régénérable : voir `npm run vendor`.
import { createClient } from './vendor/supabase.esm.js'

export const sb = createClient(
  'https://xavjaucknyeihzglnbey.supabase.co',
  'sb_publishable_wSvcNCDGp7nkj71eI3ivbA_MBMmDwDU',
  { auth: { persistSession: true, autoRefreshToken: true } }
)
