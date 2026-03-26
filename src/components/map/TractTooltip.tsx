import { formatNumber, formatPercent, formatKW, formatCurrencyFull } from '../../lib/formatters'

interface TractTooltipProps {
  x: number
  y: number
  properties: Record<string, any>
  erAdjustmentFactor: number
  longitude: number
  latitude: number
}

export function TractTooltip({ properties, erAdjustmentFactor }: TractTooltipProps) {
  const name = properties.NAME || 'Unknown Tract'
  const county = properties.county || ''
  const totalOccupied = Number(properties.totalOccupied) || 0
  const electricHeat = Number(properties.electricHeat) || 0
  const electricHeatPct = Number(properties.electricHeatPct) || 0
  const estimatedERHomes = Math.round(electricHeat * erAdjustmentFactor)
  const blendedKW = Number(properties.blendedReductionKW) || 0
  const peakFreedKW = estimatedERHomes * blendedKW
  const singleFamilyPct = Number(properties.singleFamilyPct) || 0
  const medianIncome = properties.medianIncome ? Number(properties.medianIncome) : null
  const pre1980Pct = Number(properties.pre1980Pct) || 0
  const ownerOccupiedPct = Number(properties.ownerOccupiedPct) || 0

  // Extract short tract label (e.g. "Census Tract 301" → "Tract 301")
  const shortName = name.replace(/Census Tract /, 'Tract ').replace(/, .+$/, '')

  return (
    <div className="absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl px-4 py-3 min-w-[240px] border border-gray-100 pointer-events-none">
      <div className="font-semibold text-gray-900 text-sm">{shortName}</div>
      <div className="text-xs text-gray-500 mb-2">{county} County</div>

      <div className="space-y-1.5">
        <Row label="Total Households" value={formatNumber(totalOccupied)} />
        <Row
          label="Electric Heat"
          value={`${formatNumber(electricHeat)} (${formatPercent(electricHeatPct)})`}
          highlight
        />
        <Row label="Est. ER Homes" value={formatNumber(estimatedERHomes)} />
        <Row label="Peak kW Freed" value={formatKW(peakFreedKW)} highlight />
        <Row label="kW/Home (blended)" value={`${blendedKW.toFixed(1)} kW`} />
        <Row label="Single-Family" value={formatPercent(singleFamilyPct)} />

        <div className="border-t border-gray-100 pt-1.5 mt-1.5" />
        <Row label="Pre-1980 Housing" value={formatPercent(pre1980Pct)} />
        <Row label="Owner-Occupied" value={formatPercent(ownerOccupiedPct)} />
        {medianIncome !== null && (
          <Row label="Median Income" value={formatCurrencyFull(medianIncome)} />
        )}
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={highlight ? 'font-semibold text-[var(--color-heat-dark)]' : 'text-gray-800 font-medium'}>
        {value}
      </span>
    </div>
  )
}
