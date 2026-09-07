// Utilitaires partagés par les tests. Les suites extraient les fonctions
// directement des sources livrées : elles testent le code réellement déployé,
// pas une copie qui divergerait.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const lire = f => fs.readFileSync(path.join(racine, f), 'utf8')

/** Extrait le module ES d'une page HTML. */
export const moduleDe = f => lire(f).match(/<script type="module">([\s\S]*?)<\/script>/)[1]

/** Extrait une fonction nommée depuis un source. */
export function fonction(src, nom, prefixe = '(async )?function') {
  const re = new RegExp(`(?:${prefixe})\\s+${nom}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`)
  const m = src.match(re)
  if (!m) throw new Error(`fonction introuvable : ${nom}`)
  return m[0]
}

/** Charge bilan.js avec un document minimal. */
export function chargerBilan() {
  const win = {}
  globalThis.window = win
  globalThis.document = { createElement: () => ({
    set textContent(v) { this._v = String(v ?? '') },
    get innerHTML() {
      return this._v.replace(/&/g,'&amp;').replace(/</g,'&lt;')
                    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    }
  })}
  ;(0, eval)(lire('src/lib/bilan.js'))
  return win
}

/** Petit harnais d'assertions. */
export function suite(titre) {
  let ko = 0
  console.log(`\n── ${titre} ──`)
  return {
    section: t => console.log(`  ${t}`),
    ok(label, condition, detail = '') {
      console.log((condition ? '    ✅ ' : '    ❌ ') + label + (condition ? '' : ` — ${detail}`))
      if (!condition) ko++
    },
    fin() { if (ko) { console.log(`\n  ${ko} échec(s)`); process.exit(1) } return true }
  }
}
