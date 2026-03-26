import { useCallback, useState, useMemo, useRef, useEffect } from 'react'
import Map, { Source, Layer, type MapMouseEvent, type ViewStateChangeEvent } from 'react-map-gl/mapbox'
import type { ChoroplethMetric, MapViewState, TerritoryConfig, DataCenter, Substation } from '../../types/territory'
import { MapLegend } from './MapLegend'
import { DataCenterMarkers } from './DataCenterMarkers'
import { SubstationMarkers } from './SubstationMarkers'
import { TractTooltip } from './TractTooltip'

interface TerritoryMapProps {
  geojson: GeoJSON.FeatureCollection
  config: TerritoryConfig
  dataCenters: DataCenter[]
  transmissionGeoJSON: GeoJSON.FeatureCollection | null
  substations: Substation[]
  selectedTracts: Set<string>
  countyFilter: string | null
  metric: ChoroplethMetric
  showDataCenters: boolean
  showTransmission: boolean
  showSubstations: boolean
  onTractClick: (geoid: string, additive: boolean) => void
  onMetricChange: (metric: ChoroplethMetric) => void
  onToggleDataCenters: () => void
  onToggleTransmission: () => void
  onToggleSubstations: () => void
}

const METRIC_OPTIONS: { value: ChoroplethMetric; label: string }[] = [
  { value: 'electricHeatPct', label: 'Electric Heat %' },
  { value: 'pre1980Pct', label: 'Pre-1980 Housing %' },
  { value: 'medianIncome', label: 'Median Income' },
  { value: 'ownerOccupiedPct', label: 'Owner-Occupied %' },
]

// Color scales for each metric
const COLOR_SCALES: Record<ChoroplethMetric, [number, string][]> = {
  electricHeatPct: [
    [0, '#FFF8E1'],
    [10, '#FFE0B2'],
    [20, '#FFCC80'],
    [30, '#FF9800'],
    [45, '#E65100'],
    [60, '#BF360C'],
  ],
  pre1980Pct: [
    [0, '#E8F5E9'],
    [20, '#A5D6A7'],
    [40, '#66BB6A'],
    [60, '#43A047'],
    [80, '#2E7D32'],
    [100, '#1B5E20'],
  ],
  medianIncome: [
    [20000, '#E3F2FD'],
    [40000, '#90CAF9'],
    [60000, '#42A5F5'],
    [80000, '#1E88E5'],
    [100000, '#1565C0'],
    [130000, '#0D47A1'],
  ],
  ownerOccupiedPct: [
    [0, '#FFF3E0'],
    [20, '#FFE0B2'],
    [40, '#FFB74D'],
    [60, '#FB8C00'],
    [80, '#E65100'],
    [100, '#BF360C'],
  ],
}

function buildFillColor(metric: ChoroplethMetric): any {
  const scale = COLOR_SCALES[metric]
  const property = metric
  const stops: any[] = []
  for (const [value, color] of scale) {
    stops.push(value, color)
  }
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', property], 0],
    ...stops,
  ]
}

interface HoverInfo {
  longitude: number
  latitude: number
  properties: Record<string, any>
}

interface TransmissionHoverInfo {
  longitude: number
  latitude: number
  properties: Record<string, any>
}

