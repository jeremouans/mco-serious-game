// Contrôles statiques sur les trois applications livrées.
import { lire, moduleDe, suite } from './_util.mjs'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const t = suite('Contrôles statiques')
const pages = { host:'src/host/index.html', join:'src/join/index.html', admin:'src/admin/index.html' }

t.section('syntaxe des modules')
for (const [nom, f] of Object.entries(pages)) {
  const tmp = path.join(os.tmpdir(), `chk-${nom}-${process.pid}.mjs`)
  fs.writeFileSync(tmp, moduleDe(f))
  let ok = true
  try { execFileSync(process.execPath, ['--check', tmp], { stdio:'pipe' }) } catch { ok = false }
  fs.unlinkSync(tmp)
  t.ok(`${nom} : module valide`, ok)
}
{
  let ok = true
  try { execFileSync(process.execPath, ['--check', 'src/lib/bilan.js'], { stdio:'pipe' }) } catch { ok = false }
  t.ok('bilan.js : valide', ok)
}

t.section('références d’éléments')
for (const [nom, f] of Object.entries(pages)) {
  const html = lire(f)
  const ids  = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]))
  const used = new Set([...html.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]))
  const manq = [...used].filter(u => !u.includes('$') && !ids.has(u) && u !== 'stars')
  t.ok(`${nom} : aucun identifiant orphelin`, manq.length === 0, manq.join(', '))
}

t.section('compatibilité navigateur')
for (const [nom, f] of Object.entries(pages)) {
  const js = moduleDe(f)
  t.ok(`${nom} : pas d’opérateur ES2021 (||=, ??=, &&=)`, !/(\|\|=|\?\?=|&&=)/.test(js))
}
t.ok('bilan.js : pas d’opérateur ES2021', !/(\|\|=|\?\?=|&&=)/.test(lire('src/lib/bilan.js')))

t.section('dépendances externes au démarrage')
for (const [nom, f] of Object.entries(pages)) {
  const js = moduleDe(f)
  const imports = [...js.matchAll(/^import .*?from\s+'([^']+)'/gm)].map(m => m[1])
  t.ok(`${nom} : aucun import depuis un CDN`, !imports.some(i => /^https?:/.test(i)), imports.join(', '))
}
t.ok('client Supabase servi localement', /from '\.\/vendor\/supabase\.esm\.js'/.test(lire('src/lib/supabase.js')))

t.section('orthographe')
for (const [nom, f] of Object.entries(pages))
  t.ok(`${nom} : « quiz » et non « quizz »`, !/[Qq]uizz(?!es)/.test(lire(f)))
t.fin()
