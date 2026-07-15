import { getCanonicalLevelId, getLesson, getLevel } from './academicCatalog'
import { hoursBetween, toDate } from './dateUtils'

export const MEXICO_TIME_ZONE = 'America/Mexico_City'
export const CLASS_TIME_OPTIONS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00'
]

const WEEKDAY_CLASS_HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00', '19:00', '20:00']
const MONDAY_CLASS_HOURS = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00']
const SATURDAY_CLASS_HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00']

function pad(value) {
  return String(value).padStart(2, '0')
}

function parseDateInput(dateValue) {
  if (!dateValue) return null
  const [year, month, day] = dateValue.split('-').map(Number)
  if (!year || !month || !day) return null
  return { year, month, day }
}

function dateInputFromUtc(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function getMexicoDateInput(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MEXICO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value)

  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}`
}

export function addDaysToDateInput(dateValue, days) {
  const parsed = parseDateInput(dateValue)
  if (!parsed) return getMexicoDateInput()

  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days, 12))
  return dateInputFromUtc(date)
}

function getDateInputDay(dateValue) {
  const date = new Date(`${dateValue}T12:00:00-06:00`)
  return date.getUTCDay()
}

function minutesFromTime(timeValue) {
  const [hour, minute] = String(timeValue || '').split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

function normalizeReservationDuration(value) {
  const duration = Number(value || 1)
  if (!Number.isFinite(duration)) return 1
  return Math.max(1, Math.min(3, Math.trunc(duration)))
}

function getMexicoClock(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MEXICO_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short'
  }).formatToParts(value)
  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0)
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0)
  const day = new Date(`${getMexicoDateInput(value)}T12:00:00-06:00`).getUTCDay()

  return {
    day,
    minutes: hour * 60 + minute
  }
}

export function formatDateInputLabel(dateValue) {
  const parsed = parseDateInput(dateValue)
  if (!parsed) return '-'

  return new Intl.DateTimeFormat('es-MX', {
    timeZone: MEXICO_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${dateValue}T12:00:00-06:00`))
}

export function buildMexicoDateTimeIso(dateValue, timeValue, durationHours = 0) {
  const cleanTime = timeValue || '08:00'
  const date = new Date(`${dateValue}T${cleanTime}:00-06:00`)
  date.setHours(date.getHours() + durationHours)
  return date.toISOString()
}

export function addHoursToTimeValue(timeValue, hours = 1) {
  const startMinutes = minutesFromTime(timeValue)
  if (startMinutes === null) return ''

  const totalMinutes = startMinutes + (Number(hours || 0) * 60)
  const hour = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minute = totalMinutes % 60
  return `${pad(hour)}:${pad(minute)}`
}

export function formatTimeLabel(timeValue) {
  const totalMinutes = minutesFromTime(timeValue)
  if (totalMinutes === null) return '-'

  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  const displayHour = hour % 12 || 12
  const suffix = hour >= 12 ? 'p.m.' : 'a.m.'
  return `${displayHour}:${pad(minute)} ${suffix}`
}

export function formatTimeRangeLabel(startTime, endTime) {
  return `${formatTimeLabel(startTime)} - ${formatTimeLabel(endTime)}`
}

export function getNextClassProcessingSlot(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MEXICO_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now)
  const currentHour = Number(parts.find(part => part.type === 'hour')?.value || 0)
  const nextHour = currentHour + 1
  const date = nextHour >= 24
    ? addDaysToDateInput(getMexicoDateInput(now), 1)
    : getMexicoDateInput(now)
  const time = `${pad(nextHour % 24)}:00`

  return {
    date,
    time,
    endTime: addHoursToTimeValue(time, 1),
    label: formatTimeRangeLabel(time, addHoursToTimeValue(time, 1))
  }
}

export function getClassDateValue(value) {
  const date = toDate(value)
  return date ? getMexicoDateInput(date) : ''
}

