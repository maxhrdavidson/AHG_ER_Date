/**
 * Fetch Census ACS 5-Year heating + structure data for all US census tracts.
 *
 * Variables pulled per tract:
 *   B25040_001E  Total occupied housing units (heating fuel denominator)
 *   B25040_004E  Electric heat (includes both resistance heaters AND heat pumps)
 *   B25024_001E  Total units in structure
 *   B25024_002E  1 unit detached (single-family detached — proxy for ducted systems)
 *   B25024_003E  1 unit attached (townhomes — also typically ducted)
 *
 * Outputs: scripts/output/national-census-data.json
 *   Keyed by 11-digit census tract GEOID.
 *   singleFamilyPct is stored as a 0–1 fraction.
 *
 * Usage: node scripts/fetch-national-census.mjs [CENSUS_API_KEY]
 * Free key signup: https://api.census.gov/data/key_signup.html
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ALL_STATE_FIPS } from './constants.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')
const CENSUS_API_BASE = 'https://api.census.gov/data/2023/acs/acs5'

const VARIABLES = 'B25040_001E,B25040_004E,B25024_001E,B25024_002E,B25024_003E'

// Census uses -666666666 and -999999999 for suppressed/missing values
function safeInt(val) {
  const n = Number(val)
  return (!val || n < 0) ? 0 : n
}

async function fetchWithRetry(url, retries = 4) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 429 || res.status === 503) {
        const delay = 3000 * (attempt + 1)
        process.stdout.write(`\n  Rate limited (${res.status}), backing off ${delay / 1000}s... `)
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      return await res.json()
    } catch (err) {
      if (attempt === retries - 1) throw err
      const delay = 1500 * (attempt + 1)
      process.stdout.write(`\n  Error: ${err.message}. Retrying in ${delay}ms... `)
      await new Promise(r => setTimeout(r, delay))
    }
  }
}

async function fetchStateTracts(stateFips, apiKey) {
  let url = `${CENSUS_API_BASE}?get=${VARIABLES}&for=tract:*&in=state:${stateFips}`
  if (apiKey) url += `&key=${apiKey}`

  const data = await fetchWithRetry(url)
  const headers = data[0]
  const rows = data.slice(1)

  const tracts = {}
  for (const row of rows) {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] })

    const geoid = obj.state + obj.county + obj.tract   // 11-digit GEOID
    const countyFips5 = obj.state + obj.county          // 5-digit county FIPS

    const totalOccupied = safeInt(obj.B25040_001E)
    const electricHeat  = safeInt(obj.B25040_004E)
    const totalUnits    = safeInt(obj.B25024_001E)
    const sfDetached    = safeInt(obj.B25024_002E)
    const sfAttached    = safeInt(obj.B25024_003E)

    // singleFamilyPct stored as 0–1 fraction (not percentage)
    const singleFamilyPct = totalUnits > 0
      ? Math.round(((sfDetached + sfAttached) / totalUnits) * 10000) / 10000
      : 0

    tracts[geoid] = {
      geoid,
      countyFips5,
      stateFips: obj.state,
      totalOccupied,
      electricHeat,
      singleFamilyPct,
    }
  }

  return tracts
}

async function main() {
  const apiKey = process.argv[2] || process.env.CENSUS_API_KEY || ''
  if (!apiKey) {
    console.warn('WARNING: No Census API key provided.')
    console.warn('  Unauthenticated limit is 500 requests/day — may hit limit mid-run.')
    console.warn('  Get a free key: https://api.census.gov/data/key_signup.html\n')
  }

  const allTracts = {}
  let totalHH = 0
  let totalElecHeat = 0

  console.log(`Fetching ACS 2023 5-Year data for ${ALL_STATE_FIPS.length} states...\n`)

  for (let i = 0; i < ALL_STATE_FIPS.length; i++) {
    const stateFips = ALL_STATE_FIPS[i]
    process.stdout.write(`[${String(i + 1).padStart(2)}/${ALL_STATE_FIPS.length}] State ${stateFips}... `)

    try {
      const tracts = await fetchStateTracts(stateFips, apiKey)
      const count = Object.keys(tracts).length
      const elec  = Object.values(tracts).reduce((s, t) => s + t.electricHeat, 0)
      const hh    = Object.values(tracts).reduce((s, t) => s + t.totalOccupied, 0)
      totalElecHeat += elec
      totalHH += hh
      Object.assign(allTracts, tracts)
      console.log(`${count} tracts  (${hh.toLocaleString()} HH, ${elec.toLocaleString()} elec-heat)`)
    } catch (err) {
      console.error(`FAILED: ${err.message}`)
    }

    // Polite delay between state requests
    if (i < ALL_STATE_FIPS.length - 1) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const outputPath = join(OUTPUT_DIR, 'national-census-data.json')
  writeFileSync(outputPath, JSON.stringify(allTracts))

  const tractCount = Object.keys(allTracts).length
  console.log(`\nOutput: ${outputPath}`)
  console.log(`  ${tractCount.toLocaleString()} total tracts`)
  console.log(`  ${totalHH.toLocaleString()} total occupied households`)
  console.log(`  ${totalElecHeat.toLocaleString()} electric-heat homes (${((totalElecHeat / totalHH) * 100).toFixed(1)}%)`)
  console.log('\nNext step: node scripts/fetch-eia-territory-crosswalk.mjs')
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
