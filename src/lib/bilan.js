/* lib/bilan.js — Rendu de bilan partagé (host + admin) */
;(function(w) {
  function esc(s) {
    const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML
  }

  // Types de questions qui ne comptent pas dans les stats de réussite
  // (pas de bonne réponse : intercalaires et questions ouvertes)
  const NON_SCORED_Q = new Set(['slide', 'open'])

  /**
   * buildMancheLogFromDB({ answers, submissions, wordcloudVotes, votes, config, playerById })
   *
   * Converts DB rows into the mancheLog format used by buildBilanHtml.
   *   answers         : rows from `answers` table, with optional .players.name join
   *   submissions     : rows from `submissions` table (idea / engage / engage-free / open)
   *   wordcloudVotes  : rows from `wordcloud_votes` table
   *   votes           : rows from `votes` table (idea + engage star votes)
   *   config          : quiz config object ({ manches: [...] })
   *   playerById      : { player_id → display name } (used when .players join is absent)
   *
   * Règle importante : TOUTES les données reçues doivent ressortir dans le
   * bilan, même si la config du quiz ne correspond plus (quiz modifié/supprimé,
   * manche renommée…). Ce qui n'a pas été rattaché à une manche de la config
   * est ajouté en fin de bilan dans une section « hors configuration ».
   */
  w.buildMancheLogFromDB = function({ answers = [], submissions = [], wordcloudVotes = [], votes = [], config = null, playerById = {} }) {
    const mancheLog = []
    const usedSubIds = new Set()
    const usedWcKeys = new Set()

    // Index answers by question_id → [{name, value, isCorrect, points, timeMs}]
    const answersByQ = {}
    answers.forEach(a => {
      const name = a.players?.name || playerById[a.player_id] || '?'
      if (!answersByQ[a.question_id]) answersByQ[a.question_id] = []
      answersByQ[a.question_id].push({ name, value: a.value, isCorrect: a.is_correct, points: a.points || 0, timeMs: a.time_ms || 0 })
    })

    // Wordcloud frequency, indexée par round_key (une manche = un nuage)
    const wcByKey = {}
    wordcloudVotes.forEach(v => {
      const k = v.round_key || '__nokey__'
      if (!wcByKey[k]) wcByKey[k] = {}
      wcByKey[k][v.word] = (wcByKey[k][v.word] || 0) + 1
    })

    // Votes indexed by submission_id
    const votesBySub = {}
    votes.forEach(v => {
      if (!v.submission_id) return
      if (!votesBySub[v.submission_id]) votesBySub[v.submission_id] = []
      votesBySub[v.submission_id].push(v)
    })

    // Récupère les soumissions d'un kind pour une manche/question donnée.
    // 1. correspondance exacte sur round_key (cas nominal)
    // 2. sinon, repli sur les lignes non encore consommées de ce kind
    //    (config modifiée depuis la partie → on n'perd pas les données)
    function takeSubs(kind, roundKey) {
      let rows = roundKey
        ? submissions.filter(s => s.kind === kind && s.round_key === roundKey && !usedSubIds.has(s.id))
        : []
      if (!rows.length) rows = submissions.filter(s => s.kind === kind && !usedSubIds.has(s.id))
      rows.forEach(s => usedSubIds.add(s.id))
      return rows
    }

    function takeWordcloud(roundKey) {
      if (roundKey && wcByKey[roundKey] && !usedWcKeys.has(roundKey)) {
        usedWcKeys.add(roundKey); return wcByKey[roundKey]
      }
      const leftover = Object.keys(wcByKey).find(k => !usedWcKeys.has(k))
      if (leftover) { usedWcKeys.add(leftover); return wcByKey[leftover] }
      return {}
    }

    const ideaRanking = rows => rows
      .slice()
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .map(s => ({
        name: s.author_name || '?', text: s.text,
        votes: (votesBySub[s.id] || []).length, pts: s.points || 0, isGold: s.is_gold
      }))

    const openResponses = rows => rows.map(s => ({ name: s.author_name || '?', text: s.text || '' }))

    function pushQuizManche(name, questions) {
      const qs = (questions || []).map(q => {
        const qId = q.id || q._id
        // Intercalaires (mises en situation) → passés tels quels, sans réponses
        if (q.type === 'slide') {
          return {
            id: qId, type: 'slide',
            title: q.title || '', text: q.text || '',
            image: q.image || '',
            answers: [], stats: { answered: 0, correct: 0 }
          }
        }
        // Questions ouvertes → les réponses vivent dans `submissions` (kind 'open')
        if (q.type === 'open') {
          const rows = takeSubs('open', qId)
          const responses = openResponses(rows)
          return {
            id: qId, type: 'open', text: q.text || qId,
            answers: [], responses,
            stats: { answered: responses.length, correct: 0 }
          }
        }
        const qAns = answersByQ[qId] || []
        return {
          id: qId, type: q.type || 'choice',
          text: q.text || qId, options: q.options || null,
          correct: q.correct, unit: q.unit || null,
          answers: qAns,
          stats: { answered: qAns.length, correct: qAns.filter(a => a.isCorrect).length }
        }
      })
      if (qs.length) mancheLog.push({ type: 'quiz', mancheName: name, questions: qs })
    }

    if (config?.manches?.length) {
      config.manches.forEach(m => {
        const mt = m.type || 'quiz'
        if (mt === 'quiz') {
          pushQuizManche(m.name, m.questions || [])
        } else if (mt === 'idea') {
          const ideas = takeSubs('idea', m.id)
          if (ideas.length) mancheLog.push({ type: 'idea', mancheName: m.name, ranking: ideaRanking(ideas) })
        } else if (mt === 'engage') {
          const eng = takeSubs('engage', m.id)
          if (eng.length) {
            mancheLog.push({
              type: 'engage', mancheName: m.name,
              subject: m.subject || '', intro: m.intro || '',
              results: eng.map(s => ({ name: s.author_name || '?', category: s.category || '—', text: s.text }))
            })
          }
        } else if (mt === 'engage-free') {
          const eng = takeSubs('engage-free', m.id)
          if (eng.length) {
            mancheLog.push({
              type: 'engage-free', mancheName: m.name,
              subject: m.subject || m.name, intro: m.intro || '',
              results: eng.map(s => ({ name: s.author_name || '?', kind: s.category || 'personnel', text: s.text }))
            })
          }
        } else if (mt === 'wordcloud') {
          const counts = takeWordcloud(m.id)
          if (Object.keys(counts).length) mancheLog.push({ type: 'wordcloud', mancheName: m.name, wordCounts: { ...counts } })
        }
      })
    } else {
      // Aucune config disponible : on reconstruit à partir des données brutes
      const qIds = [...new Set(answers.map(a => a.question_id))]
      if (qIds.length) {
        const questions = qIds.map(qId => {
          const qAns = answersByQ[qId] || []
          return { id: qId, type: 'choice', text: qId, options: null, correct: null, unit: null, answers: qAns, stats: { answered: qAns.length, correct: qAns.filter(a => a.isCorrect).length } }
        }).filter(q => q.answers.length)
        if (questions.length) mancheLog.push({ type: 'quiz', mancheName: 'Quiz', questions })
      }
    }

    // ── Filet de sécurité : tout ce qui n'a pas été rattaché à la config ──
    const leftIdeas = submissions.filter(s => s.kind === 'idea' && !usedSubIds.has(s.id))
    if (leftIdeas.length) {
      leftIdeas.forEach(s => usedSubIds.add(s.id))
      mancheLog.push({ type: 'idea', mancheName: 'Idées en Or', ranking: ideaRanking(leftIdeas) })
    }
    const leftEngage = submissions.filter(s => s.kind === 'engage' && !usedSubIds.has(s.id))
    if (leftEngage.length) {
      leftEngage.forEach(s => usedSubIds.add(s.id))
      mancheLog.push({
        type: 'engage', mancheName: 'Mes engagements',
        results: leftEngage.map(s => ({ name: s.author_name || '?', category: s.category || '—', text: s.text }))
      })
    }
    const leftFree = submissions.filter(s => s.kind === 'engage-free' && !usedSubIds.has(s.id))
    if (leftFree.length) {
      leftFree.forEach(s => usedSubIds.add(s.id))
      mancheLog.push({
        type: 'engage-free', mancheName: 'Engagements libres', subject: 'Engagements libres', intro: '',
        results: leftFree.map(s => ({ name: s.author_name || '?', kind: s.category || 'personnel', text: s.text }))
      })
    }
    const leftOpen = submissions.filter(s => s.kind === 'open' && !usedSubIds.has(s.id))
    if (leftOpen.length) {
      leftOpen.forEach(s => usedSubIds.add(s.id))
      // Regroupées par round_key = id de la question
      const byKey = {}
      leftOpen.forEach(s => { (byKey[s.round_key || '—'] ||= []).push(s) })
      mancheLog.push({
        type: 'open', mancheName: 'Questions ouvertes',
        questions: Object.entries(byKey).map(([key, rows]) => ({
          id: key, text: rows[0]?.question_text || 'Question ouverte',
          responses: openResponses(rows)
        }))
      })
    }
    const leftWcKeys = Object.keys(wcByKey).filter(k => !usedWcKeys.has(k))
    leftWcKeys.forEach(k => {
      usedWcKeys.add(k)
      mancheLog.push({ type: 'wordcloud', mancheName: 'Nuage de mots', wordCounts: { ...wcByKey[k] } })
    })

    return mancheLog
  }

  /**
   * buildBilanHtml({ code, date, scoreboard, mancheLog, extraMeta, logoHtml })
   *
   * Returns a full bilan HTML string.
   *   scoreboard  : [{name, emoji?, score|final_score}]
   *   mancheLog   : output of buildMancheLogFromDB OR GAME_LOG
   *   extraMeta   : optional extra string appended to sub-header (e.g. "animateur : X")
   *   logoHtml    : optional HTML for logo slot (inner html of the 64×64 box)
   */
  w.buildBilanHtml = function({ code, date, scoreboard = [], mancheLog = [], extraMeta = '', logoHtml = '' }) {
    const avg = scoreboard.length ? Math.round(scoreboard.reduce((s, p) => s + (p.score ?? p.final_score ?? 0), 0) / scoreboard.length) : 0
    // Stats de réussite : uniquement sur les questions scorées
    const scoredQs = mancheLog
      .filter(e => e.type === 'quiz')
      .flatMap(e => (e.questions || []).filter(q => !NON_SCORED_Q.has(q.type)))
    const totalQ       = scoredQs.length
    const totalAns     = scoredQs.reduce((s, q) => s + (q.stats?.answered || 0), 0)
    const totalCorrect = scoredQs.reduce((s, q) => s + (q.stats?.correct || 0), 0)
    const rate = totalAns ? Math.round(totalCorrect / totalAns * 100) : 0
    // Nombre de réponses libres collectées (questions ouvertes, toutes manches)
    const totalOpen = mancheLog.reduce((s, e) => {
      if (e.type === 'quiz') return s + (e.questions || []).filter(q => q.type === 'open').reduce((ss, q) => ss + (q.responses?.length || 0), 0)
      if (e.type === 'open') return s + (e.questions || []).reduce((ss, q) => ss + (q.responses?.length || 0), 0)
      return s
    }, 0)

    const rankRows = scoreboard.map((p, i) => {
      const name = p.name || (p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : '') || p.player_name || '?'
      const score = p.score ?? p.final_score ?? 0
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1)
      return `<tr><td>${medal}</td><td>${esc(name)}${p.emoji ? ' ' + esc(p.emoji) : ''}</td><td style="font-weight:900;color:#6aa517">${score} pts</td></tr>`
    }).join('')

    // Bloc « question ouverte » (réutilisé dans une manche quiz et en section autonome)
    function openBlock(q) {
      const responses = q.responses || []
      const rows = responses.map(r => `<tr>
        <td style="font-weight:700;white-space:nowrap">${esc(r.name)}</td>
        <td style="font-size:.92rem">« ${esc(r.text)} »</td>
      </tr>`).join('')
      return `<div style="background:#fdf5ec;border-left:5px solid #d9a55a;border-radius:12px;padding:12px 16px;margin-bottom:8px;">
        <div style="font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#b06c14;margin-bottom:4px;">💬 Question ouverte</div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <div style="font-weight:700;color:#1a2b22;font-size:.95rem;flex:1">${esc(q.text)}</div>
          <div style="white-space:nowrap;flex:none;font-size:.75rem;color:#888">${responses.length} réponse${responses.length > 1 ? 's' : ''}</div>
        </div>
        <table class="rep-table"><thead><tr><th>Participant</th><th>Réponse</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="2" style="text-align:center;color:#999;font-style:italic;">Aucune réponse reçue</td></tr>'}</tbody></table>
      </div>`
    }

    const sections = mancheLog.filter(e => {
      if (e.type === 'quiz')        return e.questions?.length > 0
      if (e.type === 'open')        return e.questions?.length > 0
      if (e.type === 'idea')        return e.ranking?.length > 0
      if (e.type === 'engage')      return e.results?.length > 0
      if (e.type === 'engage-free') return e.results?.length > 0
      if (e.type === 'wordcloud')   return Object.keys(e.wordCounts || {}).length > 0
      return true
    }).map(entry => {
      if (entry.type === 'quiz') {
        const qBlocks = entry.questions.map(q => {
          // Intercalaire (mise en situation) : séparateur descriptif, pas de tableau
          if (q.type === 'slide') {
            return `<div style="background:#eef4fb;border-left:5px solid #86bfeb;border-radius:12px;padding:14px 16px;margin-bottom:8px;">
              <div style="font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#2980b9;margin-bottom:4px;">🎬 Mise en situation</div>
              ${q.title ? `<div style="font-weight:800;color:#113124;font-size:1rem;margin-bottom:6px;">${esc(q.title)}</div>` : ''}
              ${q.text ? `<div style="font-size:.9rem;color:#333;white-space:pre-wrap;">${esc(q.text)}</div>` : '<div style="font-size:.85rem;color:#888;font-style:italic;">(mise en situation vide)</div>'}
            </div>`
          }
          if (q.type === 'open') return openBlock(q)
          const s = q.stats || { answered: 0, correct: 0 }
          const pct = s.answered ? Math.round(s.correct / s.answered * 100) : null
          const rateStr = pct !== null
            ? `<span style="font-weight:900;color:${pct >= 60 ? '#27ae60' : pct >= 35 ? '#e8a020' : '#e74c3c'}">${pct}%</span>`
            : '<span style="color:#999">—</span>'
          const correctLabel = q.type === 'slider'
            ? `${q.correct}${q.unit ? ' ' + esc(q.unit) : ''}`
            : (q.options && q.correct != null ? esc(String(q.options[q.correct] ?? '')) : null)
          const rows = (q.answers || []).map(a => {
            const val = q.type === 'slider'
              ? (a.value != null ? esc(String(a.value)) + (q.unit ? ' ' + esc(q.unit) : '') : '—')
              : (q.options && a.value != null ? esc(String(q.options[parseInt(a.value)] ?? a.value)) : (a.value != null ? esc(String(a.value)) : '—'))
            return `<tr>
              <td style="font-weight:700">${esc(a.name || '')}</td>
              <td>${val}</td>
              <td style="font-weight:700;color:${a.isCorrect ? '#27ae60' : '#e74c3c'}">${a.isCorrect ? '✓' : '✗'}</td>
              <td style="font-weight:700;color:#6aa517">+${a.points || 0}</td>
            </tr>`
          }).join('')
          return `<div style="background:#f4f8ee;border-radius:12px;padding:12px 16px;margin-bottom:8px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
              <div style="font-weight:700;color:#1a2b22;font-size:.95rem;flex:1">${q.type === 'slider' ? '🎚️ ' : ''}${esc(q.text)}</div>
              <div style="white-space:nowrap;flex:none">${rateStr} <span style="font-size:.75rem;color:#888">${s.answered} rép.</span></div>
            </div>
            ${correctLabel ? `<div style="font-size:.8rem;color:#5a6b60;margin-bottom:6px;">Bonne réponse : <strong style="color:#6aa517">${correctLabel}</strong></div>` : ''}
            <table class="rep-table"><thead><tr><th>Joueur</th><th>Réponse</th><th></th><th>Points</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#999;font-style:italic;">Aucune réponse reçue</td></tr>'}</tbody></table>
          </div>`
        }).join('')
        return `<div><div class="rep-section-title">🎯 ${esc(entry.mancheName)}</div>${qBlocks}</div>`
      }

      // Section autonome de questions ouvertes (données non rattachées à une config)
      if (entry.type === 'open') {
        return `<div><div class="rep-section-title">💬 ${esc(entry.mancheName)}</div>
          ${entry.questions.map(openBlock).join('')}</div>`
      }

      if (entry.type === 'idea') {
        const rows = entry.ranking.map(r => `<tr>
          <td style="font-weight:700">${r.isGold ? '🥇 ' : ''}${esc(r.name)}</td>
          <td>${esc(r.text)}</td>
          <td style="text-align:center;font-weight:700;color:#6aa517">${r.votes}</td>
          <td style="font-weight:900;color:#c9a000">+${r.pts}</td>
        </tr>`).join('')
        return `<div><div class="rep-section-title">💡 ${esc(entry.mancheName)}</div>
          <table class="rep-table"><thead><tr><th>Auteur</th><th>Idée</th><th>Votes</th><th>Points</th></tr></thead>
          <tbody>${rows}</tbody></table></div>`
      }

      if (entry.type === 'engage') {
        const rows = entry.results.map(r => `<tr>
          <td style="font-weight:700;white-space:nowrap">${esc(r.name)}</td>
          <td style="font-size:.8em;white-space:nowrap;color:#5a6b60">${esc(r.category)}</td>
          <td style="font-size:.92rem">« ${esc(r.text)} »</td>
        </tr>`).join('')
        const header = entry.subject && entry.subject !== entry.mancheName
          ? `<div style="font-size:.85rem;color:#5a6b60;margin-bottom:8px;">Sujet : <strong style="color:#113124">${esc(entry.subject)}</strong></div>`
          : ''
        return `<div><div class="rep-section-title">🤝 ${esc(entry.mancheName)}</div>
          ${header}
          <div style="overflow-x:auto"><table class="rep-table" style="font-size:.88rem;">
            <thead><tr><th>Auteur</th><th>Catégorie</th><th>Engagement</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="3" style="text-align:center;color:#999;font-style:italic;">Aucun engagement pris.</td></tr>'}</tbody>
          </table></div></div>`
      }

      if (entry.type === 'engage-free') {
        const kindLbl = k => k === 'equipe' ? '👥 Équipe' : '🙋 Personnel'
        const rows = entry.results.map(r => `<tr>
          <td style="font-weight:700;white-space:nowrap">${esc(r.name)}</td>
          <td style="font-size:.82em;white-space:nowrap;color:#5a6b60">${kindLbl(r.kind)}</td>
          <td style="font-size:.92rem">« ${esc(r.text)} »</td>
        </tr>`).join('')
        const header = entry.subject && entry.subject !== entry.mancheName
          ? `<div style="font-size:.85rem;color:#5a6b60;margin-bottom:8px;">Sujet : <strong style="color:#113124">${esc(entry.subject)}</strong></div>`
          : ''
        return `<div><div class="rep-section-title">✍️ ${esc(entry.mancheName)}</div>
          ${header}
          <div style="overflow-x:auto"><table class="rep-table" style="font-size:.88rem;">
            <thead><tr><th>Auteur</th><th>Type</th><th>Engagement</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="3" style="text-align:center;color:#999;font-style:italic;">Aucun engagement pris.</td></tr>'}</tbody>
          </table></div></div>`
      }

      if (entry.type === 'wordcloud') {
        const top = Object.entries(entry.wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 25)
        const maxC = top[0]?.[1] || 1
        const chips = top.map(([w, c]) =>
          `<span style="background:rgba(106,165,23,${(0.15 + c / maxC * 0.25).toFixed(2)});border-radius:20px;padding:.3em .75em;font-weight:700;font-size:${Math.min(1.5, .65 + c / maxC * .85).toFixed(2)}rem;color:#124c15">${esc(w)} <span style="font-size:.7em;opacity:.6">${c}</span></span>`
        ).join('')
        return `<div><div class="rep-section-title">☁️ ${esc(entry.mancheName)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 0;">${chips || '<span style="color:#999">Aucun vote reçu</span>'}</div></div>`
      }

      return ''
    }).join('')

    return `
      <div class="rep-head">
        <div class="bilan-logo-slot" style="width:64px;height:64px;flex:none;border-radius:12px;overflow:hidden;">${logoHtml}</div>
        <div>
          <h2>Engagements 2030 — le Quizz</h2>
          <p class="rep-sub">Session <strong>${esc(code)}</strong> · ${esc(date)}${extraMeta ? ' · ' + extraMeta : ''}</p>
        </div>
      </div>
      <div class="rep-kpis">
        <div class="kpi"><div class="kv">${scoreboard.length}</div><div class="kl">Participants</div></div>
        <div class="kpi"><div class="kv">${totalQ}</div><div class="kl">Questions jouées</div></div>
        <div class="kpi"><div class="kv">${avg}</div><div class="kl">Score moyen</div></div>
        <div class="kpi"><div class="kv">${rate}%</div><div class="kl">Taux de réussite</div></div>
        ${totalOpen ? `<div class="kpi"><div class="kv">${totalOpen}</div><div class="kl">Réponses libres</div></div>` : ''}
      </div>
      ${scoreboard.length ? `<div><div class="rep-section-title">🏆 Classement final</div>
        <table class="rep-table"><thead><tr><th>Rang</th><th>Joueur</th><th>Score</th></tr></thead>
        <tbody>${rankRows}</tbody></table></div>` : ''}
      ${sections || '<p class="rep-empty">Aucune manche enregistrée.</p>'}
      <div class="rep-foot">Engagements 2030, le Quizz · MGEN · Session ${esc(code)} · ${esc(date)}</div>
    `
  }
})(window)
