import type { TractProperties, TerritoryConfig, SelectionSummary, Substation, DataCenter } from '../types/territory'

interface Centroid {
  lat: number
  lng: number
}

export function computeTractCentroids(
  geojson: GeoJSON.FeatureCollection
): Map<string, Centroid> {
  const centroids = new Map<string, Centroid>()

  for (const feature of geojson.features) {
    const geoid = (feature.properties as TractProperties | null)?.GEOID
    if (!geoid || !feature.geometry) continue

    const coords: number[][] = []
    const geom = feature.geometry

    if (geom.type === 'Polygon') {
      // Use exterior ring only
      for (const ring of geom.coordinates) {
        for (const pt of ring) {
          coords.push(pt)
        }
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        for (const ring of poly) {
          for (const pt of ring) {
            coords.push(pt)
          }
        }
      }
    }

    if (coords.length === 0) continue

    let sumLat = 0
    let sumLng = 0
    for (const [lng, lat] of coords) {
      sumLat += lat!
      sumLng += lng!
    }
    centroids.set(geoid, {
      lat: Math.round((sumLat / coords.length) * 10000) / 10000,
      lng: Math.round((sumLng / coords.length) * 10000) / 10000,
    })
  }

  return centroids
}

export function formatTractsCSV(
  tracts: TractProperties[],
  centroids: Map<string, Centroid>
): string {
  const header = 'GEOID|county|totalOccupied|electricHeat|estimatedERHomes|peakCapacityFreedKW|blendedReductionKW|singleFamilyPct|medianIncome|ownerOccupiedPct|pre1980Pct|lat|lng'
  const rows = tracts.map(t => {
    const c = centroids.get(t.GEOID)
    return [
      t.GEOID,
      t.county,
      t.totalOccupied,
      t.electricHeat,
      t.estimatedERHomes,
      Math.round(t.peakCapacityFreedKW),
      t.blendedReductionKW,
      t.singleFamilyPct,
      t.medianIncome ?? '',
      t.ownerOccupiedPct,
      t.pre1980Pct,
      c?.lat ?? '',
      c?.lng ?? '',
    ].join('|')
  })
  return [header, ...rows].join('\n')
}

export function formatSubstationsCSV(substations: Substation[]): string {
  const header = 'name|lat|lng|maxVoltage|owner|lineCount'
  const rows = substations.map(s =>
    [s.name, s.lat, s.lng, s.maxVoltage, s.owner, s.lineCount].join('|')
  )
  return [header, ...rows].join('\n')
}

export function formatDataCentersCSV(dataCenters: DataCenter[]): string {
  const header = 'name|lat|lng|capacityMW|operator|status'
  const rows = dataCenters.map(d =>
    [d.name, d.lat, d.lng, d.capacityMW ?? '', d.operator, d.status].join('|')
  )
  return [header, ...rows].join('\n')
}

interface ReferencePoint {
  name: string
  lat: number
  lng: number
}

