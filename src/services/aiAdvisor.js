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
const MISTRAL_ENABLED = import.meta.env.VITE_ENABLE_MISTRAL_AI === 'true'
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

function buildLessonAttemptCounts(student, classes = []) {
  const studentId = typeof student === 'string' ? student : student?.id
  const initialCounts = (Array.isArray(student?.completedLessonIds) ? student.completedLessonIds : [])
    .reduce((counts, lessonId) => {
      counts[lessonId] = Math.max(counts[lessonId] || 0, 1)
      return counts
    }, {})

  return classes.reduce((counts, classItem) => {
    if ((classItem.status || 'programada') === 'cancelada') return counts
    if (!classItem.studentIds?.includes(studentId)) return counts

    ;(classItem.lessonIds || []).forEach(lessonId => {
      counts[lessonId] = (counts[lessonId] || 0) + 1
    })

    return counts
  }, initialCounts)
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

function splitStudentIdsByLevelProximity(studentIds = [], studentsById = new Map(), levels = [], classCount = 1) {
  const levelOrderById = buildLevelOrderMap(levels)
  const cleanStudentIds = uniqueValues(studentIds)
  const count = Math.max(1, Math.min(Number(classCount) || 1, cleanStudentIds.length || 1))
  const orderedStudentIds = [...cleanStudentIds].sort((a, b) => {
    const studentA = studentsById.get(a)
    const studentB = studentsById.get(b)
    const orderA = levelOrderById.get(getCanonicalLevelId(studentA?.currentLevelId)) ?? 999
    const orderB = levelOrderById.get(getCanonicalLevelId(studentB?.currentLevelId)) ?? 999

    return orderA - orderB || (studentA?.fullName || '').localeCompare(studentB?.fullName || '', 'es')
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

  return freeLessons
    .map(lesson => {
      const counts = selectedStudents.map(student => attemptsByStudent.get(student.id)?.[lesson.id] || 0)
      const maxCount = counts.length ? Math.max(...counts) : 0
      const totalCount = counts.reduce((sum, count) => sum + count, 0)
      return { lesson, maxCount, totalCount }
    })
    .filter(item => item.maxCount < 2)
    .sort((a, b) => a.maxCount - b.maxCount || a.totalCount - b.totalCount || Number(a.lesson.order || 0) - Number(b.lesson.order || 0))[0]?.lesson
    || freeLessons[0]
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
- Si el grupo mezcla niveles bastante diferenciados (2 o mas niveles de distancia), usa Tema Libre: FREE_TALKING_TIME, FREE_VOCABULARY o FREE_GAMES.
- Puedes proponer varias clases para la misma fecha/hora si hay classrooms activos suficientes y eso mejora el acomodo.
- Nunca propongas mas clases simultaneas que classrooms activos disponibles.
- Si un alumno debe repetir una leccion para que el grupo funcione, se permite; tercera vez ya no.
- Maximo 8 alumnos por clase.
- No inventes IDs.
- Usa classId como la reserva ancla que se editara.
- Incluye sourceClassIds con todas las reservas pendientes que fusionas en esa clase.
- Conserva solo studentIds que ya esten en cualquiera de las reservas sourceClassIds.
- Preferencia: elegir lecciones que el alumno no ha tomado.
- No repitas la misma leccion que el alumno ya tiene programada/tomada si existe otra leccion viable. Evita clases consecutivas con la misma leccion.
- En cada alumno, lessonAttempts indica cuantas veces ya tiene tomada o programada una leccion.
- Si un alumno no ha visto un tema y otro ya lo vio 1 vez, pueden tomarlo juntos.
- Ningun alumno debe tomar una misma leccion por tercera vez.
- Si no hay leccion viable, deja lessonId como "" y agrega warning.

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
      const counts = selectedStudents.map(student => attemptsByStudent.get(student.id)?.[lesson.id] || 0)
      const maxCount = counts.length ? Math.max(...counts) : 0
      const totalCount = counts.reduce((sum, count) => sum + count, 0)
      const unseenCount = counts.filter(count => count === 0).length
      const onceCount = counts.filter(count => count === 1).length
      const sameLevelCount = selectedStudents.filter(student => getCanonicalLevelId(student.currentLevelId) === lesson.levelId).length
      const currentLessonCount = selectedStudents.filter(student => student.currentLessonId === lesson.id).length
      const lessonLevelOrder = levelOrderById.get(lesson.levelId) || 0
      const averageLevelDistance = selectedStudents.length
        ? selectedStudents.reduce((sum, student) => sum + Math.abs((levelOrderById.get(getCanonicalLevelId(student.currentLevelId)) || lessonLevelOrder) - lessonLevelOrder), 0) / selectedStudents.length
        : 0
      const allUnseen = maxCount === 0

      return {
        lesson,
        maxCount,
        totalCount,
        allUnseen,
        score: (allUnseen ? 30 : 0)
          + (currentLessonCount * (allUnseen ? 5 : 1))
          + (sameLevelCount * 4)
          + (unseenCount * 3)
          + onceCount
          - (totalCount * 12)
          - averageLevelDistance
      }
    })
    .filter(item => item.maxCount < 2)
    .sort((a, b) => Number(b.allUnseen) - Number(a.allUnseen) || b.score - a.score || a.totalCount - b.totalCount || Number(a.lesson.globalOrder || a.lesson.order || 0) - Number(b.lesson.globalOrder || b.lesson.order || 0))

  return scored[0]?.lesson || pickFreeTopicLesson(selectedStudents, lessons, attemptsByStudent)
}

function buildLocalClassFormationSuggestions({ pendingClasses = [], students = [], teachers = [], classes = [], lessons = [], levels = [], classrooms = [], aiLabel = 'IA' }) {
  const studentsById = new Map(students.map(student => [student.id, student]))
  const attemptsByStudent = new Map(students.map(student => [student.id, buildLessonAttemptCounts(student, classes)]))
  const activeClassroomLimit = Math.max(1, classrooms.filter(classroom => classroom.active !== false).length || 1)
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
    const uniqueLevelCount = studentIds.reduce((levelIds, studentId) => {
      const student = studentsById.get(studentId)
      const levelId = getCanonicalLevelId(student?.currentLevelId) || 'sin-nivel'
      levelIds.add(levelId)
      return levelIds
    }, new Set()).size
    const requiredByCapacity = Math.ceil(studentIds.length / 8)
    const desiredByLevelProximity = activeClassroomLimit > 1 && uniqueLevelCount > 1
      ? Math.min(activeClassroomLimit, uniqueLevelCount, studentIds.length)
      : 1
    const desiredClassCount = Math.max(requiredByCapacity, desiredByLevelProximity)
    const chunks = splitStudentIdsByLevelProximity(
      studentIds,
      studentsById,
      levels,
      Math.min(activeClassroomLimit, desiredClassCount)
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
          ? `${date} ${time}: grupo mixto de ${chunk.length} alumno(s), ${level?.shortName || 'nivel flexible'}, tema ${lesson.name}; mezcla niveles si conviene y evita tercera repeticion.`
          : `${date} ${time}: no hay tema viable sin tercera repeticion.`,
        confidence: lesson?.id ? Math.max(0.64, 0.84 - (chunkIndex * 0.04)) : 0.35
      }
    }).filter(Boolean)
  })

  return {
    provider: MISTRAL_ENABLED || AI_ENABLED ? 'local-rules-fallback' : 'local-rules',
    model: MISTRAL_ENABLED ? MISTRAL_MODEL : AI_ENABLED ? DEFAULT_MODEL : 'sin-ia',
    summary: MISTRAL_ENABLED || AI_ENABLED
      ? 'El asistente no respondio; se usaron reglas internas para no detener la operacion.'
      : `La IA esta desactivada; se agruparon ${pendingClasses.length} reservas por horario en ${suggestions.length} clase(s).`,
    suggestions,
    warnings: suggestions.some(item => !item.lessonId)
      ? ['Hay grupos sin leccion viable. Revisa historial o separa alumnos manualmente.']
      : []
  }
}