export function getClassTimeValue(value) {
  const date = toDate(value)
  if (!date) return ''

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MEXICO_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)

  return `${parts.find(part => part.type === 'hour')?.value}:${parts.find(part => part.type === 'minute')?.value}`
}

export function getScheduleHoursForDate(dateValue) {
  const day = getDateInputDay(dateValue)

  if (day === 0) return []
  if (day === 1) return MONDAY_CLASS_HOURS
  if (day === 6) return SATURDAY_CLASS_HOURS
  return WEEKDAY_CLASS_HOURS
}

export function isReservationWindowOpen(now = new Date()) {
  const { day, minutes } = getMexicoClock(now)

  if (day === 0) return false
  if (day === 6) return minutes >= 8 * 60 && minutes <= 13 * 60
  return minutes >= 8 * 60 && minutes <= 20 * 60
}

export function getNextReservationDate(now = new Date()) {
  return addDaysToDateInput(getMexicoDateInput(now), 1)
}

export function isSlotBlocked(blockouts = [], dateValue, timeValue) {
  return blockouts.some(blockout => (
    blockout.date === dateValue
    && (
      blockout.allDay === true
      || !blockout.time
      || blockout.time === timeValue
    )
  ))
}

export function getDefaultReservationDate(now = new Date()) {
  let dateValue = addDaysToDateInput(getMexicoDateInput(now), 1)

  for (let index = 0; index < 7; index += 1) {
    if (getScheduleHoursForDate(dateValue).length) return dateValue
    dateValue = addDaysToDateInput(dateValue, 1)
  }

  return dateValue
}

export function getDefaultReservationSlot(now = new Date()) {
  return {
    date: getNextReservationDate(now),
    time: getScheduleHoursForDate(getNextReservationDate(now))[0] || ''
  }
}

export function isValidReservationSlot(dateValue, timeValue, now = new Date(), blockouts = []) {
  if (!dateValue || !timeValue) return false
  if (dateValue !== getNextReservationDate(now)) return false
  if (!isReservationWindowOpen(now)) return false
  if (!getScheduleHoursForDate(dateValue).includes(timeValue)) return false
  if (isSlotBlocked(blockouts, dateValue, timeValue)) return false
  return true
}

export function getConsecutiveReservationDurations(dateValue, timeValue, now = new Date(), blockouts = []) {
  if (!isValidReservationSlot(dateValue, timeValue, now, blockouts)) return []

  const hours = getScheduleHoursForDate(dateValue)
  const startIndex = hours.indexOf(timeValue)
  if (startIndex < 0) return []

  const durations = []

  for (let duration = 1; duration <= 3; duration += 1) {
    const slots = hours.slice(startIndex, startIndex + duration)
    if (slots.length !== duration) break

    const isConsecutive = slots.every((slot, index) => {
      if (index === 0) return true
      const previousMinutes = minutesFromTime(slots[index - 1])
      const currentMinutes = minutesFromTime(slot)
      return currentMinutes === previousMinutes + 60
    })
    const allAvailable = slots.every(slot => !isSlotBlocked(blockouts, dateValue, slot))

    if (!isConsecutive || !allAvailable) break
    durations.push(duration)
  }

  return durations
}

function getReservationSlotTimes(dateValue, timeValue, durationHours) {
  const hours = getScheduleHoursForDate(dateValue)
  const startIndex = hours.indexOf(timeValue)
  if (startIndex < 0) return []
  return hours.slice(startIndex, startIndex + normalizeReservationDuration(durationHours))
}

export function isCancelableClass(startAt, now = new Date()) {
  const startDate = toDate(startAt)
  return startDate && startDate > now && hoursBetween(now, startDate) >= 2
}

function normalizeForId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildClassSlotKey({ date, time, levelId, lessonId = '', durationHours = '' }) {
  const parts = [date, time, levelId, lessonId]
  if (durationHours) parts.push(`${durationHours}h`)
  return parts.map(normalizeForId).join('__')
}

export function buildAutoClassId(slotKey) {
  return `auto-${normalizeForId(slotKey)}`
}

