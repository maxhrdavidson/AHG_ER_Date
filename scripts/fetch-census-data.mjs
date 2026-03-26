/**
 * Fetch Census ACS 5-Year data for PGE territory counties.
 * Outputs: scripts/output/census-data.json
 *
 * Usage: node scripts/fetch-census-data.mjs [CENSUS_API_KEY]
 * Census API works without key for 500 requests/day.
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')

const CENSUS_API_BASE = 'https://api.census.gov/data/2023/acs/acs5'
const STATE_FIPS = '41' // Oregon
const COUNTY_FIPS = ['067', '051', '005', '047', '071', '053', '009'] // PGE counties

const COUNTY_NAMES = {
  '067': 'Washington',
  '051': 'Multnomah',
  '005': 'Clackamas',
  '047': 'Marion',
  '071': 'Yamhill',
  '053': 'Polk',
  '009': 'Columbia',
}

// ACS variable codes grouped by table
const VARIABLES = {
  // B25040 - Heating Fuel
  B25040_001E: 'heatingFuelTotal',
  B25040_002E: 'heatingGas',
  B25040_003E: 'heatingBottledGas',
  B25040_004E: 'heatingElectricity',
  B25040_005E: 'heatingOil',
  B25040_006E: 'heatingCoal',
  B25040_007E: 'heatingWood',
  B25040_008E: 'heatingSolar',
  B25040_009E: 'heatingOther',
  B25040_010E: 'heatingNone',
  // B25034 - Year Built
  B25034_001E: 'yearBuiltTotal',
  B25034_002E: 'built2020Plus',
  B25034_003E: 'built2010_2019',
  B25034_004E: 'built2000_2009',
  B25034_005E: 'built1990_1999',
  B25034_006E: 'built1980_1989',
  B25034_007E: 'built1970_1979',
  B25034_008E: 'built1960_1969',
  B25034_009E: 'built1950_1959',
  B25034_010E: 'built1940_1949',
  B25034_011E: 'builtPre1940',
  // B25003 - Tenure
  B25003_001E: 'tenureTotal',
  B25003_002E: 'tenureOwner',
  B25003_003E: 'tenureRenter',
  // B19013 - Income
  B19013_001E: 'medianHouseholdIncome',
  // B25024 - Units in Structure
  B25024_001E: 'unitsTotal',
  B25024_002E: 'units1Detached',
  B25024_003E: 'units1Attached',
  B25024_004E: 'units2',
  B25024_005E: 'units3_4',
  B25024_006E: 'units5_9',
  B25024_007E: 'units10_19',
  B25024_008E: 'units20_49',
  B25024_009E: 'units50Plus',
  B25024_010E: 'unitsMobile',
  // B25002 - Occupancy
  B25002_001E: 'occupancyTotal',
  B25002_002E: 'occupancyOccupied',
  B25002_003E: 'occupancyVacant',
}

async function fetchCensusData() {
  const apiKey = process.argv[2] || process.env.CENSUS_API_KEY || ''
  const varCodes = Object.keys(VARIABLES).join(',')
  const counties = COUNTY_FIPS.join(',')

  let url = `${CENSUS_API_BASE}?get=NAME,${varCodes}&for=tract:*&in=state:${STATE_FIPS}&in=county:${counties}`
  if (apiKey) url += `&key=${apiKey}`

  console.log(`Fetching ACS data for ${COUNTY_FIPS.length} Oregon counties...`)
  console.log(`URL: ${url.substring(0, 120)}...`)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Census API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const headers = data[0]
  const rows = data.slice(1)

  console.log(`Got ${rows.length} census tracts`)

  const tracts = {}
  for (const row of rows) {
    const rowObj = {}
    headers.forEach((h, i) => { rowObj[h] = row[i] })

    const geoid = rowObj.state + rowObj.county + rowObj.tract

    const tract = { geoid, name: rowObj.NAME || '' }

    // Map variable codes to friendly names with numeric conversion
    for (const [code, friendlyName] of Object.entries(VARIABLES)) {
      const raw = rowObj[code]
      if (raw === null || raw === undefined || raw === '' || raw === '-666666666' || raw === '-999999999') {
        tract[friendlyName] = null
      } else {
        tract[friendlyName] = Number(raw)
      }
    }

    // Compute derived fields
    const hfTotal = tract.heatingFuelTotal || 0
    if (hfTotal > 0) {
      tract.electricHeatPct = Math.round(((tract.heatingElectricity || 0) / hfTotal) * 1000) / 10
      tract.gasHeatPct = Math.round(((tract.heatingGas || 0) / hfTotal) * 1000) / 10
    } else {
      tract.electricHeatPct = 0
      tract.gasHeatPct = 0
    }

    const ybTotal = tract.yearBuiltTotal || 0
    if (ybTotal > 0) {
      const pre1980 = (tract.built1970_1979 || 0) + (tract.built1960_1969 || 0) +
        (tract.built1950_1959 || 0) + (tract.built1940_1949 || 0) + (tract.builtPre1940 || 0)
      tract.pre1980Pct = Math.round((pre1980 / ybTotal) * 1000) / 10
    } else {
      tract.pre1980Pct = 0
    }

    const tenTotal = tract.tenureTotal || 0
    if (tenTotal > 0) {
      tract.ownerOccupiedPct = Math.round(((tract.tenureOwner || 0) / tenTotal) * 1000) / 10
    } else {
      tract.ownerOccupiedPct = 0
    }

    const uTotal = tract.unitsTotal || 0
    if (uTotal > 0) {
      const sf = (tract.units1Detached || 0) + (tract.units1Attached || 0)
      tract.singleFamilyPct = Math.round((sf / uTotal) * 1000) / 10
    } else {
      tract.singleFamilyPct = 0
    }

    // County name
    tract.county = COUNTY_NAMES[rowObj.county] || rowObj.county

    tracts[geoid] = tract
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const outputPath = join(OUTPUT_DIR, 'census-data.json')
  writeFileSync(outputPath, JSON.stringify(tracts, null, 2))
  console.log(`Wrote ${Object.keys(tracts).length} tracts to ${outputPath}`)

  // Print summary by county
  const byCty = {}
  for (const t of Object.values(tracts)) {
    if (!byCty[t.county]) byCty[t.county] = { tracts: 0, households: 0, electricHeat: 0 }
    byCty[t.county].tracts++
    byCty[t.county].households += t.heatingFuelTotal || 0
    byCty[t.county].electricHeat += t.heatingElectricity || 0
  }
  console.log('\nSummary by county:')
  for (const [county, stats] of Object.entries(byCty)) {
    const pct = stats.households > 0 ? ((stats.electricHeat / stats.households) * 100).toFixed(1) : '0'
    console.log(`  ${county}: ${stats.tracts} tracts, ${stats.households.toLocaleString()} households, ${stats.electricHeat.toLocaleString()} electric heat (${pct}%)`)
  }
}

fetchCensusData().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
