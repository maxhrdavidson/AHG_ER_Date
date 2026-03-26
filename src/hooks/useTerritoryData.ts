import { useState, useEffect } from 'react'
import type { TractProperties, Substation } from '../types/territory'

interface TerritoryData {
  geojson: GeoJSON.FeatureCollection | null
  tracts: TractProperties[]
  counties: string[]
  transmissionGeoJSON: GeoJSON.FeatureCollection | null
  substations: Substation[]
  loading: boolean
  error: string | null
}

export function useTerritoryData(territoryId: string): TerritoryData {
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [tracts, setTracts] = useState<TractProperties[]>([])
  const [counties, setCounties] = useState<string[]>([])
  const [transmissionGeoJSON, setTransmissionGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null)
  const [substations, setSubstations] = useState<Substation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    const basePath = `/data/${territoryId}`

    // Load all data files in parallel
    Promise.all([
      fetch(`${basePath}/tracts.geojson`).then(res => {
        if (!res.ok) throw new Error(`Failed to load territory data: ${res.status}`)
        return res.json()
      }),
      fetch(`${basePath}/transmission-lines.geojson`).then(res => {
        if (!res.ok) return null // Grid data is optional
        return res.json()
      }).catch(() => null),
      fetch(`${basePath}/substations.geojson`).then(res => {
        if (!res.ok) return null
        return res.json()
      }).catch(() => null),
    ])
      .then(([tractsData, txData, subData]: [GeoJSON.FeatureCollection, GeoJSON.FeatureCollection | null, GeoJSON.FeatureCollection | null]) => {
        // Tracts (required)
        setGeojson(tractsData)
        const tractList: TractProperties[] = tractsData.features.map(f => f.properties as TractProperties)
        setTracts(tractList)
        const countySet = new Set(tractList.map(t => t.county))
        setCounties(Array.from(countySet).sort())

        // Transmission lines (optional)
        if (txData) {
          setTransmissionGeoJSON(txData)
        }

        // Substations (optional) — parse into typed array
        if (subData) {
          const subList: Substation[] = subData.features
            .filter(f => f.geometry?.type === 'Point')
            .map(f => {
              const coords = (f.geometry as GeoJSON.Point).coordinates
              return {
                name: f.properties?.name || 'Unknown',
                lng: coords[0] ?? 0,
                lat: coords[1] ?? 0,
                maxVoltage: f.properties?.maxVoltage || 0,
                owner: f.properties?.owner || 'Unknown',
                lineCount: f.properties?.lineCount || 0,
              }
            })
          setSubstations(subList)
        }

        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [territoryId])

  return { geojson, tracts, counties, transmissionGeoJSON, substations, loading, error }
}
