import type { TractProperties, SelectionSummary, TerritoryConfig } from '../types/territory'
import { SAVINGS_ASSUMPTIONS, BATTERY_SPECS } from '../config/quilt-specs'

export function calculateAddressableHomes(
  electricHeatHomes: number,
  heatPumpAdjustmentFactor: number
): number {
  return Math.round(electricHeatHomes * (1 - heatPumpAdjustmentFactor))
}

export function calculateBlendedReductionKW(
  singleFamilyPct: number,
  sfReductionKW: number,
  mfReductionKW: number
): number {
  const sf = singleFamilyPct / 100
  return sf * sfReductionKW + (1 - sf) * mfReductionKW
}

export function calculatePeakCapacityFreedKW(
  addressableHomes: number,
  peakReductionPerHomeKW: number
): number {
  return addressableHomes * peakReductionPerHomeKW
}

export function calculatePeakCapacityFreedMW(
  addressableHomes: number,
  peakReductionPerHomeKW: number
): number {
  return (addressableHomes * peakReductionPerHomeKW) / 1000
}

export function calculateAnnualKWhSaved(addressableHomes: number): number {
  return addressableHomes * SAVINGS_ASSUMPTIONS.annualKWhSaved
}

export function calculateAnnualSavings(
  addressableHomes: number,
  electricityRate: number
): number {
  return addressableHomes * SAVINGS_ASSUMPTIONS.annualKWhSaved * electricityRate
}

export function calculateProgramInvestment(
  pilotHomes: number,
  costPerHome: number
): number {
  return pilotHomes * costPerHome
}

export function calculateCostPerKW(
  costPerHome: number,
  peakReductionPerHomeKW: number
): number {
  return costPerHome / peakReductionPerHomeKW
}

export function calculateAnnualAvoidedCapacityValue(
  pilotHomes: number,
  peakReductionPerHomeKW: number,
  avoidedCapacityCostPerKWYear: number
): number {
  return pilotHomes * peakReductionPerHomeKW * avoidedCapacityCostPerKWYear
}

export function calculateSimplePaybackYears(
  programInvestment: number,
  annualAvoidedCapacityValue: number
): number {
  if (annualAvoidedCapacityValue === 0) return Infinity
  return programInvestment / annualAvoidedCapacityValue
}

export function calculateCO2ReductionTons(
  addressableHomes: number,
  co2LbsPerKwh: number
): number {
  const annualKWhSaved = calculateAnnualKWhSaved(addressableHomes)
  return (annualKWhSaved * co2LbsPerKwh) / 2000
}

export function summarizeTracts(
  tracts: TractProperties[],
  config: TerritoryConfig,
  includeBattery: boolean = false
): SelectionSummary {
  if (tracts.length === 0) {
    return {
      tractCount: 0,
      totalHouseholds: 0,
      electricHeatHomes: 0,
      estimatedERHomes: 0,
      peakCapacityFreedMW: 0,
      weightedAvgReductionKW: 0,
      annualKWhSaved: 0,
      annualSavingsDollars: 0,
      weightedMedianIncome: 0,
      weightedOwnerOccupiedPct: 0,
      weightedPre1980Pct: 0,
    }
  }

  let totalHouseholds = 0
  let electricHeatHomes = 0
  let incomeWeightedSum = 0
  let incomeWeightTotal = 0
  let ownerWeightedSum = 0
  let pre1980WeightedSum = 0
  let peakCapacityFreedKWTotal = 0
  const batteryKW = includeBattery ? BATTERY_SPECS.additionalPeakReductionKW : 0

  for (const t of tracts) {
    totalHouseholds += t.totalOccupied
    electricHeatHomes += t.electricHeat
    peakCapacityFreedKWTotal += t.estimatedERHomes * (t.blendedReductionKW + batteryKW)

    if (t.medianIncome !== null && t.medianIncome > 0) {
      incomeWeightedSum += t.medianIncome * t.totalOccupied
      incomeWeightTotal += t.totalOccupied
    }
    ownerWeightedSum += t.ownerOccupiedPct * t.totalOccupied
    pre1980WeightedSum += t.pre1980Pct * t.totalOccupied
  }

  const estimatedERHomes = calculateAddressableHomes(
    electricHeatHomes,
    config.heatPumpAdjustmentFactor
  )
  const peakCapacityFreedMW = peakCapacityFreedKWTotal / 1000
  const annualKWhSaved = calculateAnnualKWhSaved(estimatedERHomes)
  const annualSavingsDollars = calculateAnnualSavings(
    estimatedERHomes,
    config.defaultElectricityRate
  )

  return {
    tractCount: tracts.length,
    totalHouseholds,
    electricHeatHomes,
    estimatedERHomes,
    peakCapacityFreedMW,
    weightedAvgReductionKW: estimatedERHomes > 0
      ? Math.round((peakCapacityFreedKWTotal / estimatedERHomes) * 10) / 10
      : 0,
    annualKWhSaved,
    annualSavingsDollars,
    weightedMedianIncome: incomeWeightTotal > 0 ? Math.round(incomeWeightedSum / incomeWeightTotal) : 0,
    weightedOwnerOccupiedPct: totalHouseholds > 0 ? Math.round((ownerWeightedSum / totalHouseholds) * 10) / 10 : 0,
    weightedPre1980Pct: totalHouseholds > 0 ? Math.round((pre1980WeightedSum / totalHouseholds) * 10) / 10 : 0,
  }
}