export function TerritoryMap({
  geojson,
  config,
  dataCenters,
  transmissionGeoJSON,
  substations,
  selectedTracts,
  countyFilter,
  metric,
  showDataCenters,
  showTransmission,
  showSubstations,
  onTractClick,
  onMetricChange,
  onToggleDataCenters,
  onToggleTransmission,
  onToggleSubstations,
}: TerritoryMapProps) {
  const [viewState, setViewState] = useState<MapViewState>({
    longitude: config.mapCenter[0],
    latitude: config.mapCenter[1],
    zoom: config.mapZoom,
  })
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)
  const [transmissionHoverInfo, setTransmissionHoverInfo] = useState<TransmissionHoverInfo | null>(null)
  const [hoveredLineId, setHoveredLineId] = useState<number | null>(null)
  const [firstLabelLayerId, setFirstLabelLayerId] = useState<string | undefined>(undefined)

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN

  // Track symbol layer IDs so we can move them on top after our data layers render
  const symbolLayerIdsRef = useRef<string[]>([])

  const onMapLoad = useCallback((e: { target: any }) => {
    const map = e.target
    const layers = map.getStyle().layers
    const symbolIds: string[] = []
    for (const layer of layers) {
      if (layer.type === 'symbol') {
        if (!firstLabelLayerId) setFirstLabelLayerId(layer.id)
        symbolIds.push(layer.id)
      }
    }
    symbolLayerIdsRef.current = symbolIds

    // Make labels darker and reduce the white halo
    for (const id of symbolIds) {
      try {
        map.setPaintProperty(id, 'text-color', '#0f172a')
        map.setPaintProperty(id, 'text-halo-width', 0.5)
        map.setPaintProperty(id, 'text-halo-color', 'rgba(255,255,255,0.3)')
      } catch (_) { /* some layers may not support these */ }
    }
  }, [])

  const onHover = useCallback((e: MapMouseEvent) => {
    if (e.features && e.features.length > 0) {
      const feature = e.features[0]!
      const layerId = feature.layer?.id

      if (layerId === 'transmission-line') {
        setTransmissionHoverInfo({
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
          properties: feature.properties || {},
        })
        setHoveredLineId(feature.id as number ?? null)
        setHoverInfo(null)
      } else {
        setHoverInfo({
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
          properties: feature.properties || {},
        })
        setTransmissionHoverInfo(null)
        setHoveredLineId(null)
      }
    } else {
      setHoverInfo(null)
      setTransmissionHoverInfo(null)
      setHoveredLineId(null)
    }
  }, [])

  const onMouseLeave = useCallback(() => {
    setHoverInfo(null)
    setTransmissionHoverInfo(null)
    setHoveredLineId(null)
  }, [])

  const onClick = useCallback((e: MapMouseEvent) => {
    if (e.features && e.features.length > 0) {
      const geoid = e.features[0]!.properties?.GEOID
      if (geoid) {
        onTractClick(geoid, e.originalEvent.shiftKey)
      }
    }
  }, [onTractClick])

  // Build a filter expression for selected tracts
  const selectedFilter = useMemo(() => {
    if (selectedTracts.size === 0) return ['==', 'GEOID', '']
    return ['in', 'GEOID', ...Array.from(selectedTracts)]
  }, [selectedTracts])

  // Build a filter for the selected county
  const countyFilterExpr = useMemo(() => {
    if (!countyFilter) return ['==', 'county', '']
    return ['==', 'county', countyFilter]
  }, [countyFilter])

  const fillColor = useMemo(() => buildFillColor(metric), [metric])

  const mapRef = useRef<any>(null)

  // After our data layers are added, move all symbol/label layers to the top
  useEffect(() => {
    const map = mapRef.current?.getMap?.()
    if (!map || symbolLayerIdsRef.current.length === 0) return
    // Small delay to ensure our Source/Layer components have rendered
    const timer = setTimeout(() => {
      for (const id of symbolLayerIdsRef.current) {
        try {
          map.moveLayer(id)
        } catch (_) { /* layer may not exist yet */ }
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [geojson, firstLabelLayerId])

  if (!mapboxToken) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center p-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Mapbox Token Required</h3>
          <p className="text-sm text-gray-500 mb-3">
            Create a <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs">.env.local</code> file with:
          </p>
          <code className="text-xs bg-gray-200 px-3 py-1.5 rounded block">
            VITE_MAPBOX_TOKEN=your_token_here
          </code>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(e: ViewStateChangeEvent) => setViewState(e.viewState)}
        onLoad={onMapLoad}
        mapboxAccessToken={mapboxToken}
        mapStyle="mapbox://styles/mapbox/light-v11"
        boxZoom={false}
        interactiveLayerIds={['tract-fill', 'transmission-line']}
        onMouseMove={onHover}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        cursor={hoverInfo || transmissionHoverInfo ? 'pointer' : 'grab'}
      >
        <Source id="tracts" type="geojson" data={geojson}>
          {/* Fill layer — choropleth */}
          <Layer
            id="tract-fill"
            type="fill"
            paint={{
              'fill-color': fillColor,
              'fill-opacity': 0.65,
            }}
          />
          {/* Outline layer */}
          <Layer
            id="tract-outline"
            type="line"
            paint={{
              'line-color': '#94a3b8',
              'line-width': 0.5,
            }}
          />
          {/* Selected tract highlight */}
          <Layer
            id="tract-selected"
            type="line"
            filter={selectedFilter as any}
            paint={{
              'line-color': '#1565C0',
              'line-width': 2.5,
            }}
          />
          <Layer
            id="tract-selected-fill"
            type="fill"
            filter={selectedFilter as any}
            paint={{
              'fill-color': '#1565C0',
              'fill-opacity': 0.12,
            }}
          />
          {/* County filter outline */}
          <Layer
            id="county-outline"
            type="line"
            filter={countyFilterExpr as any}
            paint={{
              'line-color': '#1565C0',
              'line-width': 2,
              'line-opacity': countyFilter ? 0.8 : 0,
            }}
          />
          <Layer
            id="county-fill"
            type="fill"
            filter={countyFilterExpr as any}
            paint={{
              'fill-color': '#1565C0',
              'fill-opacity': countyFilter ? 0.06 : 0,
            }}
          />
        </Source>

        {/* Transmission lines layer */}
        {transmissionGeoJSON && showTransmission && (
          <Source id="transmission-lines" type="geojson" data={transmissionGeoJSON} generateId>
            <Layer
              id="transmission-line"
              type="line"
              paint={{
                'line-color': [
                  'match',
                  ['get', 'voltClass'],
                  '500', '#1a1a2e',
                  '345', '#3d3d5c',
                  '220-287', '#4a4a80',
                  '230', '#4a4a80',
                  '115', '#5c5c8a',
                  '100-161', '#5c5c8a',
                  'UNDER 100', '#7070a0',
                  'DC', '#cc3333',
                  '#7070a0',
                ],
                'line-width': [
                  'match',
                  ['get', 'voltClass'],
                  '500', 3,
                  '345', 2.5,
                  '220-287', 2,
                  '230', 2,
                  '115', 2,
                  '100-161', 2,
                  'UNDER 100', 1.5,
                  'DC', 2,
                  1.5,
                ],
                'line-opacity': 0.85,
              }}
            />
            {/* Hover highlight layer */}
            <Layer
              id="transmission-line-hover"
              type="line"
              filter={hoveredLineId !== null ? ['==', ['id'], hoveredLineId] : ['==', ['id'], -1]}
              paint={{
                'line-color': '#3b82f6',
                'line-width': [
                  'match',
                  ['get', 'voltClass'],
                  '500', 5,
                  '345', 4.5,
                  '220-287', 4,
                  '230', 4,
                  '115', 4,
                  '100-161', 4,
                  'UNDER 100', 3.5,
                  'DC', 4,
                  3.5,
                ],
                'line-opacity': 1,
              }}
            />
          </Source>
        )}

        <DataCenterMarkers dataCenters={dataCenters} visible={showDataCenters} />
        <SubstationMarkers substations={substations} visible={showSubstations} />
      </Map>

      {/* Tract hover tooltip */}
      {hoverInfo && (
        <TractTooltip
          x={0}
          y={0}
          properties={hoverInfo.properties}
          erAdjustmentFactor={config.erAdjustmentFactor}
          longitude={hoverInfo.longitude}
          latitude={hoverInfo.latitude}
        />
      )}

      {/* Transmission line hover tooltip */}
      {transmissionHoverInfo && (
        <div className="absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl px-4 py-3 min-w-[200px] border border-gray-100 pointer-events-none">
          <div className="font-semibold text-gray-900 text-sm">
            {transmissionHoverInfo.properties.voltage
              ? `${transmissionHoverInfo.properties.voltage} kV`
              : transmissionHoverInfo.properties.voltClass || 'Unknown'}{' '}
            Transmission Line
          </div>
          {transmissionHoverInfo.properties.owner && (
            <div className="text-xs text-gray-500 mt-0.5">
              {transmissionHoverInfo.properties.owner}
            </div>
          )}
          {(transmissionHoverInfo.properties.sub1 || transmissionHoverInfo.properties.sub2) && (
            <div className="text-xs text-gray-700 mt-1 font-medium">
              {transmissionHoverInfo.properties.sub1 || '?'}
              {' → '}
              {transmissionHoverInfo.properties.sub2 || '?'}
            </div>
          )}
        </div>
      )}

      {/* Map controls overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <select
          value={metric}
          onChange={(e) => onMetricChange(e.target.value as ChoroplethMetric)}
          className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-1.5 text-sm shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {METRIC_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="bg-white/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg flex flex-col gap-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showDataCenters}
              onChange={onToggleDataCenters}
              className="rounded"
            />
            <span className="text-xs text-gray-700">Data Centers</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showTransmission}
              onChange={onToggleTransmission}
              className="rounded"
            />
            <span className="text-xs text-gray-700">Transmission Lines</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showSubstations}
              onChange={onToggleSubstations}
              className="rounded"
            />
            <span className="text-xs text-gray-700">Substations</span>
          </label>
        </div>
      </div>

      <MapLegend metric={metric} />
    </div>
  )
}
