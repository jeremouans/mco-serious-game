// manage-users — gestion des comptes animateurs/admins
//
// SEUL endroit où vit la clé service_role : elle ne doit jamais atteindre le
// navigateur. Chaque appel est authentifié par le JWT de l'appelant, qui doit
// figurer dans `admin_emails`.
//
// Actions : list · create · set_password · set_role · delete

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // ── Authentification de l'appelant ──
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace(/^Bearer /i, '')
  if (!jwt) return json({ error: 'Non authentifié.' }, 401)

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  const caller = userData?.user
  if (userErr || !caller?.email) return json({ error: 'Session invalide.' }, 401)

  const { data: adminRow } = await admin.from('admin_emails')
    .select('email').eq('email', caller.email).maybeSingle()
  if (!adminRow) return json({ error: 'Réservé aux administrateurs.' }, 403)

  let body: any = {}
  try { body = await req.json() } catch { /* corps vide */ }
  const action = body.action

  // Rôle courant d'un email, d'après les deux tables de référence
  async function roleOf(email: string): Promise<string> {
    const [{ data: a }, { data: h }] = await Promise.all([
      admin.from('admin_emails').select('email').eq('email', email).maybeSingle(),
      admin.from('host_whitelist').select('email').eq('email', email).maybeSingle()
    ])
    return a ? 'admin' : h ? 'host' : 'none'
  }
  async function applyRole(email: string, role: string) {
    await admin.from('admin_emails').delete().eq('email', email)
    await admin.from('host_whitelist').delete().eq('email', email)
    if (role === 'admin') await admin.from('admin_emails').insert({ email })
    else if (role === 'host') await admin.from('host_whitelist').insert({ email })
  }
  const badPassword = (p: unknown) =>
    typeof p !== 'string' || p.length < 10 ? 'Le mot de passe doit faire au moins 10 caractères.' : null

  try {
    // ── Lister les comptes, avec rôle et nombre de sessions possédées ──
    if (action === 'list') {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (error) throw error
      const [{ data: admins }, { data: hosts }, { data: sessions }] = await Promise.all([
        admin.from('admin_emails').select('email'),
        admin.from('host_whitelist').select('email'),
        admin.from('sessions').select('host_id')
      ])
      const adminSet = new Set((admins || []).map(r => r.email))
      const hostSet  = new Set((hosts  || []).map(r => r.email))
      const counts: Record<string, number> = {}
      for (const s of sessions || []) counts[s.host_id] = (counts[s.host_id] || 0) + 1
      return json({
        users: data.users.map(u => ({
          id: u.id,
          email: u.email,
          role: adminSet.has(u.email!) ? 'admin' : hostSet.has(u.email!) ? 'host' : 'none',
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          sessions: counts[u.id] || 0,
          is_self: u.id === caller.id
        })).sort((a, b) => (a.email || '').localeCompare(b.email || ''))
      })
    }

    // ── Créer un compte ──
    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase()
      const role  = body.role === 'admin' ? 'admin' : 'host'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Adresse email invalide.' }, 400)
      const pwErr = badPassword(body.password)
      if (pwErr) return json({ error: pwErr }, 400)

      const { data, error } = await admin.auth.admin.createUser({
        email, password: body.password, email_confirm: true
      })
      if (error) {
        const dejaPris = /already|exist|registered/i.test(error.message)
        return json({ error: dejaPris ? 'Un compte existe déjà avec cet email.' : error.message }, 400)
      }
      await applyRole(email, role)
      return json({ ok: true, user: { id: data.user.id, email, role } })
    }

    // ── Redéfinir un mot de passe ──
    if (action === 'set_password') {
      const pwErr = badPassword(body.password)
      if (pwErr) return json({ error: pwErr }, 400)
      const { error } = await admin.auth.admin.updateUserById(String(body.user_id), { password: body.password })
      if (error) throw error
      return json({ ok: true })
    }

    // ── Changer le rôle ──
    if (action === 'set_role') {
      const email = String(body.email || '').trim().toLowerCase()
      const role  = ['admin', 'host', 'none'].includes(body.role) ? body.role : 'host'
      if (email === caller.email && role !== 'admin')
        return json({ error: 'Vous ne pouvez pas retirer votre propre accès administrateur.' }, 400)
      await applyRole(email, role)
      return json({ ok: true, role })
    }

    // ── Supprimer un compte ──
    // Garde-fou : sessions.host_id est en ON DELETE CASCADE. Supprimer un
    // compte qui possède des sessions effacerait aussi ses parties, ses
    // joueurs, ses réponses et ses engagements. On l'interdit sans
    // réattribution explicite.
    if (action === 'delete') {
      const userId = String(body.user_id || '')
      if (userId === caller.id) return json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, 400)

      const { count } = await admin.from('sessions')
        .select('id', { count: 'exact', head: true }).eq('host_id', userId)
      const owned = count || 0

      if (owned > 0 && !body.reassign_to) {
        return json({
          error: `Ce compte possède ${owned} session(s). Les supprimer effacerait définitivement ` +
                 `leurs parties, joueurs, réponses et engagements. Choisissez à qui les réattribuer.`,
          needs_reassign: true, sessions: owned
        }, 409)
      }
      if (owned > 0) {
        const { error: reErr } = await admin.from('sessions')
          .update({ host_id: String(body.reassign_to) }).eq('host_id', userId)
        if (reErr) throw reErr
      }

      const { data: u } = await admin.auth.admin.getUserById(userId)
      if (u?.user?.email) await applyRole(u.user.email, 'none')
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) throw error
      return json({ ok: true, reassigned: owned })
    }

    return json({ error: 'Action inconnue : ' + action }, 400)
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500)
  }
})
