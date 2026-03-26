export const QUILT_SPECS = {
  maxDrawKW: 5.4,
  sfERBaselineKW: 15.0,
  mfERBaselineKW: 9.0,
  sfPeakReductionKW: 9.0, // SF: 15.0 kW ER baseline × 60% (COP 2.5 vs 1.0)
  mfPeakReductionKW: 5.4, // MF: 9.0 kW ER baseline × 60% (COP 2.5 vs 1.0)
  copAt17F: 2.5,
  copAt47F: 4.0,
  hspf2: 12,
  seer2: 25,
  minOperatingTempF: -15,
  backupResistance: false,
  demandResponseCapable: true,
}

export const PROGRAM_ECONOMICS = {
  totalProgramCostPerHome: 20000, // Fully loaded per home (all-in)
}

export const SAVINGS_ASSUMPTIONS = {
  typicalHomeSqft: 1700,
  annualHeatingBTU: 50_000_000, // ~50M BTU for 1,700 sqft in ~5,000 HDD climate
  erSeasonalCOP: 1.0,
  quiltSeasonalCOP: 3.5, // HSPF2 12 ÷ 3.412
  erAnnualHeatingKWh: 14650, // 50M BTU ÷ 3,412 BTU/kWh ÷ COP 1.0
  quiltAnnualHeatingKWh: 4190, // 14,650 kWh ÷ COP 3.5
  annualKWhSaved: 10460, // 14,650 - 4,190 (~10,500, 71% reduction)
  reboundEffectPercent: 0.12,
}

export const BATTERY_SPECS = {
  capacityKWh: 13.5,
  additionalPeakReductionKW: 5.0,
}

export const PROGRAM_DEFAULTS = {
  equipmentLifespanYears: 15,
}

export const COMPARISON_BENCHMARKS = {
  gasPeakerCapexPerKW: 1200,
  gasPeakerBuildTimeYears: '4-7',
  batteryStorageCapexPerKW: 1500,
  newTransmissionCapexPerKW: 3000,
  newTransmissionBuildTimeYears: '7-10',
  quiltDeploymentTimeMonths: '12-24',
}
