import { Marker, Popup } from 'react-map-gl/mapbox'
import { useState } from 'react'
import type { Substation } from '../../types/territory'

interface SubstationMarkersProps {
  substations: Substation[]
  visible: boolean
}

function getMarkerSize(maxVoltage: number): number {
  if (maxVoltage >= 500) return 14
  if (maxVoltage >= 230) return 12
  if (maxVoltage >= 115) return 10
  return 9
}

function getMarkerColor(maxVoltage: number): string {
  if (maxVoltage >= 500) return '#7B1FA2'  // deep purple
  if (maxVoltage >= 230) return '#9C27B0'  // purple
  if (maxVoltage >= 115) return '#BA68C8'  // light purple
  return '#CE93D8'                          // pale purple
}

export function SubstationMarkers({ substations, visible }: SubstationMarkersProps) {
  const [popup, setPopup] = useState<Substation | null>(null)

  if (!visible) return null

  return (
    <>
      {substations.map((sub) => {
        const size = getMarkerSize(sub.maxVoltage)
        const color = getMarkerColor(sub.maxVoltage)
        return (
          <Marker
            key={`${sub.name}-${sub.lat}-${sub.lng}`}
            longitude={sub.lng}
            latitude={sub.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              setPopup(sub)
            }}
          >
            <div className="cursor-pointer group">
              <div
                className="border-2 border-white shadow-sm group-hover:scale-125 transition-transform"
                style={{
                  width: size,
                  height: size,
                  backgroundColor: color,
                  transform: 'rotate(45deg)',
                }}
              />
            </div>
          </Marker>
        )
      })}
      {popup && (
        <Popup
          longitude={popup.lng}
          latitude={popup.lat}
          anchor="bottom"
          offset={12}
          closeOnClick={false}
          onClose={() => setPopup(null)}
        >
          <div className="pr-3">
            <div className="font-semibold text-gray-900 text-sm">{popup.name}</div>
            <div className="text-xs text-gray-500 mt-0.5">{popup.owner}</div>
            <div className="text-xs font-medium mt-1" style={{ color: getMarkerColor(popup.maxVoltage) }}>
              {popup.maxVoltage > 0 ? `${popup.maxVoltage} kV` : 'Voltage unknown'}
            </div>
            {popup.lineCount > 0 && (
              <div className="text-xs text-gray-400 mt-0.5">
                {popup.lineCount} connected line{popup.lineCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </Popup>
      )}
    </>
  )
}