const RADII_MILES = [5, 10, 15, 20, 25]

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959 // Earth radius in miles
  const toRad = (deg: number) => deg * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function computeProximitySummaries(
  tracts: TractProperties[],
  centroids: Map<string, Centroid>,
  substations: Substation[],
  dataCenters: DataCenter[],
  includeBattery: boolean,
  batteryKW: number,
): string {
  const refPoints: ReferencePoint[] = [
    ...substations.map(s => ({ name: `${s.name} substation`, lat: s.lat, lng: s.lng })),
    ...dataCenters.map(d => ({ name: `${d.name} data center`, lat: d.lat, lng: d.lng })),
  ]

  // Pre-compute tract centroids array for speed
  const tractData = tracts.map(t => {
    const c = centroids.get(t.GEOID)
    return { tract: t, lat: c?.lat ?? 0, lng: c?.lng ?? 0 }
  }).filter(td => td.lat !== 0 && td.lng !== 0)

  const lines: string[] = []
  lines.push('Pre-computed proximity summaries (use these instead of calculating distances):')
  lines.push('')

  for (const ref of refPoints) {
    lines.push(`${ref.name} (${ref.lat}, ${ref.lng}):`)

    // Compute distance from this ref point to every tract
    const tractDistances = tractData.map(td => ({
      ...td,
      distance: haversineDistance(ref.lat, ref.lng, td.lat, td.lng),
    }))

    for (const radius of RADII_MILES) {
      const nearby = tractDistances.filter(td => td.distance <= radius)
      let tractCount = 0
      let erHomes = 0
      let capacityKW = 0

      for (const td of nearby) {
        tractCount++
        erHomes += td.tract.estimatedERHomes
        capacityKW += td.tract.estimatedERHomes * (td.tract.blendedReductionKW + (includeBattery ? batteryKW : 0))
      }

      const capacityMW = (capacityKW / 1000).toFixed(1)
      lines.push(`  ${radius} mi: ${tractCount} tracts, ${erHomes.toLocaleString()} ER homes, ${capacityMW} MW`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export interface ChatContext {
  tractsCSV: string
  substationsCSV: string
  dataCentersCSV: string
  proximitySummaries: string
  summary: SelectionSummary
  config: TerritoryConfig
  countyFilter: string | null
  selectedCount: number
  includeBattery: boolean
}

export function buildDynamicContext(ctx: ChatContext): string {
  const lines: string[] = []

  lines.push('=== CURRENT SELECTION ===')
  if (ctx.selectedCount > 0) {
    lines.push(`User has ${ctx.selectedCount} tracts manually selected.`)
  } else if (ctx.countyFilter) {
    lines.push(`Filtered to county: ${ctx.countyFilter}`)
  } else {
    lines.push('Showing all tracts in territory (no filter).')
  }
  lines.push(`Battery addon: ${ctx.includeBattery ? 'ENABLED (+5.0 kW/home)' : 'disabled'}`)
  lines.push('')
  lines.push(`Summary of active tracts:`)
  lines.push(`- Tracts: ${ctx.summary.tractCount}`)
  lines.push(`- Total households: ${ctx.summary.totalHouseholds.toLocaleString()}`)
  lines.push(`- Electric heat homes: ${ctx.summary.electricHeatHomes.toLocaleString()}`)
  lines.push(`- Estimated ER homes: ${ctx.summary.estimatedERHomes.toLocaleString()}`)
  lines.push(`- Addressable capacity: ${ctx.summary.peakCapacityFreedMW.toFixed(1)} MW`)
  lines.push(`- Weighted avg reduction: ${ctx.summary.weightedAvgReductionKW} kW/home`)
  lines.push(`- Annual kWh saved: ${ctx.summary.annualKWhSaved.toLocaleString()}`)
  lines.push(`- Annual savings: $${ctx.summary.annualSavingsDollars.toLocaleString()}`)
  lines.push('')

  lines.push('=== TERRITORY CONFIG ===')
  lines.push(`Utility: ${ctx.config.displayName} (${ctx.config.state})`)
  lines.push(`Electricity rate: $${ctx.config.defaultElectricityRate}/kWh`)
  lines.push(`Climate zone: ${ctx.config.climate.ieccZone}, HDD ${ctx.config.climate.hddAnnual}, Design temp ${ctx.config.climate.ashrae99DesignF}°F`)
  lines.push(`CO2 intensity: ${ctx.config.climate.co2LbsPerKwh} lbs/kWh`)
  lines.push(`SF peak reduction: ${ctx.config.sfPeakReductionKW} kW, MF peak reduction: ${ctx.config.mfPeakReductionKW} kW`)
  lines.push(`ER adjustment factor: ${ctx.config.erAdjustmentFactor * 100}% (${ctx.config.heatPumpAdjustmentFactor * 100}% already have heat pumps)`)
  lines.push(`Counties: ${ctx.config.counties.map(c => c.name).join(', ')}`)
  lines.push('')

  lines.push('=== ALL TRACT DATA (pipe-delimited) ===')
  lines.push(ctx.tractsCSV)
  lines.push('')

  lines.push('=== SUBSTATIONS ===')
  lines.push(ctx.substationsCSV)
  lines.push('')

  lines.push('=== DATA CENTERS ===')
  lines.push(ctx.dataCentersCSV)
  lines.push('')

  lines.push('=== PROXIMITY SUMMARIES ===')
  lines.push(ctx.proximitySummaries)

  return lines.join('\n')
}
