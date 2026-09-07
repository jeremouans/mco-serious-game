// Intégration des participants arrivant après le démarrage de la partie.
import { moduleDe, fonction, suite } from './_util.mjs'
const src = moduleDe('src/host/index.html')
const t = suite('Joueurs tardifs')

let inserted = [], failInsert = false
const sb = { from: () => ({ insert: rows => ({ select: async () =>
  failInsert ? { data:null, error:{message:'réseau'} }
             : (inserted.push(...[].concat(rows)),
                { data: [].concat(rows).map((_, i) => ({ id:'p' + (inserted.length - [].concat(rows).length + i) })), error:null }) }) }) }
let presence = []
const activeChannel = { presenceState: () => ({ k: presence }) }
let activeSession = { id:'S1', settings:{ manager:'M' } }, OFFLINE_MODE = false, GS = null
let syncLateEnCours = false
const els = {}
const $ = id => (els[id] ||= { textContent:'' })
;['ans-total','sq-ans-total','idea-total-players','idea-vote-total','engage-total-players',
  'engagefree-total-players','open-total-players','wc-total-players'].forEach(id => $(id))
const updatePlayerTotals = eval(`(${fonction(src, 'updatePlayerTotals')})`)
const syncLatePlayers    = eval(`(${fonction(src, 'syncLatePlayers')})`)

GS = { players:new Map([['t1',{name:'Anne',score:0}],['t2',{name:'Bob',score:0}]]),
       dbPlayerIds:new Map([['t1','p-a'],['t2','p-b']]), ended:false }
presence = [{role:'player',tempId:'t1',name:'Anne'},{role:'player',tempId:'t2',name:'Bob'}]
await syncLatePlayers()
t.ok('aucun ajout inutile', GS.players.size === 2 && inserted.length === 0)

presence.push({ role:'player', tempId:'t3', name:'Cyane', emoji:'🦊', email:'c@x.fr' })
await syncLatePlayers()
t.ok('ajouté à la partie', GS.players.size === 3)
t.ok('score initialisé à 0', GS.players.get('t3').score === 0)
t.ok('ligne créée en base', inserted.length === 1 && inserted[0].name === 'Cyane')
t.ok('email conservé', inserted[0].email === 'c@x.fr')
t.ok('identifiant mémorisé', GS.dbPlayerIds.get('t3') === 'p0')
t.ok('dénominateurs mis à jour', $('ans-total').textContent === 3 && $('open-total-players').textContent === 3)

presence = presence.filter(p => p.tempId !== 't3')
await syncLatePlayers()
t.ok('départ : le score survit', GS.players.size === 3)

presence.push({ role:'player', tempId:'t4', name:'Dan' })
failInsert = true; await syncLatePlayers(); failInsert = false
t.ok('échec réseau : compté en mémoire', GS.players.has('t4'))
t.ok('échec réseau : pas d’identifiant', !GS.dbPlayerIds.has('t4'))

GS.ended = true
presence.push({ role:'player', tempId:'t5', name:'Eve' })
await syncLatePlayers()
t.ok('partie close : plus d’ajout', !GS.players.has('t5'))

GS.ended = false; OFFLINE_MODE = true
const avant = inserted.length
presence.push({ role:'player', tempId:'t6', name:'Fred' })
await syncLatePlayers()
t.ok('hors ligne : aucune écriture', inserted.length === avant && !GS.players.has('t6'))
t.fin()
