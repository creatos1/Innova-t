export const SCHOLARSHIP_RULES = {
  weeklyRequiredHours: 6,
  absenceNoticeHours: 2,
  firstUnexcusedAbsence: 1,
  riskUnexcusedAbsences: 2,
  reviewUnexcusedAbsences: 3
}

export const CATALOG_VERSION = 'innova-real-2026-01'

export const FREE_TOPIC_LEVEL_ID = 'tema-libre'
export const FREE_TOPIC_LESSON_IDS = ['FREE_TALKING_TIME', 'FREE_VOCABULARY', 'FREE_GAMES']

export const CORE_ACADEMIC_LEVELS = [
  {
    id: 'pre-starter',
    order: 0,
    name: 'Pre-Starter',
    shortName: 'Pre-Starter',
    durationMonths: 1,
    targetLessons: 12,
    description: 'Innova Card inicial: alfabeto, frases base, confianza y supervivencia comunicativa.',
    catalogVersion: CATALOG_VERSION
  },
  {
    id: 'starter',
    order: 1,
    name: 'Starter',
    shortName: 'Starter',
    durationMonths: 1,
    targetLessons: 12,
    description: 'Identidad, presente, rutinas, casa, articulos y tiempo.',
    catalogVersion: CATALOG_VERSION
  },
  {
    id: 'beginner',
    order: 2,
    name: 'Beginner',
    shortName: 'Beginner',
    durationMonths: 3,
    targetLessons: 20,
    description: 'Preguntas, habilidades, comparativos, pasado, futuro cercano y conversacion funcional.',
    catalogVersion: CATALOG_VERSION
  },
  {
    id: 'intermediate',
    order: 3,
    name: 'Intermediate',
    shortName: 'Intermediate',
    durationMonths: 3,
    targetLessons: 16,
    description: 'Comparativos avanzados, presente perfecto, condicionales, obligaciones y fluidez controlada.',
    catalogVersion: CATALOG_VERSION
  },
  {
    id: 'advanced',
    order: 4,
    name: 'Advanced',
    shortName: 'Advanced',
    durationMonths: 3,
    targetLessons: 16,
    description: 'Conectores avanzados, pasiva, realidades alternativas, causativos y estructuras complejas.',
    catalogVersion: CATALOG_VERSION
  }
]

export const FREE_TOPIC_LEVEL = {
  id: FREE_TOPIC_LEVEL_ID,
  order: 99,
  name: 'FREE TIME',
  shortName: 'FREE TIME',
  durationMonths: 0,
  targetLessons: 3,
  description: 'Clases flexibles para grupos con niveles muy distintos: talking time, vocabulary y games.',
  isFreeTopic: true,
  catalogVersion: CATALOG_VERSION
}

export const ACADEMIC_LEVELS = [...CORE_ACADEMIC_LEVELS, FREE_TOPIC_LEVEL]

export const LEGACY_ACADEMIC_LEVEL_IDS = ['level-1', 'level-2', 'level-3', 'level-4', 'level-5']

export const LEGACY_LEVEL_ALIASES = {
  'level-1': 'starter',
  'level-2': 'beginner',
  'level-3': 'intermediate',
  'level-4': 'advanced',
  'level-5': 'advanced'
}

const lessonsByLevel = {
  'pre-starter': [
    'E-Z ABC',
    'Bye bye Spanish',
    'D.M.O.Y',
    'Welcome to the jungle',
    "What's your favorite food?",
    'Family tree',
    'What is your phone number?',
    "Let's go to...",
    "What's your favorite hobby?",
    'Sentence structure',
    'My little helper',
    'Do I really speak English?'
  ],
  starter: [
    'Who are you?',
    'This is an easy lesson.',
    'Counting stars',
    'Existence',
    "What's happenING?",
    'Verbs in past',
    'Talking about frequency',
    "My mother's routine",
    'Welcome to my house',
    'A good example, an excellent idea',
    'Tomorrowland.',
    'Telling the time.'
  ],
  beginner: [
    'My stuff',
    'My abilities',
    'Wh questions',
    'What I want',
    'GPS',
    'Better or worse',
    'The best',
    'My day',
    'Are you OK?',
    'My childhood',
    'Irregular past verbs',
    'What are you doing tomorrow?',
    'My weekend',
    'A solution to your problem.',
    'Might be',
    'Are you talking to me?',
    'Team',
    "John's car",
    'What was happening?',
    'Connecting your world'
  ],
  intermediate: [
    'Much better than',
    'An amazing class',
    'Unbelievable',
    'Around the world',
    'J.A.Y.S',
    "I've been learning",
    'I go to (the) school',
    'Me, myself and I',
    'My obligations',
    "You're studying, aren't you?",
    'If you heat ice...',
    'If I have time',
    'If I had',
    'Study carefully',
    'I used to...',
    'Polite questions'
  ],
  advanced: [
    'Now and then',
    'Take a break',
    'Connecting your world 2',
    'I want to learn...',
    'The past family',
    'Nouning',
    "It's done",
    'Time machine',
    'Alternative realities',
    'Gossip teachers',
    'The chain',
    'When, where, how?',
    'Getting my car fixed',
    'Me too, Me neither',
    'Meet my family',
    'Not only... but also.'
  ]
}

const levelStartOrder = {
  'pre-starter': 1,
  starter: 13,
  beginner: 25,
  intermediate: 45,
  advanced: 61
}