function normalizeClassPlan(plan, pendingClasses = [], lessons = [], context = {}) {
  const pendingIds = new Set(pendingClasses.map(classItem => classItem.id))
  const lessonIds = new Set(lessons.map(lesson => lesson.id))
  const pendingById = new Map(pendingClasses.map(classItem => [classItem.id, classItem]))
  const studentsById = new Map((context.students || []).map(student => [student.id, student]))
  const attemptsByStudent = new Map((context.students || []).map(student => [
    student.id,
    buildLessonAttemptCounts(student, context.classes || [])
  ]))

  return {
    summary: plan.summary || 'La IA genero una propuesta de acomodo.',
    warnings: Array.isArray(plan.warnings) ? plan.warnings : [],
    suggestions: (Array.isArray(plan.suggestions) ? plan.suggestions : [])
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
        const suggestedCounts = selectedStudents.map(student => attemptsByStudent.get(student.id)?.[suggestedLesson?.id] || 0)
        const repeatsExistingLesson = suggestedLesson && suggestedCounts.some(count => count > 0)
        const shouldUseFreeTopic = groupDistance >= 2 && !isFreeTopicLesson(suggestedLesson)
        const recommendedLesson = selectedStudents.length
          ? pickBestLessonForMixedGroup(selectedStudents, lessons, context.levels || [], attemptsByStudent)
          : null
        const shouldRepairLesson = (!suggestedLesson || repeatsExistingLesson || shouldUseFreeTopic) && recommendedLesson?.id
        const lessonId = shouldRepairLesson ? recommendedLesson.id : lessonIds.has(item.lessonId) ? item.lessonId : ''
        const repairReason = shouldRepairLesson && lessonId !== item.lessonId
          ? ` Ajuste automatico: ${recommendedLesson.name} evita repetir tema o usa Tema Libre para niveles distintos.`
          : ''
        return {
          classId: item.classId,
          sourceClassIds: sourceClassIds.length ? sourceClassIds : [item.classId],
          lessonId,
          studentIds,
          reason: `${item.reason || 'Sugerencia de IA.'}${repairReason}`,
          confidence: Number(item.confidence || 0)
        }
      })
      .filter(item => item.studentIds.length > 0)
      .filter((item, index, list) => list.findIndex(candidate => candidate.classId === item.classId) === index)
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
        motivoAtraso: 'El asistente no respondio; se uso la evaluacion local.',
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

function buildClassFormationPayload({ pendingClasses = [], students = [], classes = [], lessons = [], levels = [], classrooms = [], targetSlot = null }) {
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
    throw new Error(payload.error || `El asistente respondio ${response.status}.`)
  }

  return response.json()
}

export async function generateClassFormationSuggestions({ pendingClasses = [], students = [], teachers = [], classes = [], lessons = [], levels = [], classrooms = [], targetSlot = null }) {
  const localPlan = (aiLabel = 'IA') => buildLocalClassFormationSuggestions({ pendingClasses, students, teachers, classes, lessons, levels, classrooms, aiLabel })

  if (!pendingClasses.length) {
    return {
      provider: 'local-rules',
      model: 'sin-reservas',
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
        ...parsed
      }
    } catch (error) {
      console.warn('Class formation assistant failed; falling back to local rules.', error)
      return localPlan('IA')
    }
  }

  if (!AI_ENABLED) return localPlan('IA')

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
      ...parsed
    }
  } catch (error) {
    console.warn('Backup class formation assistant failed; falling back to local rules.', error)
    return localPlan('IA')
  }
}
