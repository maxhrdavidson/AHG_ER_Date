/**
 * Build territory GeoJSON by merging Census ACS data into tract boundaries.
 * Downloads Oregon tract boundaries from Census Cartographic Boundary Files,
 * filters to PGE counties, and merges demographic data from fetch-census-data.mjs output.
 *
 * Usage: node scripts/build-territory.mjs
 * Prerequisite: Run fetch-census-data.mjs first
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const CENSUS_DATA_PATH = join(__dirname, 'output', 'census-data.json')
const OUTPUT_DIR = join(PROJECT_ROOT, 'public', 'data', 'pge-oregon')

const STATE_FIPS = '41'
const COUNTY_FIPS = new Set(['067', '051', '005', '047', '071', '053', '009'])

// Census Cartographic Boundary Files — pre-simplified GeoJSON
// Using 2023 vintage, 1:500k resolution
const TRACT_GEOJSON_URL = `https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_${STATE_FIPS}_tract_500k.zip`

// Alternative: direct GeoJSON from TIGERweb (no shapefile dependency)
const TIGERWEB_URL = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2023/MapServer/8/query`

// ER adjustment factor — 80% of electric-heated homes are resistance (per plan)
const ER_ADJUSTMENT_FACTOR = 0.80
// Per-home peak reduction, blended by SF/MF housing mix per tract
// At ~23°F design temp, Quilt COP 2.5 vs ER COP 1.0 → 60% reduction
// See docs/sf-mf-peak-reduction-assumptions.md for derivation
const SF_PEAK_REDUCTION_KW = 9.0 // SF: 15.0 kW ER baseline × 60%
const MF_PEAK_REDUCTION_KW = 5.4 // MF: 9.0 kW ER baseline × 60%

async function fetchTractBoundaries() {
  // Use TIGERweb REST API to get GeoJSON directly (avoids shapefile processing)
  // Query in batches by county to avoid result limits
  const allFeatures = []

  for (const countyFips of COUNTY_FIPS) {
    console.log(`  Fetching tracts for county ${countyFips}...`)
    const params = new URLSearchParams({
      where: `STATE='${STATE_FIPS}' AND COUNTY='${countyFips}'`,
      outFields: 'GEOID,STATE,COUNTY,TRACT,BASENAME,NAME',
      outSR: '4326',
      f: 'geojson',
    })

    const url = `${TIGERWEB_URL}?${params}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`TIGERweb error for county ${countyFips}: ${response.status}`)
    }

    const data = await response.json()
    if (data.features) {
      allFeatures.push(...data.features)
      console.log(`    → ${data.features.length} tracts`)
    }
  }

  return {
    type: 'FeatureCollection',
    features: allFeatures,
  }
}

function simplifyCoordinate(coord) {
  // Round to 4 decimal places (~11m precision)
  return Math.round(coord * 10000) / 10000
}

function simplifyCoordinates(coords) {
  if (typeof coords[0] === 'number') {
    return [simplifyCoordinate(coords[0]), simplifyCoordinate(coords[1])]
  }
  return coords.map(simplifyCoordinates)
}

// Douglas-Peucker line simplification to reduce vertex count
function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  if (dx === 0 && dy === 0) {
    return Math.sqrt((point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2)
  }
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)))
  const projX = start[0] + t * dx
  const projY = start[1] + t * dy
  return Math.sqrt((point[0] - projX) ** 2 + (point[1] - projY) ** 2)
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points

  let maxDist = 0
  let maxIdx = 0
  const first = points[0]
  const last = points[points.length - 1]

  for (let i = 1; i < points.length - 1; i++) {
    const d = distanceToSegment(points[i], first, last)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), tolerance)
    const right = douglasPeucker(points.slice(maxIdx), tolerance)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

function simplifyRing(ring, tolerance) {
  const simplified = douglasPeucker(ring, tolerance)
  // Ensure ring closure
  if (simplified.length >= 3) {
    const first = simplified[0]
    const last = simplified[simplified.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) {
      simplified.push([...first])
    }
  }
  return simplified
}

function simplifyGeometry(geometry, tolerance) {
  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(ring =>
        simplifyCoordinates(simplifyRing(ring, tolerance))
      ),
    }
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(polygon =>
        polygon.map(ring => simplifyCoordinates(simplifyRing(ring, tolerance)))
      ),
    }
  }
  return geometry
}

function buildTerritoryGeoJSON(boundaryGeoJSON, censusData) {
  const features = []
  let matched = 0
  let unmatched = 0

  for (const feature of boundaryGeoJSON.features) {
    const geoid = feature.properties.GEOID
    const census = censusData[geoid]

    if (!census) {
      unmatched++
      continue
    }

    matched++

    // Compute ER-specific values
    const electricHeat = census.heatingElectricity || 0
    const estimatedERHomes = Math.round(electricHeat * ER_ADJUSTMENT_FACTOR)
    const singleFamilyPct = census.singleFamilyPct || 0
    const sfFraction = singleFamilyPct / 100
    const blendedReductionKW = Math.round((sfFraction * SF_PEAK_REDUCTION_KW + (1 - sfFraction) * MF_PEAK_REDUCTION_KW) * 100) / 100
    const peakCapacityFreedKW = Math.round(estimatedERHomes * blendedReductionKW)

    // Simplify geometry to reduce file size (tolerance ~0.001 degrees ≈ ~100m)
    const simplifiedGeometry = simplifyGeometry(feature.geometry, 0.0008)

    features.push({
      type: 'Feature',
      geometry: simplifiedGeometry,
      properties: {
        GEOID: geoid,
        NAME: census.name,
        county: census.county,
        COUNTYFP: feature.properties.COUNTY,

        // Heating fuel
        totalOccupied: census.heatingFuelTotal || 0,
        electricHeat,
        gasHeat: census.heatingGas || 0,
        electricHeatPct: census.electricHeatPct || 0,
        gasHeatPct: census.gasHeatPct || 0,

        // ER estimates
        estimatedERHomes,
        peakCapacityFreedKW,
        blendedReductionKW,

        // Year built
        totalHousingUnits: census.yearBuiltTotal || 0,
        pre1980Pct: census.pre1980Pct || 0,

        // Tenure
        ownerOccupiedPct: census.ownerOccupiedPct || 0,

        // Income
        medianIncome: census.medianHouseholdIncome,

        // Structure type
        singleFamilyPct: census.singleFamilyPct || 0,
      },
    })
  }

  console.log(`  Matched: ${matched}, Unmatched: ${unmatched}`)

  return {
    type: 'FeatureCollection',
    features,
  }
}

async function main() {
  console.log('Building PGE-Oregon territory GeoJSON...\n')

  // Step 1: Load census data
  console.log('[1/3] Loading census data...')
  let censusData
  try {
    censusData = JSON.parse(readFileSync(CENSUS_DATA_PATH, 'utf-8'))
    console.log(`  Loaded ${Object.keys(censusData).length} tracts from census-data.json`)
  } catch (err) {
    console.error('Error: Census data not found. Run fetch-census-data.mjs first.')
    process.exit(1)
  }

  // Step 2: Fetch tract boundaries
  console.log('\n[2/3] Fetching tract boundaries from TIGERweb...')
  const boundaries = await fetchTractBoundaries()
  console.log(`  Total: ${boundaries.features.length} tract boundaries`)

  // Step 3: Merge and output
  console.log('\n[3/3] Merging census data into GeoJSON...')
  const territoryGeoJSON = buildTerritoryGeoJSON(boundaries, censusData)

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const outputPath = join(OUTPUT_DIR, 'tracts.geojson')
  const jsonStr = JSON.stringify(territoryGeoJSON)
  writeFileSync(outputPath, jsonStr)

  const sizeMB = (Buffer.byteLength(jsonStr) / (1024 * 1024)).toFixed(1)
  console.log(`\nOutput: ${outputPath}`)
  console.log(`  ${territoryGeoJSON.features.length} tracts, ${sizeMB} MB`)

  // Summary stats
  let totalHH = 0, totalElec = 0, totalER = 0, totalPeakKW = 0
  for (const f of territoryGeoJSON.features) {
    totalHH += f.properties.totalOccupied
    totalElec += f.properties.electricHeat
    totalER += f.properties.estimatedERHomes
    totalPeakKW += f.properties.peakCapacityFreedKW
  }
  const peakMW = (totalPeakKW / 1000).toFixed(1)
  const avgKW = totalER > 0 ? (totalPeakKW / totalER).toFixed(1) : '0'
  console.log(`\nTerritory Summary:`)
  console.log(`  Households: ${totalHH.toLocaleString()}`)
  console.log(`  Electric heat homes: ${totalElec.toLocaleString()} (${((totalElec/totalHH)*100).toFixed(1)}%)`)
  console.log(`  Estimated ER homes: ${totalER.toLocaleString()}`)
  console.log(`  Peak capacity freed: ${peakMW} MW (avg ${avgKW} kW/home, blended by SF/MF mix)`)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