const coreLessons = CORE_ACADEMIC_LEVELS.flatMap(level =>
  lessonsByLevel[level.id].map((title, index) => {
    const globalOrder = levelStartOrder[level.id] + index
    const code = `L${globalOrder}`

    return {
      id: code,
      code,
      levelId: level.id,
      order: index + 1,
      globalOrder,
      name: `${code} ${title}`,
      title,
      estimatedHours: 1,
      catalogVersion: CATALOG_VERSION,
      activities: [
        'Warm-up',
        'Guided practice',
        'Speaking task',
        'Teacher feedback'
      ],
      objectives: [
        `Complete ${code}: ${title}`,
        'Register evidence of progress',
        'Define next academic action'
      ]
    }
  })
)

export const FREE_TOPIC_LESSONS = [
  {
    id: FREE_TOPIC_LESSON_IDS[0],
    code: 'TL1',
    levelId: FREE_TOPIC_LEVEL_ID,
    order: 1,
    globalOrder: 901,
    name: 'FREE TIME - Talking Time',
    title: 'Talking Time',
    estimatedHours: 1,
    isFreeTopic: true,
    catalogVersion: CATALOG_VERSION,
    activities: ['Conversation prompt', 'Guided speaking', 'Teacher feedback'],
    objectives: ['Practice fluency across mixed levels', 'Maintain active speaking time']
  },
  {
    id: FREE_TOPIC_LESSON_IDS[1],
    code: 'TL2',
    levelId: FREE_TOPIC_LEVEL_ID,
    order: 2,
    globalOrder: 902,
    name: 'FREE TIME - Vocabulary',
    title: 'Vocabulary',
    estimatedHours: 1,
    isFreeTopic: true,
    catalogVersion: CATALOG_VERSION,
    activities: ['Vocabulary set', 'Context practice', 'Speaking task'],
    objectives: ['Build practical vocabulary for mixed groups', 'Use new words in conversation']
  },
  {
    id: FREE_TOPIC_LESSON_IDS[2],
    code: 'TL3',
    levelId: FREE_TOPIC_LEVEL_ID,
    order: 3,
    globalOrder: 903,
    name: 'FREE TIME - Games',
    title: 'Games',
    estimatedHours: 1,
    isFreeTopic: true,
    catalogVersion: CATALOG_VERSION,
    activities: ['Language game', 'Team speaking', 'Teacher correction'],
    objectives: ['Reinforce English through games', 'Keep mixed-level students engaged']
  }
]

export const LESSONS = [...coreLessons, ...FREE_TOPIC_LESSONS]

export function getCanonicalLevelId(levelId) {
  const cleanLevelId = String(levelId || '').trim()
  return LEGACY_LEVEL_ALIASES[cleanLevelId] || cleanLevelId
}

export function isFreeTopicLevelId(levelId) {
  return getCanonicalLevelId(levelId) === FREE_TOPIC_LEVEL_ID
}

export function isFreeTopicLesson(lesson) {
  return lesson?.isFreeTopic === true || isFreeTopicLevelId(lesson?.levelId)
}

export function isLegacyCatalogLevelId(levelId) {
  return LEGACY_ACADEMIC_LEVEL_IDS.includes(String(levelId || '').trim())
}

export function isLegacyLessonId(lessonId) {
  const cleanLessonId = String(lessonId || '').trim()
  return /^pre-starter-lesson-\d{2}$/i.test(cleanLessonId)
    || /^level-[1-5]-lesson-\d{2}$/i.test(cleanLessonId)
}

export function getCanonicalLessonId(lessonId) {
  const cleanLessonId = String(lessonId || '').trim()
  const preStarterMatch = cleanLessonId.match(/^pre-starter-lesson-(\d{2})$/i)
  if (preStarterMatch) return `L${Math.min(Number(preStarterMatch[1]), 12)}`

  const levelMatch = cleanLessonId.match(/^level-([1-5])-lesson-(\d{2})$/i)
  if (!levelMatch) return cleanLessonId

  const legacyLevelNumber = Number(levelMatch[1])
  const legacyLessonNumber = Number(levelMatch[2])
  const legacyLevelToStart = {
    1: 13,
    2: 25,
    3: 45,
    4: 61,
    5: 61
  }
  const legacyLevelToCount = {
    1: 12,
    2: 20,
    3: 16,
    4: 16,
    5: 16
  }
  const startOrder = legacyLevelToStart[legacyLevelNumber] || 1
  const maxLessons = legacyLevelToCount[legacyLevelNumber] || 12
  const lessonOffset = Math.min(Math.max(legacyLessonNumber, 1), maxLessons) - 1

  return `L${startOrder + lessonOffset}`
}

export function getLevel(levelId, levels = []) {
  const canonicalLevelId = getCanonicalLevelId(levelId)
  return levels.find(level => level.id === levelId)
    || levels.find(level => level.id === canonicalLevelId)
}

export function getLessonsByLevel(levelId, lessons = []) {
  const canonicalLevelId = getCanonicalLevelId(levelId)
  return lessons
    .filter(lesson => lesson.levelId === levelId || lesson.levelId === canonicalLevelId)
    .sort((a, b) => (a.globalOrder || a.order || 0) - (b.globalOrder || b.order || 0))
}

export function getLesson(lessonId, lessons = []) {
  const cleanLessonId = String(lessonId || '').trim()
  const canonicalLessonId = getCanonicalLessonId(cleanLessonId)
  return lessons.find(lesson => lesson.id === cleanLessonId || lesson.code === cleanLessonId.toUpperCase())
    || lessons.find(lesson => lesson.id === canonicalLessonId || lesson.code === canonicalLessonId)
}

export function getNextLesson(levelId, currentLessonId, lessons = []) {
  const levelLessons = getLessonsByLevel(levelId, lessons)
  const canonicalLessonId = getCanonicalLessonId(currentLessonId)
  const currentIndex = levelLessons.findIndex(lesson => (
    lesson.id === currentLessonId
    || lesson.id === canonicalLessonId
    || lesson.code === canonicalLessonId
  ))

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
