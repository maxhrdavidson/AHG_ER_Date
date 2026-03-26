import type { DataCenter } from '../types/territory'

export const PGE_DATA_CENTERS: DataCenter[] = [
  {
    name: 'Meta / QTS Hillsboro',
    lat: 45.5407,
    lng: -122.9365,
    capacityMW: 250,
    operator: 'Meta',
    status: 'active',
    notes: 'QTS campus, 250 MW committed',
  },
  {
    name: 'NTT Portland',
    lat: 45.5312,
    lng: -122.9158,
    capacityMW: null,
    operator: 'NTT',
    status: 'active',
  },
  {
    name: 'Aligned Hillsboro',
    lat: 45.5389,
    lng: -122.9250,
    capacityMW: null,
    operator: 'Aligned',
    status: 'active',
  },
  {
    name: 'Flexential Hillsboro',
    lat: 45.5345,
    lng: -122.9212,
    capacityMW: null,
    operator: 'Flexential',
    status: 'active',
  },
]

export const DATA_CENTERS: Record<string, DataCenter[]> = {
  'pge-oregon': PGE_DATA_CENTERS,
}
