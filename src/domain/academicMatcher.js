import {
  getExpectedLessonOrder,
  getLesson,
  getLessonsByLevel,
  getLevel,
  getNextLesson
} from './academicCatalog'

function getStudentPace(student, weeklySummary) {
  if (weeklySummary?.hours < 3) return 'lento'
  if (student.progressPercent >= 75 && weeklySummary?.meetsWeeklyHours) return 'avanzado'
  if (student.progressPercent < 40 && weeklySummary?.missingHours > 0) return 'lento'
  return 'normal'
}

export function buildAcademicRecommendation(student, context = {}) {
  const { levels = [], lessons = [], scholarshipEvaluation } = context
  const level = getLevel(student.currentLevelId, levels)
  const currentLesson = getLesson(student.currentLessonId, lessons)
  const nextLesson = getNextLesson(student.currentLevelId, student.currentLessonId, lessons)
  const levelLessons = getLessonsByLevel(student.currentLevelId, lessons)
  const expectedOrder = getExpectedLessonOrder(student.progressPercent || 0, student.currentLevelId, lessons)
  const currentOrder = currentLesson?.order || 0
  const isBehind = currentOrder < expectedOrder - 1 || scholarshipEvaluation?.weekly?.missingHours >= 3
  const pace = getStudentPace(student, scholarshipEvaluation?.weekly)
  const reinforcementTopics = []

  if (scholarshipEvaluation?.weekly?.missingHours > 0) {
    reinforcementTopics.push('recuperacion de horas semanales')
  }

  if (pace === 'lento') {
    reinforcementTopics.push('speaking guiado')
    reinforcementTopics.push('repaso de leccion actual')
  }

  if (scholarshipEvaluation?.discipline?.unexcusedAbsences > 0) {
    reinforcementTopics.push('habitos de asistencia y compromiso de beca')
  }

  const action = isBehind
    ? 'Agendar clase de refuerzo antes de avanzar'
    : nextLesson
      ? 'Avanzar a la siguiente clase planeada'
      : 'Preparar evaluacion de cierre de nivel'

  return {
    studentId: student.id,
    levelId: student.currentLevelId,
    levelName: level?.shortName || 'Sin nivel',
    currentLesson,
    nextLesson,
    lessonsTotal: levelLessons.length,
    expectedLessonOrder: expectedOrder,
    isBehind,
    pace,
    reinforcementTopics: [...new Set(reinforcementTopics)],
    action,
    priority: scholarshipEvaluation?.severity === 'critical'
      ? 'alta'
      : isBehind || scholarshipEvaluation?.severity === 'risk'
        ? 'media'
        : 'normal',
    confidence: 0.82
  }
}

export function buildAcademicBoard(students = [], scholarshipEvaluations = [], catalog = {}) {
  const byStudentId = new Map(
    scholarshipEvaluations.map(item => [item.student.id, item.evaluation])
  )

  const recommendations = students.map(student =>
    buildAcademicRecommendation(student, {
      levels: catalog.levels || [],
      lessons: catalog.lessons || [],
      scholarshipEvaluation: byStudentId.get(student.id)
    })
  )

  return {
    recommendations,
    behind: recommendations.filter(item => item.isBehind).length,
    slowPace: recommendations.filter(item => item.pace === 'lento').length,
    readyToAdvance: recommendations.filter(item => !item.isBehind && item.nextLesson).length
  }
}

export function buildSuggestedGroups(students = [], recommendations = [], levels = []) {
  const byStudentId = new Map(recommendations.map(item => [item.studentId, item]))
  const groups = new Map()

  students.forEach(student => {
    const recommendation = byStudentId.get(student.id)
    const level = getLevel(student.currentLevelId, levels)
    const pace = recommendation?.pace || 'normal'
    const key = `${student.currentLevelId}-${pace}`

    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        levelId: student.currentLevelId,
        levelName: level?.shortName || 'Sin nivel',
        pace,
        students: [],
        focus: pace === 'lento' ? 'refuerzo y recuperacion' : 'avance planeado',
        recommendedCapacity: pace === 'lento' ? 4 : 6
      })
    }

    groups.get(key).students.push({
      id: student.id,
      name: student.fullName,
      availability: student.availability,
      nextLesson: recommendation?.nextLesson?.name || 'Evaluacion'
    })
  })

  return Array.from(groups.values()).sort((a, b) => a.levelName.localeCompare(b.levelName))
}
