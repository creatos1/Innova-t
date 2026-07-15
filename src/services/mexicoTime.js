const DEFAULT_MEXICO_TIME_API_URL = 'https://worldtimeapi.org/api/timezone/America/Mexico_City'

const MEXICO_TIME_API_URL = import.meta.env.VITE_MEXICO_TIME_API_URL || DEFAULT_MEXICO_TIME_API_URL

function parseApiDate(payload) {
  const value = payload?.datetime
    || payload?.dateTime
    || payload?.currentDateTime
    || payload?.utc_datetime
    || payload?.utcDateTime

  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

export function getFallbackMexicoNow() {
  return new Date()
}

export function getSyncedNow(clockState) {
  if (!clockState?.baseTime || !clockState?.syncedAt) return getFallbackMexicoNow()
  return new Date(clockState.baseTime.getTime() + (Date.now() - clockState.syncedAt))
}

export async function fetchMexicoClock() {
  const response = await fetch(MEXICO_TIME_API_URL, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Time API respondio ${response.status}.`)
  }

  const payload = await response.json()
  const apiDate = parseApiDate(payload)
  if (!apiDate) throw new Error('Time API no devolvio una fecha valida.')

  return {
    baseTime: apiDate,
    syncedAt: Date.now(),
    source: 'api'
  }
}
