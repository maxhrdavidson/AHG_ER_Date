import type { TerritoryConfig } from '../types/territory'

export const PGE_OREGON: TerritoryConfig = {
  id: 'pge-oregon',
  displayName: 'Portland General Electric',
  utilityName: 'Portland General Electric Co',
  state: 'OR',
  defaultElectricityRate: 0.1141,
  erAdjustmentFactor: 0.80,
  heatPumpAdjustmentFactor: 0.20, // 1 - erAdjustmentFactor
  mapCenter: [-122.77, 45.52],
  mapZoom: 9,
  counties: [
    { name: 'Washington', fips: '067', primary: true },
    { name: 'Multnomah', fips: '051', primary: true },
    { name: 'Clackamas', fips: '005', primary: true },
    { name: 'Marion', fips: '047', primary: false },
    { name: 'Yamhill', fips: '071', primary: false },
    { name: 'Polk', fips: '053', primary: false },
    { name: 'Columbia', fips: '009', primary: false },
  ],
  climate: {
    ieccZone: '4C',
    hddAnnual: 4400,
    cddAnnual: 400,
    ashrae99DesignF: 23,
    co2LbsPerKwh: 0.64,
  },
  sfPeakReductionKW: 9.0,
  mfPeakReductionKW: 5.4,
}

export const TERRITORIES: Record<string, TerritoryConfig> = {
  'pge-oregon': PGE_OREGON,
}

export const DEFAULT_TERRITORY = 'pge-oregon'
