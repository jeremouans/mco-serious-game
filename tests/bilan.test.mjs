// Rendu des bilans : toutes les manches doivent ressortir, même si la config
// du quiz ne correspond plus aux données enregistrées.
import { chargerBilan, suite } from './_util.mjs'
const w = chargerBilan(), t = suite('Bilans')

const config = { manches: [
  { id:'m1', type:'quiz', name:'Manche 1', questions: [
    { id:'q1', type:'choice', text:'Capitale ?', options:['Paris','Lyon'], correct:0 },
    { id:'q2', type:'open',   text:"Qu'est-ce qui vous freine ?" },
    { id:'q3', type:'slide',  title:'Contexte', text:'Un texte' } ]},
  { id:'m2', type:'engage',      name:'Mes engagements',  subject:'Planète' },
  { id:'m3', type:'engage-free', name:'Engagement libre', subject:'2030' },
  { id:'m4', type:'wordcloud',   name:'Nuage' } ]}
const answers = [
  { question_id:'q1', player_id:'p1', value:'0', is_correct:true,  points:900, time_ms:1200 },
  { question_id:'q1', player_id:'p2', value:'1', is_correct:false, points:0,   time_ms:1500 }]
const submissions = [
  { id:'s1', kind:'open',        round_key:'q2', author_name:'Alice', text:'Le manque de temps' },
  { id:'s2', kind:'open',        round_key:'q2', author_name:'Bob',   text:'Les habitudes' },
  { id:'s3', kind:'engage',      round_key:'m2', author_name:'Alice', category:'Je me déplace', text:'Je viens à vélo' },
  { id:'s4', kind:'engage-free', round_key:'m3', author_name:'Bob',   category:'equipe',       text:'On trie au bureau' }]
const wc = [{ round_key:'m4', word:'Solidarité' },{ round_key:'m4', word:'Solidarité' },{ round_key:'m4', word:'Santé' }]
const playerById = { p1:'Alice', p2:'Bob' }
const rendre = log => w.buildBilanHtml({ code:'ABC123', date:'1 janv. 2026',
  scoreboard:[{name:'Alice',score:900},{name:'Bob',score:0}], mancheLog: log })

t.section('config complète')
let log = w.buildMancheLogFromDB({ answers, submissions, wordcloudVotes: wc, votes: [], config, playerById })
t.ok('4 sections', log.length === 4, JSON.stringify(log.map(e => e.type)))
t.ok('question ouverte et ses 2 réponses', log.find(e=>e.type==='quiz').questions.find(q=>q.type==='open')?.responses?.length === 2)
t.ok('mise en situation présente', log.find(e=>e.type==='quiz').questions.some(q => q.type === 'slide'))
t.ok('engagements présents', log.find(e => e.type === 'engage')?.results.length === 1)
t.ok('engagement libre présent', log.find(e => e.type === 'engage-free')?.results.length === 1)
t.ok('nuage présent', Object.keys(log.find(e => e.type === 'wordcloud').wordCounts).length === 2)
let html = rendre(log)
t.ok('réponse ouverte rendue', html.includes('Le manque de temps'))
t.ok('engagement rendu', html.includes('Je viens à vélo'))
t.ok('engagement libre rendu', html.includes('On trie au bureau'))
t.ok('« Mise en situation », plus « Intercalaire »', html.includes('Mise en situation') && !html.includes('Intercalaire'))
t.ok('taux de réussite 50 % (ouvertes exclues)', html.includes('>50%<'))
t.ok('1 question comptée (slide et open exclus)', /<div class="kv">1<\/div><div class="kl">Questions jouées/.test(html))
t.ok('2 réponses libres comptées', /<div class="kv">2<\/div><div class="kl">Réponses libres/.test(html))

t.section('config obsolète — rien ne doit être perdu')
html = rendre(w.buildMancheLogFromDB({ answers, submissions, wordcloudVotes: wc, votes: [],
  config: { manches: [{ id:'ZZZ', type:'engage', name:'Autre' }] }, playerById }))
t.ok('engagement rattaché malgré le round_key différent', html.includes('Je viens à vélo'))
t.ok('engagement libre récupéré', html.includes('On trie au bureau'))
t.ok('réponses ouvertes récupérées', html.includes('Le manque de temps'))
t.ok('nuage récupéré', html.includes('Solidarité'))

t.section('aucune config')
html = rendre(w.buildMancheLogFromDB({ answers, submissions, wordcloudVotes: wc, votes: [], config: null, playerById }))
t.ok('quiz reconstruit', html.includes('Alice'))
t.ok('engagements présents', html.includes('Je viens à vélo'))
t.ok('réponses ouvertes présentes', html.includes('Les habitudes'))
t.ok('nuage présent', html.includes('Santé'))

t.section('cas limites')
html = rendre(w.buildMancheLogFromDB({ config }))
t.ok('sans données : pas de plantage', typeof html === 'string' && html.length > 0)
t.ok('questions affichées sans réponse', html.includes('Aucune réponse reçue'))
t.ok('bilan vide : message dédié', rendre([]).includes('Aucune manche enregistrée'))

t.section('thème de l’idée en Or')
const ideas = [
  { id:'i1', kind:'idea', round_key:'mi', author_name:'Anne', text:'Vélos', category:'Mobilité douce', points:400, is_gold:true },
  { id:'i2', kind:'idea', round_key:'mi', author_name:'Bob',  text:'Covoiturage', category:'Mobilité douce', points:100, is_gold:false }]
const cfgIdea = { manches:[{ id:'mi', type:'idea', name:'Idée en Or' }] }
log = w.buildMancheLogFromDB({ submissions: ideas, config: cfgIdea })
t.ok('thème extrait de category', log[0].theme === 'Mobilité douce')
t.ok('thème affiché', rendre(log).includes('Thème :') && rendre(log).includes('Mobilité douce'))
log = w.buildMancheLogFromDB({ submissions: ideas.map(i => ({...i, category:null})), config: cfgIdea })
t.ok('sans thème : aucune ligne parasite', !rendre(log).includes('Thème :'))
t.fin()
