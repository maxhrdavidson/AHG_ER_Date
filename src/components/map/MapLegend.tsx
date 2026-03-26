import type { ChoroplethMetric } from '../../types/territory'

interface MapLegendProps {
  metric: ChoroplethMetric
}

const LEGENDS: Record<ChoroplethMetric, { label: string; stops: { color: string; value: string }[] }> = {
  electricHeatPct: {
    label: '% Electric Heat',
    stops: [
      { color: '#FFF8E1', value: '0%' },
      { color: '#FFCC80', value: '15%' },
      { color: '#FF9800', value: '30%' },
      { color: '#E65100', value: '45%' },
      { color: '#BF360C', value: '60%+' },
    ],
  },
  pre1980Pct: {
    label: '% Pre-1980 Housing',
    stops: [
      { color: '#E8F5E9', value: '0%' },
      { color: '#81C784', value: '25%' },
      { color: '#43A047', value: '50%' },
      { color: '#2E7D32', value: '75%' },
      { color: '#1B5E20', value: '100%' },
    ],
  },
  medianIncome: {
    label: 'Median Income',
    stops: [
      { color: '#E3F2FD', value: '$30K' },
      { color: '#90CAF9', value: '$50K' },
      { color: '#42A5F5', value: '$70K' },
      { color: '#1E88E5', value: '$90K' },
      { color: '#0D47A1', value: '$120K+' },
    ],
  },
  ownerOccupiedPct: {
    label: '% Owner-Occupied',
    stops: [
      { color: '#FFF3E0', value: '0%' },
      { color: '#FFB74D', value: '25%' },
      { color: '#FB8C00', value: '50%' },
      { color: '#E65100', value: '75%' },
      { color: '#BF360C', value: '100%' },
    ],
  },
}

export function MapLegend({ metric }: MapLegendProps) {
  const legend = LEGENDS[metric]

  return (
    <div className="absolute bottom-6 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2.5 z-10">
      <div className="text-[11px] font-semibold text-gray-600 mb-1.5">{legend.label}</div>
      <div className="flex items-center gap-0">
        {legend.stops.map((stop, i) => (
          <div key={i} className="flex flex-col items-center">
            <div
              className="w-10 h-3"
              style={{
                backgroundColor: stop.color,
                borderRadius: i === 0 ? '2px 0 0 2px' : i === legend.stops.length - 1 ? '0 2px 2px 0' : 0,
              }}
            />
            <span className="text-[9px] text-gray-500 mt-0.5">{stop.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
