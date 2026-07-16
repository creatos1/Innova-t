import { app } from '../firebase'
import { buildAcademicRecommendation, buildSuggestedGroups } from '../domain/academicMatcher'
import {
  FREE_TOPIC_LESSON_IDS,
  getCanonicalLevelId,
  getLesson,
  getLevel,
  isFreeTopicLesson,
  isFreeTopicLevelId
} from '../domain/academicCatalog'
import { getClassDateValue, getClassTimeValue } from '../domain/scheduleMatcher'

const AI_ENABLED = import.meta.env.VITE_ENABLE_FIREBASE_AI === 'true'
const DEFAULT_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash-lite'
const USE_APP_CHECK = import.meta.env.VITE_FIREBASE_AI_APP_CHECK === 'true'
const MISTRAL_ENABLED = import.meta.env.VITE_ENABLE_MISTRAL_AI !== 'false'
const MISTRAL_MODEL = import.meta.env.VITE_MISTRAL_MODEL || 'mistral-server'
const MISTRAL_PROXY_URL = import.meta.env.VITE_MISTRAL_PROXY_URL || '/api/mistral-class-plan'

const CLASS_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          classId: { type: 'string' },
          sourceClassIds: {
            type: 'array',
            items: { type: 'string' }
          },
          lessonId: { type: 'string' },
          studentIds: {
            type: 'array',
            items: { type: 'string' }
          },
          reason: { type: 'string' },
          confidence: { type: 'number' }
        },
        required: ['classId', 'sourceClassIds', 'lessonId', 'studentIds', 'reason', 'confidence']
      }
    },
    warnings: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['summary', 'suggestions', 'warnings']
}

function buildPrompt(student, localRecommendation, scholarshipEvaluation) {
  return `
Actua como coordinador academico de un instituto de ingles con becas.
Devuelve SOLO JSON valido, sin markdown.

Reglas reales:
- La beca se mantiene si paga a tiempo.
- Debe asistir minimo 6 horas por semana.
- Si falta, debe avisar al menos 2 horas antes.
- 1 falta sin aviso: advertencia.
- 2 faltas sin aviso: beca en riesgo.
- 3 faltas sin aviso: revision por posible perdida.

Estudiante:
${JSON.stringify(student, null, 2)}

Evaluacion de beca:
${JSON.stringify(scholarshipEvaluation, null, 2)}

Recomendacion local calculada:
${JSON.stringify(localRecommendation, null, 2)}

Formato esperado:
{
  "nextLessonId": "string",
  "atrasoDetectado": true,
  "motivoAtraso": "string",
  "refuerzos": ["string"],
  "grupoSugerido": "string",
  "accionRecomendada": "string",
  "prioridad": "normal|media|alta",
  "confianza": 0.0
}
`
}

function parseJson(text) {
  const cleanText = text
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim()

  return JSON.parse(cleanText)
}

function getClassDate(classItem) {
  return classItem.date || getClassDateValue(classItem.startAt)
}

function getClassTime(classItem) {
  return classItem.time || getClassTimeValue(classItem.startAt)
}

function isFreeTopicLessonId(lessonId) {
  return FREE_TOPIC_LESSON_IDS.includes(String(lessonId || '').trim())
}

function buildLessonAttemptCounts(student, classes = []) {
  const studentId = typeof student === 'string' ? student : student?.id
  const excludedLessonIds = new Set(Array.isArray(student?.excludedLessonIds) ? student.excludedLessonIds : [])
  const initialCounts = (Array.isArray(student?.completedLessonIds) ? student.completedLessonIds : [])
    .filter(lessonId => !isFreeTopicLessonId(lessonId))
    .filter(lessonId => !excludedLessonIds.has(lessonId))
    .reduce((counts, lessonId) => {
      counts[lessonId] = Math.max(counts[lessonId] || 0, 1)
      return counts
    }, {})

  return classes.reduce((counts, classItem) => {
    if ((classItem.status || 'programada') === 'cancelada') return counts
    if (!classItem.studentIds?.includes(studentId)) return counts

    ;(classItem.lessonIds || []).forEach(lessonId => {
      if (isFreeTopicLessonId(lessonId)) return
      counts[lessonId] = (counts[lessonId] || 0) + 1
    })

    return counts
  }, initialCounts)
}

function getCompletedLessonSet(student) {
  const excludedLessonIds = new Set(Array.isArray(student?.excludedLessonIds) ? student.excludedLessonIds : [])
  return new Set((Array.isArray(student?.completedLessonIds) ? student.completedLessonIds : []).filter(lessonId => !isFreeTopicLessonId(lessonId) && !excludedLessonIds.has(lessonId)))
}

