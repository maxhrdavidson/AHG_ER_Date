/**
 * Download EIA Form 861 Service Territory data and build a county FIPS → utility crosswalk.
 *
 * EIA Form 861 reports which counties each electric utility serves. This script:
 *   1. Fetches all US county names from the Census API (to build a name→FIPS lookup)
 *   2. Downloads the EIA 861 2023 zip from eia.gov
 *   3. Extracts and parses the Service Territory xlsx worksheet
 *   4. Matches EIA county names to 5-digit county FIPS codes
 *   5. Outputs a county FIPS → utility list mapping
 *
 * Outputs: scripts/output/eia-county-utility-map.json
 *   { "01001": [{ utilityId, utilityName, state }], ... }
 *
 * Usage: node scripts/fetch-eia-territory-crosswalk.mjs
 * Requires: xlsx package  (npm install)
 *
 * Notes:
 *   - EIA 861 year can be changed by updating EIA_861_YEAR below
 *   - The zip is cached in scripts/output/eia861-temp/ — delete to force re-download
 *   - Some Alaska/Virginia entries may not match due to non-standard county designations
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'output')
const TEMP_DIR   = join(OUTPUT_DIR, 'eia861-temp')

const EIA_861_YEAR = '2023'
// EIA hosts the current year's data at zip/ and older years at archive/zip/.
// Try both in order so the script works regardless of which location EIA uses.
const EIA_861_URLS = [
  `https://www.eia.gov/electricity/data/eia861/zip/f861${EIA_861_YEAR}.zip`,
  `https://www.eia.gov/electricity/data/eia861/archive/zip/f861${EIA_861_YEAR}.zip`,
]
const ZIP_FILE = join(TEMP_DIR, `f861${EIA_861_YEAR}.zip`)

const CENSUS_API_BASE = 'https://api.census.gov/data/2023/acs/acs5'

// All 50 states + DC
const ALL_STATE_FIPS = [
  '01', '02', '04', '05', '06', '08', '09', '10', '11', '12', '13',
  '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25',
  '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36',
  '37', '38', '39', '40', '41', '42', '44', '45', '46', '47', '48',
  '49', '50', '51', '53', '54', '55', '56',
]

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

// Normalize county names for fuzzy matching.
// EIA uses bare names ("Washington"), Census returns "Washington County, Oregon".
function normalizeCountyName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/\bcounty\b/g, '')
    .replace(/\bparish\b/g, '')         // Louisiana
    .replace(/\bborough\b/g, '')        // Alaska
    .replace(/\bcensus area\b/g, '')    // Alaska
    .replace(/\bmunicipality\b/g, '')   // Alaska
    .replace(/\band borough\b/g, '')    // Alaska
    .replace(/\bcity and\b/g, '')       // Alaska
    .replace(/\bindependent city\b/g, '')
    .replace(/[.']/g, '')               // e.g. "St." → "St"
    .replace(/[-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Step 1: Census county name → FIPS lookup ────────────────────────────────

async function buildCountyFipsLookup() {
  console.log('[1/4] Fetching county names from Census API...')
  const lookup = {} // key: "stateAbbr|normalizedName" → 5-digit countyFips

  for (let i = 0; i < ALL_STATE_FIPS.length; i++) {
    const stateFips = ALL_STATE_FIPS[i]
    const stateAbbr = STATE_FIPS_TO_ABBR[stateFips]

    try {
      const url = `${CENSUS_API_BASE}?get=NAME&for=county:*&in=state:${stateFips}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      // data[0] = ["NAME","state","county"]
      // data[1+] = ["Washington County, Oregon", "41", "067"]
      for (const [fullName, , countyFips] of data.slice(1)) {
        const countyPart  = fullName.split(',')[0] // "Washington County"
        const normalized  = normalizeCountyName(countyPart)
        const fips5       = stateFips + countyFips
        lookup[`${stateAbbr}|${normalized}`] = fips5

        // Also store "saint" variant for "St." names
        if (normalized.includes('st ')) {
          const saintVariant = normalized.replace(/\bst\b/g, 'saint')
          lookup[`${stateAbbr}|${saintVariant}`] = fips5
        }
      }

      process.stdout.write(i % 10 === 9 ? `${stateAbbr}\n  ` : `${stateAbbr} `)
    } catch (err) {
      console.error(`\n  Failed for state ${stateFips} (${stateAbbr}): ${err.message}`)
    }

    await new Promise(r => setTimeout(r, 120))
  }

  console.log(`\n  Built lookup: ${Object.keys(lookup).length} county entries\n`)
  return lookup
}

// ─── Step 2: Download EIA 861 zip ─────────────────────────────────────────────

async function downloadEIA861() {
  mkdirSync(TEMP_DIR, { recursive: true })

  if (existsSync(ZIP_FILE)) {
    console.log(`[2/4] EIA 861 zip already cached at:\n  ${ZIP_FILE}\n  (delete to force re-download)\n`)
    return
  }

  // EIA requires a browser-like User-Agent — plain fetch() gets 403'd
  const headers = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0' }

  let lastErr
  for (const url of EIA_861_URLS) {
    console.log(`[2/4] Trying EIA Form 861 (${EIA_861_YEAR}):\n  ${url}`)
    const res = await fetch(url, { headers })
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer())
      writeFileSync(ZIP_FILE, buffer)
      console.log(`  Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB\n`)
      return
    }
    lastErr = `HTTP ${res.status} from ${url}`
    console.log(`  ${lastErr} — trying next URL...`)
  }
  throw new Error(
    `Failed to download EIA 861 from all URLs: ${lastErr}\n` +
    `Download manually from https://www.eia.gov/electricity/data/eia861/ ` +
    `and place the zip at: ${ZIP_FILE}`
  )
}

// ─── Step 3: Extract and parse Service Territory xlsx ─────────────────────────

function extractAndParseServiceTerritory() {
  console.log('[3/4] Extracting Service Territory file from zip...')

  // Extract all files from the zip into the temp dir.
  // unzip exits non-zero on warnings (e.g. duplicate files), so only rethrow
  // if no xlsx files landed on disk.
  try {
    execSync(`unzip -o "${ZIP_FILE}" -d "${TEMP_DIR}"`, { stdio: 'pipe' })
  } catch (err) {
    const hasXlsx = readdirSync(TEMP_DIR).some(f => f.toLowerCase().endsWith('.xlsx'))
    if (!hasXlsx) throw new Error(`unzip failed and no xlsx files extracted: ${err.message}`)
  }

  // Find the service territory xlsx (file name varies slightly by year)
  function findFile(dir, pattern) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const found = findFile(join(dir, entry.name), pattern)
        if (found) return found
      } else if (pattern.test(entry.name)) {
        return join(dir, entry.name)
      }
    }
    return null
  }

  const xlsxPath = findFile(TEMP_DIR, /Service_Territory/i)
  if (!xlsxPath) {
    const allFiles = execSync(`find "${TEMP_DIR}" -name "*.xlsx"`).toString().trim()
    throw new Error(
      `Service_Territory*.xlsx not found in zip.\nFiles extracted:\n${allFiles}`
    )
  }
  console.log(`  Found: ${xlsxPath}`)

  const workbook = XLSX.readFile(xlsxPath)

  // Find the service territory worksheet (some years nest it in multiple sheets)
  const sheetName = workbook.SheetNames.find(n => /service.territory/i.test(n))
    || workbook.SheetNames[0]
  console.log(`  Using sheet: "${sheetName}"`)

  const sheet = workbook.Sheets[sheetName]
  const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  console.log(`  ${rows.length} rows parsed\n`)

  return rows
}

// ─── Step 4: Match EIA county names to FIPS ───────────────────────────────────

function buildCrossWalk(rows, countyFipsLookup) {
  console.log('[4/4] Matching EIA county names to FIPS codes...')

  if (rows.length === 0) throw new Error('Service territory sheet is empty')

  // Detect columns (names vary by EIA 861 vintage)
  const columns = Object.keys(rows[0])
  const findCol = (...patterns) =>
    columns.find(c => patterns.some(p => c.toLowerCase().replace(/\s+/g, '').includes(p.toLowerCase().replace(/\s+/g, ''))))

  const colId    = findCol('utility number', 'utility id', 'eiaid', 'id')
  const colName  = findCol('utility name', 'name')
  const colState = findCol('state')
  const colCounty = findCol('county')
  const colFips   = findCol('fips', 'countyfips', 'county fips') // not always present

  if (!colName || !colState || !colCounty) {
    throw new Error(`Missing required columns in EIA 861.\nFound columns: ${columns.join(', ')}`)
  }
  console.log(`  Columns → id: "${colId}", name: "${colName}", state: "${colState}", county: "${colCounty}", fips: "${colFips || 'n/a'}"`)

  const countyUtilityMap = {} // countyFips5 → [{utilityId, utilityName, state}]
  let matched = 0
  let unmatched = 0
  const unmatchedSamples = []

  for (const row of rows) {
    const utilityId   = String(row[colId]    || '').trim()
    const utilityName = String(row[colName]  || '').trim()
    const stateAbbr   = String(row[colState] || '').trim().toUpperCase()
    const countyName  = String(row[colCounty] || '').trim()

    // Skip blank rows and header-repeat rows
    if (!utilityName || utilityName === 'Utility Name' || !stateAbbr || !countyName) continue
    // Skip non-US states (some EIA entries have territories)
    if (!STATE_FIPS_TO_ABBR[Object.keys(STATE_FIPS_TO_ABBR).find(k => STATE_FIPS_TO_ABBR[k] === stateAbbr)]) continue

    let countyFips5 = null

    // Try direct FIPS column first (available in some EIA 861 vintages)
    if (colFips) {
      const rawFips = String(row[colFips] || '').trim().replace(/[^0-9]/g, '')
      if (rawFips.length >= 4) {
        countyFips5 = rawFips.padStart(5, '0')
      }
    }

    // Fall back to name-based matching
    if (!countyFips5) {
      const normalized = normalizeCountyName(countyName)

      countyFips5 = countyFipsLookup[`${stateAbbr}|${normalized}`]
        || countyFipsLookup[`${stateAbbr}|${normalized.replace(/\bst\b/g, 'saint')}`]
        || countyFipsLookup[`${stateAbbr}|${normalized.replace(/[^a-z0-9 ]/g, '').trim()}`]
    }

    if (countyFips5) {
      if (!countyUtilityMap[countyFips5]) countyUtilityMap[countyFips5] = []
      // Avoid duplicate (same utility listed twice for the same county)
      if (!countyUtilityMap[countyFips5].some(u => u.utilityId === utilityId)) {
        countyUtilityMap[countyFips5].push({ utilityId, utilityName, state: stateAbbr })
      }
      matched++
    } else {
      unmatched++
      if (unmatchedSamples.length < 15) unmatchedSamples.push(`${stateAbbr}/${countyName}`)
    }
  }

  const matchRate = ((matched / (matched + unmatched)) * 100).toFixed(1)
  console.log(`  Matched: ${matched.toLocaleString()}  Unmatched: ${unmatched.toLocaleString()}  (${matchRate}% match rate)`)
  if (unmatchedSamples.length > 0) {
    console.log(`  Unmatched samples: ${unmatchedSamples.join(', ')}`)
  }

  return countyUtilityMap
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Building EIA ${EIA_861_YEAR} county→utility crosswalk...\n`)
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const countyFipsLookup = await buildCountyFipsLookup()
  await downloadEIA861()
  const rows = extractAndParseServiceTerritory()
  const countyUtilityMap = buildCrossWalk(rows, countyFipsLookup)

  const outputPath = join(OUTPUT_DIR, 'eia-county-utility-map.json')
  writeFileSync(outputPath, JSON.stringify(countyUtilityMap, null, 2))

  const countyCount  = Object.keys(countyUtilityMap).length
  const utilityIds   = new Set(Object.values(countyUtilityMap).flat().map(u => u.utilityId))
  const multiCounties = Object.values(countyUtilityMap).filter(u => u.length > 1).length

  console.log(`\nOutput: ${outputPath}`)
  console.log(`  ${countyCount.toLocaleString()} counties mapped`)
  console.log(`  ${utilityIds.size.toLocaleString()} distinct utilities`)
  console.log(`  ${multiCounties.toLocaleString()} counties served by 2+ utilities (will be split proportionally)`)
  console.log('\nNext step: node scripts/build-utility-spreadsheet.mjs')
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
