import { app } from '../firebase'
import { buildAcademicRecommendation, buildSuggestedGroups } from '../domain/academicMatcher'
import { getLesson, getLevel } from '../domain/academicCatalog'
import { getClassDateValue, getClassTimeValue } from '../domain/scheduleMatcher'

const AI_ENABLED = import.meta.env.VITE_ENABLE_FIREBASE_AI === 'true'
const DEFAULT_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash-lite'
const USE_APP_CHECK = import.meta.env.VITE_FIREBASE_AI_APP_CHECK === 'true'

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

function buildLessonAttemptCounts(studentId, classes = []) {
  return classes.reduce((counts, classItem) => {
    if (!classItem.studentIds?.includes(studentId)) return counts

    ;(classItem.lessonIds || []).forEach(lessonId => {
      counts[lessonId] = (counts[lessonId] || 0) + 1
    })

    return counts
  }, {})
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

function getSlotKey(classItem) {
  return `${getClassDate(classItem)}__${getClassTime(classItem)}`
}

function compactStudent(student, lessons = [], levels = [], classes = []) {
  const lesson = getLesson(student.currentLessonId, lessons)
  const level = getLevel(student.currentLevelId || lesson?.levelId, levels)

  return {
    id: student.id,
    publicId: student.publicId,
    levelId: student.currentLevelId || lesson?.levelId || '',
    levelName: level?.shortName || level?.name || '',
    lessonId: student.currentLessonId || '',
    lessonName: lesson?.name || '',
    lessonAttempts: buildLessonAttemptCounts(student.id, classes),
    progressPercent: Number(student.progressPercent || 0),
    scholarshipStatus: student.scholarshipStatus || ''
  }
}

function compactPendingClass(classItem, catalog = {}) {
  const lesson = getLesson(classItem.lessonIds?.[0], catalog.lessons || [])
  const level = getLevel(classItem.levelId || lesson?.levelId, catalog.levels || [])

  return {
    id: classItem.id,
    date: getClassDate(classItem),
    time: getClassTime(classItem),
    durationHours: Number(classItem.durationHours || 1),
    reservationBlockId: classItem.reservationBlockId || '',
    reservationBlockHours: Number(classItem.reservationBlockHours || classItem.durationHours || 1),
    blockHourIndex: Number(classItem.blockHourIndex || 1),
    levelId: classItem.levelId || lesson?.levelId || '',
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
Sugerir como formar clases pendientes: alumnos y leccion/tema. NO asignes teacher.

Reglas reales:
- El alumno solo reserva horario y leccion.
- La IA propone alumnos y leccion.
- Admin asigna teacher y confirma.
- Cada clase/leccion dura exactamente 1 hora.
- Agrupa reservas pendientes de la misma fecha/hora en UNA sola clase final siempre que no exceda 8 alumnos.
- Puedes mezclar estudiantes de distintos niveles si eso mejora la operacion; elige un tema util para la mayoria.
- Si un alumno debe repetir una leccion para que el grupo funcione, se permite; tercera vez ya no.
- Maximo 8 alumnos por clase.
- No inventes IDs.
- Usa classId como la reserva ancla que se editara.
- Incluye sourceClassIds con todas las reservas pendientes que fusionas en esa clase.
- Conserva solo studentIds que ya esten en cualquiera de las reservas sourceClassIds.
- Preferencia: elegir lecciones que el alumno no ha tomado.
- Si un alumno no ha visto un tema y otro ya lo vio 1 vez, pueden tomarlo juntos.
- Ningun alumno debe tomar una misma leccion por tercera vez.
- Si no hay leccion viable, deja lessonId como "" y agrega warning.

Lecciones disponibles:
${JSON.stringify(payload.lessons, null, 2)}

Reservas pendientes:
${JSON.stringify(payload.pendingClasses, null, 2)}

Alumnos:
${JSON.stringify(payload.students, null, 2)}

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
  const studentsByCurrentLesson = new Map(selectedStudents.map(student => [student.currentLessonId, student]))
  const levelOrderById = new Map(levels.map(level => [level.id, Number(level.order || 0)]))

  const scored = lessons
    .map(lesson => {
      const counts = selectedStudents.map(student => attemptsByStudent.get(student.id)?.[lesson.id] || 0)
      const maxCount = counts.length ? Math.max(...counts) : 0
      const totalCount = counts.reduce((sum, count) => sum + count, 0)
      const unseenCount = counts.filter(count => count === 0).length
      const onceCount = counts.filter(count => count === 1).length
      const sameLevelCount = selectedStudents.filter(student => student.currentLevelId === lesson.levelId).length
      const currentLessonCount = selectedStudents.filter(student => student.currentLessonId === lesson.id).length
      const lessonLevelOrder = levelOrderById.get(lesson.levelId) || 0
      const averageLevelDistance = selectedStudents.length
        ? selectedStudents.reduce((sum, student) => sum + Math.abs((levelOrderById.get(student.currentLevelId) || lessonLevelOrder) - lessonLevelOrder), 0) / selectedStudents.length
        : 0

      return {
        lesson,
        maxCount,
        totalCount,
        score: (currentLessonCount * 6)
          + (sameLevelCount * 4)
          + (unseenCount * 3)
          + onceCount
          - (totalCount * 2)
          - averageLevelDistance
      }
    })
    .filter(item => item.maxCount < 2)
    .sort((a, b) => b.score - a.score || a.totalCount - b.totalCount || Number(a.lesson.order || 0) - Number(b.lesson.order || 0))

  return scored[0]?.lesson || lessons.find(lesson => studentsByCurrentLesson.has(lesson.id)) || null
}

function buildLocalClassFormationSuggestions({ pendingClasses = [], students = [], teachers = [], classes = [], lessons = [], levels = [] }) {
  const studentsById = new Map(students.map(student => [student.id, student]))
  const attemptsByStudent = new Map(students.map(student => [student.id, buildLessonAttemptCounts(student.id, classes)]))
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
    const chunks = chunkItems(studentIds, 8)

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
    provider: AI_ENABLED ? 'local-rules-fallback' : 'local-rules',
    model: AI_ENABLED ? DEFAULT_MODEL : 'sin-gemini',
    summary: AI_ENABLED
      ? 'Gemini no respondio; se usaron reglas locales para no detener operacion.'
      : `Firebase AI Logic esta desactivado; se agruparon ${pendingClasses.length} reservas por horario en ${suggestions.length} clase(s).`,
    suggestions,
    warnings: suggestions.some(item => !item.lessonId)
      ? ['Hay grupos sin leccion viable. Revisa historial o separa alumnos manualmente.']
      : []
  }
}

function normalizeClassPlan(plan, pendingClasses = [], lessons = []) {
  const pendingIds = new Set(pendingClasses.map(classItem => classItem.id))
  const lessonIds = new Set(lessons.map(lesson => lesson.id))
  const pendingById = new Map(pendingClasses.map(classItem => [classItem.id, classItem]))

  return {
    summary: plan.summary || 'Gemini genero una propuesta de acomodo.',
    warnings: Array.isArray(plan.warnings) ? plan.warnings : [],
    suggestions: (Array.isArray(plan.suggestions) ? plan.suggestions : [])
      .filter(item => pendingIds.has(item.classId))
      .map(item => {
        const sourceClassIds = (Array.isArray(item.sourceClassIds) && item.sourceClassIds.length ? item.sourceClassIds : [item.classId])
          .filter(classId => pendingIds.has(classId))
        const allowedStudents = new Set(sourceClassIds.flatMap(classId => pendingById.get(classId)?.studentIds || []))
        return {
          classId: item.classId,
          sourceClassIds: sourceClassIds.length ? sourceClassIds : [item.classId],
          lessonId: lessonIds.has(item.lessonId) ? item.lessonId : '',
          studentIds: (Array.isArray(item.studentIds) ? item.studentIds : [])
            .filter(studentId => allowedStudents.has(studentId))
            .slice(0, 8),
          reason: item.reason || 'Sugerencia Gemini Flash-Lite.',
          confidence: Number(item.confidence || 0)
        }
      })
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
    console.warn('Firebase AI Logic failed; falling back to local rules.', error)
    return {
      provider: 'local-rules-fallback',
      ...localRecommendation,
      aiSummary: {
        nextLessonId: localRecommendation.nextLesson?.id || null,
        atrasoDetectado: localRecommendation.isBehind,
        motivoAtraso: 'Firebase AI Logic no respondio; se uso la evaluacion local.',
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

export async function generateClassFormationSuggestions({ pendingClasses = [], students = [], teachers = [], classes = [], lessons = [], levels = [] }) {
  const catalog = { lessons, levels }
  const localPlan = () => buildLocalClassFormationSuggestions({ pendingClasses, students, teachers, classes, lessons, levels })

  if (!pendingClasses.length) {
    return {
      provider: 'local-rules',
      model: 'sin-reservas',
      summary: 'No hay reservas pendientes por formar.',
      suggestions: [],
      warnings: []
    }
  }

  if (!AI_ENABLED) return localPlan()

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
        studentCount: classItem.studentIds?.length || 0
      }))
    const prompt = buildClassFormationPrompt({
      lessons: lessons.map(lesson => ({
        id: lesson.id,
        levelId: lesson.levelId,
        order: lesson.order || 0,
        name: lesson.name || ''
      })),
      pendingClasses: pendingClasses.map(classItem => compactPendingClass(classItem, catalog)),
      students: students.map(student => compactStudent(student, lessons, levels, classes)),
      scheduledClasses
    })

    const result = await model.generateContent(prompt)
    const parsed = normalizeClassPlan(parseJson(result.response.text()), pendingClasses, lessons)

    return {
      provider: 'firebase-ai-logic',
      model: DEFAULT_MODEL,
      ...parsed
    }
  } catch (error) {
    console.warn('Gemini Flash-Lite class formation failed; falling back to local rules.', error)
    return localPlan()
  }
}
