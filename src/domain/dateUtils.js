export function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === 'function') return value.toDate()
  return new Date(value)
}

export function formatDate(value) {
  const date = toDate(value)
  if (!date || Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

export function formatDateTime(value) {
  const date = toDate(value)
  if (!date || Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function formatTime(value) {
  const date = toDate(value)
  if (!date || Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function getWeekKey(value = new Date()) {
  const date = toDate(value)
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const weekNumber = Math.ceil(((target - yearStart) / 86400000 + 1) / 7)

  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`
}

export function hoursBetween(start, end) {
  const startDate = toDate(start)
  const endDate = toDate(end)
  if (!startDate || !endDate) return 0

  return Math.max(0, (endDate.getTime() - startDate.getTime()) / 3600000)
}