function getClassTime(classItem) {
  return classItem.time || getClassTimeValue(classItem.startAt)
}

function isPendingStudentAutoClass(classItem) {
  return classItem.reservationSource === 'student-auto'
    && (classItem.status || 'programada') === 'pendiente_asignacion'
    && !classItem.teacherId
}

export function findMatchingAutoClass(classes = [], options = {}) {
  const slotKey = buildClassSlotKey(options)
  const durationHours = normalizeReservationDuration(options.durationHours)
  const sameDuration = classItem => normalizeReservationDuration(classItem.durationHours) === durationHours

  return classes.find(classItem => classItem.slotKey === slotKey && isPendingStudentAutoClass(classItem) && sameDuration(classItem) && (classItem.studentIds?.length || 0) < 8)
    || classes.find(classItem => (
      isPendingStudentAutoClass(classItem)
      && sameDuration(classItem)
      && (classItem.studentIds?.length || 0) < 8
      && (classItem.date || getClassDateValue(classItem.startAt)) === options.date
      && getClassTime(classItem) === options.time
      && classItem.levelId === options.levelId
    ))
}

export function selectTeacherForSlot({ teachers = [], classes = [], date, time, existingClass }) {
  if (existingClass?.teacherId || existingClass?.teacherName) {
    return teachers.find(teacher => teacher.id === existingClass.teacherId) || {
      id: existingClass.teacherId || '',
      name: existingClass.teacherName || 'Teacher asignado'
    }
  }

  const activeTeachers = teachers.filter(teacher => teacher.active !== false)
  if (!activeTeachers.length) return { id: '', name: 'Por asignar' }

  const activeClasses = classes.filter(classItem => (classItem.status || 'programada') !== 'cancelada')
  const scoredTeachers = activeTeachers.map(teacher => {
    const teacherClasses = activeClasses.filter(classItem => (
      classItem.teacherId === teacher.id || classItem.teacherName === teacher.name
    ))
    const sameSlot = teacherClasses.some(classItem => (
      (classItem.date || getClassDateValue(classItem.startAt)) === date
      && getClassTime(classItem) === time
    ))
    const dayLoad = teacherClasses.filter(classItem => (
      (classItem.date || getClassDateValue(classItem.startAt)) === date
    )).length

    return {
      ...teacher,
      sameSlot,
      dayLoad,
      totalLoad: teacherClasses.length
    }
  })

  return scoredTeachers
    .filter(teacher => !teacher.sameSlot)
    .sort((a, b) => a.dayLoad - b.dayLoad || a.totalLoad - b.totalLoad || a.name.localeCompare(b.name, 'es'))[0]
    || scoredTeachers.sort((a, b) => a.totalLoad - b.totalLoad || a.name.localeCompare(b.name, 'es'))[0]
}

export function getRecommendedReservationLesson(student, recommendation, lessons = []) {
  const currentLesson = getLesson(student.currentLessonId, lessons)
  const levelId = getCanonicalLevelId(student.currentLevelId)
  if (recommendation?.isBehind && currentLesson) return currentLesson
  return recommendation?.nextLesson || currentLesson || lessons.find(lesson => lesson.levelId === levelId) || null
}

function getClassRange(classItem) {
  const date = classItem.date || getClassDateValue(classItem.startAt)
  const time = classItem.time || getClassTimeValue(classItem.startAt)
  const durationHours = normalizeReservationDuration(classItem.durationHours)
  const startAt = toDate(classItem.startAt) || toDate(buildMexicoDateTimeIso(date, time))
  const endAt = toDate(classItem.endAt) || (startAt ? new Date(startAt.getTime() + durationHours * 60 * 60 * 1000) : null)
  return { startAt, endAt }
}

function hasStudentClassOverlap(classes = [], studentId, startAtValue, endAtValue) {
  const startAt = toDate(startAtValue)
  const endAt = toDate(endAtValue)
  if (!startAt || !endAt) return false

  return classes.some(classItem => {
    if (!classItem.studentIds?.includes(studentId)) return false
    if ((classItem.status || 'programada') === 'cancelada') return false

    const range = getClassRange(classItem)
    if (!range.startAt || !range.endAt) return false
    return startAt < range.endAt && range.startAt < endAt
  })
}

