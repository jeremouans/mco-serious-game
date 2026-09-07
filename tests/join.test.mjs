// Parcours mobile : choix de catégorie d'engagement.
import { moduleDe, fonction, suite } from './_util.mjs'
const src = moduleDe('src/join/index.html')
const t = suite('Mobile')

const els = {}
const mk = () => ({ style:{}, classList:{ _s:new Set(),
  add(c){this._s.add(c)}, remove(c){this._s.delete(c)},
  toggle(c,v){v?this._s.add(c):this._s.delete(c)}, contains(c){return this._s.has(c)} },
  textContent:'', innerHTML:'', disabled:false, dataset:{},
  querySelectorAll:()=>[], appendChild(){}, addEventListener(){} })
for (const id of ['engage-subject-p','engage-intro-p','engage-cat-grid','engage-step1','engage-step2',
  'engage-submit-btn','engage-input-err','engage-change-cat-btn','engage-cat-fixe',
  'engage-action-chips','engage-moyen-chips','engage-echeance-chips',
  'engage-action-inp','engage-moyen-inp','engage-echeance-inp',
  'ep-action','ep-moyen','ep-echeance']) els[id] = mk()
const $ = id => els[id]
globalThis.document = { createElement: () => mk() }
const escHtml = s => String(s || '')
const clearInterval = () => {}
const PS = { timerInterval: null }, P4J = {}
let engageCategories = [], engageState = {}
const showScreen = () => {}
const buildEngageChips = () => {}, updateEngagePreview = () => {}
const handleEngagePrompt    = eval(`(${fonction(src, 'handleEngagePrompt')})`)
const selectEngageCategory  = eval(`(${fonction(src, 'selectEngageCategory')})`)
const cat = n => ({ name:'Cat ' + n, slots:{ action:['a'], moyen:['m'], echeance:['e'] } })

t.section('plusieurs catégories')
handleEngagePrompt({ subject:'S', categories:[cat(1),cat(2),cat(3)] })
t.ok('écran de choix affiché', els['engage-step1'].style.display === 'flex')
t.ok('aucune présélection', engageState.catIdx == null)

t.section('une seule catégorie')
handleEngagePrompt({ subject:'S', categories:[cat(1)] })
t.ok('étape de choix sautée', els['engage-step1'].style.display === 'none')
t.ok('rédaction affichée directement', els['engage-step2'].style.display === 'flex')
t.ok('catégorie sélectionnée d’office', engageState.catIdx === 0)
t.ok('« changer » masqué', els['engage-change-cat-btn'].style.display === 'none')
t.ok('catégorie rappelée', els['engage-cat-fixe'].textContent === 'Cat 1')

t.section('aucune catégorie')
handleEngagePrompt({ subject:'S', categories:[] })
t.ok('écran de choix conservé', els['engage-step1'].style.display === 'flex')

t.section('retour à plusieurs catégories')
handleEngagePrompt({ subject:'S', categories:[cat(1),cat(2)] })
selectEngageCategory(1)
t.ok('« changer » réaffiché', els['engage-change-cat-btn'].style.display === 'inline-block')
t.ok('rappel masqué', els['engage-cat-fixe'].style.display === 'none')
t.fin()