function getGroupLessonStats(lessonId, selectedStudents = [], attemptsByStudent = new Map()) {
  if (isFreeTopicLessonId(lessonId)) {
    return {
      completedCount: 0,
      maxCount: 0,
      totalCount: 0,
      unseenCount: selectedStudents.length,
      allUnseen: true,
      hasCompletedRepeat: false,
      hasThirdRepeatRisk: false
    }
  }

  const counts = selectedStudents.map(student => attemptsByStudent.get(student.id)?.[lessonId] || 0)
  const completedCount = selectedStudents.filter(student => getCompletedLessonSet(student).has(lessonId)).length
  const maxCount = counts.length ? Math.max(...counts) : 0
  const totalCount = counts.reduce((sum, count) => sum + count, 0)
  const unseenCount = counts.filter(count => count === 0).length

  return {
    completedCount,
    maxCount,
    totalCount,
    unseenCount,
    allUnseen: maxCount === 0,
    hasCompletedRepeat: completedCount > 0,
    hasThirdRepeatRisk: maxCount >= 2
  }
}

function uniqueValues(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function chunkItems(items = [], size = 8) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function buildLevelOrderMap(levels = []) {
  return new Map(
    levels
      .filter(level => !isFreeTopicLevelId(level.id))
      .map(level => [level.id, Number(level.order || 0)])
  )
}

function getGroupLevelDistance(selectedStudents = [], levels = []) {
  const levelOrderById = buildLevelOrderMap(levels)
  const orders = selectedStudents
    .map(student => levelOrderById.get(getCanonicalLevelId(student.currentLevelId)))
    .filter(order => Number.isFinite(order))

  if (orders.length < 2) return 0
  return Math.max(...orders) - Math.min(...orders)
}

function getLessonSequenceNumber(lesson) {
  const idMatch = String(lesson?.id || '').match(/^L(\d+)$/i)
  if (idMatch) return Number(idMatch[1])
  return Number(lesson?.globalOrder || lesson?.order || 0)
}

function getStudentAcademicPosition(student, lessons = [], levels = []) {
  const currentLesson = lessons.find(lesson => lesson.id === student?.currentLessonId)
  const excludedLessonIds = new Set(Array.isArray(student?.excludedLessonIds) ? student.excludedLessonIds : [])
  const completedPositions = (student?.completedLessonIds || [])
    .filter(lessonId => !isFreeTopicLessonId(lessonId))
    .filter(lessonId => !excludedLessonIds.has(lessonId))
    .map(lessonId => lessons.find(lesson => lesson.id === lessonId))
    .filter(Boolean)
    .map(getLessonSequenceNumber)
  const currentPosition = isFreeTopicLesson(currentLesson) ? 0 : getLessonSequenceNumber(currentLesson)
  const maxCompleted = completedPositions.length ? Math.max(...completedPositions) : 0

  if (currentPosition || maxCompleted) return Math.max(currentPosition, maxCompleted)
  const levelOrderById = buildLevelOrderMap(levels)
  return (levelOrderById.get(getCanonicalLevelId(student?.currentLevelId)) || 0) * 100
}

function getGroupAcademicDistance(selectedStudents = [], lessons = [], levels = []) {
  const positions = selectedStudents
    .map(student => getStudentAcademicPosition(student, lessons, levels))
    .filter(position => Number.isFinite(position) && position > 0)

  if (positions.length < 2) return 0
  return Math.max(...positions) - Math.min(...positions)
}

function splitStudentIdsByLevelProximity(studentIds = [], studentsById = new Map(), levels = [], classCount = 1, lessons = []) {
  const levelOrderById = buildLevelOrderMap(levels)
  const cleanStudentIds = uniqueValues(studentIds)
  const count = Math.max(1, Math.min(Number(classCount) || 1, cleanStudentIds.length || 1))
  const orderedStudentIds = [...cleanStudentIds].sort((a, b) => {
    const studentA = studentsById.get(a)
    const studentB = studentsById.get(b)
    const orderA = levelOrderById.get(getCanonicalLevelId(studentA?.currentLevelId)) ?? 999
    const orderB = levelOrderById.get(getCanonicalLevelId(studentB?.currentLevelId)) ?? 999

    return orderA - orderB
      || getStudentAcademicPosition(studentA, lessons, levels) - getStudentAcademicPosition(studentB, lessons, levels)
      || (studentA?.fullName || '').localeCompare(studentB?.fullName || '', 'es')
  })
  const baseSize = Math.floor(orderedStudentIds.length / count)
  const remainder = orderedStudentIds.length % count
  let cursor = 0

  return Array.from({ length: count }, (_, index) => {
    const chunkSize = baseSize + (index < remainder ? 1 : 0)
    const chunk = orderedStudentIds.slice(cursor, cursor + chunkSize)
    cursor += chunkSize
    return chunk
  }).filter(chunk => chunk.length)
}

function pickFreeTopicLesson(selectedStudents = [], lessons = [], attemptsByStudent = new Map()) {
  const freeLessons = lessons.filter(lesson => (
    isFreeTopicLesson(lesson) || FREE_TOPIC_LESSON_IDS.includes(lesson.id)
  ))

  const strictMatch = freeLessons
    .map(lesson => {
      const stats = getGroupLessonStats(lesson.id, selectedStudents, attemptsByStudent)
      return { lesson, ...stats }
    })
    .filter(item => item.completedCount === 0 && !item.hasThirdRepeatRisk)
    .sort((a, b) => Number(b.allUnseen) - Number(a.allUnseen)
      || a.maxCount - b.maxCount
      || a.totalCount - b.totalCount
      || Number(a.lesson.order || 0) - Number(b.lesson.order || 0))[0]?.lesson

  if (strictMatch) return strictMatch

  return freeLessons
    .map(lesson => {
      const stats = getGroupLessonStats(lesson.id, selectedStudents, attemptsByStudent)
      return { lesson, ...stats }
    })
    .filter(item => !item.hasThirdRepeatRisk)
    .sort((a, b) => a.completedCount - b.completedCount
      || a.maxCount - b.maxCount
      || a.totalCount - b.totalCount
      || Number(a.lesson.order || 0) - Number(b.lesson.order || 0))[0]?.lesson
    || null
}

function getSlotKey(classItem) {
  return `${getClassDate(classItem)}__${getClassTime(classItem)}`
}

function compactStudent(student, lessons = [], levels = [], classes = []) {
  const lesson = getLesson(student.currentLessonId, lessons)
  const levelId = getCanonicalLevelId(student.currentLevelId || lesson?.levelId)
  const level = getLevel(levelId, levels)

  return {
    id: student.id,
    publicId: student.publicId,
    levelId,
    levelName: level?.shortName || level?.name || '',
    lessonId: student.currentLessonId || '',
    lessonName: lesson?.name || '',
    academicPosition: getStudentAcademicPosition(student, lessons, levels),
    completedLessonIds: (Array.isArray(student.completedLessonIds) ? student.completedLessonIds : []).filter(lessonId => !isFreeTopicLessonId(lessonId) && !(student.excludedLessonIds || []).includes(lessonId)),
    excludedLessonIds: Array.isArray(student.excludedLessonIds) ? student.excludedLessonIds : [],
    avoidLessonIds: (Array.isArray(student.completedLessonIds) ? student.completedLessonIds : []).filter(lessonId => !isFreeTopicLessonId(lessonId) && !(student.excludedLessonIds || []).includes(lessonId)),
    lessonAttempts: buildLessonAttemptCounts(student, classes),
    progressPercent: Number(student.progressPercent || 0),
    scholarshipStatus: student.scholarshipStatus || ''
  }
}

function compactPendingClass(classItem, catalog = {}) {
  const lesson = getLesson(classItem.lessonIds?.[0], catalog.lessons || [])
  const levelId = getCanonicalLevelId(classItem.levelId || lesson?.levelId)
  const level = getLevel(levelId, catalog.levels || [])

  return {
    id: classItem.id,
    date: getClassDate(classItem),
    time: getClassTime(classItem),
    durationHours: Number(classItem.durationHours || 1),
    reservationBlockId: classItem.reservationBlockId || '',
    reservationBlockHours: Number(classItem.reservationBlockHours || classItem.durationHours || 1),
    blockHourIndex: Number(classItem.blockHourIndex || 1),
    levelId,
    levelName: level?.shortName || level?.name || '',
    lessonId: classItem.lessonIds?.[0] || '',
    lessonName: lesson?.name || classItem.lessonName || '',
    studentIds: (classItem.studentIds || []).slice(0, 8),
    capacity: 8
  }
}

function buildClassFormationPrompt(payload) {
  return `
Actua como coordinador academico de un instituto de ingles.
Devuelve SOLO JSON valido, sin markdown.

Objetivo:
Sugerir como formar clases pendientes: alumnos y leccion/tema. NO asignes teacher ni classroom.

Reglas reales:
- El alumno solo reserva horario y leccion.
- La IA propone alumnos y leccion/tema.
- Admin asigna teacher, classroom y confirma.
- Si se incluye ventana objetivo, procesa SOLO reservas de esa fecha/hora.
- Cada clase/leccion dura exactamente 1 hora.
- Agrupa reservas pendientes de la misma fecha/hora en UNA sola clase final siempre que no exceda 8 alumnos.
- Puedes mezclar estudiantes de distintos niveles si eso mejora la operacion; elige un tema util para la mayoria.
- Si se forman varias clases del mismo horario, separa por proximidad academica: Pre-Starter con Starter, Beginner con Intermediate, Advanced con Advanced cuando sea posible.
- Nunca mezcles Advanced con Pre-Starter/Starter si hay otro alumno Advanced o Intermediate disponible en esa misma ventana.
- Si el grupo mezcla niveles bastante diferenciados (2 o mas niveles de distancia), usa FREE TIME: FREE_TALKING_TIME, FREE_VOCABULARY o FREE_GAMES.
- Puedes proponer varias clases para la misma fecha/hora si hay classrooms activos suficientes y eso mejora el acomodo.
- Nunca propongas mas clases simultaneas que classrooms activos disponibles.
- Nunca propongas mas clases simultaneas que teacherCapacity.
- Separa alumnos si el avance academico es muy distinto aunque sus niveles esten cercanos. Ejemplo: L1 no debe ir con L18 si hay teachers/classrooms disponibles.
- Maximo 8 alumnos por clase.
- No inventes IDs.
- No escribas warnings sobre alumnos que no aparecen en Reservas pendientes.
- Si todos los alumnos de la ventana quedan asignados, warnings debe ser [].
- No propongas clases vacias ni warnings de "clase vacia".
- Usa classId como la reserva ancla que se editara.
- Incluye sourceClassIds con todas las reservas pendientes que fusionas en esa clase.
- Conserva solo studentIds que ya esten en cualquiera de las reservas sourceClassIds.
- Preferencia: elegir lecciones que el alumno no ha tomado.
- completedLessonIds / avoidLessonIds son lecciones que el alumno ya tiene marcadas como tomadas en su checklist. Evitalas antes que cualquier otra regla academica.
- excludedLessonIds son lecciones que admin desmarco para recursar; esas SI pueden volver a sugerirse.
- No sugieras una leccion normal si al menos un alumno del grupo ya la tiene en completedLessonIds / avoidLessonIds.
- En cada alumno, lessonAttempts indica cuantas veces ya tiene tomada, marcada o programada una leccion.
- Ningun alumno debe tomar una misma leccion por tercera vez.
- Prioridad al elegir tema: 1) nadie del grupo lo tiene marcado, 2) cercania de nivel, 3) menor total de repeticiones.
- Si hay diferencia academica grande, usa FREE TIME.
- FREE TIME (Talking Time, Vocabulary, Games) no cuenta como progreso/checklist y se puede repetir varias veces.
- Si no hay leccion viable, usa FREE TIME. Si tampoco hay FREE TIME viable, deja lessonId como "".
- Usa summary, reason y warnings muy cortos.

Lecciones disponibles:
${JSON.stringify(payload.lessons, null, 2)}

Ventana objetivo:
${JSON.stringify(payload.targetSlot || null, null, 2)}

Reservas pendientes:
${JSON.stringify(payload.pendingClasses, null, 2)}

Alumnos:
${JSON.stringify(payload.students, null, 2)}

Classrooms disponibles:
${JSON.stringify(payload.classrooms || [], null, 2)}

Teachers disponibles para este bloque:
${JSON.stringify(payload.teacherCapacity || 1, null, 2)}

Historial de clases programadas:
${JSON.stringify(payload.scheduledClasses, null, 2)}

Formato esperado:
{
  "summary": "string",
  "suggestions": [
    {
      "classId": "id exacto de reserva pendiente",
      "sourceClassIds": ["ids exactos de reservas pendientes fusionadas"],
      "lessonId": "id exacto de leccion o vacio",
      "studentIds": ["ids exactos, maximo 8"],
      "reason": "motivo corto",
      "confidence": 0.0
    }
  ],
  "warnings": ["string"]
}
`
}

function pickBestLessonForMixedGroup(selectedStudents = [], lessons = [], levels = [], attemptsByStudent = new Map()) {
  const levelDistance = getGroupLevelDistance(selectedStudents, levels)
  if (levelDistance >= 2) {
    return pickFreeTopicLesson(selectedStudents, lessons, attemptsByStudent)
  }

  const levelOrderById = buildLevelOrderMap(levels)
  const representedLevels = new Set(selectedStudents.map(student => getCanonicalLevelId(student.currentLevelId)).filter(Boolean))
  const currentLessonIds = new Set(selectedStudents.map(student => student.currentLessonId).filter(Boolean))
  const regularLessons = lessons.filter(lesson => (
    !isFreeTopicLesson(lesson)
    && (representedLevels.has(lesson.levelId) || currentLessonIds.has(lesson.id))
  ))
  const candidateLessons = regularLessons.length
    ? regularLessons
    : lessons.filter(lesson => !isFreeTopicLesson(lesson))

  const scored = candidateLessons
    .map(lesson => {
      const stats = getGroupLessonStats(lesson.id, selectedStudents, attemptsByStudent)
      const sameLevelCount = selectedStudents.filter(student => getCanonicalLevelId(student.currentLevelId) === lesson.levelId).length
      const currentLessonCount = selectedStudents.filter(student => student.currentLessonId === lesson.id).length
      const lessonLevelOrder = levelOrderById.get(lesson.levelId) || 0
      const averageLevelDistance = selectedStudents.length
        ? selectedStudents.reduce((sum, student) => sum + Math.abs((levelOrderById.get(getCanonicalLevelId(student.currentLevelId)) || lessonLevelOrder) - lessonLevelOrder), 0) / selectedStudents.length
        : 0

      return {
        lesson,
        ...stats,
        score: (stats.allUnseen ? 1000 : 0)
          + (stats.completedCount === 0 ? 250 : 0)
          + (currentLessonCount * (stats.allUnseen ? 8 : 1))
          + (sameLevelCount * 4)
          + (stats.unseenCount * 6)
          - (stats.completedCount * 200)
          - (stats.maxCount * 80)
          - (stats.totalCount * 35)
          - averageLevelDistance
      }
    })
    .filter(item => item.completedCount === 0 && !item.hasThirdRepeatRisk)
    .sort((a, b) => Number(b.allUnseen) - Number(a.allUnseen)
      || b.score - a.score
      || a.maxCount - b.maxCount
      || a.totalCount - b.totalCount
      || Number(a.lesson.globalOrder || a.lesson.order || 0) - Number(b.lesson.globalOrder || b.lesson.order || 0))

  return scored[0]?.lesson || pickFreeTopicLesson(selectedStudents, lessons, attemptsByStudent)
}

function buildLocalClassFormationSuggestions({ pendingClasses = [], students = [], teachers = [], classes = [], lessons = [], levels = [], classrooms = [], teacherCapacity = null, fallbackReason = '' }) {
  const studentsById = new Map(students.map(student => [student.id, student]))
  const attemptsByStudent = new Map(students.map(student => [student.id, buildLessonAttemptCounts(student, classes)]))
  const activeClassroomLimit = Math.max(1, classrooms.filter(classroom => classroom.active !== false).length || 1)
  const activeTeacherLimit = Math.max(1, Math.min(Number(teacherCapacity || teachers.length || 1), teachers.length || Number(teacherCapacity) || 1))
  const formationLimit = Math.max(1, Math.min(activeClassroomLimit, activeTeacherLimit))
  const slotGroups = Array.from(pendingClasses.reduce((groups, classItem) => {
    const key = getSlotKey(classItem)
    const current = groups.get(key) || []
    current.push(classItem)
    groups.set(key, current)
    return groups
  }, new Map()).values())

  const suggestions = slotGroups.flatMap(slotClasses => {
    const orderedClasses = [...slotClasses].sort((a, b) => (a.id || '').localeCompare(b.id || '', 'es'))
    const studentIds = uniqueValues(orderedClasses.flatMap(classItem => classItem.studentIds || []))
    const selectedStudents = studentIds.map(studentId => studentsById.get(studentId)).filter(Boolean)
    const uniqueLevelCount = studentIds.reduce((levelIds, studentId) => {
      const student = studentsById.get(studentId)
      const levelId = getCanonicalLevelId(student?.currentLevelId) || 'sin-nivel'
      levelIds.add(levelId)
      return levelIds
    }, new Set()).size
    const academicDistance = getGroupAcademicDistance(selectedStudents, lessons, levels)
    const requiredByCapacity = Math.ceil(studentIds.length / 8)
    const desiredByLevelProximity = formationLimit > 1 && (uniqueLevelCount > 1 || academicDistance > 4)
      ? Math.min(formationLimit, Math.max(uniqueLevelCount, Math.ceil(academicDistance / 8)), studentIds.length)
      : 1
    const desiredClassCount = Math.max(requiredByCapacity, desiredByLevelProximity)
    const chunks = splitStudentIdsByLevelProximity(
      studentIds,
      studentsById,
      levels,
      Math.min(formationLimit, desiredClassCount),
      lessons
    ).flatMap(chunk => chunkItems(chunk, 8))

    return chunks.map((chunk, chunkIndex) => {
      const selectedStudents = chunk.map(studentId => studentsById.get(studentId)).filter(Boolean)
      const sourceClassIds = orderedClasses
        .filter(classItem => {
          const ids = classItem.studentIds || []
          return ids.length && ids.every(studentId => chunk.includes(studentId))
        })
        .map(classItem => classItem.id)
      if (!sourceClassIds.length) return null
      const lesson = pickBestLessonForMixedGroup(selectedStudents, lessons, levels, attemptsByStudent)
      const lessonStats = lesson ? getGroupLessonStats(lesson.id, selectedStudents, attemptsByStudent) : null
      const level = getLevel(lesson?.levelId, levels)
      const anchorClassId = sourceClassIds[0] || orderedClasses[0]?.id
      const date = getClassDate(orderedClasses[0])
      const time = getClassTime(orderedClasses[0])

      return {
        classId: anchorClassId,
        sourceClassIds,
        lessonId: lesson?.id || '',
        studentIds: chunk,
        reason: lesson?.id
          ? `${level?.shortName || 'Nivel flexible'} - tema no registrado.`
          : `${date} ${time}: sin tema viable.`,
        confidence: lesson?.id ? Math.max(0.64, 0.84 - (chunkIndex * 0.04)) : 0.35
      }
    }).filter(Boolean)
  })

  return {
    provider: MISTRAL_ENABLED || AI_ENABLED ? 'local-rules-fallback' : 'local-rules',
    model: MISTRAL_ENABLED ? MISTRAL_MODEL : AI_ENABLED ? DEFAULT_MODEL : 'sin-ia',
    sourceType: MISTRAL_ENABLED || AI_ENABLED ? 'fallback' : 'local',
    sourceLabel: MISTRAL_ENABLED || AI_ENABLED ? 'Deteccion local' : 'Reglas del sistema',
    fallbackReason,
    summary: `${suggestions.length} clase(s) sugeridas.`,
    suggestions,
    warnings: suggestions.some(item => !item.lessonId)
      ? ['Hay grupos sin tema viable.']
      : []
  }
}

function normalizeClassPlan(plan, pendingClasses = [], lessons = [], context = {}) {
  const pendingIds = new Set(pendingClasses.map(classItem => classItem.id))
  const lessonIds = new Set(lessons.map(lesson => lesson.id))
  const pendingById = new Map(pendingClasses.map(classItem => [classItem.id, classItem]))
  const allowedStudentIds = new Set(pendingClasses.flatMap(classItem => classItem.studentIds || []))
  const studentsById = new Map((context.students || []).map(student => [student.id, student]))
  const allowedStudentPublicIds = new Set(
    Array.from(allowedStudentIds)
      .map(studentId => studentsById.get(studentId)?.publicId)
      .filter(Boolean)
  )
  const attemptsByStudent = new Map((context.students || []).map(student => [
    student.id,
    buildLessonAttemptCounts(student, context.classes || [])
  ]))
  const cleanWarnings = (Array.isArray(plan.warnings) ? plan.warnings : [])
    .map(warning => String(warning || '').trim())
    .filter(Boolean)
    .filter(warning => {
      const lower = warning.toLowerCase()
      if (lower.includes('clase vacia') || lower.includes('clase vacía')) return false
      if (lower.includes('no esta incluido') || lower.includes('no está incluido')) return false
      if (lower.includes('no tiene reserva')) return false
      const idMatches = warning.match(/\b(?:\d{3,5}|T-\d{3}|EST-\d{3})\b/gi) || []
      return idMatches.every(id => allowedStudentIds.has(id) || allowedStudentPublicIds.has(id.toUpperCase()))
    })

  const normalizedSuggestions = (Array.isArray(plan.suggestions) ? plan.suggestions : [])
    .filter(item => pendingIds.has(item.classId))
    .map(item => {
      const sourceClassIds = (Array.isArray(item.sourceClassIds) && item.sourceClassIds.length ? item.sourceClassIds : [item.classId])
        .filter(classId => pendingIds.has(classId))
      const allowedStudents = new Set(sourceClassIds.flatMap(classId => pendingById.get(classId)?.studentIds || []))
      const studentIds = (Array.isArray(item.studentIds) ? item.studentIds : [])
        .filter(studentId => allowedStudents.has(studentId))
        .slice(0, 8)
      const selectedStudents = studentIds.map(studentId => studentsById.get(studentId)).filter(Boolean)
      const suggestedLesson = getLesson(item.lessonId, lessons)
      const groupDistance = getGroupLevelDistance(selectedStudents, context.levels || [])
      const suggestedStats = suggestedLesson
        ? getGroupLessonStats(suggestedLesson.id, selectedStudents, attemptsByStudent)
        : null
      const repeatsChecklistLesson = suggestedStats && suggestedStats.completedCount > 0
      const thirdRepeatRisk = suggestedStats?.hasThirdRepeatRisk
      const shouldUseFreeTopic = groupDistance >= 2 && !isFreeTopicLesson(suggestedLesson)
      const recommendedLesson = selectedStudents.length
        ? pickBestLessonForMixedGroup(selectedStudents, lessons, context.levels || [], attemptsByStudent)
        : null
      const shouldRepairLesson = (!suggestedLesson || repeatsChecklistLesson || thirdRepeatRisk || shouldUseFreeTopic) && recommendedLesson?.id
      const lessonId = shouldRepairLesson ? recommendedLesson.id : lessonIds.has(item.lessonId) ? item.lessonId : ''
      const repairReason = shouldRepairLesson && lessonId !== item.lessonId
        ? 'Tema ajustado por progreso.'
        : ''
      return {
        classId: item.classId,
        sourceClassIds: sourceClassIds.length ? sourceClassIds : [item.classId],
        lessonId,
        studentIds,
        reason: repairReason || String(item.reason || 'Sugerencia lista.').slice(0, 90),
        confidence: Number(item.confidence || 0)
      }
    })
    .filter(item => item.studentIds.length > 0)
    .filter((item, index, list) => list.findIndex(candidate => candidate.classId === item.classId) === index)

  return {
    summary: normalizedSuggestions.length ? `${normalizedSuggestions.length} clase(s) sugeridas.` : 'Sin propuesta viable.',
    warnings: cleanWarnings,
    suggestions: normalizedSuggestions
  }
}

export async function generateStudentAiRecommendation(student, scholarshipEvaluation, catalog = {}) {
  const localRecommendation = buildAcademicRecommendation(student, {
    levels: catalog.levels || [],
    lessons: catalog.lessons || [],
    scholarshipEvaluation
  })

  if (!AI_ENABLED) {
    return {
      provider: 'local-rules',
      ...localRecommendation,
      aiSummary: {
        nextLessonId: localRecommendation.nextLesson?.id || null,
        atrasoDetectado: localRecommendation.isBehind,
        motivoAtraso: localRecommendation.isBehind
          ? 'El progreso academico o las horas semanales estan por debajo del objetivo.'
          : 'El estudiante mantiene condiciones suficientes para avanzar.',
        refuerzos: localRecommendation.reinforcementTopics,
        grupoSugerido: `${localRecommendation.levelName} - ritmo ${localRecommendation.pace}`,
        accionRecomendada: localRecommendation.action,
        prioridad: localRecommendation.priority,
        confianza: localRecommendation.confidence
      }
    }
  }

  try {
    const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai')
    const ai = getAI(app, {
      backend: new GoogleAIBackend(),
      useLimitedUseAppCheckTokens: USE_APP_CHECK
    })
    const model = getGenerativeModel(ai, {
      model: DEFAULT_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 700
      }
    })

    const result = await model.generateContent(buildPrompt(student, localRecommendation, scholarshipEvaluation))
    const text = result.response.text()

    return {
      provider: 'firebase-ai-logic',
      ...localRecommendation,
      aiSummary: parseJson(text)
    }
  } catch (error) {
    console.warn('Academic recommendation assistant failed; falling back to local rules.', error)
    return {
      provider: 'local-rules-fallback',
      ...localRecommendation,
      aiSummary: {
        nextLessonId: localRecommendation.nextLesson?.id || null,
        atrasoDetectado: localRecommendation.isBehind,
        motivoAtraso: 'Se uso la evaluacion academica disponible del sistema.',
        refuerzos: localRecommendation.reinforcementTopics,
        grupoSugerido: `${localRecommendation.levelName} - ritmo ${localRecommendation.pace}`,
        accionRecomendada: localRecommendation.action,
        prioridad: localRecommendation.priority,
        confianza: localRecommendation.confidence
      }
    }
  }
}

