export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export function formatMW(mw: number): string {
  if (mw >= 1) return `${mw.toFixed(1)} MW`
  return `${(mw * 1000).toFixed(0)} kW`
}

export function formatKW(kw: number): string {
  if (kw >= 1000) return `${(kw / 1000).toFixed(1)} MW`
  return `${Math.round(kw).toLocaleString('en-US')} kW`
}

export function formatCurrency(dollars: number): string {
  if (dollars >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(1)}M`
  }
  if (dollars >= 1_000) {
    return `$${(dollars / 1_000).toFixed(0)}K`
  }
  return `$${Math.round(dollars).toLocaleString('en-US')}`
}

export function formatCurrencyFull(dollars: number): string {
  return `$${Math.round(dollars).toLocaleString('en-US')}`
}

export function formatPercent(pct: number): string {
  return `${pct.toFixed(1)}%`
}

export function formatKWh(kwh: number): string {
  if (kwh >= 1_000_000) return `${(kwh / 1_000_000).toFixed(1)}M kWh`
  if (kwh >= 1_000) return `${(kwh / 1_000).toFixed(0)}K kWh`
  return `${Math.round(kwh).toLocaleString('en-US')} kWh`
}
