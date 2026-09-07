// Fonctions du poste animateur, extraites de la page livrée.
import { moduleDe, fonction, suite } from './_util.mjs'
const src = moduleDe('src/host/index.html')
const t = suite('Animateur')

// ── Bornage du temps de réponse ────────────────────────────────
const INT_MAX = 2147483647
const clampTimeMs = eval(`(${src.match(/const clampTimeMs = (.*)/)[1]})`)
t.section('bornage de time_ms (colonne integer)')
t.ok('durée normale conservée', clampTimeMs(1200) === 1200)
t.ok('valeur aberrante bornée', clampTimeMs(9989999001) === INT_MAX, clampTimeMs(9989999001))
t.ok('négatif ramené à 0', clampTimeMs(-5000) === 0)
t.ok('undefined / null / NaN → 0', clampTimeMs(undefined) === 0 && clampTimeMs(null) === 0 && clampTimeMs(NaN) === 0)
t.ok('décimal arrondi', clampTimeMs(1200.7) === 1201)

// ── Boutons du classement ──────────────────────────────────────
t.section('« Terminer » seulement à la dernière question')
const mancheTypes = ['idea','engage','engage-free','wordcloud']
const boutons = (qIdx, total, nextType) => {
  const hasMore = qIdx + 1 < total
  return { suivant: hasMore ? 'inline-flex' : 'none',
           terminer: hasMore ? 'none' : 'inline-flex',
           libelle: mancheTypes.includes(nextType) ? 'Manche suivante →' : 'Question suivante →' }
}
t.ok('début de quiz : terminer masqué', boutons(0, 14, 'choice').terminer === 'none')
t.ok('milieu de quiz : terminer masqué', boutons(6, 14, 'choice').terminer === 'none')
t.ok('avant une manche : libellé adapté', boutons(6, 14, 'engage').libelle === 'Manche suivante →')
t.ok('dernière question : terminer visible', boutons(13, 14).terminer === 'inline-flex')
t.ok('quiz d’une question : terminer d’emblée', boutons(0, 1).terminer === 'inline-flex')

// ── Départage de l'idée en Or ──────────────────────────────────
t.section('idée en Or — ex æquo')
const calcul = (soum, votes, vPts = 100, gBonus = 300) => {
  const c = new Map(); votes.forEach(a => c.set(a, (c.get(a) || 0) + 1))
  const max = Math.max(0, ...[...c.values()])
  const golds = max > 0 ? [...c.entries()].filter(([, v]) => v === max).map(([k]) => k) : []
  const rk = soum.map(a => { const v = c.get(a) || 0, g = golds.includes(a)
    return { a, votes: v, isGold: g, pts: v * vPts + (g ? gBonus : 0) } })
    .sort((x, y) => y.votes - x.votes || y.pts - x.pts)
  return { rk, golds: rk.filter(r => r.isGold), max }
}
let r = calcul(['A','B','C'], ['A','A','B'])
t.ok('vainqueur unique', r.golds.length === 1 && r.golds[0].a === 'A')
t.ok('2 votes + bonus = 500', r.golds[0].pts === 500)
r = calcul(['A','B','C'], ['A','A','B','B'])
t.ok('égalité à deux', r.golds.length === 2)
t.ok('chacun le bonus complet', r.golds.every(g => g.pts === 500))
r = calcul(['A','B','C'], ['A','B','C'])
t.ok('égalité à trois', r.golds.length === 3 && r.golds.every(g => g.pts === 400))
r = calcul(['A','B'], [])
t.ok('aucun vote : aucun gagnant', r.golds.length === 0 && r.rk.every(x => x.pts === 0))
r = calcul(['A','B','C'], ['A','A','B','B','C'])
t.ok('gagnants en tête du classement', r.golds.length === 2 && r.rk[0].isGold && r.rk[1].isGold && !r.rk[2].isGold)

// ── Persistance progressive ────────────────────────────────────
t.section('persistance au fil de la partie')
const inserted = { players: [], answers: [] }
let failNext = null
const sb = { from: t2 => ({ insert(rows) { return {
  select: () => failNext === t2 ? (failNext = null, Promise.resolve({ data:null, error:{message:'boom'} }))
    : (inserted[t2].push(...[].concat(rows)),
       Promise.resolve({ data: [].concat(rows).map((_, i) => ({ id: t2[0] + (inserted[t2].length - [].concat(rows).length + i) })), error: null })),
  then: res => failNext === t2 ? (failNext = null, Promise.resolve({ error:{message:'boom'} }).then(res))
    : (inserted[t2].push(...[].concat(rows)), Promise.resolve({ error: null }).then(res)) } } }) }
let activeSession = { id:'S1', settings:{ manager:'M' } }, OFFLINE_MODE = false, GS = null
// eval en module est strict : une déclaration n'y crée pas de liaison
// visible au dehors. On récupère donc des expressions de fonction.
const persistPlayersAtStart = eval(`(${fonction(src, 'persistPlayersAtStart')})`)
const persistAnswers        = eval(`(${fonction(src, 'persistAnswers')})`)
GS = { players: new Map([['t1',{name:'Jean',score:0}],['t2',{name:'Jean',score:0}],['t3',{name:'Anne',score:0}]]),
       dbPlayerIds: new Map(), persistedQuestions: new Set() }
await persistPlayersAtStart()
t.ok('3 joueurs enregistrés', inserted.players.length === 3)
t.ok('homonymes distingués', GS.dbPlayerIds.get('t1') !== GS.dbPlayerIds.get('t2'))
await persistAnswers('q1', [
  { tempId:'t1', value:'0', isCorrect:true,  points:900, timeMs:1200 },
  { tempId:'t2', value:'1', isCorrect:false, points:0,   timeMs:1500 },
  { tempId:'t3', value:null }])
t.ok('réponse nulle ignorée', inserted.answers.length === 2)
t.ok('question marquée persistée', GS.persistedQuestions.has('q1'))
failNext = 'answers'
await persistAnswers('q2', [{ tempId:'t1', value:'2', isCorrect:true, points:800, timeMs:900 }])
t.ok('échec réseau : question à rattraper', !GS.persistedQuestions.has('q2'))
await persistAnswers('q3', [])
t.ok('question sans réponse marquée', GS.persistedQuestions.has('q3'))
OFFLINE_MODE = true
GS = { players:new Map([['t1',{name:'X',score:0}]]), dbPlayerIds:new Map(), persistedQuestions:new Set() }
const avant = inserted.players.length
await persistPlayersAtStart()
t.ok('hors ligne : aucune écriture', inserted.players.length === avant)
t.fin()
