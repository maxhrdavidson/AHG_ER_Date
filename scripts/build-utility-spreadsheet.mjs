/**
 * Build national utility heating estimates spreadsheet.
 *
 * Joins Census ACS tract-level heating data with the EIA service territory
 * county crosswalk to produce per-utility estimates of:
 *   - Total households
 *   - Homes using electric heat (ACS B25040_004E — includes resistance + heat pumps)
 *   - Estimated electric resistance (ER) homes (applying a state-level ER factor)
 *   - Estimated existing heat pump homes
 *   - Ducted ER homes (single-family proxy — these can take a ducted HP replacement)
 *   - Non-ducted ER homes (multifamily proxy — likely mini-split territory)
 *
 * Inputs (run these first):
 *   scripts/output/national-census-data.json   (from fetch-national-census.mjs)
 *   scripts/output/eia-county-utility-map.json  (from fetch-eia-territory-crosswalk.mjs)
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
 *   is actually resistance. It varies by state/region:
 *   - Southeast: lower (30–50% of electric-heated homes already have heat pumps)
 *   - Northeast/Pacific NW: higher (legacy resistance stock, newer HP adoption)
 *   Source: NREL ResStock analysis + DOE LEAD data
 *
 * DUCTED vs NON-DUCTED: Approximated using the share of single-family detached +
 *   attached housing units (Census B25024_002E + B25024_003E). Single-family homes
 *   are more likely to have ductwork for a central HP; multifamily units are more
 *   likely to use mini-split (ductless) systems. This is a structural proxy, not a
 *   direct HVAC survey. For more precision, use NREL ResStock's in.hvac_heating_type
 *   field which directly identifies "Electric Resistance Furnace" (ducted) vs
 *   "Electric Baseboard" (non-ducted).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')

// ── ER Adjustment Factors by State ──────────────────────────────────────────
// What fraction of Census "electric heat" homes actually use resistance heating
// (vs. heat pumps already installed). To update these, reference:
//   - NREL ResStock: in.hvac_heating_type aggregated by state/county
//   - DOE LEAD Tool: electric resistance vs HP share by geography
const ER_FACTOR_BY_STATE = {
  // Southeast: historically high heat pump penetration for cooling-primary climate
  FL: 0.50,
  GA: 0.58, SC: 0.60, NC: 0.63,
  VA: 0.65, TN: 0.65, AL: 0.65, MS: 0.67, AR: 0.68, LA: 0.68,
  KY: 0.70, WV: 0.72,
  // Mid-Atlantic
  MD: 0.72, DE: 0.70, DC: 0.72,
  // New England: growing HP market but large legacy resistance stock
  CT: 0.82, RI: 0.82, MA: 0.83, NH: 0.84, ME: 0.85, VT: 0.85,
  // Pacific Northwest
  OR: 0.80, WA: 0.80,
  // All other states use the default below
}
const DEFAULT_ER_FACTOR = 0.80

function getErFactor(stateAbbr) {
  return ER_FACTOR_BY_STATE[stateAbbr] ?? DEFAULT_ER_FACTOR
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
  console.log(`Loaded EIA crosswalk: ${Object.keys(countyUtilityMap).length.toLocaleString()} counties\n`)

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
    const stateAbbr   = STATE_FIPS_TO_ABBR[stateFips] || ''
    const erFactor    = getErFactor(stateAbbr)
    const shareWeight = 1 / countyUtilityCount[countyFips5]  // split multi-utility counties equally

    for (const { utilityId, utilityName, state: utilityState } of utilities) {
      // Use the tract's state for the ER factor (more accurate than the utility's primary state)
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
