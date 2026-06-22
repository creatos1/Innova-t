export const SCHOLARSHIP_RULES = {
  weeklyRequiredHours: 6,
  absenceNoticeHours: 2,
  firstUnexcusedAbsence: 1,
  riskUnexcusedAbsences: 2,
  reviewUnexcusedAbsences: 3
}

export const ACADEMIC_LEVELS = [
  {
    id: 'pre-starter',
    order: 0,
    name: 'Innova Card Pre-Starter',
    shortName: 'Pre-Starter',
    durationMonths: 1,
    targetLessons: 8,
    description: 'Induccion, frases esenciales, classroom language y confianza inicial.'
  },
  {
    id: 'level-1',
    order: 1,
    name: 'Nivel 1',
    shortName: 'Nivel 1',
    durationMonths: 1,
    targetLessons: 8,
    description: 'Bases de presentacion, presente simple, vocabulario diario y preguntas.'
  },
  {
    id: 'level-2',
    order: 2,
    name: 'Nivel 2',
    shortName: 'Nivel 2',
    durationMonths: 1,
    targetLessons: 8,
    description: 'Rutinas, pasado simple, frecuencia, conversaciones guiadas y pronunciacion.'
  },
  {
    id: 'level-3',
    order: 3,
    name: 'Nivel 3',
    shortName: 'Nivel 3',
    durationMonths: 3,
    targetLessons: 18,
    description: 'Narracion, fluidez, comparativos, situaciones reales y writing funcional.'
  },
  {
    id: 'level-4',
    order: 4,
    name: 'Nivel 4',
    shortName: 'Nivel 4',
    durationMonths: 3,
    targetLessons: 18,
    description: 'Argumentacion, entrevistas, presentaciones y autonomia conversacional.'
  },
  {
    id: 'level-5',
    order: 5,
    name: 'Nivel 5',
    shortName: 'Nivel 5',
    durationMonths: 3,
    targetLessons: 18,
    description: 'Dominio avanzado, business English, debates y preparacion profesional.'
  }
]

const lessonNamesByLevel = {
  'pre-starter': [
    'Welcome and learning habits',
    'Alphabet, spelling and classroom language',
    'Personal information',
    'Numbers, dates and schedules',
    'Basic verbs and daily objects',
    'Survival questions',
    'Mini speaking practice',
    'Pre-Starter checkpoint'
  ],
  'level-1': [
    'Introductions and verb to be',
    'Countries, jobs and identities',
    'Present simple foundations',
    'Daily routines',
    'Questions and short answers',
    'Food, places and preferences',
    'Speaking lab: daily life',
    'Nivel 1 checkpoint'
  ],
  'level-2': [
    'Frequency and habits',
    'Past simple regular verbs',
    'Past simple irregular verbs',
    'There was and there were',
    'Directions and city tasks',
    'Pronunciation clinic',
    'Guided conversation practice',
    'Nivel 2 checkpoint'
  ],
  'level-3': [
    'Storytelling warm-up',
    'Past continuous',
    'Comparatives and superlatives',
    'Future plans',
    'Modal verbs for advice',
    'Travel situations',
    'Problem solving conversations',
    'Email and short writing',
    'Listening strategy lab',
    'Speaking fluency circle',
    'Vocabulary expansion',
    'Role play: services',
    'Grammar integration',
    'Pronunciation and rhythm',
    'Progress interview',
    'Workshop reinforcement',
    'Project presentation',
    'Nivel 3 checkpoint'
  ],
  'level-4': [
    'Opinion building',
    'Present perfect',
    'Experience interviews',
    'Conditionals 0 and 1',
    'Meetings and teamwork',
    'Negotiation basics',
    'Explaining processes',
    'Academic reading',
    'Writing paragraphs',
    'Speaking under pressure',
    'Listening: native pace',
    'Debate lab',
    'Error correction clinic',
    'Presentation design',
    'Mock interview',
    'Workshop reinforcement',
    'Final project rehearsal',
    'Nivel 4 checkpoint'
  ],
  'level-5': [
    'Advanced fluency benchmark',
    'Conditionals 2 and 3',
    'Reported speech',
    'Business presentations',
    'Professional email',
    'Data and trends',
    'Leadership vocabulary',
    'Negotiation scenarios',
    'Advanced listening',
    'Pronunciation polish',
    'Debate and argument',
    'Culture and idioms',
    'Client service English',
    'Interview mastery',
    'Writing review',
    'Capstone planning',
    'Capstone delivery',
    'Nivel 5 checkpoint'
  ]
}

export const LESSONS = ACADEMIC_LEVELS.flatMap(level =>
  lessonNamesByLevel[level.id].map((name, index) => ({
    id: `${level.id}-lesson-${String(index + 1).padStart(2, '0')}`,
    levelId: level.id,
    order: index + 1,
    name,
    estimatedHours: 1,
    activities: [
      'Warm-up',
      'Guided practice',
      'Speaking task',
      'Teacher feedback'
    ],
    objectives: [
      `Complete ${name.toLowerCase()}`,
      'Register evidence of progress',
      'Define next academic action'
    ]
  }))
)

export function getLevel(levelId, levels = []) {
  return levels.find(level => level.id === levelId)
}

export function getLessonsByLevel(levelId, lessons = []) {
  return lessons.filter(lesson => lesson.levelId === levelId).sort((a, b) => a.order - b.order)
}

export function getLesson(lessonId, lessons = []) {
  return lessons.find(lesson => lesson.id === lessonId)
}

export function getNextLesson(levelId, currentLessonId, lessons = []) {
  const levelLessons = getLessonsByLevel(levelId, lessons)
  const currentIndex = levelLessons.findIndex(lesson => lesson.id === currentLessonId)

  if (currentIndex === -1) return levelLessons[0] || null
  return levelLessons[currentIndex + 1] || null
}

export function getExpectedLessonOrder(progressPercent, levelId, lessons = []) {
  const levelLessons = getLessonsByLevel(levelId, lessons)
  if (!levelLessons.length) return 1

  return Math.min(
    levelLessons.length,
    Math.max(1, Math.ceil((progressPercent / 100) * levelLessons.length))
  )
}
