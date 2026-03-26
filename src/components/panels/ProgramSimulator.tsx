import { useState } from 'react'
import type { TerritoryConfig } from '../../types/territory'
import { formatMW, formatCurrency, formatCurrencyFull, formatNumber } from '../../lib/formatters'
import { SAVINGS_ASSUMPTIONS, BATTERY_SPECS, PROGRAM_DEFAULTS } from '../../config/quilt-specs'

interface ProgramSimulatorProps {
  config: TerritoryConfig
}

export function ProgramSimulator({ config }: ProgramSimulatorProps) {
  const [programSize, setProgramSize] = useState(1000)
  const [includeBattery, setIncludeBattery] = useState(false)

  // Blended peak reduction — baked-in program assumption (~7.5 kW/home)
  // Derived from territory's SF/MF weighted average (SF=9.0, MF=5.4)
  const baseReductionKW = 7.5
  const batteryAdditionalKW = includeBattery ? BATTERY_SPECS.additionalPeakReductionKW : 0
  const totalReductionPerHomeKW = baseReductionKW + batteryAdditionalKW

  // Capacity impact
  const peakCapacityFreedMW = (programSize * totalReductionPerHomeKW) / 1000

  // Homeowner savings
  const annualSavingsPerHome = SAVINGS_ASSUMPTIONS.annualKWhSaved * config.defaultElectricityRate
  const lifetimeSavingsPerHome = annualSavingsPerHome * PROGRAM_DEFAULTS.equipmentLifespanYears
  const totalAnnualSavings = annualSavingsPerHome * programSize
  const totalLifetimeSavings = lifetimeSavingsPerHome * programSize

  return (
    <div className="p-4 space-y-5">
      {/* Program size slider */}
      <div>
        <div className="flex justify-between items-baseline mb-2">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Program Size
          </label>
          <span className="text-sm font-bold text-gray-900">
            {formatNumber(programSize)} homes
          </span>
        </div>
        <input
          type="range"
          min={100}
          max={30000}
          step={100}
          value={programSize}
          onChange={(e) => setProgramSize(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[var(--color-quilt-coral)]"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>100</span>
          <span>30,000</span>
        </div>
      </div>

      {/* Battery toggle */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
        <div>
          <div className="text-sm font-medium text-gray-700">Include Battery</div>
          <div className="text-[10px] text-gray-400">{BATTERY_SPECS.capacityKWh} kWh per home (+{BATTERY_SPECS.additionalPeakReductionKW} kW peak)</div>
        </div>
        <button
          onClick={() => setIncludeBattery(!includeBattery)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            includeBattery ? 'bg-[var(--color-quilt-coral)]' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              includeBattery ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Hero number: Addressable capacity */}
      <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-4 text-center">
        <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">
          Addressable Capacity
        </div>
        <div className="text-3xl font-bold text-[var(--color-heat-dark)] mt-1">
          {formatMW(peakCapacityFreedMW)}
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
          {totalReductionPerHomeKW.toFixed(1)} kW/home (SF/MF blended{includeBattery ? ' + battery' : ''})
        </div>
      </div>

      {/* Homeowner savings */}
      <Section title="Homeowner Savings">
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Annual / Home"
            value={formatCurrencyFull(Math.round(annualSavingsPerHome))}
            description={`${SAVINGS_ASSUMPTIONS.annualKWhSaved.toLocaleString()} kWh/yr saved`}
          />
          <StatCard
            label="Lifetime / Home"
            value={formatCurrencyFull(Math.round(lifetimeSavingsPerHome))}
            description={`${PROGRAM_DEFAULTS.equipmentLifespanYears}-year lifespan`}
          />
        </div>
      </Section>

      {/* Program totals */}
      <Section title="Program Totals">
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Annual Savings"
            value={formatCurrency(totalAnnualSavings)}
            description={`across ${formatNumber(programSize)} homes`}
            highlight
          />
          <StatCard
            label="Lifetime Savings"
            value={formatCurrency(totalLifetimeSavings)}
            description={`${PROGRAM_DEFAULTS.equipmentLifespanYears}-year program`}
            highlight
          />
        </div>
      </Section>

      {/* Assumptions footnote */}
      <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-100 space-y-0.5">
        <p>Based on {SAVINGS_ASSUMPTIONS.annualKWhSaved.toLocaleString()} kWh/yr savings per home at {config.defaultElectricityRate * 100}¢/kWh.</p>
        <p>Peak reduction: {baseReductionKW} kW/home blended ({config.sfPeakReductionKW} kW SF / {config.mfPeakReductionKW} kW MF).</p>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  description,
  highlight,
}: {
  label: string
  value: string
  description?: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${highlight ? 'bg-orange-50 border border-orange-100' : 'bg-gray-50'}`}>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{label}</div>
      <div className={`font-bold text-lg ${highlight ? 'text-[var(--color-heat-dark)]' : 'text-gray-900'} mt-0.5`}>
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
