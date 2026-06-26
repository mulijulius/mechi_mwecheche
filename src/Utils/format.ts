/** All monetary values are stored/passed as integer cents (KES). */

export function centsToKes(cents: number): number {
  return cents / 100
}

export function kesToCents(kes: number): number {
  return Math.round(kes * 100)
}

export function formatKes(cents: number): string {
  const value = centsToKes(cents)
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const diffMs = date.getTime() - Date.now()
  const diffMins = Math.round(diffMs / 60000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (Math.abs(diffMins) < 60) return rtf.format(diffMins, 'minute')
  const diffHours = Math.round(diffMins / 60)
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour')
  const diffDays = Math.round(diffHours / 24)
  return rtf.format(diffDays, 'day')
}
