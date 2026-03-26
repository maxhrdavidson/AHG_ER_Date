import type { TerritoryConfig } from '../../types/territory'

interface HeaderProps {
  config: TerritoryConfig
}

export function Header({ config }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-gray-900 tracking-tight">
          Quilt <span className="text-[var(--color-quilt-coral)]">Capacity Explorer</span>
        </h1>
        <span className="text-sm text-gray-400">|</span>
        <span className="text-sm font-medium text-gray-600">{config.displayName}</span>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{config.state}</span>
      </div>
      <div className="text-xs text-gray-400">
        Census ACS 2023 · {config.climate.ieccZone} Climate Zone
      </div>
    </header>
  )
}
