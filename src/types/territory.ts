export interface TractProperties {
  GEOID: string
  NAME: string
  county: string
  COUNTYFP: string

  // Heating fuel (B25040)
  totalOccupied: number
  electricHeat: number
  gasHeat: number
  electricHeatPct: number
  gasHeatPct: number

  // Derived
  estimatedERHomes: number
  peakCapacityFreedKW: number
  blendedReductionKW: number

  // Year built (B25034)
  totalHousingUnits: number
  pre1980Pct: number

  // Tenure (B25003)
  ownerOccupiedPct: number

  // Income (B19013)
  medianIncome: number | null

  // Structure (B25024)
  singleFamilyPct: number

}

export interface TerritoryConfig {
  id: string
  displayName: string
  utilityName: string
  state: string
  defaultElectricityRate: number
  erAdjustmentFactor: number
  heatPumpAdjustmentFactor: number
  mapCenter: [number, number] // [lng, lat]
  mapZoom: number
  counties: CountyConfig[]
  climate: ClimateConfig
  sfPeakReductionKW: number
  mfPeakReductionKW: number
}

export interface CountyConfig {
  name: string
  fips: string
  primary: boolean
}

export interface ClimateConfig {
  ieccZone: string
  hddAnnual: number
  cddAnnual: number
  ashrae99DesignF: number
  co2LbsPerKwh: number
}

export interface DataCenter {
  name: string
  lat: number
  lng: number
  capacityMW: number | null
  operator: string
  status: 'active' | 'planned' | 'under_construction'
  notes?: string
}

export interface SelectionSummary {
  tractCount: number
  totalHouseholds: number
  electricHeatHomes: number
  estimatedERHomes: number
  peakCapacityFreedMW: number
  weightedAvgReductionKW: number
  annualKWhSaved: number
  annualSavingsDollars: number
  weightedMedianIncome: number
  weightedOwnerOccupiedPct: number
  weightedPre1980Pct: number
}

export type ChoroplethMetric = 'electricHeatPct' | 'pre1980Pct' | 'medianIncome' | 'ownerOccupiedPct'

export interface TransmissionLine {
  voltage: number
  voltClass: string
  owner: string
  status: string
  type: string
  sub1: string
  sub2: string
}

export interface Substation {
  name: string
  lat: number
  lng: number
  maxVoltage: number
  owner: string
  lineCount: number
}

export interface MapViewState {
  longitude: number
  latitude: number
  zoom: number
}
