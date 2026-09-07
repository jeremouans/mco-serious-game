// Lance toutes les suites. `npm test`
import { readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ici = path.dirname(fileURLToPath(import.meta.url))
const suites = readdirSync(ici).filter(f => f.endsWith('.test.mjs')).sort()
let echecs = 0
for (const s of suites) {
  try { execFileSync(process.execPath, [path.join(ici, s)], { stdio:'inherit' }) }
  catch { echecs++ }
}
console.log(echecs
  ? `\n❌ ${echecs} suite(s) en échec sur ${suites.length}\n`
  : `\n✅ ${suites.length} suites au vert\n`)
process.exit(echecs ? 1 : 0)
