/**
 * Derive county-level electric resistance (ER) factors from NREL ResStock 2024.2.
 *
 * Streams baseline_metadata_only.csv (~1.2 GB) from OEDI S3 — no full download to disk.
 * For each simulated home, reads:
 *   in.county          GISJOIN county code (G + state(2) + 0 + county(3))
 *   in.hvac_heating_type  heating system type (Electric Resistance / Heat Pump variants)
 *   weight             statistical weight (number of real homes this record represents)
 *
 * ER factor = weighted ER homes / (weighted ER homes + weighted HP homes)
 * Only electrically-heated homes are counted (ER + HP); gas/oil/propane are skipped.
 * Dual-fuel heat pumps are excluded (gas is the primary fuel).
 *
 * Output: scripts/output/resstock-county-er-factors.json
 *   { "41067": 0.82, "53033": 0.79, ... }  (keyed by 5-digit county FIPS)
 *
 * Usage: node scripts/fetch-resstock-er-factors.mjs
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { get as httpsGet } from 'https'
import { createInterface } from 'readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')

// ResStock 2024 Release 2 — national baseline metadata (characteristics only, no timeseries)
const RESSTOCK_URL = 'https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock' +
  '/end-use-load-profiles-for-us-building-stock/2024/resstock_tmy3_release_2' +
  '/metadata_and_annual_results/national/csv/baseline/baseline_metadata_only.csv'

// GISJOIN county code → 5-digit FIPS
// Format: G + SS (2-digit state) + 0 + CCC (3-digit county)  e.g. "G410067" → "41067"
function gisjoinToFips5(gisjoin) {
  if (!gisjoin || gisjoin.length < 7 || gisjoin[0] !== 'G') return null
  return gisjoin.slice(1, 3) + gisjoin.slice(4, 7)
}

// Minimal CSV line parser that handles double-quoted fields (needed because
// in.hvac_heating_type contains commas, e.g. "ASHP, SEER 10, 6.2 HSPF").
function parseCSVLine(line) {
  const fields = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // Handle escaped quotes ("")
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (ch === ',' && !inQ) {
      fields.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields
}

function isElectricResistance(hvacType) {
  return /electric.?resistance/i.test(hvacType)
}

function isHeatPump(hvacType) {
  // Exclude dual-fuel HPs — gas is their primary fuel, not electricity
  if (/dual.?fuel/i.test(hvacType)) return false
  return /heat.?pump/i.test(hvacType) || /\bASHP\b/i.test(hvacType)
}

async function streamResStock() {
  return new Promise((resolve, reject) => {
    console.log(`Streaming from:\n  ${RESSTOCK_URL}\n`)

    const req = httpsGet(RESSTOCK_URL, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        reject(new Error(`Redirect to ${res.headers.location} — update RESSTOCK_URL`))
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}`))
        return
      }

      const countyData = {}   // fips5 → { erWeight, hpWeight }
      let headers = null
      let colCounty = -1
      let colHvac = -1
      let colWeight = -1
      let rows = 0
      let erRows = 0
      let hpRows = 0

      const rl = createInterface({ input: res, crlfDelay: Infinity })

      rl.on('line', (line) => {
        if (!line) return

        const fields = parseCSVLine(line)

        // First line — detect column positions
        if (!headers) {
          headers = fields
          colCounty = headers.indexOf('in.county')
          colHvac   = headers.indexOf('in.hvac_heating_type')
          colWeight = headers.indexOf('weight')

          if (colCounty === -1 || colHvac === -1 || colWeight === -1) {
            reject(new Error(
              `Required columns not found.\n` +
              `  in.county: ${colCounty}  in.hvac_heating_type: ${colHvac}  weight: ${colWeight}\n` +
              `  First 30 columns: ${headers.slice(0, 30).join(', ')}`
            ))
          }
          return
        }

        const gisjoin  = fields[colCounty]
        const hvacType = fields[colHvac]
        const weight   = parseFloat(fields[colWeight]) || 0

        const isER = isElectricResistance(hvacType)
        const isHP = isHeatPump(hvacType)
        if (!isER && !isHP) return

        const fips5 = gisjoinToFips5(gisjoin)
        if (!fips5 || weight <= 0) return

        countyData[fips5] ??= { erWeight: 0, hpWeight: 0 }
        if (isER) { countyData[fips5].erWeight += weight; erRows++ }
        else      { countyData[fips5].hpWeight += weight; hpRows++ }

        rows++
        if (rows % 50000 === 0) {
          process.stdout.write(`\r  ${rows.toLocaleString()} electric-heat rows processed...`)
        }
      })

      rl.on('close', () => {
        console.log(`\r  ${rows.toLocaleString()} electric-heat rows processed (${erRows.toLocaleString()} ER, ${hpRows.toLocaleString()} HP)`)
        resolve(countyData)
      })

      rl.on('error', reject)
      res.on('error', reject)
    })

    req.on('error', reject)
  })
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  console.log('Fetching ResStock 2024.2 county-level ER factors...')
  console.log('(~1.2 GB streamed — not written to disk)\n')

  const countyData = await streamResStock()

  const erFactors = {}
  const stateSums = {}
  for (const [fips5, { erWeight, hpWeight }] of Object.entries(countyData)) {
    const total = erWeight + hpWeight
    if (total <= 0) continue
    const factor = Math.round((erWeight / total) * 10000) / 10000
    erFactors[fips5] = factor
    const st = fips5.slice(0, 2)
    stateSums[st] ??= { sum: 0, count: 0 }
    stateSums[st].sum += factor
    stateSums[st].count++
  }

  const stateFallbacks = {}
  for (const [st, { sum, count }] of Object.entries(stateSums)) {
    stateFallbacks[st] = Math.round((sum / count) * 10000) / 10000
  }

  const outputPath = join(OUTPUT_DIR, 'resstock-county-er-factors.json')
  writeFileSync(outputPath, JSON.stringify({ counties: erFactors, stateFallbacks }))

  const factors = Object.values(erFactors)
  const avg = factors.reduce((a, b) => a + b, 0) / factors.length
  const min = factors.reduce((a, b) => Math.min(a, b), Infinity)
  const max = factors.reduce((a, b) => Math.max(a, b), -Infinity)

  console.log(`\nOutput: ${outputPath}`)
  console.log(`  ${factors.length.toLocaleString()} counties with ResStock ER data`)
  console.log(`  ${Object.keys(stateFallbacks).length} state fallbacks computed`)
  console.log(`  ER factor range: ${min.toFixed(2)} – ${max.toFixed(2)}  (avg: ${avg.toFixed(2)})`)
  console.log('\nNext step: node scripts/build-utility-spreadsheet.mjs')
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
