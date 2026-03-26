import type { SelectionSummary, TerritoryConfig } from '../../types/territory'
import { formatNumber, formatMW, formatCurrency, formatKWh, formatPercent, formatCurrencyFull } from '../../lib/formatters'
import { SAVINGS_ASSUMPTIONS, BATTERY_SPECS } from '../../config/quilt-specs'

interface MarketSizingPanelProps {
  summary: SelectionSummary
  config: TerritoryConfig
  countyFilter: string | null
  counties: string[]
  onCountyFilter: (county: string | null) => void
  selectedCount: number
  onClearSelection: () => void
  includeBattery: boolean
  onToggleBattery: () => void
}

export function MarketSizingPanel({
  summary,
  config,
  countyFilter,
  counties,
  onCountyFilter,
  selectedCount,
  onClearSelection,
  includeBattery,
  onToggleBattery,
}: MarketSizingPanelProps) {
  const monthlySavingsPerHome = Math.round(
    (SAVINGS_ASSUMPTIONS.annualKWhSaved * config.defaultElectricityRate) / 12
  )

  return (
    <div className="p-4 space-y-5">
      {/* Scope indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            value={countyFilter || ''}
            onChange={(e) => onCountyFilter(e.target.value || null)}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Counties</option>
            {counties.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {selectedCount > 0 && (
            <button
              onClick={onClearSelection}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Clear selection ({selectedCount} tracts)
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {summary.tractCount} tracts
        </span>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Total Households"
          value={formatNumber(summary.totalHouseholds)}
          size="small"
        />
        <StatCard
          label="Electric Heat Homes"
          value={formatNumber(summary.electricHeatHomes)}
          size="small"
        />
        <StatCard
          label="Est. ER Homes"
          value={formatNumber(summary.estimatedERHomes)}
          description={`${Math.round(config.erAdjustmentFactor * 100)}% of electric-heated`}
          highlight
        />
        <StatCard
          label="Addressable Capacity"
          value={formatMW(summary.peakCapacityFreedMW)}
          description={`avg ${summary.weightedAvgReductionKW} kW/home${includeBattery ? ' (HP + battery)' : ' (SF/MF blended)'}`}
          highlight
        />
      </div>

      {/* Battery toggle */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeBattery}
            onChange={onToggleBattery}
            className="rounded"
          />
          <span className="text-sm text-gray-700">Include battery storage</span>
        </label>
        <p className="text-[11px] text-gray-400 mt-0.5 ml-6">
          Adds {BATTERY_SPECS.additionalPeakReductionKW} kW/home peak reduction via {BATTERY_SPECS.capacityKWh} kWh battery paired with heat pump.
        </p>
      </div>

      {/* Energy savings */}
      <Section title="Energy Savings">
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Annual kWh Saved"
            value={formatKWh(summary.annualKWhSaved)}
            size="small"
          />
          <StatCard
            label="Annual $ Saved"
            value={formatCurrency(summary.annualSavingsDollars)}
            description={`at ${config.defaultElectricityRate * 100}¢/kWh`}
            size="small"
          />
        </div>
        <div className="mt-2 bg-green-50 rounded-lg px-3 py-2 text-sm">
          <span className="text-green-800 font-medium">~${monthlySavingsPerHome}/mo</span>
          <span className="text-green-600 text-xs ml-1">savings per home</span>
        </div>
      </Section>

      {/* Demographics */}
      <Section title="Demographics">
        <div className="space-y-2">
          <DemoRow label="Median Income" value={formatCurrencyFull(summary.weightedMedianIncome)} />
          <DemoRow label="Owner-Occupied" value={formatPercent(summary.weightedOwnerOccupiedPct)} />
          <DemoRow label="Pre-1980 Housing" value={formatPercent(summary.weightedPre1980Pct)} />
        </div>
      </Section>

      {/* Help text */}
      <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
        Click tracts on the map to select. Shift-click to add. Use county filter to narrow scope.
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  description,
  highlight,
  size = 'normal',
}: {
  label: string
  value: string
  description?: string
  highlight?: boolean
  size?: 'normal' | 'small'
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${highlight ? 'bg-orange-50 border border-orange-100' : 'bg-gray-50'}`}>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{label}</div>
      <div className={`font-bold ${size === 'small' ? 'text-lg' : 'text-xl'} ${highlight ? 'text-[var(--color-heat-dark)]' : 'text-gray-900'} mt-0.5`}>
        {value}
      </div>
      {description && (
        <div className="text-[10px] text-gray-400 mt-0.5">{description}</div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h3>
      {children}
    </div>
  )
}

function DemoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  )
}
