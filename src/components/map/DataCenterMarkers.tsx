import { Marker, Popup } from 'react-map-gl/mapbox'
import { useState } from 'react'
import type { DataCenter } from '../../types/territory'

interface DataCenterMarkersProps {
  dataCenters: DataCenter[]
  visible: boolean
}

export function DataCenterMarkers({ dataCenters, visible }: DataCenterMarkersProps) {
  const [popup, setPopup] = useState<DataCenter | null>(null)

  if (!visible) return null

  return (
    <>
      {dataCenters.map((dc) => (
        <Marker
          key={dc.name}
          longitude={dc.lng}
          latitude={dc.lat}
          anchor="bottom"
          onClick={(e) => {
            e.originalEvent.stopPropagation()
            setPopup(dc)
          }}
        >
          <div className="cursor-pointer group">
            <div className="w-5 h-5 bg-[var(--color-dc-teal)] rounded-full border-2 border-white shadow-md flex items-center justify-center group-hover:scale-125 transition-transform">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v4h8V4H6zm0 6v2h8v-2H6zm0 4v2h8v-2H6z" />
              </svg>
            </div>
          </div>
        </Marker>
      ))}
      {popup && (
        <Popup
          longitude={popup.lng}
          latitude={popup.lat}
          anchor="bottom"
          offset={24}
          closeOnClick={false}
          onClose={() => setPopup(null)}
        >
          <div className="pr-3">
            <div className="font-semibold text-gray-900 text-sm">{popup.name}</div>
            <div className="text-xs text-gray-500 mt-0.5">{popup.operator}</div>
            {popup.capacityMW && (
              <div className="text-xs text-[var(--color-dc-teal)] font-medium mt-1">
                {popup.capacityMW} MW committed
              </div>
            )}
            {popup.notes && (
              <div className="text-xs text-gray-400 mt-0.5">{popup.notes}</div>
            )}
          </div>
        </Popup>
      )}
    </>
  )
}
