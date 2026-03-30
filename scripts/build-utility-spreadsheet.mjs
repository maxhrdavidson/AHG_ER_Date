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
 * DUCTED vs NON-DUCTED: Sourced from NREL ResStock 2024.2 via the in.hvac_has_ducts
 *   column. For each county, the ducted fraction is the share of simulated ER homes
 *   that have a duct system (weighted by homes represented). Falls back to a ResStock
 *   state average, then to the Census single-family % proxy (B25024_002E + B25024_003E
 *   / B25024_001E) if no ResStock ducted data is available.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')

// ── ER Adjustment Factors (county-level from ResStock) ───────────────────────
// Falls back to ResStock state average, then national default.
const DEFAULT_ER_FACTOR = 0.80

function loadResStockData() {
  const factorsPath = join(OUTPUT_DIR, 'resstock-county-er-factors.json')
  try {
    const data = JSON.parse(readFileSync(factorsPath, 'utf-8'))
    const erCounties     = data.counties         || {}
    const erStates       = data.stateFallbacks   || {}
    const ductedCounties = data.ductedFractions  || {}
    const ductedStates   = data.ductedFallbacks  || {}
    const hasDucted      = Object.keys(ductedCounties).length > 0

    console.log(`Loaded ResStock ER factors: ${Object.keys(erCounties).length.toLocaleString()} counties, ${Object.keys(erStates).length} state fallbacks`)
    if (hasDucted) {
      console.log(`Loaded ResStock ducted fractions: ${Object.keys(ductedCounties).length.toLocaleString()} counties, ${Object.keys(ductedStates).length} state fallbacks`)
    } else {
      console.warn('WARNING: No ResStock ducted fraction data — falling back to single-family % proxy')
    }

    const getErFactor = (fips5) =>
      erCounties[fips5] ?? erStates[fips5.slice(0, 2)] ?? DEFAULT_ER_FACTOR

    const getDuctedFraction = hasDucted
      ? (fips5, singleFamilyPct) => ductedCounties[fips5] ?? ductedStates[fips5.slice(0, 2)] ?? singleFamilyPct
      : (_fips5, singleFamilyPct) => singleFamilyPct

    return { getErFactor, getDuctedFraction }
  } catch {
    console.warn(`WARNING: resstock-county-er-factors.json not found — using ${DEFAULT_ER_FACTOR} default.`)
    console.warn('  Run: node scripts/fetch-resstock-er-factors.mjs\n')
    return {
      getErFactor:       ()              => DEFAULT_ER_FACTOR,
      getDuctedFraction: (_fips5, sfPct) => sfPct,
    }
  }
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

  const { getErFactor, getDuctedFraction } = loadResStockData()
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
    const { countyFips5, totalOccupied, electricHeat, singleFamilyPct } = tract
    const utilities = countyUtilityMap[countyFips5]

    if (!utilities || utilities.length === 0) {
      tractsUnmatched++
      continue
    }

    tractsMatched++
    const erFactor      = getErFactor(countyFips5)
    const ductedFrac    = getDuctedFraction(countyFips5, singleFamilyPct)
    const shareWeight   = 1 / countyUtilityCount[countyFips5]  // split multi-utility counties equally

    for (const { utilityId, utilityName, state: utilityState } of utilities) {
      const rowKey = `${utilityId}|${utilityState}`

      const weightedHH        = totalOccupied * shareWeight
      const weightedElecHeat  = electricHeat  * shareWeight
      const weightedER        = weightedElecHeat * erFactor
      const weightedDucted    = weightedER * ductedFrac
      const weightedNonDucted = weightedER * (1 - ductedFrac)

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
  console.log(`  Ducted ER homes:     ${Math.round(natDuct).toLocaleString()}${natER > 0 ? ` (${((natDuct / natER) * 100).toFixed(1)}% of ER)` : ''}`)
  console.log(`  Non-ducted ER homes: ${Math.round(natER - natDuct).toLocaleString()}`)
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
