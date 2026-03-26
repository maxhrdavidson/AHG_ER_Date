import { useState } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { Header } from './components/layout/Header'
import { TerritoryMap } from './components/map/TerritoryMap'
import { MarketSizingPanel } from './components/panels/MarketSizingPanel'
import { ProgramSimulator } from './components/panels/ProgramSimulator'
import { ChatPanel } from './components/panels/ChatPanel'
import { useTerritoryData } from './hooks/useTerritoryData'
import { useSelection } from './hooks/useSelection'
import { TERRITORIES, DEFAULT_TERRITORY } from './config/territories'
import { DATA_CENTERS } from './config/data-centers'
import type { ChoroplethMetric } from './types/territory'

type TabId = 'market' | 'program' | 'chat'

export default function App() {
  const territoryId = DEFAULT_TERRITORY
  const config = TERRITORIES[territoryId]!
  const dataCenters = DATA_CENTERS[territoryId] || []

  const [metric, setMetric] = useState<ChoroplethMetric>('electricHeatPct')
  const [showDataCenters, setShowDataCenters] = useState(true)
  const [showTransmission, setShowTransmission] = useState(true)
  const [showSubstations, setShowSubstations] = useState(true)
  const [includeBattery, setIncludeBattery] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('market')

  const { geojson, tracts, counties, transmissionGeoJSON, substations, loading, error } = useTerritoryData(territoryId)
  const {
    selectedTracts,
    countyFilter,
    toggleTract,
    setCountyFilter,
    clearSelection,
    summary,
  } = useSelection(tracts, config, includeBattery)

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-[var(--color-quilt-coral)] rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading territory data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Failed to Load Data</h2>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <p className="text-xs text-gray-400">
            Make sure you've run the data pipeline:<br />
            <code className="bg-gray-200 px-2 py-0.5 rounded">npm run fetch-data && npm run build-territory</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <AppLayout
      header={<Header config={config} />}
      map={
        geojson ? (
          <TerritoryMap
            geojson={geojson}
            config={config}
            dataCenters={dataCenters}
            transmissionGeoJSON={transmissionGeoJSON}
            substations={substations}
            selectedTracts={selectedTracts}
            countyFilter={countyFilter}
            metric={metric}
            showDataCenters={showDataCenters}
            showTransmission={showTransmission}
            showSubstations={showSubstations}
            onTractClick={toggleTract}
            onMetricChange={setMetric}
            onToggleDataCenters={() => setShowDataCenters(!showDataCenters)}
            onToggleTransmission={() => setShowTransmission(!showTransmission)}
            onToggleSubstations={() => setShowSubstations(!showSubstations)}
          />
        ) : null
      }
      sidebar={
        <div className="flex flex-col h-full">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 shrink-0">
            {([
              { id: 'market' as TabId, label: 'Market Size' },
              { id: 'program' as TabId, label: 'Program' },
              { id: 'chat' as TabId, label: 'AI Chat' },
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-gray-900 border-b-2 border-[var(--color-quilt-coral)]'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'market' && (
              <MarketSizingPanel
                summary={summary}
                config={config}
                countyFilter={countyFilter}
                counties={counties}
                onCountyFilter={setCountyFilter}
                selectedCount={selectedTracts.size}
                onClearSelection={clearSelection}
                includeBattery={includeBattery}
                onToggleBattery={() => setIncludeBattery(!includeBattery)}
              />
            )}
            {activeTab === 'program' && <ProgramSimulator config={config} />}
            {activeTab === 'chat' && (
              <ChatPanel
                tracts={tracts}
                geojson={geojson}
                substations={substations}
                dataCenters={dataCenters}
                config={config}
                summary={summary}
                selectedTracts={selectedTracts}
                countyFilter={countyFilter}
                includeBattery={includeBattery}
              />
            )}
          </div>
        </div>
      }
    />
  )
}