export function buildAutoClassAssignment({ student, recommendation, data, date, time, durationHours = 1 }) {
  if (!student) throw new Error('No hay estudiante para reservar.')
  if (!isValidReservationSlot(date, time, new Date(), data.blockouts || [])) {
    throw new Error('Solo puedes reservar para manana, dentro del horario de reservacion y en horas disponibles.')
  }

  const reservationDuration = normalizeReservationDuration(durationHours)
  const validDurations = getConsecutiveReservationDurations(date, time, new Date(), data.blockouts || [])
  if (!validDurations.includes(reservationDuration)) {
    throw new Error('El bloque elegido debe ser de 1 a 3 horas seguidas dentro del horario disponible.')
  }

  const lesson = getRecommendedReservationLesson(student, recommendation, data.lessons)
  if (!lesson) throw new Error('El estudiante no tiene leccion academica asignada.')

  const level = getLevel(lesson.levelId || student.currentLevelId, data.levels)
  const levelId = lesson.levelId || student.currentLevelId
  const startAt = buildMexicoDateTimeIso(date, time)
  const endAt = buildMexicoDateTimeIso(date, time, reservationDuration)
  if (hasStudentClassOverlap(data.classes, student.id, startAt, endAt)) {
    throw new Error('Ya tienes una reserva que se cruza con ese bloque de horas.')
  }

  const reservationBlockId = buildAutoClassId(buildClassSlotKey({
    date,
    time,
    levelId,
    lessonId: student.id,
    durationHours: reservationDuration
  }))
  const slotTimes = getReservationSlotTimes(date, time, reservationDuration)
  const reason = reservationDuration === 1
    ? 'Se creo 1 clase pendiente de 1 hora. Admin asigna teacher y confirma grupo.'
    : `Se crearon ${reservationDuration} clases pendientes de 1 hora dentro de un solo bloque de reserva.`
  const assignments = slotTimes.map((slotTime, index) => {
    const slotKey = buildClassSlotKey({
      date,
      time: slotTime,
      levelId,
      lessonId: student.id,
      durationHours: 1
    })
    const classId = buildAutoClassId(`${reservationBlockId}-${index + 1}-${slotKey}`)

    return {
      classId,
      studentId: student.id,
      reservationBlockId,
      blockHourIndex: index + 1,
      payload: {
        id: classId,
        slotKey,
        date,
        time: slotTime,
        startAt: buildMexicoDateTimeIso(date, slotTime),
        endAt: buildMexicoDateTimeIso(date, slotTime, 1),
        durationHours: 1,
        reservationBlockId,
        reservationBlockHours: reservationDuration,
        reservationBlockStartAt: startAt,
        reservationBlockEndAt: endAt,
        blockHourIndex: index + 1,
        levelId,
        lessonIds: [],
        lessonName: '',
        teacherId: '',
        teacherName: '',
        studentIds: [student.id],
        room: level?.shortName ? `Salon ${level.shortName}` : 'Salon por asignar',
        mode: 'presencial',
        status: 'pendiente_asignacion',
        reservationSource: 'student-auto',
        aiAssignment: {
          provider: 'local-schedule-matcher',
          strategy: 'bloque_reserva_clases_1_hora_sin_teacher',
          unlimitedFree: true,
          maxStudents: 8,
          reservationBlockId,
          reservationBlockHours: reservationDuration,
          blockHourIndex: index + 1,
          durationHours: 1,
          reason
        }
      }
    }
  })
  const firstAssignment = assignments[0]

  return {
    classId: firstAssignment?.classId || reservationBlockId,
    studentId: student.id,
    existingClassId: '',
    reservationBlockId,
    durationHours: reservationDuration,
    assignments,
    lesson,
    level,
    teacher: null,
    reason,
    payload: firstAssignment?.payload || null
  }
}
