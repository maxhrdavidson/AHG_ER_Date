import { useState, useCallback, useMemo } from 'react'
import type { TractProperties, SelectionSummary, TerritoryConfig } from '../types/territory'
import { summarizeTracts } from '../lib/calculations'

interface SelectionState {
  selectedTracts: Set<string>
  countyFilter: string | null
  toggleTract: (geoid: string, additive: boolean) => void
  setCountyFilter: (county: string | null) => void
  clearSelection: () => void
  summary: SelectionSummary
  activeTracts: TractProperties[]
}

export function useSelection(
  allTracts: TractProperties[],
  config: TerritoryConfig,
  includeBattery: boolean = false
): SelectionState {
  const [selectedTracts, setSelectedTracts] = useState<Set<string>>(new Set())
  const [countyFilter, setCountyFilter] = useState<string | null>(null)

  const toggleTract = useCallback((geoid: string, additive: boolean) => {
    setSelectedTracts(prev => {
      const next = new Set(additive ? prev : [])
      if (prev.has(geoid) && additive) {
        next.delete(geoid)
      } else {
        next.add(geoid)
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedTracts(new Set())
    setCountyFilter(null)
  }, [])

  // Determine which tracts are "active" for calculations
  const activeTracts = useMemo(() => {
    if (selectedTracts.size > 0) {
      return allTracts.filter(t => selectedTracts.has(t.GEOID))
    }
    if (countyFilter) {
      return allTracts.filter(t => t.county === countyFilter)
    }
    return allTracts
  }, [allTracts, selectedTracts, countyFilter])

  const summary = useMemo(() => {
    return summarizeTracts(activeTracts, config, includeBattery)
  }, [activeTracts, config, includeBattery])

  return {
    selectedTracts,
    countyFilter,
    toggleTract,
    setCountyFilter,
    clearSelection,
    summary,
    activeTracts,
  }
}
