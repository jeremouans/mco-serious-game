// Écran de connexion et détermination du rôle, extraits de /host.
import { moduleDe, fonction, suite } from './_util.mjs'
const src = moduleDe('src/host/index.html')
const t = suite('Connexion')

const el = {}
const mk = () => ({ style:{}, classList:{ _s:new Set(),
  add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, contains(c){return this._s.has(c)} },
  textContent:'', disabled:false })
for (const id of ['login-form','login-checking','login-signout-btn','login-err','login-btn']) el[id] = mk()
const $ = id => el[id]
let ecran = null
const showScreen = id => { ecran = id }
globalThis.window = {}
let rpcCalls = 0, rpcPlan = []
const sb = { rpc: async () => { const r = rpcPlan[Math.min(rpcCalls, rpcPlan.length-1)]; rpcCalls++; return r } }
const setLoginState = eval(`(${fonction(src, 'setLoginState')})`)
const fetchRole     = eval(`(${fonction(src, 'fetchRole')})`)

t.section('états de l’écran')
setLoginState('checking')
t.ok('formulaire masqué pendant la vérification', el['login-form'].style.display === 'none')
t.ok('indicateur visible', el['login-checking'].style.display === 'flex')
el['login-btn'].disabled = true; el['login-btn'].textContent = 'Connexion…'
setLoginState('form')
t.ok('formulaire rendu', el['login-form'].style.display === 'flex')
t.ok('bouton réactivé', el['login-btn'].disabled === false && el['login-btn'].textContent === 'Se connecter')
setLoginState('form', 'Pas autorisé', { sessionActive: true })
t.ok('message affiché', el['login-err'].classList.contains('show'))
t.ok('déconnexion proposée', el['login-signout-btn'].style.display === 'inline-flex')

t.section('détermination du rôle')
rpcCalls = 0; rpcPlan = [{ data:'host', error:null }]
t.ok('succès immédiat', (await fetchRole()).role === 'host' && rpcCalls === 1)
rpcCalls = 0; rpcPlan = [{ data:null, error:{message:'network'} }, { data:'host', error:null }]
t.ok('échec transitoire puis succès', (await fetchRole()).role === 'host' && rpcCalls === 2)
rpcCalls = 0; rpcPlan = [{ data:null, error:{message:'network'} }]
let r = await fetchRole()
t.ok('serveur injoignable → indéterminé', r.role === null)
t.ok('jamais assimilé à un refus', r.role !== 'none')
t.ok('3 tentatives', rpcCalls === 3)
rpcCalls = 0; rpcPlan = [{ data:'none', error:null }]
t.ok('compte sans rôle → refus net', (await fetchRole()).role === 'none')
t.fin()
