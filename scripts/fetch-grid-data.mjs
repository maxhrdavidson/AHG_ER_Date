/**
 * Fetch transmission line and substation data from HIFLD via ArcGIS REST API.
 * Derives substation locations from transmission line endpoints (SUB_1/SUB_2 fields).
 *
 * Usage: node scripts/fetch-grid-data.mjs
 * Output: public/data/pge-oregon/transmission-lines.geojson
 *         public/data/pge-oregon/substations.geojson
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, '..', 'public', 'data', 'pge-oregon')

// HIFLD Transmission Lines FeatureServer
const TRANSMISSION_URL =
  'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0/query'

// PGE Oregon territory bounding box (generous to capture lines crossing the boundary)
const BBOX = {
  xmin: -123.8,
  ymin: 44.3,
  xmax: -121.3,
  ymax: 46.4,
}

const MAX_RECORDS = 1000 // ArcGIS default max per request

async function fetchTransmissionLines() {
  console.log('Fetching transmission lines from HIFLD...')

  const allFeatures = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const params = new URLSearchParams({
      where: "STATUS = 'IN SERVICE'",
      geometry: JSON.stringify({
        xmin: BBOX.xmin,
        ymin: BBOX.ymin,
        xmax: BBOX.xmax,
        ymax: BBOX.ymax,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'VOLTAGE,VOLT_CLASS,OWNER,STATUS,TYPE,SUB_1,SUB_2',
      outSR: '4326',
      resultOffset: String(offset),
      resultRecordCount: String(MAX_RECORDS),
      f: 'geojson',
    })

    const url = `${TRANSMISSION_URL}?${params}`
    console.log(`  Fetching offset ${offset}...`)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HIFLD API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    if (data.error) {
      throw new Error(`HIFLD API error: ${JSON.stringify(data.error)}`)
    }

    const features = data.features || []
    allFeatures.push(...features)
    console.log(`  Got ${features.length} features (total: ${allFeatures.length})`)

    // If we got fewer than max, we've reached the end
    if (features.length < MAX_RECORDS) {
      hasMore = false
    } else {
      offset += MAX_RECORDS
    }
  }

  console.log(`Total transmission line features: ${allFeatures.length}`)
  return allFeatures
}

function buildTransmissionGeoJSON(features) {
  // Simplify properties for our use case
  const simplified = features.map((f) => ({
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      voltage: f.properties.VOLTAGE || 0,
      voltClass: f.properties.VOLT_CLASS || 'UNDER 100',
      owner: f.properties.OWNER || 'UNKNOWN',
      status: f.properties.STATUS || 'UNKNOWN',
      type: f.properties.TYPE || 'UNKNOWN',
      sub1: f.properties.SUB_1 || '',
      sub2: f.properties.SUB_2 || '',
    },
  }))

  return {
    type: 'FeatureCollection',
    features: simplified,
  }
}

function deriveSubstations(features) {
  console.log('Deriving substations from line endpoints...')

  // Map: substation name -> { coords, maxVoltage, owners }
  const substationMap = new Map()

  for (const f of features) {
    const coords = f.geometry?.coordinates
    if (!coords || coords.length === 0) continue

    const voltage = f.properties.VOLTAGE || 0
    const owner = f.properties.OWNER || 'UNKNOWN'
    const sub1 = f.properties.SUB_1?.trim()
    const sub2 = f.properties.SUB_2?.trim()

    // Get first coordinate for SUB_1
    if (sub1) {
      const firstCoord = getFirstCoord(coords)
      if (firstCoord) {
        if (!substationMap.has(sub1)) {
          substationMap.set(sub1, {
            name: sub1,
            lng: firstCoord[0],
            lat: firstCoord[1],
            maxVoltage: voltage,
            owners: new Set([owner]),
            lineCount: 0,
          })
        }
        const entry = substationMap.get(sub1)
        entry.maxVoltage = Math.max(entry.maxVoltage, voltage)
        entry.owners.add(owner)
        entry.lineCount++
      }
    }

    // Get last coordinate for SUB_2
    if (sub2) {
      const lastCoord = getLastCoord(coords)
      if (lastCoord) {
        if (!substationMap.has(sub2)) {
          substationMap.set(sub2, {
            name: sub2,
            lng: lastCoord[0],
            lat: lastCoord[1],
            maxVoltage: voltage,
            owners: new Set([owner]),
            lineCount: 0,
          })
        }
        const entry = substationMap.get(sub2)
        entry.maxVoltage = Math.max(entry.maxVoltage, voltage)
        entry.owners.add(owner)
        entry.lineCount++
      }
    }
  }

  // Convert to GeoJSON points
  const substationFeatures = Array.from(substationMap.values()).map((s) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [s.lng, s.lat],
    },
    properties: {
      name: s.name,
      maxVoltage: s.maxVoltage,
      owner: Array.from(s.owners).join(', '),
      lineCount: s.lineCount,
    },
  }))

  console.log(`Derived ${substationFeatures.length} unique substations`)
  return {
    type: 'FeatureCollection',
    features: substationFeatures,
  }
}

function getFirstCoord(coords) {
  // Handle both LineString [coord, coord, ...] and MultiLineString [[coord, ...], ...]
  if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
    // MultiLineString — take first coord of first segment
    return coords[0][0]
  }
  return coords[0]
}

function getLastCoord(coords) {
  if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
    // MultiLineString — take last coord of last segment
    const lastSegment = coords[coords.length - 1]
    return lastSegment[lastSegment.length - 1]
  }
  return coords[coords.length - 1]
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const rawFeatures = await fetchTransmissionLines()

  // Build transmission lines GeoJSON
  const transmissionGeoJSON = buildTransmissionGeoJSON(rawFeatures)
  const transmissionPath = join(OUTPUT_DIR, 'transmission-lines.geojson')
  writeFileSync(transmissionPath, JSON.stringify(transmissionGeoJSON))
  console.log(`Wrote ${transmissionPath} (${transmissionGeoJSON.features.length} lines)`)

  // Derive substations from line endpoints
  const substationsGeoJSON = deriveSubstations(rawFeatures)
  const substationsPath = join(OUTPUT_DIR, 'substations.geojson')
  writeFileSync(substationsPath, JSON.stringify(substationsGeoJSON))
  console.log(`Wrote ${substationsPath} (${substationsGeoJSON.features.length} substations)`)

  // Summary stats
  const voltageClasses = {}
  for (const f of transmissionGeoJSON.features) {
    const vc = f.properties.voltClass
    voltageClasses[vc] = (voltageClasses[vc] || 0) + 1
  }
  console.log('\nVoltage class breakdown:')
  for (const [vc, count] of Object.entries(voltageClasses).sort()) {
    console.log(`  ${vc}: ${count}`)
  }

  const owners = {}
  for (const f of transmissionGeoJSON.features) {
    const o = f.properties.owner
    owners[o] = (owners[o] || 0) + 1
  }
  console.log('\nTop owners:')
  const sorted = Object.entries(owners).sort((a, b) => b[1] - a[1]).slice(0, 10)
  for (const [owner, count] of sorted) {
    console.log(`  ${owner}: ${count}`)
  }
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