export function generateGroupRecommendations(students, recommendations, levels = []) {
  return buildSuggestedGroups(students, recommendations, levels).map(group => ({
    ...group,
    recommendation: group.pace === 'lento'
      ? 'Crear bloque de refuerzo con cupo reducido y seguimiento semanal.'
      : 'Mantener avance por leccion y asignar teacher segun disponibilidad.'
  }))
}

function buildClassFormationPayload({ pendingClasses = [], students = [], classes = [], lessons = [], levels = [], classrooms = [], teacherCapacity = null, targetSlot = null }) {
  const catalog = { lessons, levels }
  const scheduledClasses = classes
    .filter(classItem => classItem.teacherId && (classItem.status || 'programada') !== 'cancelada')
    .map(classItem => ({
      id: classItem.id,
      date: getClassDate(classItem),
      time: getClassTime(classItem),
      durationHours: Number(classItem.durationHours || 1),
      reservationBlockId: classItem.reservationBlockId || '',
      reservationBlockHours: Number(classItem.reservationBlockHours || classItem.durationHours || 1),
      blockHourIndex: Number(classItem.blockHourIndex || 1),
      teacherId: classItem.teacherId,
      classroomId: classItem.classroomId || '',
      studentCount: classItem.studentIds?.length || 0
    }))

  return {
    lessons: lessons.map(lesson => ({
      id: lesson.id,
      levelId: lesson.levelId,
      order: lesson.order || 0,
      name: lesson.name || ''
    })),
    pendingClasses: pendingClasses.map(classItem => compactPendingClass(classItem, catalog)),
    students: students.map(student => compactStudent(student, lessons, levels, classes)),
    teacherCapacity: Math.max(1, Number(teacherCapacity || 1)),
    classrooms: classrooms.map(classroom => ({
      id: classroom.id,
      name: classroom.name || '',
      active: classroom.active !== false
    })),
    targetSlot,
    scheduledClasses
  }
}

