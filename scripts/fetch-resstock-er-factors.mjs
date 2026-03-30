/**
 * Derive county-level electric resistance (ER) factors from NREL ResStock 2024.2.
 *
 * Streams per-state baseline CSV files from OEDI S3 (~30 MB each, 51 states).
 * For each simulated home, reads:
 *   in.county                    GISJOIN county code (G + state(2) + 0 + county(3))
 *   in.hvac_heating_type_and_fuel heating system + fuel (e.g. "Electricity Baseboard", "Electricity ASHP")
 *   weight                       statistical weight (number of real homes this record represents)
 *
 * ER factor = weighted ER homes / (weighted ER homes + weighted HP homes)
 * Only electrically-heated homes are counted (ER + HP); gas/oil/propane are skipped.
 * Dual-fuel heat pumps are excluded (gas is the primary fuel).
 *
 * Output: scripts/output/resstock-county-er-factors.json
 *   { counties: { "12086": 0.43, ... }, stateFallbacks: { "12": 0.47, ... } }
 *
 * Usage: node scripts/fetch-resstock-er-factors.mjs
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { get as httpsGet } from 'https'
import { createInterface } from 'readline'
import { STATE_FIPS_TO_ABBR } from './constants.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')

const RESSTOCK_BASE = 'https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock' +
  '/end-use-load-profiles-for-us-building-stock/2024/resstock_tmy3_release_2' +
  '/metadata_and_annual_results/by_state'

function stateUrl(abbr) {
  return `${RESSTOCK_BASE}/state=${abbr}/csv/${abbr}_baseline_metadata_and_annual_results.csv`
}

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

function isElectricResistance(hvacTypeAndFuel) {
  // ResStock 2024.2 metadata_and_annual_results uses in.hvac_heating_type_and_fuel.
  // ER values: "Electricity Electric Furnace", "Electricity Baseboard",
  //            "Electricity Electric Boiler", "Electricity Shared Heating"
  if (!/^electricity\s/i.test(hvacTypeAndFuel)) return false
  return !/\b(ashp|mshp|heat.?pump)\b/i.test(hvacTypeAndFuel)
}

function isHeatPump(hvacTypeAndFuel) {
  // HP values: "Ducted Heat Pump", "Electricity ASHP", "Electricity MSHP"
  // Dual-fuel HPs carry a gas prefix ("Natural Gas ...") so won't pass isElectricResistance
  // but we still exclude them here via the "heat.?pump" catch-all check
  return /\b(heat.?pump|ashp|mshp)\b/i.test(hvacTypeAndFuel)
}

function streamState(abbr, countyData) {
  const url = stateUrl(abbr)
  return new Promise((resolve, reject) => {
    const req = httpsGet(url, (res) => {
      if (res.statusCode === 404) {
        // Some states (e.g. HI, AK) may not be in this release — skip gracefully
        res.resume()
        resolve(0)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${abbr}`))
        return
      }

      let headers = null
      let colCounty = -1, colHvac = -1, colWeight = -1, colDucts = -1
      let rows = 0

      const rl = createInterface({ input: res, crlfDelay: Infinity })

      rl.on('line', (line) => {
        if (!line) return
        const fields = parseCSVLine(line)

        if (!headers) {
          headers = fields
          colCounty = headers.indexOf('in.county')
          colHvac   = headers.indexOf('in.hvac_heating_type_and_fuel')
          colWeight = headers.indexOf('weight')
          colDucts  = headers.indexOf('in.hvac_has_ducts')  // -1 handled gracefully
          if (colCounty === -1 || colHvac === -1 || colWeight === -1) {
            reject(new Error(
              `Required columns not found in ${abbr} (need in.county, in.hvac_heating_type_and_fuel, weight).\n` +
              `  First 30 columns: ${headers.slice(0, 30).join(', ')}`
            ))
          }
          return
        }

        const hvacType = fields[colHvac]
        const isER = isElectricResistance(hvacType)
        const isHP = isHeatPump(hvacType)
        if (!isER && !isHP) return

        const fips5  = gisjoinToFips5(fields[colCounty])
        const weight = parseFloat(fields[colWeight]) || 0
        if (!fips5 || weight <= 0) return

        countyData[fips5] ??= { erWeight: 0, hpWeight: 0, erDuctedWeight: 0 }
        if (isER) {
          countyData[fips5].erWeight += weight
          if (colDucts !== -1 && /^true$/i.test(fields[colDucts])) {
            countyData[fips5].erDuctedWeight += weight
          }
        } else {
          countyData[fips5].hpWeight += weight
        }
        rows++
      })

      rl.on('close', () => resolve(rows))
      rl.on('error', reject)
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const stateAbbrs = Object.values(STATE_FIPS_TO_ABBR)
  console.log(`Fetching ResStock 2024.2 county-level ER factors (${stateAbbrs.length} states)...\n`)

  const countyData = {}
  let totalRows = 0
  let statesDone = 0

  for (const abbr of stateAbbrs) {
    process.stdout.write(`  [${String(++statesDone).padStart(2)}/${stateAbbrs.length}] ${abbr}... `)
    try {
      const rows = await streamState(abbr, countyData)
      console.log(rows === 0 ? 'skipped (not in release)' : `${rows.toLocaleString()} rows`)
      totalRows += rows
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
    }
  }

  const erFactors = {}
  const ductedFractions = {}
  const erStateSums = {}
  const ductedStateSums = {}

  for (const [fips5, { erWeight, hpWeight, erDuctedWeight }] of Object.entries(countyData)) {
    const total = erWeight + hpWeight
    if (total <= 0) continue
    const st = fips5.slice(0, 2)

    const erFactor = Math.round((erWeight / total) * 10000) / 10000
    erFactors[fips5] = erFactor
    erStateSums[st] ??= { sum: 0, count: 0 }
    erStateSums[st].sum += erFactor
    erStateSums[st].count++

    if (erWeight > 0) {
      const ductedFrac = Math.round((erDuctedWeight / erWeight) * 10000) / 10000
      ductedFractions[fips5] = ductedFrac
      ductedStateSums[st] ??= { sum: 0, count: 0 }
      ductedStateSums[st].sum += ductedFrac
      ductedStateSums[st].count++
    }
  }

  const stateFallbacks = {}
  for (const [st, { sum, count }] of Object.entries(erStateSums)) {
    stateFallbacks[st] = Math.round((sum / count) * 10000) / 10000
  }

  const ductedFallbacks = {}
  for (const [st, { sum, count }] of Object.entries(ductedStateSums)) {
    ductedFallbacks[st] = Math.round((sum / count) * 10000) / 10000
  }

  const outputPath = join(OUTPUT_DIR, 'resstock-county-er-factors.json')
  writeFileSync(outputPath, JSON.stringify({ counties: erFactors, stateFallbacks, ductedFractions, ductedFallbacks }))

  const factors = Object.values(erFactors)
  const avg = factors.reduce((a, b) => a + b, 0) / factors.length
  const min = factors.reduce((a, b) => Math.min(a, b), Infinity)
  const max = factors.reduce((a, b) => Math.max(a, b), -Infinity)

  console.log(`\nTotal electric-heat rows processed: ${totalRows.toLocaleString()}`)
  const ductedVals = Object.values(ductedFractions)
  const dAvg = ductedVals.reduce((a, b) => a + b, 0) / ductedVals.length
  const dMin = ductedVals.reduce((a, b) => Math.min(a, b), Infinity)
  const dMax = ductedVals.reduce((a, b) => Math.max(a, b), -Infinity)

  console.log(`\nOutput: ${outputPath}`)
  console.log(`  ${factors.length.toLocaleString()} counties with ResStock ER data`)
  console.log(`  ${Object.keys(stateFallbacks).length} state fallbacks computed`)
  console.log(`  ER factor range: ${min.toFixed(2)} – ${max.toFixed(2)}  (avg: ${avg.toFixed(2)})`)
  console.log(`  Ducted fraction range: ${dMin.toFixed(2)} – ${dMax.toFixed(2)}  (avg: ${dAvg.toFixed(2)})`)
  console.log('\nNext step: node scripts/build-utility-spreadsheet.mjs')
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
