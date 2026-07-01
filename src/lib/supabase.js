import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const sb = createClient(
  'https://xavjaucknyeihzglnbey.supabase.co',
  'sb_publishable_wSvcNCDGp7nkj71eI3ivbA_MBMmDwDU',
  { auth: { persistSession: true, autoRefreshToken: true } }
)