async function requestMistralClassPlan(prompt) {
  const response = await fetch(MISTRAL_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt
    })
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    if (response.status === 404) {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const isViteDirect = origin.includes(':5173')
      throw new Error(isViteDirect
        ? 'Abriste el panel en Vite directo (5173). Para usar IA local abre la URL de Vercel Dev, normalmente http://localhost:3000.'
        : 'No se encontro el asistente en el servidor. Revisa que el despliegue de Vercel incluya la carpeta api y que hayas hecho redeploy.')
    }
    throw new Error(payload.error || `El asistente no pudo responder (${response.status}).`)
  }

  return response.json()
}

export async function generateClassFormationSuggestions({ pendingClasses = [], students = [], teachers = [], classes = [], lessons = [], levels = [], classrooms = [], teacherCapacity = null, targetSlot = null }) {
  const localPlan = (fallbackReason = '') => buildLocalClassFormationSuggestions({ pendingClasses, students, teachers, classes, lessons, levels, classrooms, teacherCapacity, fallbackReason })

  if (!pendingClasses.length) {
    return {
      provider: 'local-rules',
      model: 'sin-reservas',
      sourceType: 'local',
      sourceLabel: 'Reglas del sistema',
      fallbackReason: '',
      summary: 'No hay reservas pendientes por formar.',
      suggestions: [],
      warnings: []
    }
  }

  const formationPayload = buildClassFormationPayload({
    pendingClasses,
    students,
    classes,
    lessons,
    levels,
    classrooms,
    teacherCapacity,
    targetSlot
  })

  if (MISTRAL_ENABLED) {
    try {
      const prompt = buildClassFormationPrompt(formationPayload)
      const rawPlan = await requestMistralClassPlan(prompt)
      const parsed = normalizeClassPlan(rawPlan, pendingClasses, lessons, {
        students,
        classes,
        levels
      })

      return {
        provider: 'mistral-ai',
        model: rawPlan.__model || MISTRAL_MODEL,
        sourceType: 'ai',
        sourceLabel: 'Resultado de IA',
        fallbackReason: '',
        ...parsed
      }
    } catch (error) {
      console.warn('Class formation assistant failed; falling back to local rules.', error)
      return localPlan(error.message || 'El asistente no respondio.')
    }
  }

  if (!AI_ENABLED) return localPlan('')

  try {
    const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai')
    const ai = getAI(app, {
      backend: new GoogleAIBackend(),
      useLimitedUseAppCheckTokens: USE_APP_CHECK
    })
    const model = getGenerativeModel(ai, {
      model: DEFAULT_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: CLASS_PLAN_SCHEMA,
        maxOutputTokens: 1800,
        temperature: 0.2
      }
    })
    const prompt = buildClassFormationPrompt(formationPayload)

    const result = await model.generateContent(prompt)
    const parsed = normalizeClassPlan(parseJson(result.response.text()), pendingClasses, lessons, {
      students,
      classes,
      levels
    })

    return {
      provider: 'firebase-ai-logic',
      model: DEFAULT_MODEL,
      sourceType: 'ai',
      sourceLabel: 'Resultado de IA',
      fallbackReason: '',
      ...parsed
    }
  } catch (error) {
    console.warn('Backup class formation assistant failed; falling back to local rules.', error)
    return localPlan(error.message || 'El asistente no respondio.')
  }
}
