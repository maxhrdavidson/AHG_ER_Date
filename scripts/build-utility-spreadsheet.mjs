/**
 * Build national utility heating estimates spreadsheet.
 *
 * Joins Census ACS tract-level heating data with the EIA service territory
 * county crosswalk to produce per-utility estimates of:
 *   - Total households
 *   - Homes using electric heat (ACS B25040_004E — includes resistance + heat pumps)
 *   - Estimated electric resistance (ER) homes (county-level ER factor from ResStock)
 *   - Estimated existing heat pump homes
 *   - Ducted ER homes (single-family proxy — these can take a ducted HP replacement)
 *   - Non-ducted ER homes (multifamily proxy — likely mini-split territory)
 *
 * Inputs (run these first):
 *   scripts/output/national-census-data.json        (from fetch-national-census.mjs)
 *   scripts/output/eia-county-utility-map.json       (from fetch-eia-territory-crosswalk.mjs)
 *   scripts/output/resstock-county-er-factors.json  (from fetch-resstock-er-factors.mjs)
 *
 * Output:
 *   scripts/output/utility-heating-estimates.csv
 *
 * Usage: node scripts/build-utility-spreadsheet.mjs
 *
 * ── Methodology Notes ──────────────────────────────────────────────────────────
 *
 * GEOGRAPHIC JOIN: Census tracts → counties → utilities (county-level approximation).
 *   This means some tracts near utility territory edges will be assigned to the
 *   wrong utility, but is accurate for most rural and mid-sized utility territories.
 *   Urban counties served by multiple utilities have their tract data split equally.
 *
 * ER ADJUSTMENT FACTOR: The Census ACS "electric heat" variable (B25040_004E)
 *   counts homes where electricity is the PRIMARY heating fuel. This includes BOTH
 *   electric resistance heaters AND heat pumps. The ER factor estimates what share
 *   is actually resistance. Sourced from NREL ResStock 2024.2 at the county level.
 *   Falls back to a ResStock-derived state average for counties with insufficient
 *   ResStock coverage, then to a national default of 0.80.
 *
 * DUCTED vs NON-DUCTED: Approximated using the share of single-family detached +
 *   attached housing units (Census B25024_002E + B25024_003E). Single-family homes
 *   are more likely to have ductwork for a central HP; multifamily units are more
 *   likely to use mini-split (ductless) systems. This is a structural proxy, not a
 *   direct HVAC survey.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')

// ── ER Adjustment Factors (county-level from ResStock) ───────────────────────
// Loaded from scripts/output/resstock-county-er-factors.json.
// Falls back to ResStock state average, then national default.
const DEFAULT_ER_FACTOR = 0.80
let countyErFactors = {}    // 5-digit county FIPS → ER factor
let stateErFallbacks = {}   // 2-digit state FIPS → ER factor (ResStock state avg)

function loadErFactors() {
  const factorsPath = join(OUTPUT_DIR, 'resstock-county-er-factors.json')
  try {
    const data = JSON.parse(readFileSync(factorsPath, 'utf-8'))
    countyErFactors  = data.counties       || {}
    stateErFallbacks = data.stateFallbacks || {}
    console.log(`Loaded ResStock ER factors: ${Object.keys(countyErFactors).length.toLocaleString()} counties, ${Object.keys(stateErFallbacks).length} state fallbacks`)
  } catch {
    console.warn(`WARNING: ${factorsPath} not found — using built-in state defaults.`)
    console.warn('  Run: node scripts/fetch-resstock-er-factors.mjs\n')
  }
}

function getErFactor(countyFips5) {
  if (countyErFactors[countyFips5] !== undefined) return countyErFactors[countyFips5]
  const stateFips2 = countyFips5.slice(0, 2)
  if (stateErFallbacks[stateFips2] !== undefined) return stateErFallbacks[stateFips2]
  return DEFAULT_ER_FACTOR
}

// State FIPS → 2-letter abbreviation
const STATE_FIPS_TO_ABBR = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY',
}

// ── CSV helpers ──────────────────────────────────────────────────────────────

function escapeCsv(val) {
  const s = String(val ?? '')
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function csvRow(fields) {
  return fields.map(escapeCsv).join(',')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Building utility heating estimates spreadsheet...\n')

  // Load Census data
  const censusPath = join(OUTPUT_DIR, 'national-census-data.json')
  let censusData
  try {
    censusData = JSON.parse(readFileSync(censusPath, 'utf-8'))
  } catch {
    console.error(`Cannot read ${censusPath}\nRun: node scripts/fetch-national-census.mjs`)
    process.exit(1)
  }
  console.log(`Loaded ${Object.keys(censusData).length.toLocaleString()} census tracts`)

  // Load EIA crosswalk
  const crosswalkPath = join(OUTPUT_DIR, 'eia-county-utility-map.json')
  let countyUtilityMap
  try {
    countyUtilityMap = JSON.parse(readFileSync(crosswalkPath, 'utf-8'))
  } catch {
    console.error(`Cannot read ${crosswalkPath}\nRun: node scripts/fetch-eia-territory-crosswalk.mjs`)
    process.exit(1)
  }
  console.log(`Loaded EIA crosswalk: ${Object.keys(countyUtilityMap).length.toLocaleString()} counties`)

  // Load ResStock county-level ER factors
  loadErFactors()
  console.log()

  // ── Aggregate by (utility, state) ────────────────────────────────────────

  // For counties served by multiple utilities, distribute equally.
  const countyUtilityCount = {}
  for (const [fips, utilities] of Object.entries(countyUtilityMap)) {
    countyUtilityCount[fips] = utilities.length
  }

  // Key: "utilityId|stateAbbr" (one row per utility per state)
  const stats = {}
  let tractsMatched = 0
  let tractsUnmatched = 0

  for (const tract of Object.values(censusData)) {
    const { countyFips5, stateFips, totalOccupied, electricHeat, singleFamilyPct } = tract
    const utilities = countyUtilityMap[countyFips5]

    if (!utilities || utilities.length === 0) {
      tractsUnmatched++
      continue
    }

    tractsMatched++
    const erFactor    = getErFactor(countyFips5)   // county-level from ResStock
    const shareWeight = 1 / countyUtilityCount[countyFips5]  // split multi-utility counties equally

    for (const { utilityId, utilityName, state: utilityState } of utilities) {
      const rowKey = `${utilityId}|${utilityState}`

      const weightedHH        = totalOccupied * shareWeight
      const weightedElecHeat  = electricHeat  * shareWeight
      const weightedER        = weightedElecHeat * erFactor
      const weightedDucted    = weightedER * singleFamilyPct
      const weightedNonDucted = weightedER * (1 - singleFamilyPct)

      if (!stats[rowKey]) {
        stats[rowKey] = {
          utilityId,
          utilityName,
          state: utilityState,
          totalHouseholds:   0,
          electricHeatHomes: 0,
          estimatedERHomes:  0,
          ductedERHomes:     0,
          nonDuctedERHomes:  0,
          tractCount:        0,
          countySet:         new Set(),
        }
      }

      const u = stats[rowKey]
      u.totalHouseholds   += weightedHH
      u.electricHeatHomes += weightedElecHeat
      u.estimatedERHomes  += weightedER
      u.ductedERHomes     += weightedDucted
      u.nonDuctedERHomes  += weightedNonDucted
      u.tractCount++
      u.countySet.add(countyFips5)
    }
  }

  const matchPct = ((tractsMatched / (tractsMatched + tractsUnmatched)) * 100).toFixed(1)
  console.log(`Tract coverage: ${tractsMatched.toLocaleString()} matched, ${tractsUnmatched.toLocaleString()} unmatched (${matchPct}%)`)
  console.log(`Generating CSV for ${Object.keys(stats).length.toLocaleString()} utility-state rows...\n`)

  // ── Write CSV ─────────────────────────────────────────────────────────────

  const CSV_HEADERS = [
    'eia_utility_id',
    'utility_name',
    'state',
    'total_households',
    'electric_heat_homes',
    'electric_heat_pct',
    'estimated_er_homes',
    'estimated_hp_homes',
    'ducted_er_homes',
    'non_ducted_er_homes',
    'tract_count',
    'county_count',
  ]

  // Sort by estimated ER homes descending
  const sorted = Object.values(stats).sort((a, b) => b.estimatedERHomes - a.estimatedERHomes)

  const csvLines = [CSV_HEADERS.join(',')]

  for (const u of sorted) {
    const hh               = Math.round(u.totalHouseholds)
    const elecHeat         = Math.round(u.electricHeatHomes)
    const elecHeatPct      = hh > 0 ? Math.round((elecHeat / hh) * 1000) / 10 : 0
    const erHomes          = Math.round(u.estimatedERHomes)
    const hpHomes          = Math.round(u.electricHeatHomes - u.estimatedERHomes)
    const ductedER         = Math.round(u.ductedERHomes)
    const nonDuctedER      = Math.round(u.nonDuctedERHomes)
    const countyCount      = u.countySet.size

    csvLines.push(csvRow([
      u.utilityId,
      u.utilityName,
      u.state,
      hh,
      elecHeat,
      elecHeatPct,
      erHomes,
      hpHomes,
      ductedER,
      nonDuctedER,
      u.tractCount,
      countyCount,
    ]))
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const outputPath = join(OUTPUT_DIR, 'utility-heating-estimates.csv')
  writeFileSync(outputPath, csvLines.join('\n'))

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`Output: ${outputPath}`)
  console.log(`  ${sorted.length.toLocaleString()} utility-state rows`)

  console.log('\nTop 15 utilities by estimated ER homes:')
  const colW = [5, 10, 35, 6, 12, 12, 12, 12]
  const hdr  = ['#', 'EIA ID', 'Utility Name', 'St', 'Total HH', 'Elec Heat', 'Est ER', 'Ducted ER']
  console.log('  ' + hdr.map((h, i) => h.padEnd(colW[i])).join(' '))
  console.log('  ' + colW.map(w => '-'.repeat(w)).join(' '))

  for (let i = 0; i < Math.min(15, sorted.length); i++) {
    const u = sorted[i]
    const fields = [
      String(i + 1),
      u.utilityId,
      u.utilityName.substring(0, colW[2] - 1),
      u.state,
      Math.round(u.totalHouseholds).toLocaleString(),
      Math.round(u.electricHeatHomes).toLocaleString(),
      Math.round(u.estimatedERHomes).toLocaleString(),
      Math.round(u.ductedERHomes).toLocaleString(),
    ]
    console.log('  ' + fields.map((f, i) => f.padEnd(colW[i])).join(' '))
  }

  // National totals (note: multi-utility counties are already split, so summing gives
  // a reasonable national estimate without double-counting)
  const natHH    = sorted.reduce((s, u) => s + u.totalHouseholds, 0)
  const natElec  = sorted.reduce((s, u) => s + u.electricHeatHomes, 0)
  const natER    = sorted.reduce((s, u) => s + u.estimatedERHomes, 0)
  const natDuct  = sorted.reduce((s, u) => s + u.ductedERHomes, 0)

  console.log('\nNational estimate (after proportional county splitting):')
  console.log(`  Total households:    ${Math.round(natHH).toLocaleString()}`)
  console.log(`  Electric heat homes: ${Math.round(natElec).toLocaleString()} (${((natElec / natHH) * 100).toFixed(1)}%)`)
  console.log(`  Estimated ER homes:  ${Math.round(natER).toLocaleString()}`)
  console.log(`  Ducted ER homes:     ${Math.round(natDuct).toLocaleString()} (${((natDuct / natER) * 100).toFixed(1)}% of ER)`)
  console.log(`  Non-ducted ER homes: ${Math.round(natER - natDuct).toLocaleString()}`)
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
