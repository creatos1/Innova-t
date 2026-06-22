import { getLesson, getLevel } from './academicCatalog'
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
  const date = new Date(`${dateValue}T12:00:00-06:00`)
  const day = date.getUTCDay()

  if (day === 0) return []
  if (day === 6) return CLASS_TIME_OPTIONS.filter(time => Number(time.slice(0, 2)) <= 13)
  return CLASS_TIME_OPTIONS
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
  let dateValue = getMexicoDateInput(now)

  for (let dayIndex = 0; dayIndex < 14; dayIndex += 1) {
    const times = getScheduleHoursForDate(dateValue)
    const validTime = times.find(time => isValidReservationSlot(dateValue, time, now))

    if (validTime) {
      return {
        date: dateValue,
        time: validTime
      }
    }

    dateValue = addDaysToDateInput(dateValue, 1)
  }

  const fallbackDate = getDefaultReservationDate(now)
  return {
    date: fallbackDate,
    time: getScheduleHoursForDate(fallbackDate)[0] || '08:00'
  }
}

export function isValidReservationSlot(dateValue, timeValue, now = new Date()) {
  if (!dateValue || !timeValue) return false
  if (!getScheduleHoursForDate(dateValue).includes(timeValue)) return false

  const startAt = buildMexicoDateTimeIso(dateValue, timeValue)
  return hoursBetween(now, startAt) >= 24
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

export function buildClassSlotKey({ date, time, levelId, lessonId }) {
  return [date, time, levelId, lessonId].map(normalizeForId).join('__')
}

export function buildAutoClassId(slotKey) {
  return `auto-${normalizeForId(slotKey)}`
}

function getClassTime(classItem) {
  return classItem.time || getClassTimeValue(classItem.startAt)
}

export function findMatchingAutoClass(classes = [], options = {}) {
  const slotKey = buildClassSlotKey(options)
  return classes.find(classItem => classItem.slotKey === slotKey)
    || classes.find(classItem => (
      (classItem.status || 'programada') !== 'cancelada'
      && (classItem.date || getClassDateValue(classItem.startAt)) === options.date
      && getClassTime(classItem) === options.time
      && classItem.levelId === options.levelId
      && classItem.lessonIds?.[0] === options.lessonId
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
  if (recommendation?.isBehind && currentLesson) return currentLesson
  return recommendation?.nextLesson || currentLesson || lessons.find(lesson => lesson.levelId === student.currentLevelId) || null
}

export function buildAutoClassAssignment({ student, recommendation, data, date, time }) {
  if (!student) throw new Error('No hay estudiante para reservar.')
  if (!isValidReservationSlot(date, time)) {
    throw new Error('La clase debe reservarse con minimo 1 dia de anticipacion y dentro del horario del instituto.')
  }

  const lesson = getRecommendedReservationLesson(student, recommendation, data.lessons)
  if (!lesson) throw new Error('El estudiante no tiene leccion academica asignada.')

  const level = getLevel(lesson.levelId || student.currentLevelId, data.levels)
  const existingClass = findMatchingAutoClass(data.classes, {
    date,
    time,
    levelId: lesson.levelId || student.currentLevelId,
    lessonId: lesson.id
  })
  const teacher = selectTeacherForSlot({
    teachers: data.teachers,
    classes: data.classes,
    date,
    time,
    existingClass
  })
  const slotKey = buildClassSlotKey({
    date,
    time,
    levelId: lesson.levelId || student.currentLevelId,
    lessonId: lesson.id
  })
  const classId = existingClass?.id || buildAutoClassId(slotKey)
  const reason = existingClass
    ? 'Se reutilizo una clase compatible por horario, nivel y leccion.'
    : 'Se creo una clase nueva por reserva del alumno, agrupada por nivel y leccion.'

  return {
    classId,
    studentId: student.id,
    existingClassId: existingClass?.id || '',
    lesson,
    level,
    teacher,
    reason,
    payload: {
      id: classId,
      slotKey,
      date,
      time,
      startAt: buildMexicoDateTimeIso(date, time),
      endAt: buildMexicoDateTimeIso(date, time, 1),
      durationHours: 1,
      levelId: lesson.levelId || student.currentLevelId,
      lessonIds: [lesson.id],
      lessonName: lesson.name,
      teacherId: teacher?.id || '',
      teacherName: teacher?.name || 'Por asignar',
      studentIds: [student.id],
      room: level?.shortName ? `Salon ${level.shortName}` : 'Salon por asignar',
      mode: 'presencial',
      status: 'programada',
      reservationSource: 'student-auto',
      aiAssignment: {
        provider: 'local-schedule-matcher',
        strategy: 'nivel_leccion_horario_teacher',
        unlimitedFree: true,
        maxStudents: null,
        reason
      }
    }
  }
}
