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
    hour12: true,
    hour: '2-digit',
    minute: '2-digit'
  }).format(date).replace(/\s*a\.\s*m\./i, ' a.m.').replace(/\s*p\.\s*m\./i, ' p.m.')
}

export function formatMexicoDate(value) {
  const date = toDate(value)
  if (!date || Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

export function formatMexicoTime(value) {
  const date = toDate(value)
  if (!date || Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour12: true,
    hour: '2-digit',
    minute: '2-digit'
  }).format(date).replace(/\s*a\.\s*m\./i, ' a.m.').replace(/\s*p\.\s*m\./i, ' p.m.')
}

export function formatTime(value) {
  const date = toDate(value)
  if (!date || Number.isNaN(date.getTime())) return '-'

  return new Intl.DateTimeFormat('es-MX', {
    hour12: true,
    hour: '2-digit',
    minute: '2-digit'
  }).format(date).replace(/\s*a\.\s*m\./i, ' a.m.').replace(/\s*p\.\s*m\./i, ' p.m.')
}

export function getWeekKey(value = new Date()) {
  const date = toDate(value)
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  target.setUTCDate(target.getUTCDate() - target.getUTCDay())
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const firstSundayOffset = yearStart.getUTCDay() === 0 ? 0 : 7 - yearStart.getUTCDay()
  const firstSunday = new Date(Date.UTC(target.getUTCFullYear(), 0, 1 + firstSundayOffset))
  const weekNumber = target < firstSunday
    ? 1
    : Math.floor((target - firstSunday) / 604800000) + 1

  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`
}

export function hoursBetween(start, end) {
  const startDate = toDate(start)
  const endDate = toDate(end)
  if (!startDate || !endDate) return 0

  return Math.max(0, (endDate.getTime() - startDate.getTime()) / 3600000)
}
