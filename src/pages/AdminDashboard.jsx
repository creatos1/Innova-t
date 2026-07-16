import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ActionMessageModal from '../components/ActionMessageModal'
import BrandLogo from '../components/BrandLogo'
import StatusBadge from '../components/StatusBadge'
import SystemControls, { useUiLanguage } from '../components/SystemControls'
import { getCanonicalLevelId, getLesson, getLessonsByLevel, getLevel, isFreeTopicLevelId } from '../domain/academicCatalog'
import { formatDateTime, toDate } from '../domain/dateUtils'
import {
  buildClassSlotKey,
  buildMexicoDateTimeIso,
  formatDateInputLabel,
  getClassDateValue,
  getClassTimeValue,
  getMexicoDateInput,
  getScheduleHoursForDate,
  formatTimeLabel,
  isSlotBlocked
} from '../domain/scheduleMatcher'
import { generateClassFormationSuggestions } from '../services/aiAdvisor'
import { formatLoginIdentifierInput, normalizeLoginId } from '../services/loginAccess'
import { recordAiUsageEvent } from '../services/instituteRepository'
import { activateTeacherPanelProfile } from '../services/panelRole'
import { useInstituteData } from '../services/useInstituteData'

const TABS = [
  { id: 'classes', label: 'RESERVAS', labelEn: 'BOOKINGS' },
  { id: 'students', label: 'ESTUDIANTES', labelEn: 'STUDENTS' },
  { id: 'payments', label: 'PAGOS', labelEn: 'PAYMENTS' },
  { id: 'teachers', label: 'TEACHERS', labelEn: 'TEACHERS' },
  { id: 'attendance', label: 'ASISTENCIAS', labelEn: 'ATTENDANCE' },
  { id: 'catalog', label: 'LECCIONES', labelEn: 'LESSONS' },
  { id: 'roles', label: 'ROLES', labelEn: 'ROLES' },
  { id: 'ai-usage', label: 'USO DE IA', labelEn: 'AI USAGE' }
  
]

const DEFAULT_STUDENT_LEVEL_ID = 'pre-starter'
const DEFAULT_STUDENT_LESSON_ID = 'L1'
const PAYMENT_MONTH_COLUMNS = 12
const MISTRAL_MONTHLY_LIMIT = Math.max(1, Number(import.meta.env.VITE_MISTRAL_MONTHLY_LIMIT || 1000))
const HIDDEN_ADMIN_EMAILS = ['www.axelelquincle@gmail.com']

function buildDateInput(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

function parseDateInput(dateValue) {
  if (!dateValue) return null
  const [year, month, day] = dateValue.split('-').map(Number)
  if (!year || !month || !day) return null
  return { year, month, day }
}

function buildMonthlyPeriods(student, count = 8) {
  const enrollment = parseDateInput(student?.enrollmentDate)
  if (!enrollment) return []

  const current = parseDateInput(getMexicoDateInput())
  const baseYear = current?.year || enrollment.year
  const baseMonth = (current?.month || enrollment.month) - 1

  return Array.from({ length: count }, (_, index) => {
    const anchor = new Date(baseYear, baseMonth + index, 1)
    const dueDate = buildDateInput(anchor.getFullYear(), anchor.getMonth(), enrollment.day)
    const previousAnchor = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1)
    const startDate = buildDateInput(previousAnchor.getFullYear(), previousAnchor.getMonth(), enrollment.day)

    return {
      dueDate,
      period: `${startDate} a ${dueDate}`,
      label: `${formatDateInputLabel(startDate)} - ${formatDateInputLabel(dueDate)}`
    }
  })
}

function buildEnrollmentPeriods(student, count = PAYMENT_MONTH_COLUMNS) {
  const enrollment = parseDateInput(student?.enrollmentDate)
  if (!enrollment) return []

  return Array.from({ length: count }, (_, index) => {
    const anchor = new Date(enrollment.year, enrollment.month - 1 + index, 1)
    const dueDate = buildDateInput(anchor.getFullYear(), anchor.getMonth(), enrollment.day)
    const monthLabel = new Intl.DateTimeFormat('es-MX', {
      month: 'short',
      year: '2-digit'
    }).format(new Date(`${dueDate}T12:00:00-06:00`))

    return {
      dueDate,
      monthLabel,
      label: formatDateInputLabel(dueDate)
    }
  })
}

function getPaymentKey(studentId, dueDate) {
  return `${studentId}__${dueDate}`
}

function isPaymentPaid(payment) {
  return payment?.status === 'pagado' || !!payment?.paidAt
}

function getPaymentAmount(payment) {
  const amount = Number(payment?.amount || 0)
  return Number.isFinite(amount) ? amount : 0
}

function sortByName(items = []) {
  return [...items].sort((a, b) => (a.fullName || a.name || '').localeCompare(b.fullName || b.name || '', 'es'))
}

function uniqueValues(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function matchesSearch(values = [], search = '') {
  const query = String(search || '').trim().toLowerCase()
  if (!query) return true
  return values.some(value => String(value || '').toLowerCase().includes(query))
}

function nextTeacherPublicId(teachers = []) {
  const maxNumber = teachers.reduce((max, teacher) => {
    const match = String(teacher.publicId || '').match(/^T-(\d+)$/i)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  return `T-${String(maxNumber + 1).padStart(3, '0')}`
}

function formatTeacherPublicIdInput(value) {
  const formatted = formatLoginIdentifierInput(value)
  return formatted.startsWith('T-') ? formatted : formatted.replace(/[^0-9]/g, '')
}

function normalizeTeacherPublicIdInput(value) {
  const formatted = normalizeLoginId(formatTeacherPublicIdInput(value))
  return formatted.startsWith('T-') ? formatted : formatted
}

function getClassDurationHours(classItem) {
  const hours = Number(classItem?.durationHours || 1)
  return Number.isFinite(hours) ? Math.max(1, hours) : 1
}

function formatClassHours(classItem) {
  const hours = getClassDurationHours(classItem)
  return `${hours} ${hours === 1 ? 'hora' : 'horas'}`
}

function hasClassStudents(classItem) {
  return Array.isArray(classItem?.studentIds) && classItem.studentIds.length > 0
}

function getClassLessonIds(classItem) {
  return uniqueValues([
    ...(Array.isArray(classItem?.lessonIds) ? classItem.lessonIds : []),
    classItem?.lessonId
  ])
}

function findStudentLessonClassConflict({ studentIds = [], lessonId = '', classes = [], ignoredClassIds = [] }) {
  if (!lessonId || !studentIds.length) return null

  const selectedStudents = new Set(studentIds)
  const ignored = new Set(ignoredClassIds.filter(Boolean))

  return classes.find(classItem => {
    if (!classItem?.id || ignored.has(classItem.id)) return false
    if ((classItem.status || 'programada') === 'cancelada') return false
    if (!getClassLessonIds(classItem).includes(lessonId)) return false
    return (classItem.studentIds || []).some(studentId => selectedStudents.has(studentId))
  }) || null
}

function buildStudentLessonConflictMessage(conflictClass, studentIds = [], lessonId = '', students = [], lessons = []) {
  const studentId = (conflictClass?.studentIds || []).find(id => studentIds.includes(id))
  const student = students.find(item => item.id === studentId)
  const lesson = getLesson(lessonId, lessons)
  const studentName = student ? `${student.publicId || student.id} - ${student.fullName || student.name || 'Alumno'}` : 'Este alumno'
  const lessonName = lesson ? `${lesson.id} ${lesson.name}` : 'esta leccion'

  return `${studentName} ya tiene una reserva o clase registrada para ${lessonName}. Cambia el tema o quita al alumno antes de formar la clase.`
}

function getRegisteredLessonIdsForStudent(studentId, classes = [], attendance = [], students = []) {
  const student = students.find(item => item.id === studentId)
  const lessonIds = new Set(Array.isArray(student?.completedLessonIds) ? student.completedLessonIds : [])
  getAttendedLessonIdsForStudent(studentId, classes, attendance).forEach(lessonId => lessonIds.add(lessonId))

  return lessonIds
}

function getAttendedLessonIdsForStudent(studentId, classes = [], attendance = []) {
  const attendedClassIds = new Set(
    attendance
      .filter(record => record.studentId === studentId && record.attended === true)
      .map(record => record.classId)
  )
  const lessonIds = new Set(
    attendance
      .filter(record => record.studentId === studentId && record.attended === true && record.lessonId)
      .map(record => record.lessonId)
  )

  classes.forEach(classItem => {
    if ((classItem.status || 'programada') === 'cancelada') return
    if (!attendedClassIds.has(classItem.id)) return
    ;(classItem.lessonIds || []).forEach(lessonId => {
      if (lessonId) lessonIds.add(lessonId)
    })
  })

  return lessonIds
}

function buildPendingSlotGroups(classes = [], students = []) {
  const studentsById = new Map(students.map(student => [student.id, student]))
  const groups = new Map()

  classes.forEach(classItem => {
    const date = classItem.date || getClassDateValue(classItem.startAt)
    const time = classItem.time || getClassTimeValue(classItem.startAt)
    const key = `${date}__${time}`
    const current = groups.get(key) || {
      id: key,
      date,
      time,
      startAt: classItem.startAt,
      classes: [],
      studentIds: []
    }

    current.classes.push(classItem)
    ;(classItem.studentIds || []).forEach(studentId => {
      if (!current.studentIds.includes(studentId)) current.studentIds.push(studentId)
    })
    groups.set(key, current)
  })

  return Array.from(groups.values())
    .flatMap(group => {
      const chunks = []
      for (let index = 0; index < group.studentIds.length; index += 8) {
        const studentIds = group.studentIds.slice(index, index + 8)
        const selected = new Set(studentIds)
        const sourceClasses = group.classes.filter(classItem => {
          const ids = classItem.studentIds || []
          return ids.length && ids.every(studentId => selected.has(studentId))
        })
        if (!sourceClasses.length) continue

        chunks.push({
          ...group,
          id: `${group.id}__${Math.floor(index / 8) + 1}`,
          chunkIndex: Math.floor(index / 8) + 1,
          classes: sourceClasses,
          sourceClassIds: sourceClasses.map(classItem => classItem.id),
          studentIds,
          students: studentIds.map(studentId => studentsById.get(studentId)).filter(Boolean)
        })
      }
      return chunks.filter(Boolean)
    })
    .sort((a, b) => (toDate(a.startAt)?.getTime() || 0) - (toDate(b.startAt)?.getTime() || 0))
}

function buildReservationStudentRows(classes = [], students = []) {
  const studentsById = new Map(students.map(student => [student.id, student]))
  const rowsByReservation = new Map()

  classes.forEach(classItem => {
    const date = classItem.date || getClassDateValue(classItem.startAt)
    const time = classItem.time || getClassTimeValue(classItem.startAt)
    const reservationBlockId = classItem.reservationBlockId || classItem.id
    const hours = Number(classItem.reservationBlockHours || classItem.durationHours || 1)

    ;(classItem.studentIds || []).forEach(studentId => {
      const student = studentsById.get(studentId)
      const key = `${studentId}__${reservationBlockId}`
      const previous = rowsByReservation.get(key)

      rowsByReservation.set(key, {
        studentId,
        publicId: student?.publicId || studentId,
        fullName: student?.fullName || 'Alumno sin nombre',
        hours: Math.max(previous?.hours || 0, Number.isFinite(hours) ? hours : 1),
        date,
        time,
        startAt: previous?.startAt || classItem.startAt
      })
    })
  })

  return Array.from(rowsByReservation.values())
    .sort((a, b) => (toDate(a.startAt)?.getTime() || 0) - (toDate(b.startAt)?.getTime() || 0) || a.fullName.localeCompare(b.fullName, 'es'))
}

function getLevelOrderForStudent(student, levels = []) {
  const canonicalLevelId = getCanonicalLevelId(student?.currentLevelId)
  return Number(getLevel(canonicalLevelId, levels)?.order ?? 999)
}

function getLessonSequenceNumber(lesson) {
  const idMatch = String(lesson?.id || '').match(/^L(\d+)$/i)
  if (idMatch) return Number(idMatch[1])
  return Number(lesson?.globalOrder || lesson?.order || 0)
}

function getStudentAcademicPosition(student, lessons = [], levels = []) {
  const currentLesson = lessons.find(lesson => lesson.id === student?.currentLessonId)
  const completedPositions = (student?.completedLessonIds || [])
    .map(lessonId => lessons.find(lesson => lesson.id === lessonId))
    .filter(Boolean)
    .map(getLessonSequenceNumber)
  const currentPosition = getLessonSequenceNumber(currentLesson)
  const maxCompleted = completedPositions.length ? Math.max(...completedPositions) : 0

  if (currentPosition || maxCompleted) return Math.max(currentPosition, maxCompleted)
  return getLevelOrderForStudent(student, levels) * 100
}

function getStudentGroupAcademicDistance(studentIds = [], students = [], lessons = [], levels = []) {
  const studentsById = new Map(students.map(student => [student.id, student]))
  const positions = studentIds
    .map(studentId => getStudentAcademicPosition(studentsById.get(studentId), lessons, levels))
    .filter(position => Number.isFinite(position) && position > 0)

  if (positions.length < 2) return 0
  return Math.max(...positions) - Math.min(...positions)
}

function splitStudentIdsByLevelProximity(studentIds = [], students = [], levels = [], classCount = 1, lessons = []) {
  const studentsById = new Map(students.map(student => [student.id, student]))
  const cleanStudentIds = uniqueValues(studentIds)
  const count = Math.max(1, Math.min(Number(classCount) || 1, cleanStudentIds.length || 1))
  const orderedStudentIds = [...cleanStudentIds].sort((a, b) => {
    const studentA = studentsById.get(a)
    const studentB = studentsById.get(b)
    return getLevelOrderForStudent(studentA, levels) - getLevelOrderForStudent(studentB, levels)
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

function getRecommendedClassCountForStudents(studentIds = [], students = [], levels = [], classroomLimit = 1, lessons = []) {
  const cleanStudentIds = uniqueValues(studentIds)
  if (cleanStudentIds.length <= 1) return cleanStudentIds.length
  if (cleanStudentIds.length <= 8) {
    const distance = getStudentGroupLevelDistance(cleanStudentIds, students, levels)
    const academicDistance = getStudentGroupAcademicDistance(cleanStudentIds, students, lessons, levels)
    if (distance <= 1 && academicDistance <= 4) return 1
    return Math.min(classroomLimit, Math.ceil(cleanStudentIds.length / 2))
  }

  return Math.min(classroomLimit, Math.ceil(cleanStudentIds.length / 8))
}

function getStudentGroupLevelDistance(studentIds = [], students = [], levels = []) {
  const studentsById = new Map(students.map(student => [student.id, student]))
  const orders = studentIds
    .map(studentId => getLevelOrderForStudent(studentsById.get(studentId), levels))
    .filter(order => Number.isFinite(order) && order < 999)

  if (!orders.length) return 0
  return Math.max(...orders) - Math.min(...orders)
}

function findDefaultLessonForStudentGroup(studentIds = [], students = [], lessons = [], levels = []) {
  const studentsById = new Map(students.map(student => [student.id, student]))
  const selectedStudents = studentIds.map(studentId => studentsById.get(studentId)).filter(Boolean)
  const isCleanForGroup = lesson => (
    lesson
    && selectedStudents.every(student => !(student.completedLessonIds || []).includes(lesson.id))
  )
  const levelDistance = getStudentGroupLevelDistance(studentIds, students, levels)
  const freeTopicLesson = lessons.find(lesson => isFreeTopicLevelId(lesson.levelId) && isCleanForGroup(lesson))

  if (levelDistance >= 2 && freeTopicLesson) return freeTopicLesson.id

  const levelFrequency = studentIds.reduce((counts, studentId) => {
    const levelId = getCanonicalLevelId(studentsById.get(studentId)?.currentLevelId)
    counts.set(levelId, (counts.get(levelId) || 0) + 1)
    return counts
  }, new Map())
  const preferredLevelId = Array.from(levelFrequency.entries())
    .sort((a, b) => b[1] - a[1] || Number(getLevel(a[0], levels)?.order ?? 999) - Number(getLevel(b[0], levels)?.order ?? 999))[0]?.[0]
  const currentLessonId = studentIds
    .map(studentId => studentsById.get(studentId)?.currentLessonId)
    .find(lessonId => isCleanForGroup(lessons.find(lesson => lesson.id === lessonId)))

  return lessons.find(lesson => lesson.id === currentLessonId && !isFreeTopicLevelId(lesson.levelId) && isCleanForGroup(lesson))?.id
    || lessons.find(lesson => getCanonicalLevelId(lesson.levelId) === preferredLevelId && !isFreeTopicLevelId(lesson.levelId) && isCleanForGroup(lesson))?.id
    || lessons.find(lesson => !isFreeTopicLevelId(lesson.levelId) && isCleanForGroup(lesson))?.id
    || freeTopicLesson?.id
    || ''
}

function isLessonViableForStudentGroup(lesson, studentIds = [], students = [], lessons = [], levels = []) {
  if (!lesson?.id || !studentIds.length) return false
  const studentsById = new Map(students.map(student => [student.id, student]))
  const selectedStudents = studentIds.map(studentId => studentsById.get(studentId)).filter(Boolean)
  const alreadyTaken = selectedStudents.some(student => (student.completedLessonIds || []).includes(lesson.id))
  if (alreadyTaken) return false

  const levelDistance = getStudentGroupLevelDistance(studentIds, students, levels)
  if (levelDistance >= 2) return isFreeTopicLevelId(lesson.levelId)

  const representedLevels = new Set(selectedStudents.map(student => getCanonicalLevelId(student.currentLevelId)).filter(Boolean))
  const currentLessonIds = new Set(selectedStudents.map(student => student.currentLessonId).filter(Boolean))
  return isFreeTopicLevelId(lesson.levelId)
    || representedLevels.has(getCanonicalLevelId(lesson.levelId))
    || currentLessonIds.has(lesson.id)
}

function getHourWord(hours) {
  return Number(hours) === 1 ? 'hora' : 'horas'
}

function getCurrentMonthId() {
  return getMexicoDateInput().slice(0, 7)
}

function getPlanSourceMeta(plan) {
  const provider = plan?.provider || 'local-rules'

  if (provider === 'mistral-ai' || provider === 'firebase-ai-logic') {
    return {
      severity: 'ok',
      label: 'Resultado de IA',
      detail: plan?.model ? `IA: ${plan.model}` : 'IA'
    }
  }

  if (provider === 'admin-manual') {
    return {
      severity: 'info',
      label: 'Manual',
      detail: 'Modo manual.'
    }
  }

  if (provider === 'local-rules-fallback') {
    return {
      severity: 'warning',
      label: 'Deteccion local',
      detail: 'IA no respondio. Se uso deteccion local.'
    }
  }

  return {
    severity: 'info',
    label: 'Reglas del sistema',
    detail: 'Reglas locales.'
  }
}

function emptyStudentForm(today) {
  return {
    publicId: '',
    fullName: '',
    email: '',
    phone: '',
    currentLevelId: DEFAULT_STUDENT_LEVEL_ID,
    currentLessonId: DEFAULT_STUDENT_LESSON_ID,
    enrollmentDate: today,
    status: 'activo',
    scholarshipStatus: 'activa',
    progressPercent: 0,
    completedLessonIds: []
  }
}

function studentToForm(student, today) {
  return {
    publicId: student?.publicId || '',
    fullName: student?.fullName || '',
    email: student?.email || '',
    phone: student?.phone || '',
    currentLevelId: student?.currentLevelId || '',
    currentLessonId: student?.currentLessonId || '',
    enrollmentDate: student?.enrollmentDate || today,
    status: student?.status || 'activo',
    scholarshipStatus: student?.scholarshipStatus || 'activa',
    progressPercent: Number(student?.progressPercent || 0),
    completedLessonIds: Array.isArray(student?.completedLessonIds) ? student.completedLessonIds : []
  }
}

function AdminDashboard() {
  const navigate = useNavigate()
  const uiLanguage = useUiLanguage()
  const {
    user,
    profile,
    authError,
    data,
    insights,
    loading,
    saving,
    message,
    setMessage,
    createBulkAttendance,
    createBlockout,
    createClass,
    createClassroom,
    createLesson,
    createLevel,
    createPayment,
    createAdmin,
    createStudent,
    createTeacher,
    deleteClass,
    deleteBlockout,
    deleteClassroom,
    deleteLesson,
    deleteLevel,
    deleteStudent,
    deleteAdmin,
    deleteTeacher,
    markAttendance,
    seedAcademicCatalog,
    seedClassrooms,
    seedTeachers,
    updateClass,
    updateClassroom,
    updateLesson,
    updateLevel,
    updatePayment,
    updateAdmin,
    saveGrade,
    deleteGrade,
    updateStudent,
    updateTeacher
  } = useInstituteData()

  const todayMexico = useMemo(() => getMexicoDateInput(), [])
  const [activeTab, setActiveTab] = useState('classes')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentForm, setStudentForm] = useState(() => emptyStudentForm(todayMexico))
  const [studentDraft, setStudentDraft] = useState(() => emptyStudentForm(todayMexico))
  const [adminForm, setAdminForm] = useState({ nombre: 'Innova Teaching', email: 'innova.teaching22@gmail.com' })
  const [adminDrafts, setAdminDrafts] = useState({})
  const [teacherForm, setTeacherForm] = useState({ publicId: '', name: '', email: '' })
  const [roleAssignmentForm, setRoleAssignmentForm] = useState({
    name: '',
    email: '',
    publicId: '',
    admin: true,
    teacher: false
  })
  const [teacherDrafts, setTeacherDrafts] = useState({})
  const [classroomForm, setClassroomForm] = useState({ name: '' })
  const [classroomDrafts, setClassroomDrafts] = useState({})
  const [editingClassId, setEditingClassId] = useState('')
  const [isClassModalOpen, setIsClassModalOpen] = useState(false)
  const [mergeSourceClassIds, setMergeSourceClassIds] = useState([])
  const [aiClassPlan, setAiClassPlan] = useState(null)
  const [aiClassLoading, setAiClassLoading] = useState(false)
  const [isAiPlanModalOpen, setIsAiPlanModalOpen] = useState(false)
  const [aiPlanGroup, setAiPlanGroup] = useState(null)
  const [aiPlanDrafts, setAiPlanDrafts] = useState([])
  const [aiPlanClassCount, setAiPlanClassCount] = useState(1)
  const [aiPlanCloseConfirm, setAiPlanCloseConfirm] = useState(false)
  const [availableTeacherSlots, setAvailableTeacherSlots] = useState(0)
  const [progressPreviewStudentId, setProgressPreviewStudentId] = useState('')
  const [classForm, setClassForm] = useState({
    lessonId: '',
    teacherId: '',
    classroomId: '',
    date: todayMexico,
    time: '08:00',
    durationHours: 1,
    status: 'programada'
  })
  const [classStudentIds, setClassStudentIds] = useState([])
  const [blockoutForm, setBlockoutForm] = useState({
    date: todayMexico,
    time: '',
    allDay: true,
    reason: ''
  })
  const [selectedAttendanceClassId, setSelectedAttendanceClassId] = useState('')
  const [attendanceChecked, setAttendanceChecked] = useState({})
  const [paymentForm, setPaymentForm] = useState({
    studentId: '',
    dueDate: '',
    period: '',
    amount: 0,
    status: 'pendiente'
  })
  const [paymentCapture, setPaymentCapture] = useState(null)
  const [gradeDrafts, setGradeDrafts] = useState({})
  const [listFilters, setListFilters] = useState({
    students: { search: '', order: 'name-asc' },
    teachers: { search: '', order: 'name-asc' },
    admins: { search: '', order: 'name-asc' },
    payments: { search: '', order: 'name-asc' },
    classes: { search: '', order: 'date-asc' },
    attendance: { search: '', order: 'name-asc' },
    catalog: { search: '', order: 'level-asc' }
  })
  const [reservationFilters, setReservationFilters] = useState({
    date: '',
    time: ''
  })
  const [reservationStudentFilters, setReservationStudentFilters] = useState({
    date: '',
    time: ''
  })
  const [classRegistryFilters, setClassRegistryFilters] = useState({
    date: '',
    time: ''
  })
  const [levelForm, setLevelForm] = useState({
    id: '',
    order: 0,
    name: '',
    shortName: '',
    durationMonths: 1,
    targetLessons: 8,
    description: ''
  })
  const [lessonForm, setLessonForm] = useState({
    id: '',
    levelId: '',
    order: 1,
    name: '',
    estimatedHours: 1
  })
  const [levelDrafts, setLevelDrafts] = useState({})
  const [lessonDrafts, setLessonDrafts] = useState({})

  const isAdmin = profile?.rol === 'admin'
  const uiText = {
    showTime: uiLanguage === 'en' ? 'Show time' : 'Show time',
    switchTeacher: uiLanguage === 'en' ? 'Switch to teacher' : 'Cambiar a teacher',
    logout: uiLanguage === 'en' ? 'Log out' : 'Cerrar sesion',
    menu: uiLanguage === 'en' ? 'Menu' : 'Menu'
  }
  const requireLogin = !loading && (!user || !profile)
  const sortedStudents = useMemo(() => sortByName(data.students), [data.students])
  const sortedTeachers = useMemo(() => sortByName(data.teachers), [data.teachers])
  const activeTeacherLimit = Math.max(1, Math.min(Number(availableTeacherSlots) || sortedTeachers.length || 1, sortedTeachers.length || 1))
  const hasTeacherPanelAccess = useMemo(() => (
    sortedTeachers.some(teacher => (
      String(teacher.email || '').toLowerCase() === String(profile?.email || user?.email || '').toLowerCase()
    ))
  ), [profile?.email, sortedTeachers, user?.email])
  const linkedTeacherProfile = useMemo(() => (
    sortedTeachers.find(teacher => (
      String(teacher.email || '').toLowerCase() === String(profile?.email || user?.email || '').toLowerCase()
    ))
  ), [profile?.email, sortedTeachers, user?.email])
  const sortedAdmins = useMemo(() => {
    const byKey = new Map()
    ;(data.users || [])
      .filter(item => (item.rol || item.role) === 'admin')
      .filter(item => !HIDDEN_ADMIN_EMAILS.includes(String(item.email || '').toLowerCase()))
      .forEach(admin => {
        const key = String(admin.email || admin.id || '').toLowerCase()
        const previous = byKey.get(key)
        const isLinked = admin.uid && admin.id === admin.uid
        const previousLinked = previous?.uid && previous.id === previous.uid
        if (!previous || (isLinked && !previousLinked)) byKey.set(key, admin)
      })

    return Array.from(byKey.values()).sort((a, b) => (
      (a.nombre || a.email || '').localeCompare(b.nombre || b.email || '', 'es')
    ))
  }, [data.users])
  const sortedClassrooms = useMemo(() => (
    [...(data.classrooms || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
  ), [data.classrooms])
  const activeClassrooms = useMemo(() => (
    sortedClassrooms.filter(classroom => classroom.active !== false)
  ), [sortedClassrooms])
  const sortedLevels = useMemo(() => [...data.levels].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)), [data.levels])
  const academicLevels = useMemo(() => (
    sortedLevels.filter(level => !isFreeTopicLevelId(level.id))
  ), [sortedLevels])
  const sortedLessons = useMemo(() => [...data.lessons].sort((a, b) => {
    const levelA = getLevel(a.levelId, data.levels)?.order || 0
    const levelB = getLevel(b.levelId, data.levels)?.order || 0
    return levelA - levelB || Number(a.order || 0) - Number(b.order || 0)
  }), [data.lessons, data.levels])
  const selectedStudent = useMemo(() => (
    insights.students.find(student => student.id === selectedStudentId)
  ), [insights.students, selectedStudentId])
  const progressPreviewStudent = useMemo(() => (
    sortedStudents.find(student => student.id === progressPreviewStudentId)
  ), [progressPreviewStudentId, sortedStudents])
  const progressPreviewRegisteredLessons = useMemo(() => (
    getRegisteredLessonIdsForStudent(progressPreviewStudentId, data.classes, data.attendance, sortedStudents)
  ), [data.attendance, data.classes, progressPreviewStudentId, sortedStudents])
  const selectedPaymentStudent = useMemo(() => (
    sortedStudents.find(student => student.id === paymentForm.studentId)
  ), [paymentForm.studentId, sortedStudents])
  const paymentPeriods = useMemo(() => buildMonthlyPeriods(selectedPaymentStudent), [selectedPaymentStudent])
  const classesByRecentDate = useMemo(() => (
    [...data.classes].sort((a, b) => (toDate(b.startAt)?.getTime() || 0) - (toDate(a.startAt)?.getTime() || 0))
  ), [data.classes])
  const pendingAssignmentClasses = useMemo(() => (
    classesByRecentDate.filter(classItem => (
      hasClassStudents(classItem)
      && (
        classItem.status === 'pendiente_asignacion'
        || (classItem.reservationSource === 'student-auto' && !classItem.teacherId)
      )
    ))
  ), [classesByRecentDate])
  const reservationFilterDates = useMemo(() => (
    Array.from(new Set(pendingAssignmentClasses.map(classItem => classItem.date || getClassDateValue(classItem.startAt)).filter(Boolean))).sort()
  ), [pendingAssignmentClasses])
  const reservationFilterTimes = useMemo(() => (
    Array.from(new Set(pendingAssignmentClasses
      .filter(classItem => !reservationFilters.date || (classItem.date || getClassDateValue(classItem.startAt)) === reservationFilters.date)
      .map(classItem => classItem.time || getClassTimeValue(classItem.startAt))
      .filter(Boolean))).sort()
  ), [pendingAssignmentClasses, reservationFilters.date])
  const filteredPendingAssignmentClasses = useMemo(() => (
    pendingAssignmentClasses.filter(classItem => {
      const date = classItem.date || getClassDateValue(classItem.startAt)
      const time = classItem.time || getClassTimeValue(classItem.startAt)

      return (!reservationFilters.date || date === reservationFilters.date)
        && (!reservationFilters.time || time === reservationFilters.time)
    })
  ), [pendingAssignmentClasses, reservationFilters])
  const oldPendingAssignmentClasses = useMemo(() => (
    pendingAssignmentClasses.filter(classItem => {
      const date = classItem.date || getClassDateValue(classItem.startAt)
      return date && date < todayMexico
    })
  ), [pendingAssignmentClasses, todayMexico])
  const currentAiUsage = useMemo(() => (
    data.aiUsage.find(item => item.id === getCurrentMonthId() || item.month === getCurrentMonthId()) || {}
  ), [data.aiUsage])
  const aiUsageTotal = Number(currentAiUsage.totalRequests || 0)
  const aiUsagePercent = Math.min(100, Math.round((aiUsageTotal / MISTRAL_MONTHLY_LIMIT) * 100))
  const pendingAssignmentSlotGroups = useMemo(() => (
    buildPendingSlotGroups(filteredPendingAssignmentClasses, sortedStudents)
  ), [filteredPendingAssignmentClasses, sortedStudents])
  const reservationStudentFilterDates = useMemo(() => (
    Array.from(new Set(pendingAssignmentClasses.map(classItem => classItem.date || getClassDateValue(classItem.startAt)).filter(Boolean))).sort()
  ), [pendingAssignmentClasses])
  const reservationStudentFilterTimes = useMemo(() => (
    Array.from(new Set(pendingAssignmentClasses
      .filter(classItem => !reservationStudentFilters.date || (classItem.date || getClassDateValue(classItem.startAt)) === reservationStudentFilters.date)
      .map(classItem => classItem.time || getClassTimeValue(classItem.startAt))
      .filter(Boolean))).sort()
  ), [pendingAssignmentClasses, reservationStudentFilters.date])
  const filteredReservationStudentClasses = useMemo(() => (
    pendingAssignmentClasses.filter(classItem => {
      const date = classItem.date || getClassDateValue(classItem.startAt)
      const time = classItem.time || getClassTimeValue(classItem.startAt)

      return (!reservationStudentFilters.date || date === reservationStudentFilters.date)
        && (!reservationStudentFilters.time || time === reservationStudentFilters.time)
    })
  ), [pendingAssignmentClasses, reservationStudentFilters])
  const reservationStudentRows = useMemo(() => (
    buildReservationStudentRows(filteredReservationStudentClasses, sortedStudents)
  ), [filteredReservationStudentClasses, sortedStudents])
  const selectedAttendanceClass = useMemo(() => (
    classesByRecentDate.find(classItem => classItem.id === selectedAttendanceClassId)
  ), [classesByRecentDate, selectedAttendanceClassId])
  const attendanceStudents = useMemo(() => {
    if (!selectedAttendanceClass?.studentIds?.length) return []
    const classIds = new Set(selectedAttendanceClass.studentIds)
    return sortedStudents.filter(student => classIds.has(student.id))
  }, [selectedAttendanceClass, sortedStudents])
  const attendanceByStudentId = useMemo(() => {
    const records = data.attendance
      .filter(record => record.classId === selectedAttendanceClass?.id)
      .map(record => [record.studentId, record])
    return new Map(records)
  }, [data.attendance, selectedAttendanceClass])
  const attendanceRows = useMemo(() => (
    data.attendance
      .map(record => {
        const student = data.students.find(item => item.id === record.studentId)
        const classItem = data.classes.find(item => item.id === record.classId)
        return {
          ...record,
          studentName: student?.fullName || record.studentId,
          publicId: student?.publicId || '',
          teacherName: classItem?.teacherName || record.recordedByName || ''
        }
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName, 'es') || (toDate(b.startAt)?.getTime() || 0) - (toDate(a.startAt)?.getTime() || 0))
  ), [data.attendance, data.classes, data.students])
  const selectedStudentRegisteredLessons = useMemo(() => (
    new Set([
      ...getAttendedLessonIdsForStudent(selectedStudentId, data.classes, data.attendance),
      ...(Array.isArray(studentDraft.completedLessonIds) ? studentDraft.completedLessonIds : [])
    ])
  ), [data.attendance, data.classes, selectedStudentId, studentDraft.completedLessonIds])
  const selectedStudentAttendedLessons = useMemo(() => (
    getAttendedLessonIdsForStudent(selectedStudentId, data.classes, data.attendance)
  ), [data.attendance, data.classes, selectedStudentId])
  const paymentsByStudentDueDate = useMemo(() => (
    data.payments.reduce((map, payment) => {
      const key = getPaymentKey(payment.studentId, payment.dueDate)
      const previous = map.get(key)
      if (!previous || isPaymentPaid(payment) || toDate(payment.updatedAt) > toDate(previous.updatedAt)) {
        map.set(key, payment)
      }
      return map
    }, new Map())
  ), [data.payments])
  const paidPayments = useMemo(() => (
    data.payments.filter(isPaymentPaid)
  ), [data.payments])
  const paymentTotals = useMemo(() => {
    const currentMonth = todayMexico.slice(0, 7)
    return paidPayments.reduce((totals, payment) => {
      const amount = getPaymentAmount(payment)
      const paidDate = payment.paidAt || payment.dueDate || ''
      return {
        total: totals.total + amount,
        month: String(paidDate).slice(0, 7) === currentMonth ? totals.month + amount : totals.month,
        count: totals.count + 1
      }
    }, { total: 0, month: 0, count: 0 })
  }, [paidPayments, todayMexico])
  const visibleStudents = useMemo(() => (
    sortedStudents
      .filter(student => matchesSearch([
        student.publicId,
        student.fullName,
        student.email,
        student.phone,
        getLevel(student.currentLevelId, data.levels)?.shortName
      ], listFilters.students.search))
      .sort((a, b) => {
        if (listFilters.students.order === 'id-asc') return String(a.publicId || '').localeCompare(String(b.publicId || ''), 'es')
        if (listFilters.students.order === 'level-asc') return (getLevel(a.currentLevelId, data.levels)?.order || 0) - (getLevel(b.currentLevelId, data.levels)?.order || 0)
        return (a.fullName || '').localeCompare(b.fullName || '', 'es')
      })
  ), [data.levels, listFilters.students, sortedStudents])
  const visibleTeachers = useMemo(() => (
    sortedTeachers
      .filter(teacher => matchesSearch([teacher.publicId, teacher.name, teacher.email], listFilters.teachers.search))
      .sort((a, b) => {
        if (listFilters.teachers.order === 'id-asc') return String(a.publicId || '').localeCompare(String(b.publicId || ''), 'es')
        return (a.name || '').localeCompare(b.name || '', 'es')
      })
  ), [listFilters.teachers, sortedTeachers])
  const visibleAdmins = useMemo(() => (
    sortedAdmins
      .filter(admin => matchesSearch([admin.nombre, admin.email, admin.status], listFilters.admins.search))
      .sort((a, b) => {
        if (listFilters.admins.order === 'email-asc') return String(a.email || '').localeCompare(String(b.email || ''), 'es')
        if (listFilters.admins.order === 'status-asc') return String(a.status || '').localeCompare(String(b.status || ''), 'es')
        return String(a.nombre || a.email || '').localeCompare(String(b.nombre || b.email || ''), 'es')
      })
  ), [listFilters.admins, sortedAdmins])
  const adminAccessEmails = useMemo(() => (
    new Set(sortedAdmins.filter(admin => admin.uid).map(admin => String(admin.email || '').toLowerCase()))
  ), [sortedAdmins])
  const visiblePaymentStudents = useMemo(() => (
    sortedStudents
      .filter(student => matchesSearch([student.publicId, student.fullName, student.email], listFilters.payments.search))
      .sort((a, b) => {
        if (listFilters.payments.order === 'id-asc') return String(a.publicId || '').localeCompare(String(b.publicId || ''), 'es')
        if (listFilters.payments.order === 'overdue-first') {
          const overdueA = buildEnrollmentPeriods(a).some(period => !isPaymentPaid(paymentsByStudentDueDate.get(getPaymentKey(a.id, period.dueDate))) && period.dueDate < todayMexico)
          const overdueB = buildEnrollmentPeriods(b).some(period => !isPaymentPaid(paymentsByStudentDueDate.get(getPaymentKey(b.id, period.dueDate))) && period.dueDate < todayMexico)
          return Number(overdueB) - Number(overdueA) || (a.fullName || '').localeCompare(b.fullName || '', 'es')
        }
        return (a.fullName || '').localeCompare(b.fullName || '', 'es')
      })
  ), [listFilters.payments, paymentsByStudentDueDate, sortedStudents, todayMexico])
  const visibleClassesByRecentDate = useMemo(() => (
    classesByRecentDate
      .filter(classItem => {
        const date = classItem.date || getClassDateValue(classItem.startAt)
        const time = classItem.time || getClassTimeValue(classItem.startAt)

        return (!classRegistryFilters.date || date === classRegistryFilters.date)
          && (!classRegistryFilters.time || time === classRegistryFilters.time)
      })
      .filter(classItem => {
        const lesson = getLesson(classItem.lessonIds?.[0], data.lessons)
        const statusLabel = classItem.status === 'cancelada'
          ? 'cancelada'
          : classItem.status === 'pendiente_asignacion' || !classItem.teacherId
            ? 'pendiente_asignacion'
            : 'programada'
        return matchesSearch([
          lesson?.name,
          classItem.teacherName,
          classItem.classroomName,
          classItem.room,
          statusLabel
        ], listFilters.classes.search)
      })
      .sort((a, b) => {
        if (listFilters.classes.order === 'date-desc') return (toDate(b.startAt)?.getTime() || 0) - (toDate(a.startAt)?.getTime() || 0)
        if (listFilters.classes.order === 'teacher-asc') return String(a.teacherName || '').localeCompare(String(b.teacherName || ''), 'es')
        return (toDate(a.startAt)?.getTime() || 0) - (toDate(b.startAt)?.getTime() || 0)
      })
  ), [classRegistryFilters, classesByRecentDate, data.lessons, listFilters.classes])
  const classRegistryFilterDates = useMemo(() => (
    Array.from(new Set(classesByRecentDate.map(classItem => classItem.date || getClassDateValue(classItem.startAt)).filter(Boolean))).sort()
  ), [classesByRecentDate])
  const classRegistryFilterTimes = useMemo(() => (
    Array.from(new Set(classesByRecentDate
      .filter(classItem => !classRegistryFilters.date || (classItem.date || getClassDateValue(classItem.startAt)) === classRegistryFilters.date)
      .map(classItem => classItem.time || getClassTimeValue(classItem.startAt))
      .filter(Boolean))).sort()
  ), [classRegistryFilters.date, classesByRecentDate])
  const visibleAttendanceRows = useMemo(() => (
    attendanceRows
      .filter(record => matchesSearch([record.studentName, record.publicId, record.className, record.teacherName], listFilters.attendance.search))
      .sort((a, b) => {
        if (listFilters.attendance.order === 'date-desc') return (toDate(b.startAt)?.getTime() || 0) - (toDate(a.startAt)?.getTime() || 0)
        if (listFilters.attendance.order === 'missed-first') return Number(a.attended) - Number(b.attended) || a.studentName.localeCompare(b.studentName, 'es')
        return a.studentName.localeCompare(b.studentName, 'es')
      })
  ), [attendanceRows, listFilters.attendance])
  const visibleSortedLessons = useMemo(() => (
    sortedLessons
      .filter(lesson => matchesSearch([lesson.id, lesson.name, getLevel(lesson.levelId, data.levels)?.shortName], listFilters.catalog.search))
      .sort((a, b) => {
        if (listFilters.catalog.order === 'name-asc') return String(a.name || '').localeCompare(String(b.name || ''), 'es')
        const levelA = getLevel(a.levelId, data.levels)?.order || 0
        const levelB = getLevel(b.levelId, data.levels)?.order || 0
        return levelA - levelB || Number(a.order || 0) - Number(b.order || 0)
      })
  ), [data.levels, listFilters.catalog, sortedLessons])
  const studentFormLessons = useMemo(() => (
    getLessonsByLevel(studentForm.currentLevelId, data.lessons)
  ), [studentForm.currentLevelId, data.lessons])
  const studentDraftLessons = useMemo(() => (
    getLessonsByLevel(studentDraft.currentLevelId, data.lessons)
  ), [studentDraft.currentLevelId, data.lessons])
  const classLesson = getLesson(classForm.lessonId, data.lessons)
  const classLevel = getLevel(classLesson?.levelId, data.levels)
  const classTimeOptions = useMemo(() => (
    getScheduleHoursForDate(classForm.date)
      .filter(time => !isSlotBlocked(data.blockouts, classForm.date, time))
  ), [classForm.date, data.blockouts])
  const blockoutTimeOptions = useMemo(() => getScheduleHoursForDate(blockoutForm.date), [blockoutForm.date])
  const sortedBlockouts = useMemo(() => (
    [...data.blockouts].sort((a, b) => `${b.date}${b.time || ''}`.localeCompare(`${a.date}${a.time || ''}`))
  ), [data.blockouts])

  const getEffectiveClassStatus = (classItem) => {
    if (classItem.status === 'cancelada') return 'cancelada'
    if (classItem.status === 'pendiente_asignacion' || !classItem.teacherId) return 'pendiente_asignacion'
    const endAt = toDate(classItem.endAt)
    return endAt && endAt < new Date() ? 'completada' : 'programada'
  }

  useEffect(() => {
    if (!selectedStudentId && sortedStudents[0]?.id) {
      setSelectedStudentId(sortedStudents[0].id)
    }
  }, [selectedStudentId, sortedStudents])

  useEffect(() => {
    setStudentDraft(studentToForm(selectedStudent, todayMexico))
  }, [selectedStudent, todayMexico])

  useEffect(() => {
    setAdminDrafts(prev => (
      sortedAdmins.reduce((drafts, admin) => ({
        ...drafts,
        [admin.id]: prev[admin.id] || {
          nombre: admin.nombre || '',
          email: admin.email || '',
          status: admin.status || (admin.uid ? 'activo' : 'pendiente')
        }
      }), {})
    ))
  }, [sortedAdmins])

  useEffect(() => {
    setTeacherDrafts(prev => (
      data.teachers.reduce((drafts, teacher) => ({
        ...drafts,
        [teacher.id]: prev[teacher.id] || {
          publicId: teacher.publicId || '',
          name: teacher.name || '',
          email: teacher.email || ''
        }
      }), {})
    ))
  }, [data.teachers])

  useEffect(() => {
    setClassroomDrafts(prev => (
      (data.classrooms || []).reduce((drafts, classroom) => ({
        ...drafts,
        [classroom.id]: prev[classroom.id] || {
          name: classroom.name || '',
          active: classroom.active !== false
        }
      }), {})
    ))
  }, [data.classrooms])

  useEffect(() => {
    if (classForm.classroomId || !activeClassrooms[0]?.id) return
    setClassForm(prev => ({ ...prev, classroomId: activeClassrooms[0].id }))
  }, [activeClassrooms, classForm.classroomId])

  useEffect(() => {
    const teacherCount = sortedTeachers.length || 1
    setAvailableTeacherSlots(prev => Math.max(1, Math.min(Number(prev) || teacherCount, teacherCount)))
  }, [sortedTeachers.length])

  useEffect(() => {
    if (teacherForm.publicId) return
    setTeacherForm(prev => ({ ...prev, publicId: nextTeacherPublicId(sortedTeachers) }))
  }, [sortedTeachers, teacherForm.publicId])

  useEffect(() => {
    if (roleAssignmentForm.publicId || !roleAssignmentForm.teacher) return
    setRoleAssignmentForm(prev => ({ ...prev, publicId: nextTeacherPublicId(sortedTeachers) }))
  }, [roleAssignmentForm.publicId, roleAssignmentForm.teacher, sortedTeachers])

  useEffect(() => {
    setLevelDrafts(prev => (
      data.levels.reduce((drafts, level) => ({
        ...drafts,
        [level.id]: prev[level.id] || {
          order: level.order || 0,
          name: level.name || '',
          shortName: level.shortName || '',
          durationMonths: level.durationMonths || 1,
          targetLessons: level.targetLessons || 0,
          description: level.description || ''
        }
      }), {})
    ))
  }, [data.levels])

  useEffect(() => {
    setLessonDrafts(prev => (
      data.lessons.reduce((drafts, lesson) => ({
        ...drafts,
        [lesson.id]: prev[lesson.id] || {
          levelId: lesson.levelId || '',
          order: lesson.order || 1,
          name: lesson.name || '',
          estimatedHours: lesson.estimatedHours || 1
        }
      }), {})
    ))
  }, [data.lessons])

  useEffect(() => {
    if (!selectedAttendanceClassId && classesByRecentDate[0]?.id) {
      setSelectedAttendanceClassId(classesByRecentDate[0].id)
    }
  }, [classesByRecentDate, selectedAttendanceClassId])

  useEffect(() => {
    setAttendanceChecked(
      attendanceStudents.reduce((checked, student) => ({
        ...checked,
        [student.id]: attendanceByStudentId.get(student.id)?.attended === true
      }), {})
    )
  }, [attendanceByStudentId, attendanceStudents])

  useEffect(() => {
    if (!paymentForm.studentId && sortedStudents[0]?.id) {
      handlePaymentStudentChange(sortedStudents[0].id)
    }
  }, [paymentForm.studentId, sortedStudents])

  useEffect(() => {
    if (!paymentForm.studentId || !paymentPeriods.length) return
    if (paymentPeriods.some(period => period.dueDate === paymentForm.dueDate)) return

    setPaymentForm(prev => ({
      ...prev,
      dueDate: paymentPeriods[0].dueDate,
      period: paymentPeriods[0].period
    }))
  }, [paymentForm.dueDate, paymentForm.studentId, paymentPeriods])

  useEffect(() => {
    if (classTimeOptions.includes(classForm.time)) return
    setClassForm(prev => ({
      ...prev,
      time: classTimeOptions[0] || ''
    }))
  }, [classForm.time, classTimeOptions])

  useEffect(() => {
    if (!reservationFilters.time || reservationFilterTimes.includes(reservationFilters.time)) return
    setReservationFilters(prev => ({ ...prev, time: '' }))
  }, [reservationFilterTimes, reservationFilters.time])

  useEffect(() => {
    if (!reservationStudentFilters.time || reservationStudentFilterTimes.includes(reservationStudentFilters.time)) return
    setReservationStudentFilters(prev => ({ ...prev, time: '' }))
  }, [reservationStudentFilterTimes, reservationStudentFilters.time])

  useEffect(() => {
    if (!classRegistryFilters.time || classRegistryFilterTimes.includes(classRegistryFilters.time)) return
    setClassRegistryFilters(prev => ({ ...prev, time: '' }))
  }, [classRegistryFilterTimes, classRegistryFilters.time])

  useEffect(() => {
    if (!studentForm.currentLevelId || studentForm.currentLessonId || !studentFormLessons[0]?.id) return
    setStudentForm(prev => ({ ...prev, currentLessonId: studentFormLessons[0].id }))
  }, [studentForm.currentLessonId, studentForm.currentLevelId, studentFormLessons])

  useEffect(() => {
    if (!studentDraft.currentLevelId || studentDraft.currentLessonId || !studentDraftLessons[0]?.id) return
    setStudentDraft(prev => ({ ...prev, currentLessonId: studentDraftLessons[0].id }))
  }, [studentDraft.currentLessonId, studentDraft.currentLevelId, studentDraftLessons])

  useEffect(() => {
    if (!selectedStudentId) return

    setGradeDrafts(prev => {
      const next = { ...prev }
      academicLevels.forEach(level => {
        const key = `${selectedStudentId}-${level.id}`
        const existingGrade = data.grades.find(grade => grade.studentId === selectedStudentId && grade.levelId === level.id)
        if (!next[key] || existingGrade) {
          next[key] = {
            oral: existingGrade?.oral ?? '',
            written: existingGrade?.written ?? ''
          }
        }
      })
      return next
    })
  }, [academicLevels, data.grades, selectedStudentId])

  const resetClassForm = () => {
    setEditingClassId('')
    setIsClassModalOpen(false)
    setMergeSourceClassIds([])
    setClassForm({ lessonId: '', teacherId: '', classroomId: activeClassrooms[0]?.id || '', date: todayMexico, time: '08:00', durationHours: 1, status: 'programada' })
    setClassStudentIds([])
  }

  const closeClassModal = () => {
    resetClassForm()
  }

  const submitStudent = async (event) => {
    event.preventDefault()
    await createStudent(studentForm)
    setStudentForm(emptyStudentForm(todayMexico))
  }

  const submitStudentUpdate = async (event) => {
    event.preventDefault()
    if (!selectedStudentId) return
    await updateStudent(selectedStudentId, studentDraft)
  }

  const handleDeleteStudent = async () => {
    if (!selectedStudentId) return
    await deleteStudent(selectedStudentId, selectedStudent?.publicId)
    setSelectedStudentId('')
  }

  const submitAdmin = async (event) => {
    event.preventDefault()
    if (!adminForm.email.trim()) return
    await createAdmin(adminForm)
    setAdminForm({ nombre: '', email: '' })
  }

  const saveAdminDraft = async (admin) => {
    const draft = adminDrafts[admin.id] || {}
    await updateAdmin(admin.id, {
      ...admin,
      ...draft,
      uid: admin.uid || '',
      accessDocId: admin.accessDocId || admin.id
    })
  }

  const removeAdmin = async (admin) => {
    await deleteAdmin(admin.id)
  }

  const toggleStudentCompletedLesson = (lessonId, checked) => {
    setStudentDraft(prev => {
      const current = new Set(Array.isArray(prev.completedLessonIds) ? prev.completedLessonIds : [])
      if (checked) {
        current.add(lessonId)
      } else {
        current.delete(lessonId)
      }

      return {
        ...prev,
        completedLessonIds: Array.from(current)
      }
    })
  }

  const submitTeacher = async (event) => {
    event.preventDefault()
    if (!teacherForm.name.trim()) return
    await createTeacher(teacherForm)
    setTeacherForm({ publicId: nextTeacherPublicId(sortedTeachers), name: '', email: '' })
  }

  const submitRoleAssignment = async (event) => {
    event.preventDefault()
    const email = roleAssignmentForm.email.trim().toLowerCase()
    const name = roleAssignmentForm.name.trim() || email

    if (!email) {
      setMessage('Escribe el correo para asignar roles.')
      return
    }

    if (!roleAssignmentForm.admin && !roleAssignmentForm.teacher) {
      setMessage('Selecciona al menos un rol: Admin o Teacher.')
      return
    }

    if (roleAssignmentForm.admin) {
      await createAdmin({ nombre: name, email, status: 'pendiente' })
    }

    if (roleAssignmentForm.teacher) {
      await createTeacher({
        publicId: roleAssignmentForm.publicId || nextTeacherPublicId(sortedTeachers),
        name,
        email
      })
    }

    setRoleAssignmentForm({
      name: '',
      email: '',
      publicId: roleAssignmentForm.teacher ? nextTeacherPublicId(sortedTeachers) : '',
      admin: true,
      teacher: false
    })
  }

  const switchToTeacherPanel = async () => {
    try {
      if (!linkedTeacherProfile) {
        setMessage('Este correo no tiene teacher registrado. Asignale rol teacher en Roles.')
        return
      }

      await activateTeacherPanelProfile({
        user,
        profile,
        teacher: linkedTeacherProfile
      })
      navigate('/teacher-dashboard/')
    } catch (error) {
      console.warn(error)
      setMessage(error.message || 'No se pudo cambiar al panel teacher.')
    }
  }

  const submitClassroom = async (event) => {
    event.preventDefault()
    if (!classroomForm.name.trim()) return
    await createClassroom({ ...classroomForm, active: true })
    setClassroomForm({ name: '' })
  }

  const toggleClassStudent = (studentId, checked) => {
    setClassStudentIds(prev => {
      if (!checked) return prev.filter(id => id !== studentId)
      if (prev.includes(studentId)) return prev
      if (prev.length >= 8) {
        setMessage('Maximo 8 estudiantes por clase.')
        return prev
      }
      return [...prev, studentId]
    })
  }

  const getAiPlanMaxClasses = (slotGroup = aiPlanGroup) => {
    const classroomLimit = activeClassrooms.length || 1
    const teacherLimit = activeTeacherLimit || 1
    const studentLimit = slotGroup?.studentIds?.length || 1
    return Math.max(1, Math.min(classroomLimit, teacherLimit, studentLimit))
  }

  const getAiPlanRecommendedClassCount = (slotGroup = aiPlanGroup, suggestions = []) => {
    const maxClasses = getAiPlanMaxClasses(slotGroup)
    const suggestionCount = (suggestions || []).filter(suggestion => suggestion.studentIds?.length).length
    const proximityCount = getRecommendedClassCountForStudents(
      slotGroup?.studentIds || [],
      sortedStudents,
      data.levels,
      maxClasses,
      data.lessons
    )

    if (!suggestionCount) return Math.max(1, proximityCount)
    return Math.max(1, Math.min(maxClasses, Math.max(proximityCount, suggestionCount)))
  }

  const getSourceClassIdsForStudentIds = (slotGroup, studentIds = []) => {
    const selected = new Set(studentIds)
    return (slotGroup?.sourceClassIds || []).filter(classId => {
      const classItem = data.classes.find(item => item.id === classId)
      const sourceStudentIds = classItem?.studentIds || []
      return sourceStudentIds.length && sourceStudentIds.every(studentId => selected.has(studentId))
    })
  }

  const buildAiPlanDrafts = (slotGroup, suggestions = [], requestedClassCount = 1, previousDrafts = []) => {
    if (!slotGroup?.studentIds?.length) return []

    const maxClasses = getAiPlanMaxClasses(slotGroup)
    const classCount = Math.max(1, Math.min(Number(requestedClassCount) || 1, maxClasses))
    const usableSuggestions = (suggestions || []).filter(suggestion => suggestion.studentIds?.length)
    const chunks = splitStudentIdsByLevelProximity(slotGroup.studentIds, sortedStudents, data.levels, classCount, data.lessons)
    const assigned = new Set(chunks.flat())
    const missing = slotGroup.studentIds.filter(studentId => !assigned.has(studentId))

    missing.forEach((studentId, index) => {
      chunks[index % chunks.length].push(studentId)
    })

    return chunks.map((studentIds, index) => {
      const suggestion = usableSuggestions[index] || usableSuggestions[0] || {}
      const previous = previousDrafts[index] || {}
      const sourceClassIds = getSourceClassIdsForStudentIds(slotGroup, studentIds)
      const classId = sourceClassIds[0] || suggestion.classId || slotGroup.sourceClassIds?.[index] || ''
      const suggestionLesson = getLesson(suggestion.lessonId, data.lessons)
      const groupLevelDistance = getStudentGroupLevelDistance(studentIds, sortedStudents, data.levels)
      const shouldIgnoreFreeTopic = groupLevelDistance < 2 && isFreeTopicLevelId(suggestionLesson?.levelId)
      const defaultLessonId = findDefaultLessonForStudentGroup(studentIds, sortedStudents, data.lessons, data.levels)
      const viableSuggestionLessonId = !shouldIgnoreFreeTopic && isLessonViableForStudentGroup(suggestionLesson, studentIds, sortedStudents, data.lessons, data.levels)
        ? suggestion.lessonId
        : ''

      return {
        id: previous.id || `${slotGroup.id}-draft-${index + 1}`,
        title: `Clase ${index + 1}`,
        classId,
        sourceClassIds,
        lessonId: previous.lessonId || viableSuggestionLessonId || defaultLessonId,
        teacherId: previous.teacherId || '',
        classroomId: previous.classroomId || activeClassrooms[index % Math.max(activeClassrooms.length, 1)]?.id || '',
        studentIds,
        reason: groupLevelDistance >= 2
          ? 'Grupo con salto amplio de nivel; Tema Libre es aceptable si no conviene separarlo mas.'
          : 'Grupo formado por cercania de nivel academico.',
        confidence: Number(suggestion.confidence || 0.8)
      }
    })
  }

  const setAiDraftClassCount = (nextCount) => {
    const count = Math.max(1, Math.min(Number(nextCount) || 1, getAiPlanMaxClasses(aiPlanGroup)))
    setAiPlanClassCount(count)
    setAiPlanDrafts(prev => enforceExclusiveAiDraftAssignments(buildAiPlanDrafts(aiPlanGroup, aiClassPlan?.suggestions || [], count, prev)))
  }

  const enforceExclusiveAiDraftAssignments = (drafts = [], slotGroup = aiPlanGroup) => {
    const usedStudents = new Set()
    const usedTeachers = new Set()
    const usedClassrooms = new Set()

    return drafts.map(draft => {
      const studentIds = []
      ;(draft.studentIds || []).forEach(studentId => {
        if (usedStudents.has(studentId)) return
        usedStudents.add(studentId)
        studentIds.push(studentId)
      })

      const teacherId = draft.teacherId && !usedTeachers.has(draft.teacherId)
        ? draft.teacherId
        : ''
      if (teacherId) usedTeachers.add(teacherId)

      const classroomId = draft.classroomId && !usedClassrooms.has(draft.classroomId)
        ? draft.classroomId
        : ''
      if (classroomId) usedClassrooms.add(classroomId)

      return {
        ...draft,
        teacherId,
        classroomId,
        studentIds,
        sourceClassIds: getSourceClassIdsForStudentIds(slotGroup, studentIds)
      }
    })
  }

  const updateAiPlanDraft = (draftId, patch) => {
    setAiPlanDrafts(prev => prev.map(draft => {
      if (draft.id === draftId) return { ...draft, ...patch }

      if (patch.teacherId && draft.teacherId === patch.teacherId) {
        return { ...draft, teacherId: '' }
      }

      if (patch.classroomId && draft.classroomId === patch.classroomId) {
        return { ...draft, classroomId: '' }
      }

      return draft
    }))
  }

  const toggleAiPlanDraftStudent = (draftId, studentId, checked) => {
    setAiPlanDrafts(prev => prev.map(draft => {
      if (draft.id === draftId) {
        const nextStudentIds = checked
          ? uniqueValues([...draft.studentIds, studentId]).slice(0, 8)
          : draft.studentIds.filter(id => id !== studentId)

        return {
          ...draft,
          studentIds: nextStudentIds,
          sourceClassIds: getSourceClassIdsForStudentIds(aiPlanGroup, nextStudentIds)
        }
      }

      if (!checked) return draft

      const nextStudentIds = draft.studentIds.filter(id => id !== studentId)
      return {
        ...draft,
        studentIds: nextStudentIds,
        sourceClassIds: getSourceClassIdsForStudentIds(aiPlanGroup, nextStudentIds)
      }
    }))
  }

  const resetAiPlanModal = () => {
    setIsAiPlanModalOpen(false)
    setAiPlanGroup(null)
    setAiPlanDrafts([])
    setAiPlanClassCount(1)
    setAiPlanCloseConfirm(false)
  }

  const requestCloseAiPlanModal = () => {
    if (!aiPlanCloseConfirm) {
      setAiPlanCloseConfirm(true)
      return
    }

    resetAiPlanModal()
  }

  const buildClassPayload = () => {
    const lesson = getLesson(classForm.lessonId, data.lessons)
    const teacher = sortedTeachers.find(item => item.id === classForm.teacherId)
    const classroom = sortedClassrooms.find(item => item.id === classForm.classroomId)
    const levelId = lesson?.levelId || ''
    const durationHours = 1
    const slotKey = buildClassSlotKey({
      date: classForm.date,
      time: classForm.time,
      levelId,
      lessonId: lesson?.id || ''
    })

    return {
      slotKey,
      levelId,
      lessonIds: lesson?.id ? [lesson.id] : [],
      lessonName: lesson?.name || '',
      teacherId: teacher?.id || '',
      teacherName: teacher?.name || '',
      date: classForm.date,
      time: classForm.time,
      startAt: buildMexicoDateTimeIso(classForm.date, classForm.time),
      endAt: buildMexicoDateTimeIso(classForm.date, classForm.time, durationHours),
      durationHours: 1,
      studentIds: classStudentIds,
      classroomId: classroom?.id || '',
      classroomName: classroom?.name || '',
      room: classroom?.name || 'Salon por asignar',
      mode: 'presencial',
      status: 'programada',
      reservationSource: editingClassId ? 'admin-edited' : 'admin-manual',
      aiAssignment: {
        provider: 'admin-manual',
        strategy: 'correccion_administrativa',
        unlimitedFree: true,
        maxStudents: null,
        reason: 'Clase creada o ajustada por admin.'
      }
    }
  }

  const buildClassPayloadFromAiDraft = (draft) => {
    const lesson = getLesson(draft.lessonId, data.lessons)
    const teacher = sortedTeachers.find(item => item.id === draft.teacherId)
    const classroom = sortedClassrooms.find(item => item.id === draft.classroomId)
    const levelId = lesson?.levelId || ''
    const durationHours = 1
    const date = aiPlanGroup?.date || classForm.date
    const time = aiPlanGroup?.time || classForm.time
    const slotKey = buildClassSlotKey({
      date,
      time,
      levelId,
      lessonId: lesson?.id || '',
      durationHours
    })

    return {
      slotKey,
      levelId,
      lessonIds: lesson?.id ? [lesson.id] : [],
      lessonName: lesson?.name || '',
      teacherId: teacher?.id || '',
      teacherName: teacher?.name || '',
      date,
      time,
      startAt: buildMexicoDateTimeIso(date, time),
      endAt: buildMexicoDateTimeIso(date, time, durationHours),
      durationHours,
      studentIds: draft.studentIds,
      classroomId: classroom?.id || '',
      classroomName: classroom?.name || '',
      room: classroom?.name || 'Salon por asignar',
      mode: 'presencial',
      status: 'programada',
      reservationSource: 'ai-formed',
      aiAssignment: {
        provider: aiClassPlan?.provider || 'local-rules',
        model: aiClassPlan?.model || '',
        strategy: 'admin_confirmed_ai_class_grouping',
        unlimitedFree: true,
        maxStudents: 8,
        sourceClassIds: draft.sourceClassIds || [],
        reason: draft.reason || 'Clase formada desde propuesta IA.'
      }
    }
  }

  const submitAiPlanClasses = async () => {
    const groupStudents = aiPlanGroup.students?.length
      ? aiPlanGroup.students
      : aiPlanGroup.studentIds.map(studentId => sortedStudents.find(student => student.id === studentId)).filter(Boolean)
    
    const totalStudents = groupStudents.length
    const selectedStudents = new Set(aiPlanDrafts.flatMap(draft => draft.studentIds))
    const selectedCount = selectedStudents.size
    
    if (selectedCount !== totalStudents) {
      setMessage(`Faltan ${totalStudents - selectedCount} alumno(s) por seleccionar. Todos deben estar en una clase.`)
      return
    }
    
    const drafts = aiPlanDrafts.filter(draft => draft.studentIds.length)
    if (!drafts.length) {
      setMessage('La propuesta no tiene alumnos seleccionados.')
      return
    }

    const missingData = drafts.some(draft => !draft.lessonId || !draft.teacherId || !draft.classroomId)
    if (missingData) {
      setMessage('Cada clase necesita tema, teacher y classroom antes de guardar.')
      return
    }

    const duplicatedStudents = drafts
      .flatMap(draft => draft.studentIds)
      .filter((studentId, index, list) => list.indexOf(studentId) !== index)
    if (duplicatedStudents.length) {
      setMessage('Un alumno no puede quedar en dos clases del mismo horario.')
      return
    }

    const duplicatedTeachers = drafts
      .map(draft => draft.teacherId)
      .filter((teacherId, index, list) => teacherId && list.indexOf(teacherId) !== index)
    if (duplicatedTeachers.length) {
      setMessage('No repitas teacher en clases del mismo horario.')
      return
    }

    const duplicatedClassrooms = drafts
      .map(draft => draft.classroomId)
      .filter((classroomId, index, list) => classroomId && list.indexOf(classroomId) !== index)
    if (duplicatedClassrooms.length) {
      setMessage('No repitas classroom en clases del mismo horario.')
      return
    }

    for (const draft of drafts) {
      const repeatedProgressStudentId = draft.studentIds.find(studentId => (
        getRegisteredLessonIdsForStudent(studentId, data.classes, data.attendance, sortedStudents).has(draft.lessonId)
      ))

      if (repeatedProgressStudentId) {
        const student = sortedStudents.find(item => item.id === repeatedProgressStudentId)
        const lesson = getLesson(draft.lessonId, data.lessons)
        setMessage(`${student?.publicId || 'Alumno'} ya tiene registrado ${lesson?.name || 'este tema'}. Cambia el tema.`)
        return
      }

      const sourceClassIds = getSourceClassIdsForStudentIds(aiPlanGroup, draft.studentIds)
      const conflictClass = findStudentLessonClassConflict({
        studentIds: draft.studentIds,
        lessonId: draft.lessonId,
        classes: data.classes,
        ignoredClassIds: sourceClassIds
      })

      if (conflictClass) {
        setMessage(buildStudentLessonConflictMessage(conflictClass, draft.studentIds, draft.lessonId, sortedStudents, data.lessons))
        return
      }
    }

    const usedAnchorIds = new Set()
    const consumedSourceIds = new Set()

    for (const draft of drafts) {
      const sourceClassIds = getSourceClassIdsForStudentIds(aiPlanGroup, draft.studentIds)
      const anchorId = sourceClassIds.find(classId => !usedAnchorIds.has(classId))
      const payload = buildClassPayloadFromAiDraft({
        ...draft,
        sourceClassIds
      })

      sourceClassIds.forEach(classId => consumedSourceIds.add(classId))

      if (anchorId) {
        usedAnchorIds.add(anchorId)
        await updateClass(anchorId, payload)
      } else {
        await createClass(payload)
      }
    }

    for (const classId of consumedSourceIds) {
      if (!usedAnchorIds.has(classId)) {
        await deleteClass(classId)
      }
    }

    setMessage(`${drafts.length} clase(s) formadas para ${aiPlanGroup ? formatDateTime(aiPlanGroup.startAt) : 'el horario seleccionado'}.`)
    resetAiPlanModal()
  }

  const submitClass = async (event) => {
    event.preventDefault()
    if (!classForm.teacherId || !classForm.classroomId || !classForm.lessonId || !classForm.time) {
      setMessage('Selecciona leccion, horario, teacher y classroom para formar la clase.')
      return
    }
    if (classStudentIds.length > 8) {
      setMessage('Maximo 8 estudiantes por clase.')
      return
    }

    const repeatedProgressStudentId = classStudentIds.find(studentId => (
      getRegisteredLessonIdsForStudent(studentId, data.classes, data.attendance, sortedStudents).has(classForm.lessonId)
    ))

    if (repeatedProgressStudentId) {
      const student = sortedStudents.find(item => item.id === repeatedProgressStudentId)
      const lesson = getLesson(classForm.lessonId, data.lessons)
      setMessage(`${student?.publicId || 'Alumno'} ya tiene registrado ${lesson?.name || 'este tema'}. Cambia el tema.`)
      return
    }

    const conflictClass = findStudentLessonClassConflict({
      studentIds: classStudentIds,
      lessonId: classForm.lessonId,
      classes: data.classes,
      ignoredClassIds: uniqueValues([editingClassId, ...mergeSourceClassIds])
    })

    if (conflictClass) {
      setMessage(buildStudentLessonConflictMessage(conflictClass, classStudentIds, classForm.lessonId, sortedStudents, data.lessons))
      return
    }

    const payload = buildClassPayload()
    if (editingClassId) {
      await updateClass(editingClassId, payload)
      const selectedSet = new Set(classStudentIds)
      const cleanupIds = mergeSourceClassIds
        .filter(classId => classId !== editingClassId)
        .filter(classId => {
          const classItem = data.classes.find(item => item.id === classId)
          return classItem && (classItem.studentIds || []).every(studentId => selectedSet.has(studentId))
        })

      for (const classId of cleanupIds) {
        await deleteClass(classId)
      }

      if (cleanupIds.length) {
        setMessage(`Clase formada; se fusionaron ${cleanupIds.length + 1} reservas del mismo horario.`)
      }
    } else {
      await createClass(payload)
    }
    resetClassForm()
  }

  const editClass = (classItem, overrides = {}) => {
    setEditingClassId(classItem.id)
    setClassForm({
      lessonId: overrides.lessonId ?? classItem.lessonIds?.[0] ?? '',
      teacherId: overrides.teacherId ?? classItem.teacherId ?? '',
      classroomId: overrides.classroomId ?? classItem.classroomId ?? activeClassrooms[0]?.id ?? '',
      date: classItem.date || getClassDateValue(classItem.startAt),
      time: classItem.time || getClassTimeValue(classItem.startAt),
      durationHours: overrides.durationHours ?? classItem.durationHours ?? 1,
      status: overrides.status ?? classItem.status ?? (classItem.teacherId ? 'programada' : 'pendiente_asignacion')
    })
    setMergeSourceClassIds(overrides.sourceClassIds || [])
    setClassStudentIds((overrides.studentIds || classItem.studentIds || []).slice(0, 8))
    setIsClassModalOpen(true)
  }

  const submitBlockout = async (event) => {
    event.preventDefault()
    if (!blockoutForm.date) return
    if (!blockoutForm.allDay && !blockoutForm.time) {
      setMessage('Selecciona una hora o marca dia completo.')
      return
    }

    await createBlockout(blockoutForm)
    setBlockoutForm({ date: todayMexico, time: '', allDay: true, reason: '' })
  }

  const requestMistralClassPlan = async (slotGroup) => {
    const sourceIds = new Set(slotGroup?.sourceClassIds || [])
    const targetPendingClasses = pendingAssignmentClasses.filter(classItem => sourceIds.has(classItem.id))
    const targetSlot = slotGroup ? {
      date: slotGroup.date,
      time: slotGroup.time,
      label: formatDateTime(slotGroup.startAt)
    } : null

    if (!targetPendingClasses.length) {
      setAiClassPlan(null)
      setMessage('No hay reservas pendientes para ese bloque.')
      return
    }

    try {
      setAiClassLoading(true)
      const plan = await generateClassFormationSuggestions({
        pendingClasses: targetPendingClasses,
        students: data.students,
        teachers: sortedTeachers,
        classes: data.classes,
        lessons: data.lessons,
        levels: data.levels,
        classrooms: data.classrooms,
        teacherCapacity: activeTeacherLimit,
        targetSlot
      })
      const nextPlan = {
        ...plan,
        groupId: slotGroup.id,
        groupLabel: `${formatDateTime(slotGroup.startAt)} - ${slotGroup.studentIds.length}/8 estudiantes`
      }
      try {
        await recordAiUsageEvent({
          month: getCurrentMonthId(),
          provider: plan.provider,
          model: plan.model || '',
          status: plan.sourceType || plan.provider,
          message: plan.fallbackReason || plan.summary || ''
        })
      } catch (usageError) {
        console.warn('No se pudo registrar el uso de IA.', usageError)
      }
      const initialClassCount = getAiPlanRecommendedClassCount(slotGroup, plan.suggestions || [])

      setAiClassPlan(nextPlan)
      setAiPlanGroup(slotGroup)
      setAiPlanClassCount(initialClassCount)
      setAiPlanDrafts(enforceExclusiveAiDraftAssignments(buildAiPlanDrafts(slotGroup, plan.suggestions || [], initialClassCount), slotGroup))
      setAiPlanCloseConfirm(false)
      setIsAiPlanModalOpen(true)
      setMessage('')
    } catch (error) {
      setMessage(error.message || 'No se pudo generar la sugerencia.')
    } finally {
      setAiClassLoading(false)
    }
  }

  const applySlotGroup = (slotGroup) => {
    const plan = {
      provider: 'admin-manual',
      model: '',
      summary: 'Forma la clase manualmente: elige tema, teacher, classroom y alumnos.',
      suggestions: [],
      warnings: []
    }
    const classCount = 1

    setAiClassPlan(plan)
    setAiPlanGroup(slotGroup)
    setAiPlanClassCount(classCount)
    setAiPlanDrafts(enforceExclusiveAiDraftAssignments(buildAiPlanDrafts(slotGroup, [], classCount), slotGroup))
    setAiPlanCloseConfirm(false)
    setIsAiPlanModalOpen(true)
  }

  const deleteOldPendingReservations = async () => {
    if (!oldPendingAssignmentClasses.length) {
      setMessage('No hay reservas anteriores por eliminar.')
      return
    }

    const confirmed = window.confirm(`Se eliminaran ${oldPendingAssignmentClasses.length} reserva(s) pendiente(s) de dias anteriores. Esta accion no se puede deshacer.`)
    if (!confirmed) return

    for (const classItem of oldPendingAssignmentClasses) {
      await deleteClass(classItem.id)
    }

    setMessage(`${oldPendingAssignmentClasses.length} reserva(s) anterior(es) eliminada(s).`)
  }

  const submitAttendance = async (event) => {
    event.preventDefault()
    if (!selectedAttendanceClass) return

    const lesson = getLesson(selectedAttendanceClass.lessonIds?.[0], data.lessons)
    const records = attendanceStudents.map(student => {
      const attended = attendanceChecked[student.id] === true
      return {
        id: `${selectedAttendanceClass.id}-${student.id}`,
        studentId: student.id,
          classId: selectedAttendanceClass.id,
          className: lesson?.name || 'Clase registrada',
          lessonId: lesson?.id || selectedAttendanceClass.lessonIds?.[0] || '',
          levelId: selectedAttendanceClass.levelId || lesson?.levelId || '',
        startAt: selectedAttendanceClass.startAt,
        endAt: selectedAttendanceClass.endAt,
        attended,
        hoursCredited: attended ? 1 : 0,
        recordedBy: profile?.uid || '',
        recordedByName: profile?.nombre || profile?.email || ''
      }
    })

    if (!records.length) {
      setMessage('La clase seleccionada no tiene estudiantes asignados.')
      return
    }

    await createBulkAttendance(records)
  }

  function handlePaymentStudentChange(studentId) {
    const student = sortedStudents.find(item => item.id === studentId)
    const firstPeriod = buildMonthlyPeriods(student)[0]
    setPaymentForm(prev => ({
      ...prev,
      studentId,
      dueDate: firstPeriod?.dueDate || '',
      period: firstPeriod?.period || ''
    }))
  }

  const submitPayment = async (event) => {
    event.preventDefault()
    const selectedPeriod = paymentPeriods.find(period => period.dueDate === paymentForm.dueDate)
    await createPayment({
      ...paymentForm,
      period: selectedPeriod?.period || paymentForm.period,
      amount: Number(paymentForm.amount || 0)
    })
    setPaymentForm(prev => ({
      ...prev,
      amount: 0,
      status: 'pendiente'
    }))
  }

  const updateListFilter = (key, patch) => {
    setListFilters(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...patch
      }
    }))
  }

  const openPaymentCapture = (student, period, payment) => {
    setPaymentCapture({
      paymentId: payment?.id || '',
      studentId: student.id,
      publicId: student.publicId || '',
      fullName: student.fullName || '',
      dueDate: period.dueDate,
      period: period.label,
      amount: payment?.amount ?? paymentForm.amount ?? 0
    })
  }

  const closePaymentCapture = () => {
    setPaymentCapture(null)
  }

  const submitPaymentCapture = async (event) => {
    event.preventDefault()
    if (!paymentCapture) return

    const payload = {
      studentId: paymentCapture.studentId,
      dueDate: paymentCapture.dueDate,
      period: paymentCapture.period,
      amount: Number(paymentCapture.amount || 0),
      status: 'pagado',
      paidAt: new Date().toISOString()
    }

    if (paymentCapture.paymentId) {
      await updatePayment(paymentCapture.paymentId, payload)
    } else {
      await createPayment(payload)
    }
    closePaymentCapture()
  }

  const getGradeForLevel = (studentId, levelId) => (
    data.grades.find(grade => grade.studentId === studentId && grade.levelId === levelId)
  )

  const updateGradeDraft = (studentId, levelId, patch) => {
    const key = `${studentId}-${levelId}`
    setGradeDrafts(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        ...patch
      }
    }))
  }

  const submitGradeForLevel = async (studentId, levelId) => {
    const key = `${studentId}-${levelId}`
    const draft = gradeDrafts[key] || {}
    await saveGrade({
      id: key,
      studentId,
      levelId,
      oral: draft.oral,
      written: draft.written
    })
  }

  const deleteGradeForLevel = async (studentId, levelId) => {
    const existingGrade = getGradeForLevel(studentId, levelId)
    if (!existingGrade?.id) return
    await deleteGrade(existingGrade.id)
  }

  const submitLevel = async (event) => {
    event.preventDefault()
    await createLevel(levelForm)
    setLevelForm({ id: '', order: 0, name: '', shortName: '', durationMonths: 1, targetLessons: 8, description: '' })
  }

  const submitLesson = async (event) => {
    event.preventDefault()
    await createLesson({
      ...lessonForm,
      estimatedHours: 1,
      activities: ['Warm-up', 'Guided practice', 'Speaking task', 'Teacher feedback'],
      objectives: [`Complete ${lessonForm.name}`, 'Register evidence of progress', 'Define next academic action']
    })
    setLessonForm({ id: '', levelId: '', order: 1, name: '', estimatedHours: 1 })
  }

  const renderListTools = (filterKey, orders = []) => (
    <div className="table-tools">
      <label className="form-field">
        <span>Buscar</span>
        <input
          value={listFilters[filterKey]?.search || ''}
          onChange={event => updateListFilter(filterKey, { search: event.target.value })}
          placeholder="Buscar en esta tabla"
        />
      </label>
      
    </div>
  )

  const renderMetrics = () => (
    <section className="dashboard-grid top-grid admin-metrics">
      <article className="metric-card">
        <span>Estudiantes activos</span>
        <strong>{insights.metrics.activeStudents}</strong>
        <small>Perfiles con seguimiento</small>
      </article>
      <article className="metric-card">
        <span>Horarios por formar</span>
        <strong>{pendingAssignmentSlotGroups.length}</strong>
        <small>{pendingAssignmentClasses.length} reservas pendientes</small>
      </article>
      <article className="metric-card">
        <span>Clases programadas</span>
        <strong>{data.classes.filter(item => getEffectiveClassStatus(item) === 'programada').length}</strong>
        <small>Con teacher asignado</small>
      </article>
      <article className="metric-card">
        <span>Pagos vencidos</span>
        <strong>{insights.metrics.overduePayments}</strong>
        <small>Impactan continuidad</small>
      </article>
    </section>
  )

  const renderStudentsTab = () => (
    <section className="admin-tab-grid">
      <article className="panel-card admin-card">
          <div className="admin-section-title">
            <div>
              <h2>Nuevo estudiante</h2>
              <p>Admin crea el registro. El alumno crea su contrasena desde el login.</p>
            </div>
          </div>
        <form className="admin-form-grid" onSubmit={submitStudent}>
          <label className="form-field">
            <span>ID</span>
            <input value={studentForm.publicId} onChange={event => setStudentForm(prev => ({ ...prev, publicId: event.target.value }))} placeholder="0252" required />
          </label>
          <label className="form-field span-2">
            <span>Nombre completo</span>
            <input value={studentForm.fullName} onChange={event => setStudentForm(prev => ({ ...prev, fullName: event.target.value }))} required />
          </label>
          <label className="form-field">
            <span>Correo</span>
            <input type="email" value={studentForm.email} onChange={event => setStudentForm(prev => ({ ...prev, email: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Telefono</span>
            <input value={studentForm.phone} onChange={event => setStudentForm(prev => ({ ...prev, phone: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Nivel actual</span>
            <select value={studentForm.currentLevelId} onChange={event => {
              const levelId = event.target.value
              const firstLesson = getLessonsByLevel(levelId, data.lessons)[0]
              setStudentForm(prev => ({ ...prev, currentLevelId: levelId, currentLessonId: firstLesson?.id || '' }))
            }} required>
              <option value="">Seleccionar nivel</option>
              {academicLevels.map(level => <option value={level.id} key={level.id}>{level.shortName || level.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Leccion actual</span>
            <select value={studentForm.currentLessonId} onChange={event => setStudentForm(prev => ({ ...prev, currentLessonId: event.target.value }))} required>
              <option value="">Seleccionar leccion</option>
              {studentFormLessons.map(lesson => <option value={lesson.id} key={lesson.id}>{lesson.order}. {lesson.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Fecha de inscripcion</span>
            <input type="date" value={studentForm.enrollmentDate} onChange={event => setStudentForm(prev => ({ ...prev, enrollmentDate: event.target.value }))} required />
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Guardar estudiante</button>
        </form>
      </article>

      <div className="admin-two-pane">
        <article className="panel-card admin-card">
          <div className="admin-section-title">
            <div>
              <h2>Estudiantes</h2>
              <p>Click en un estudiante para abrir su perfil.</p>
            </div>
          </div>
          {renderListTools('students', [
            { value: 'name-asc', label: 'Nombre A-Z' },
            { value: 'id-asc', label: 'ID' },
            { value: 'level-asc', label: 'Nivel' }
          ])}
          <div className="record-list">
            {visibleStudents.map(student => (
              <button className={selectedStudentId === student.id ? 'record-button active' : 'record-button'} key={student.id} type="button" onClick={() => setSelectedStudentId(student.id)}>
                <strong>{student.fullName}</strong>
                <span>{student.publicId} - {getLevel(student.currentLevelId, data.levels)?.shortName || 'Sin nivel'}</span>
              </button>
            ))}
            {!visibleStudents.length && <p className="empty-state">No hay estudiantes con ese filtro.</p>}
          </div>
        </article>

        <article className="panel-card admin-card">
          <div className="admin-section-title">
            <div>
              <h2>{selectedStudent ? `Perfil: ${selectedStudent.fullName}` : 'Perfil de estudiante'}</h2>
              <p>Estado de beca, contacto, pagos, avance y clases.</p>
            </div>
            {selectedStudent?.scholarshipEvaluation && (
              <StatusBadge severity={selectedStudent.scholarshipEvaluation.severity}>
                {selectedStudent.scholarshipEvaluation.label}
              </StatusBadge>
            )}
          </div>

          {!selectedStudent && <p className="empty-state">Selecciona un estudiante para ver su perfil.</p>}

          {selectedStudent && (
            <>
              <dl className="compact-facts four-columns">
                <div>
                  <dt>Pago</dt>
                  <dd>{selectedStudent.scholarshipEvaluation.payment.status}</dd>
                </div>
                <div>
                  <dt>Horas semana</dt>
                  <dd>{selectedStudent.scholarshipEvaluation.weekly.hours}/6</dd>
                </div>
                <div>
                  <dt>Faltas sin aviso</dt>
                  <dd>{selectedStudent.scholarshipEvaluation.discipline.unexcusedAbsences}</dd>
                </div>
                <div>
                  <dt>Inscripcion</dt>
                  <dd>{formatDateInputLabel(selectedStudent.enrollmentDate)}</dd>
                </div>
              </dl>

              <div className="form-field section-gap">
                <span>Lecciones registradas</span>
                <details className="dropdown-checklist lesson-history-checklist">
                  <summary>{selectedStudentRegisteredLessons.size} temas registrados para este alumno</summary>
                  <div className="lesson-history-grid">
                    {sortedLevels.map(level => (
                      <div className="lesson-history-group" key={level.id}>
                        <strong>{level.shortName || level.name}</strong>
                        {getLessonsByLevel(level.id, data.lessons).map(lesson => {
                          const checked = selectedStudentRegisteredLessons.has(lesson.id)
                          const lockedByAttendance = selectedStudentAttendedLessons.has(lesson.id)

                          return (
                            <label className="lesson-history-row" key={lesson.id}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={event => toggleStudentCompletedLesson(lesson.id, event.target.checked)}
                                disabled={!isAdmin || lockedByAttendance}
                              />
                              <span>{lesson.order}. {lesson.name}{lockedByAttendance ? ' - asistencia' : ''}</span>
                            </label>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </details>
                <small>Las asistencias marcadas como "Asistio" se registran automaticamente. Admin tambien puede marcar temas manualmente y guardar el perfil.</small>
              </div>

              <div className="section-gap">
                <div className="admin-section-title">
                  <div>
                    <h3>Calificaciones por nivel</h3>
                    <p>Solo admin captura examen oral y escrito de cada nivel.</p>
                  </div>
                </div>
                <div className="excel-scroll">
                  <table className="excel-grid-table grades-admin-table">
                    <thead>
                      <tr>
                        <th>Nivel</th>
                        <th>Oral</th>
                        <th>Escrito</th>
                        <th>Estado</th>
                        <th>Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {academicLevels.map(level => {
                        const key = `${selectedStudent.id}-${level.id}`
                        const draft = gradeDrafts[key] || {}
                        const existingGrade = getGradeForLevel(selectedStudent.id, level.id)
                        const captured = existingGrade?.oral != null || existingGrade?.written != null
                        return (
                          <tr key={level.id}>
                            <td>{level.shortName || level.name}</td>
                            <td>
                              <input
                                className="table-input"
                                type="number"
                                min="0"
                                max="100"
                                value={draft.oral ?? ''}
                                onChange={event => updateGradeDraft(selectedStudent.id, level.id, { oral: event.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                className="table-input"
                                type="number"
                                min="0"
                                max="100"
                                value={draft.written ?? ''}
                                onChange={event => updateGradeDraft(selectedStudent.id, level.id, { written: event.target.value })}
                              />
                            </td>
                            <td>{captured ? 'Capturada' : 'Pendiente'}</td>
                            <td>
                              <div className="table-actions">
                                <button className="btn btn-primary small-btn" type="button" onClick={() => submitGradeForLevel(selectedStudent.id, level.id)} disabled={saving || !isAdmin}>Guardar</button>
                                {captured && <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => deleteGradeForLevel(selectedStudent.id, level.id)} disabled={saving || !isAdmin}>Borrar</button>}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <form className="admin-form-grid profile-form" onSubmit={submitStudentUpdate}>
                <label className="form-field">
                  <span>ID</span>
                  <input value={studentDraft.publicId} onChange={event => setStudentDraft(prev => ({ ...prev, publicId: event.target.value }))} required />
                </label>
                <label className="form-field span-2">
                  <span>Nombre completo</span>
                  <input value={studentDraft.fullName} onChange={event => setStudentDraft(prev => ({ ...prev, fullName: event.target.value }))} required />
                </label>
                <label className="form-field">
                  <span>Correo</span>
                  <input type="email" value={studentDraft.email} onChange={event => setStudentDraft(prev => ({ ...prev, email: event.target.value }))} />
                </label>
                <label className="form-field">
                  <span>Telefono</span>
                  <input value={studentDraft.phone} onChange={event => setStudentDraft(prev => ({ ...prev, phone: event.target.value }))} />
                </label>
                <label className="form-field">
                  <span>Nivel actual</span>
                  <select value={studentDraft.currentLevelId} onChange={event => {
                    const levelId = event.target.value
                    const firstLesson = getLessonsByLevel(levelId, data.lessons)[0]
                    setStudentDraft(prev => ({ ...prev, currentLevelId: levelId, currentLessonId: firstLesson?.id || '' }))
                  }} required>
                    <option value="">Seleccionar nivel</option>
                    {academicLevels.map(level => <option value={level.id} key={level.id}>{level.shortName || level.name}</option>)}
                  </select>
                </label>
                <label className="form-field">
                  <span>Leccion actual</span>
                  <select value={studentDraft.currentLessonId} onChange={event => setStudentDraft(prev => ({ ...prev, currentLessonId: event.target.value }))} required>
                    <option value="">Seleccionar leccion</option>
                    {studentDraftLessons.map(lesson => <option value={lesson.id} key={lesson.id}>{lesson.order}. {lesson.name}</option>)}
                  </select>
                </label>
                <label className="form-field">
                  <span>Fecha de inscripcion</span>
                  <input type="date" value={studentDraft.enrollmentDate} onChange={event => setStudentDraft(prev => ({ ...prev, enrollmentDate: event.target.value }))} required />
                </label>
                <label className="form-field">
                  <span>Estatus</span>
                  <select value={studentDraft.status} onChange={event => setStudentDraft(prev => ({ ...prev, status: event.target.value }))}>
                    <option value="activo">Activo</option>
                    <option value="pausado">Pausado</option>
                    <option value="baja">Baja</option>
                  </select>
                </label>
                <div className="row-actions form-wide-actions">
                  <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Actualizar perfil</button>
                  <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={handleDeleteStudent} disabled={saving || !isAdmin}>Eliminar estudiante</button>
                </div>
              </form>
            </>
          )}
        </article>
      </div>
    </section>
  )

  const renderRolesTab = () => (
    <section className="admin-tab-grid">
      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Asignar roles por correo</h2>
            <p>Un mismo correo puede tener rol Admin y Teacher. El usuario usa una sola contrasena y cambia de panel.</p>
          </div>
        </div>

        <form className="admin-form-grid" onSubmit={submitRoleAssignment}>
          <label className="form-field">
            <span>Nombre</span>
            <input value={roleAssignmentForm.name} onChange={event => setRoleAssignmentForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Nombre de la persona" />
          </label>
          <label className="form-field span-2">
            <span>Correo</span>
            <input type="email" value={roleAssignmentForm.email} onChange={event => setRoleAssignmentForm(prev => ({ ...prev, email: event.target.value }))} placeholder="correo@innova-t.com" required />
          </label>
          {roleAssignmentForm.teacher && (
            <label className="form-field">
              <span>ID Teacher</span>
              <input
                value={roleAssignmentForm.publicId}
                onChange={event => setRoleAssignmentForm(prev => ({ ...prev, publicId: formatTeacherPublicIdInput(event.target.value) }))}
                onBlur={() => setRoleAssignmentForm(prev => ({ ...prev, publicId: normalizeTeacherPublicIdInput(prev.publicId) }))}
                placeholder="T-006"
              />
            </label>
          )}
          <label className="inline-check">
            <input type="checkbox" checked={roleAssignmentForm.admin} onChange={event => setRoleAssignmentForm(prev => ({ ...prev, admin: event.target.checked }))} />
            Admin
          </label>
          <label className="inline-check">
            <input type="checkbox" checked={roleAssignmentForm.teacher} onChange={event => setRoleAssignmentForm(prev => ({ ...prev, teacher: event.target.checked, publicId: event.target.checked ? prev.publicId || nextTeacherPublicId(sortedTeachers) : prev.publicId }))} />
            Teacher
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Guardar roles</button>
        </form>
      </article>

      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Admins</h2>
            <p>Alta y control de administradores. El admin nuevo crea su contrasena desde el login.</p>
          </div>
        </div>

        <form className="admin-form-grid" onSubmit={submitAdmin}>
          <label className="form-field">
            <span>Nombre</span>
            <input value={adminForm.nombre} onChange={event => setAdminForm(prev => ({ ...prev, nombre: event.target.value }))} placeholder="Administrador" required />
          </label>
          <label className="form-field span-2">
            <span>Correo</span>
            <input type="email" value={adminForm.email} onChange={event => setAdminForm(prev => ({ ...prev, email: event.target.value }))} placeholder="admin@innova-t.com" required />
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Agregar admin</button>
        </form>

        <div className="teacher-list section-gap">
          {renderListTools('admins', [
            { value: 'name-asc', label: 'Nombre A-Z' },
            { value: 'email-asc', label: 'Correo' },
            { value: 'status-asc', label: 'Estatus' }
          ])}
          {visibleAdmins.map(admin => {
            const draft = adminDrafts[admin.id] || {}
            const isCurrentAdmin = admin.id === user?.uid || admin.uid === user?.uid
            return (
              <div className="teacher-row" key={admin.id}>
                <input value={draft.nombre || ''} onChange={event => setAdminDrafts(prev => ({ ...prev, [admin.id]: { ...draft, nombre: event.target.value } }))} />
                <input type="email" value={draft.email || ''} onChange={event => setAdminDrafts(prev => ({ ...prev, [admin.id]: { ...draft, email: event.target.value } }))} />
                <select value={draft.status || 'activo'} onChange={event => setAdminDrafts(prev => ({ ...prev, [admin.id]: { ...draft, status: event.target.value } }))}>
                  <option value="activo">Activo</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="suspendido">Suspendido</option>
                </select>
                <span className="table-mini-status">{admin.uid ? 'Con acceso' : 'Sin contrasena'}</span>
                <button className="btn btn-secondary small-btn" type="button" onClick={() => saveAdminDraft(admin)} disabled={saving || !isAdmin}>Guardar</button>
                <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => removeAdmin(admin)} disabled={saving || !isAdmin || isCurrentAdmin}>Eliminar</button>
              </div>
            )
          })}
          {!visibleAdmins.length && <p className="empty-state">No hay admins con ese filtro.</p>}
        </div>
      </article>

      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Teachers</h2>
            <p>Alta rapida y edicion de accesos teacher.</p>
          </div>
        </div>

        <form className="admin-form-grid" onSubmit={submitTeacher}>
          <label className="form-field">
            <span>ID publico</span>
            <input
              value={teacherForm.publicId}
              onChange={event => setTeacherForm(prev => ({ ...prev, publicId: formatTeacherPublicIdInput(event.target.value) }))}
              onBlur={() => setTeacherForm(prev => ({ ...prev, publicId: normalizeTeacherPublicIdInput(prev.publicId) }))}
              placeholder="T-001"
              required
            />
          </label>
          <label className="form-field">
            <span>Nombre</span>
            <input value={teacherForm.name} onChange={event => setTeacherForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Rolando" required />
          </label>
          <label className="form-field">
            <span>Correo</span>
            <input type="email" value={teacherForm.email} onChange={event => setTeacherForm(prev => ({ ...prev, email: event.target.value }))} placeholder="teacher@innova-t.com" />
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Agregar teacher</button>
        </form>

        <div className="teacher-list section-gap">
          {visibleTeachers.map(teacher => {
            const draft = teacherDrafts[teacher.id] || {}
            return (
              <div className="teacher-row" key={teacher.id}>
                <input
                  value={draft.publicId || ''}
                  onChange={event => setTeacherDrafts(prev => ({ ...prev, [teacher.id]: { ...draft, publicId: formatTeacherPublicIdInput(event.target.value) } }))}
                  onBlur={() => setTeacherDrafts(prev => ({ ...prev, [teacher.id]: { ...draft, publicId: normalizeTeacherPublicIdInput(draft.publicId) } }))}
                />
                <input value={draft.name || ''} onChange={event => setTeacherDrafts(prev => ({ ...prev, [teacher.id]: { ...draft, name: event.target.value } }))} />
                <input value={draft.email || ''} onChange={event => setTeacherDrafts(prev => ({ ...prev, [teacher.id]: { ...draft, email: event.target.value } }))} />
                <span className="table-mini-status">
                  {teacher.uid ? 'Con acceso' : adminAccessEmails.has(String(teacher.email || '').toLowerCase()) ? 'Acceso compartido' : 'Sin contrasena'}
                </span>
                <button className="btn btn-secondary small-btn" type="button" onClick={() => updateTeacher(teacher.id, { ...draft, uid: teacher.uid })} disabled={saving || !isAdmin}>Guardar</button>
                <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => deleteTeacher(teacher.id, teacher.publicId)} disabled={saving || !isAdmin}>Eliminar</button>
              </div>
            )
          })}
          {!visibleTeachers.length && <p className="empty-state">No hay teachers registrados.</p>}
        </div>
      </article>

      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Alumnos</h2>
            <p>Vista general de alumnos; abre el perfil para editar datos academicos y pagos.</p>
          </div>
          <button className="btn btn-primary small-btn" type="button" onClick={() => setActiveTab('students')} disabled={!isAdmin}>Nuevo alumno</button>
        </div>
        <div className="excel-scroll">
          <table className="excel-grid-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Nivel</th>
                <th>Acceso</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map(student => (
                <tr key={student.id}>
                  <td>{student.publicId}</td>
                  <td>{student.fullName}</td>
                  <td>{student.email || 'Sin correo'}</td>
                  <td>{getLevel(student.currentLevelId, data.levels)?.shortName || 'Sin nivel'}</td>
                  <td>{student.uid ? 'Con acceso' : 'Sin contrasena'}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-secondary small-btn" type="button" onClick={() => {
                        setSelectedStudentId(student.id)
                        setActiveTab('students')
                      }}>Abrir perfil</button>
                      <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => deleteStudent(student.id, student.publicId)} disabled={saving || !isAdmin}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleStudents.length && (
                <tr>
                  <td colSpan="6">No hay alumnos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )

  const renderTeachersTab = () => (
    <section className="admin-tab-grid">
      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>CRUD Teachers</h2>
            <p>Admin crea ID, nombre y correo. El teacher crea su contrasena desde el login.</p>
          </div>
        </div>

        <form className="admin-form-grid" onSubmit={submitTeacher}>
          <label className="form-field">
            <span>ID publico</span>
            <input
              value={teacherForm.publicId}
              onChange={event => setTeacherForm(prev => ({ ...prev, publicId: formatTeacherPublicIdInput(event.target.value) }))}
              onBlur={() => setTeacherForm(prev => ({ ...prev, publicId: normalizeTeacherPublicIdInput(prev.publicId) }))}
              placeholder="T-001"
              required
            />
          </label>
          <label className="form-field">
            <span>Nombre</span>
            <input value={teacherForm.name} onChange={event => setTeacherForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Rolando" required />
          </label>
          <label className="form-field">
            <span>Correo</span>
            <input type="email" value={teacherForm.email} onChange={event => setTeacherForm(prev => ({ ...prev, email: event.target.value }))} placeholder="teacher@innova-t.com" />
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Agregar teacher</button>
        </form>

        <div className="teacher-list section-gap">
          {renderListTools('teachers', [
            { value: 'name-asc', label: 'Nombre A-Z' },
            { value: 'id-asc', label: 'ID' }
          ])}
          {visibleTeachers.map(teacher => {
            const draft = teacherDrafts[teacher.id] || {}
            return (
              <div className="teacher-row" key={teacher.id}>
                <input
                  value={draft.publicId || ''}
                  onChange={event => setTeacherDrafts(prev => ({ ...prev, [teacher.id]: { ...draft, publicId: formatTeacherPublicIdInput(event.target.value) } }))}
                  onBlur={() => setTeacherDrafts(prev => ({ ...prev, [teacher.id]: { ...draft, publicId: normalizeTeacherPublicIdInput(draft.publicId) } }))}
                />
                <input value={draft.name || ''} onChange={event => setTeacherDrafts(prev => ({ ...prev, [teacher.id]: { ...draft, name: event.target.value } }))} />
                <input value={draft.email || ''} onChange={event => setTeacherDrafts(prev => ({ ...prev, [teacher.id]: { ...draft, email: event.target.value } }))} />
                <button className="btn btn-secondary small-btn" type="button" onClick={() => updateTeacher(teacher.id, { ...draft, uid: teacher.uid })} disabled={saving || !isAdmin}>Guardar</button>
                <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => deleteTeacher(teacher.id, teacher.publicId)} disabled={saving || !isAdmin}>Eliminar</button>
              </div>
            )
          })}
          {!visibleTeachers.length && <p className="empty-state">No hay teachers con ese filtro.</p>}
        </div>
      </article>
    </section>
  )

  const renderPaymentsTab = () => (
    <section className="admin-tab-grid">
      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Nuevo pago</h2>
            <p>Periodos mensuales calculados desde la fecha de inscripcion.</p>
          </div>
        </div>
        <form className="admin-form-grid" onSubmit={submitPayment}>
          <label className="form-field span-2">
            <span>Estudiante</span>
            <select value={paymentForm.studentId} onChange={event => handlePaymentStudentChange(event.target.value)} required>
              <option value="">Seleccionar estudiante</option>
              {sortedStudents.map(student => <option value={student.id} key={student.id}>{student.fullName}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Periodo</span>
            <select value={paymentForm.dueDate} onChange={event => {
              const selected = paymentPeriods.find(period => period.dueDate === event.target.value)
              setPaymentForm(prev => ({ ...prev, dueDate: event.target.value, period: selected?.period || '' }))
            }} required>
              <option value="">Seleccionar periodo</option>
              {paymentPeriods.map(period => <option value={period.dueDate} key={period.dueDate}>{period.label}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Monto</span>
            <input type="number" min="0" value={paymentForm.amount} onChange={event => setPaymentForm(prev => ({ ...prev, amount: event.target.value }))} required />
          </label>
          <label className="form-field">
            <span>Estatus</span>
            <select value={paymentForm.status} onChange={event => setPaymentForm(prev => ({ ...prev, status: event.target.value }))}>
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
            </select>
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Guardar pago</button>
        </form>
      </article>

      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Pagos registrados</h2>
            <p>Tabla tipo Excel por estudiante y mensualidad desde su fecha de inscripcion.</p>
          </div>
        </div>
        <dl className="compact-facts three-columns">
          <div>
            <dt>Ingresos totales</dt>
            <dd>${paymentTotals.total.toLocaleString('es-MX')}</dd>
          </div>
          <div>
            <dt>Ingresos del mes</dt>
            <dd>${paymentTotals.month.toLocaleString('es-MX')}</dd>
          </div>
          <div>
            <dt>Pagos capturados</dt>
            <dd>{paymentTotals.count}</dd>
          </div>
        </dl>

        {renderListTools('payments', [
          { value: 'name-asc', label: 'Nombre A-Z' },
          { value: 'id-asc', label: 'ID' },
          { value: 'overdue-first', label: 'Vencidos primero' }
        ])}

        <div className="excel-scroll section-gap">
          <table className="excel-grid-table payments-ledger-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                {Array.from({ length: PAYMENT_MONTH_COLUMNS }, (_, index) => <th key={index}>Mes {index + 1}</th>)}
              </tr>
            </thead>
            <tbody>
              {visiblePaymentStudents.map(student => {
                const periods = buildEnrollmentPeriods(student)
                return (
                  <tr key={student.id}>
                    <td>{student.publicId}</td>
                    <td>{student.fullName}</td>
                    {periods.map(period => {
                      const payment = paymentsByStudentDueDate.get(getPaymentKey(student.id, period.dueDate))
                      const paid = isPaymentPaid(payment)
                      const overdue = !paid && period.dueDate < todayMexico
                      return (
                        <td className={paid ? 'payment-month paid' : overdue ? 'payment-month overdue' : 'payment-month pending'} key={period.dueDate}>
                          <button className="payment-cell-button" type="button" onClick={() => openPaymentCapture(student, period, payment)}>
                            <span className="payment-check">
                              <input type="checkbox" checked={paid} readOnly />
                            </span>
                            <strong>{paid ? 'Pagado' : overdue ? 'Vencido' : 'Pendiente'}</strong>
                            <small>{period.label}</small>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {!visiblePaymentStudents.length && (
                <tr>
                  <td colSpan={PAYMENT_MONTH_COLUMNS + 2}>No hay estudiantes con ese filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )

  const renderClassModal = () => {
    if (!isClassModalOpen) return null

    return (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-card panel-card admin-card" role="dialog" aria-modal="true" aria-labelledby="class-modal-title">
          <div className="admin-section-title">
            <div>
              <h2 id="class-modal-title">{editingClassId ? 'Formar / editar clase' : 'Crear clase'}</h2>
              <p>Selecciona leccion, teacher, classroom y hasta 8 alumnos.</p>
            </div>
            <div className="row-actions">
              {classLevel && <StatusBadge severity="info">{classLevel.shortName}</StatusBadge>}
              <button className="btn btn-secondary small-btn" type="button" onClick={closeClassModal}>Cerrar</button>
            </div>
          </div>

          <form className="admin-form-grid" onSubmit={submitClass}>
            <label className="form-field span-2">
              <span>Leccion</span>
              <select value={classForm.lessonId} onChange={event => setClassForm(prev => ({ ...prev, lessonId: event.target.value }))} required>
                <option value="">Seleccionar leccion</option>
                {sortedLevels.map(level => (
                  <optgroup label={level.shortName || level.name} key={level.id}>
                    {getLessonsByLevel(level.id, data.lessons).map(lesson => (
                      <option value={lesson.id} key={lesson.id}>{level.shortName || level.name} - {lesson.order}. {lesson.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Teacher</span>
              <select value={classForm.teacherId} onChange={event => setClassForm(prev => ({ ...prev, teacherId: event.target.value }))} required>
                <option value="">Seleccionar teacher</option>
                {sortedTeachers.map(teacher => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>Classroom</span>
              <select value={classForm.classroomId} onChange={event => setClassForm(prev => ({ ...prev, classroomId: event.target.value }))} required>
                <option value="">Seleccionar classroom</option>
                {activeClassrooms.map(classroom => <option value={classroom.id} key={classroom.id}>{classroom.name}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>Fecha</span>
              <input type="date" value={classForm.date} onChange={event => setClassForm(prev => ({ ...prev, date: event.target.value }))} required />
            </label>
            <label className="form-field">
              <span>Hora</span>
              <select value={classForm.time} onChange={event => setClassForm(prev => ({ ...prev, time: event.target.value }))} required>
                {classTimeOptions.map(time => <option value={time} key={time}>{formatTimeLabel(time)}</option>)}
              </select>
            </label>
            <div className="form-field span-2">
              <span>Estudiantes</span>
              <details className="dropdown-checklist" open>
                <summary>{classStudentIds.length}/8 estudiantes seleccionados</summary>
                <div className="attendance-check-grid compact-check-grid">
                  {sortedStudents.map(student => {
                    const checked = classStudentIds.includes(student.id)
                    return (
                      <label className="attendance-check" key={student.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && classStudentIds.length >= 8}
                          onChange={event => toggleClassStudent(student.id, event.target.checked)}
                        />
                        <span>
                          <strong>{student.fullName}</strong>
                          <small>{student.publicId}</small>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </details>
            </div>
            <div className="row-actions form-wide-actions">
              <button className="btn btn-primary small-btn" type="submit" disabled={saving}>{editingClassId ? 'Guardar clase' : 'Crear clase'}</button>
              <button className="btn btn-secondary small-btn" type="button" onClick={closeClassModal}>Cancelar</button>
            </div>
          </form>
        </section>
      </div>
    )
  }

  const renderPaymentCaptureModal = () => {
    if (!paymentCapture) return null

    return (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-card panel-card admin-card payment-capture-modal" role="dialog" aria-modal="true" aria-labelledby="payment-capture-title">
          <div className="admin-section-title">
            <div>
              <h2 id="payment-capture-title">Registrar pago</h2>
              <p>{paymentCapture.publicId} - {paymentCapture.fullName}</p>
            </div>
            <button className="btn btn-secondary small-btn" type="button" onClick={closePaymentCapture}>Cerrar</button>
          </div>

          <form className="admin-form-grid" onSubmit={submitPaymentCapture}>
            <label className="form-field span-2">
              <span>Mensualidad</span>
              <input value={paymentCapture.period} readOnly />
            </label>
            <label className="form-field">
              <span>Monto pagado</span>
              <input
                type="number"
                min="0"
                value={paymentCapture.amount}
                onChange={event => setPaymentCapture(prev => ({ ...prev, amount: event.target.value }))}
                required
              />
            </label>
            <div className="row-actions form-wide-actions">
              <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Aceptar y marcar pagado</button>
              <button className="btn btn-secondary small-btn" type="button" onClick={closePaymentCapture}>Cancelar</button>
            </div>
          </form>
        </section>
      </div>
    )
  }

  const renderProgressPreviewModal = () => {
    if (!progressPreviewStudent) return null

    return (
      <div className="modal-backdrop nested-modal" role="presentation">
        <section className="modal-card panel-card admin-card progress-preview-modal" role="dialog" aria-modal="true" aria-labelledby="progress-preview-title">
          <div className="admin-section-title">
            <div>
              <h2 id="progress-preview-title">Progreso del alumno</h2>
              <p>{progressPreviewStudent.publicId} - {progressPreviewStudent.fullName}</p>
            </div>
            <button className="btn btn-secondary small-btn" type="button" onClick={() => setProgressPreviewStudentId('')}>Cerrar</button>
          </div>
          <div className="lesson-history-grid progress-preview-grid">
            {sortedLevels.map(level => (
              <div className="lesson-history-group" key={level.id}>
                <strong>{level.shortName || level.name}</strong>
                {getLessonsByLevel(level.id, data.lessons).map(lesson => (
                  <label className="lesson-history-row" key={lesson.id}>
                    <input type="checkbox" checked={progressPreviewRegisteredLessons.has(lesson.id)} readOnly />
                    <span>{lesson.order}. {lesson.name}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const renderAiPlanModal = () => {
    if (!isAiPlanModalOpen || !aiPlanGroup) return null

    const maxClasses = getAiPlanMaxClasses(aiPlanGroup)
    const groupStudents = aiPlanGroup.students?.length
      ? aiPlanGroup.students
      : aiPlanGroup.studentIds.map(studentId => sortedStudents.find(student => student.id === studentId)).filter(Boolean)
    const totalStudents = groupStudents.length
    const selectedStudents = new Set(aiPlanDrafts.flatMap(draft => draft.studentIds))
    const selectedCount = selectedStudents.size
    const allStudentsSelected = selectedCount === totalStudents
    const isManualFormation = aiClassPlan?.provider === 'admin-manual'
    const sourceMeta = getPlanSourceMeta(aiClassPlan)

    return (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-card panel-card admin-card ai-plan-modal" role="dialog" aria-modal="true" aria-labelledby="ai-plan-modal-title">
          <div className="admin-section-title">
            <div>
              <h2 id="ai-plan-modal-title">{isManualFormation ? 'Formar clase' : 'Propuesta IA para formar clases'}</h2>
              <p>{formatDateTime(aiPlanGroup.startAt)}. Puedes formar hasta {maxClasses} {maxClasses === 1 ? 'clase' : 'clases'} por los classrooms activos.</p>
            </div>
            <div className="row-actions">
              <StatusBadge severity={sourceMeta.severity}>
                {sourceMeta.label}
              </StatusBadge>
              <button className="btn btn-secondary small-btn" type="button" onClick={requestCloseAiPlanModal}>
                {aiPlanCloseConfirm ? 'Cerrar de todos modos' : 'Cerrar'}
              </button>
            </div>
          </div>

          {aiPlanCloseConfirm && (
            <p className="system-message modal-warning">
              Hay una propuesta sin guardar. Si cierras se descartan los cambios de esta ventana.
            </p>
          )}

          <div className="highlight-panel">
            <div className="admin-section-title">
              <div>
                <h3>Resumen</h3>
                <p>{aiClassPlan?.summary || 'Ajusta la propuesta antes de guardar.'}</p>
                <p className="ai-source-note">{sourceMeta.detail}</p>
              </div>
              <label className="form-field compact-select">
                <span>Clases a formar</span>
                <select value={aiPlanClassCount} onChange={event => setAiDraftClassCount(event.target.value)}>
                  {Array.from({ length: maxClasses }, (_, index) => index + 1).map(count => (
                    <option value={count} key={count}>{count}</option>
                  ))}
                </select>
              </label>
            </div>
            {aiClassPlan?.warnings?.map(warning => <p className="system-message" key={warning}>{warning}</p>)}
          </div>

          <div className="ai-draft-grid section-gap">
            {aiPlanDrafts.map((draft, draftIndex) => {
              const lesson = getLesson(draft.lessonId, data.lessons)

              return (
                <article className="ai-draft-card" key={draft.id}>
                  <div className="admin-section-title">
                    <div>
                      <h3>{draft.title}</h3>
                      <p>{draft.studentIds.length}/8 alumnos - confianza {Math.round((draft.confidence || 0) * 100)}%</p>
                    </div>
                    {lesson && <StatusBadge severity="info">{getLevel(lesson.levelId, data.levels)?.shortName || 'Tema'}</StatusBadge>}
                  </div>

                  <div className="admin-form-grid ai-draft-controls">
                    <label className="form-field span-2">
                      <span>Tema / leccion</span>
                      <select value={draft.lessonId} onChange={event => updateAiPlanDraft(draft.id, { lessonId: event.target.value })} required>
                        <option value="">Seleccionar tema</option>
                        {sortedLevels.map(level => (
                          <optgroup label={level.shortName || level.name} key={level.id}>
                            {getLessonsByLevel(level.id, data.lessons).map(lessonItem => (
                              <option value={lessonItem.id} key={lessonItem.id}>{level.shortName || level.name} - {lessonItem.order}. {lessonItem.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">
                      <span>Teacher</span>
                      <select value={draft.teacherId} onChange={event => updateAiPlanDraft(draft.id, { teacherId: event.target.value })} required>
                        <option value="">Seleccionar teacher</option>
                        {sortedTeachers.map(teacher => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}
                      </select>
                    </label>
                    <label className="form-field">
                      <span>Classroom</span>
                      <select value={draft.classroomId} onChange={event => updateAiPlanDraft(draft.id, { classroomId: event.target.value })} required>
                        <option value="">Seleccionar classroom</option>
                        {activeClassrooms.map(classroom => <option value={classroom.id} key={classroom.id}>{classroom.name}</option>)}
                      </select>
                    </label>
                  </div>

                  <details className="dropdown-checklist ai-student-picker" open>
                    <summary>Alumnos de esta clase</summary>
                    <div className="attendance-check-grid compact-check-grid">
                      {groupStudents.map(student => {
                        const checked = draft.studentIds.includes(student.id)
                        return (
                          <label className="attendance-check" key={`${draft.id}-${student.id}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!checked && draft.studentIds.length >= 8}
                              onChange={event => toggleAiPlanDraftStudent(draft.id, student.id, event.target.checked)}
                            />
                            <span>
                              <strong>{student.publicId} - {student.fullName}</strong>
                              <small>{getLevel(student.currentLevelId, data.levels)?.shortName || 'Sin nivel'}</small>
                            </span>
                            <button
                              className="btn btn-secondary tiny-btn"
                              type="button"
                              onClick={event => {
                                event.preventDefault()
                                event.stopPropagation()
                                setProgressPreviewStudentId(student.id)
                              }}
                            >
                              Ver progreso
                            </button>
                          </label>
                        )
                      })}
                    </div>
                  </details>

                  <p className="ai-draft-reason">{draft.reason || `Clase ${draftIndex + 1} propuesta por IA.`}</p>
                </article>
              )
            })}
          </div>

          <div className="row-actions form-wide-actions">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div>
                <strong>{selectedCount}/{totalStudents}</strong> alumnos seleccionados
                {!allStudentsSelected && (
                  <span style={{ color: '#dc2626', marginLeft: '8px' }}>
                    • Faltan {totalStudents - selectedCount}
                  </span>
                )}
              </div>
              <button className="btn btn-primary" type="button" onClick={submitAiPlanClasses} disabled={saving || !allStudentsSelected}>
                Guardar clases formadas
              </button>
            </div>
            <button className="btn btn-secondary" type="button" onClick={requestCloseAiPlanModal}>
              {aiPlanCloseConfirm ? 'Cerrar sin guardar' : 'Cancelar'}
            </button>
          </div>
        </section>
      </div>
    )
  }

  const renderClassesTab = () => (
    <section className="admin-tab-grid">
      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Reservas por asignar</h2>
            <p>IA propone grupos y tema; Admin asigna teacher y classroom.</p>
          </div>
          <div className="row-actions">
            <StatusBadge severity={pendingAssignmentSlotGroups.length ? 'warning' : 'ok'}>{pendingAssignmentSlotGroups.length} bloques / {filteredPendingAssignmentClasses.length} de {pendingAssignmentClasses.length} reservas</StatusBadge>
          </div>
        </div>
        <div className="table-tools reservation-tools">
          <input
            className="table-input"
            type="date"
            value={reservationFilters.date}
            onChange={event => setReservationFilters(prev => ({ ...prev, date: event.target.value }))}
            list="reservation-filter-dates"
            aria-label="Filtrar reservas por dia"
          />
          <datalist id="reservation-filter-dates">
            {reservationFilterDates.map(date => <option value={date} key={date}>{formatDateInputLabel(date)}</option>)}
          </datalist>
          <select
            className="table-input"
            value={reservationFilters.time}
            onChange={event => setReservationFilters(prev => ({ ...prev, time: event.target.value }))}
            aria-label="Filtrar reservas por hora"
          >
            <option value="">Todas las horas</option>
            {reservationFilterTimes.map(time => <option value={time} key={time}>{formatTimeLabel(time)}</option>)}
          </select>
          <label className="table-inline-field">
            <span>No. de teachers disponibles</span>
            <select
              className="table-input"
              value={activeTeacherLimit}
              onChange={event => setAvailableTeacherSlots(Number(event.target.value) || 1)}
            >
              {Array.from({ length: Math.max(1, sortedTeachers.length || 1) }, (_, index) => index + 1).map(count => (
                <option value={count} key={count}>{count}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary small-btn" type="button" onClick={() => setReservationFilters({ date: '', time: '' })}>
            Limpiar filtros
          </button>
          <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={deleteOldPendingReservations} disabled={saving || !oldPendingAssignmentClasses.length || !isAdmin}>
            Eliminar anteriores ({oldPendingAssignmentClasses.length})
          </button>
        </div>
        <div className="stack-list">
          {pendingAssignmentSlotGroups.map(group => {
            const levels = uniqueValues(group.students.map(student => getLevel(student.currentLevelId, data.levels)?.shortName || 'Sin nivel'))
            return (
              <div className="list-row reservation-block-row" key={group.id}>
                <div>
                  <strong>{formatDateTime(group.startAt)} - clase sugerida</strong>
                  <small>{group.studentIds.length}/8 estudiantes - niveles: {levels.join(', ')} - {group.sourceClassIds.length} reservas fusionables</small>
                  <div className="inline-subrows">
                    {group.students.map(student => (
                      <small key={student.id}>{student.publicId} - {student.fullName} - {getLevel(student.currentLevelId, data.levels)?.shortName || 'Sin nivel'}</small>
                    ))}
                  </div>
                </div>
                <div className="row-actions">
                  <button className="btn btn-secondary small-btn" type="button" onClick={() => requestMistralClassPlan(group)} disabled={aiClassLoading}>
                    {aiClassLoading ? 'Pensando...' : 'Sugerir con IA'}
                  </button>
                  <button className="btn btn-primary small-btn" type="button" onClick={() => applySlotGroup(group)}>
                    Formar una clase
                  </button>
                </div>
              </div>
            )
          })}
          {!pendingAssignmentSlotGroups.length && <p className="empty-state">No hay reservas pendientes por formar.</p>}
        </div>
      </article>

      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Reservas por estudiantes</h2>
            <p>Vista rapida por alumno para validar cuantas horas pidio antes de formar clases.</p>
          </div>
        </div>
        <div className="table-tools reservation-tools">
          <input
            className="table-input"
            type="date"
            value={reservationStudentFilters.date}
            onChange={event => setReservationStudentFilters(prev => ({ ...prev, date: event.target.value }))}
            list="reservation-student-filter-dates"
            aria-label="Filtrar reservas por estudiante por dia"
          />
          <datalist id="reservation-student-filter-dates">
            {reservationStudentFilterDates.map(date => <option value={date} key={date}>{formatDateInputLabel(date)}</option>)}
          </datalist>
          <select
            className="table-input"
            value={reservationStudentFilters.time}
            onChange={event => setReservationStudentFilters(prev => ({ ...prev, time: event.target.value }))}
            aria-label="Filtrar reservas por estudiante por hora"
          >
            <option value="">Todas las horas</option>
            {reservationStudentFilterTimes.map(time => <option value={time} key={time}>{formatTimeLabel(time)}</option>)}
          </select>
          <button className="btn btn-secondary small-btn" type="button" onClick={() => setReservationStudentFilters({ date: '', time: '' })}>
            Limpiar filtros
          </button>
        </div>
        <div className="excel-scroll">
          <table className="excel-grid-table reservation-student-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Dia</th>
                <th>Hora</th>
                <th>Horas reservadas</th>
              </tr>
            </thead>
            <tbody>
              {reservationStudentRows.map(row => (
                <tr key={`${row.studentId}-${row.date}-${row.time}`}>
                  <td>{row.publicId}</td>
                  <td>{row.fullName}</td>
                  <td>{formatDateInputLabel(row.date)}</td>
                  <td>{formatTimeLabel(row.time)}</td>
                  <td>{row.hours} {getHourWord(row.hours)}</td>
                </tr>
              ))}
              {!reservationStudentRows.length && (
                <tr>
                  <td colSpan="5">No hay reservas pendientes por estudiante.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Clases registradas</h2>
            <p>Reservas pendientes, clases formadas por admin y correcciones manuales.</p>
          </div>
        </div>
        {renderListTools('classes', [
          { value: 'date-asc', label: 'Fecha proxima' },
          { value: 'date-desc', label: 'Fecha reciente' },
          { value: 'teacher-asc', label: 'Teacher' }
        ])}
        <div className="table-tools reservation-tools">
          <input
            className="table-input"
            type="date"
            value={classRegistryFilters.date}
            onChange={event => setClassRegistryFilters(prev => ({ ...prev, date: event.target.value }))}
            list="class-registry-filter-dates"
            aria-label="Filtrar clases registradas por dia"
          />
          <datalist id="class-registry-filter-dates">
            {classRegistryFilterDates.map(date => <option value={date} key={date}>{formatDateInputLabel(date)}</option>)}
          </datalist>
          <select
            className="table-input"
            value={classRegistryFilters.time}
            onChange={event => setClassRegistryFilters(prev => ({ ...prev, time: event.target.value }))}
            aria-label="Filtrar clases registradas por hora"
          >
            <option value="">Todas las horas</option>
            {classRegistryFilterTimes.map(time => <option value={time} key={time}>{formatTimeLabel(time)}</option>)}
          </select>
          <button className="btn btn-secondary small-btn" type="button" onClick={() => setClassRegistryFilters({ date: '', time: '' })}>
            Limpiar dia/hora
          </button>
        </div>
        <div className="stack-list">
          {visibleClassesByRecentDate.map(classItem => {
            const lesson = getLesson(classItem.lessonIds?.[0], data.lessons)
            const level = getLevel(classItem.levelId || lesson?.levelId, data.levels)
            return (
              <div className="list-row" key={classItem.id}>
                <div>
                  <strong>{level?.shortName || 'Nivel'} - {lesson?.name || 'Sin leccion'}</strong>
                  <small>{formatDateTime(classItem.startAt)} - {formatClassHours(classItem)} - {classItem.teacherName || 'Sin teacher'} - {classItem.classroomName || classItem.room || 'Sin classroom'} - {classItem.studentIds?.length || 0}/8 estudiantes - {classItem.reservationSource || 'manual'}</small>
                </div>
                <div className="row-actions">
                  <StatusBadge severity={getEffectiveClassStatus(classItem) === 'pendiente_asignacion' ? 'warning' : getEffectiveClassStatus(classItem) === 'cancelada' ? 'risk' : getEffectiveClassStatus(classItem) === 'completada' ? 'ok' : 'info'}>{getEffectiveClassStatus(classItem)}</StatusBadge>
                  <button className="btn btn-secondary small-btn" type="button" onClick={() => editClass(classItem)}>Editar</button>
                  <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => deleteClass(classItem.id)} disabled={saving}>Eliminar</button>
                </div>
              </div>
            )
          })}
          {!visibleClassesByRecentDate.length && <p className="empty-state">No hay clases con ese filtro.</p>}
        </div>
      </article>

      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Classrooms</h2>
            <p>Salones disponibles para que admin los asigne a clases formadas.</p>
          </div>
          <button className="btn btn-secondary small-btn" type="button" onClick={seedClassrooms} disabled={saving || !isAdmin}>Crear 3 base</button>
        </div>

        <form className="admin-form-grid" onSubmit={submitClassroom}>
          <label className="form-field span-2">
            <span>Nombre</span>
            <input value={classroomForm.name} onChange={event => setClassroomForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Classroom 1" required />
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving}>Agregar classroom</button>
        </form>

        <div className="teacher-list section-gap">
          {sortedClassrooms.map(classroom => {
            const draft = classroomDrafts[classroom.id] || {}
            return (
              <div className="teacher-row classroom-row" key={classroom.id}>
                <input value={draft.name || ''} onChange={event => setClassroomDrafts(prev => ({ ...prev, [classroom.id]: { ...draft, name: event.target.value } }))} />
                <label className="inline-check">
                  <input type="checkbox" checked={draft.active !== false} onChange={event => setClassroomDrafts(prev => ({ ...prev, [classroom.id]: { ...draft, active: event.target.checked } }))} />
                  <span>Activo</span>
                </label>
                <button className="btn btn-secondary small-btn" type="button" onClick={() => updateClassroom(classroom.id, draft)} disabled={saving}>Guardar</button>
                <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => deleteClassroom(classroom.id)} disabled={saving || !isAdmin}>Eliminar</button>
              </div>
            )
          })}
          {!sortedClassrooms.length && <p className="empty-state">Aun no hay classrooms. Usa Crear 3 base o agrega uno.</p>}
        </div>
      </article>

      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Bloquear horarios</h2>
            <p>Cierra un dia completo o una hora por vacaciones, juntas o mantenimiento.</p>
          </div>
        </div>
        <form className="admin-form-grid" onSubmit={submitBlockout}>
          <label className="form-field">
            <span>Fecha</span>
            <input type="date" value={blockoutForm.date} onChange={event => setBlockoutForm(prev => ({ ...prev, date: event.target.value }))} required />
          </label>
          <label className="form-field">
            <span>Tipo</span>
            <select value={blockoutForm.allDay ? 'day' : 'hour'} onChange={event => setBlockoutForm(prev => ({ ...prev, allDay: event.target.value === 'day', time: event.target.value === 'day' ? '' : prev.time }))}>
              <option value="day">Dia completo</option>
              <option value="hour">Hora especifica</option>
            </select>
          </label>
          {!blockoutForm.allDay && (
            <label className="form-field">
              <span>Hora</span>
              <select value={blockoutForm.time} onChange={event => setBlockoutForm(prev => ({ ...prev, time: event.target.value }))} required>
                <option value="">Seleccionar hora</option>
                {blockoutTimeOptions.map(time => <option value={time} key={time}>{formatTimeLabel(time)}</option>)}
              </select>
            </label>
          )}
          <label className="form-field span-2">
            <span>Motivo</span>
            <input value={blockoutForm.reason} onChange={event => setBlockoutForm(prev => ({ ...prev, reason: event.target.value }))} placeholder="Vacaciones, junta, evento..." />
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Guardar bloqueo</button>
        </form>
        <div className="stack-list section-gap">
          {sortedBlockouts.map(blockout => (
            <div className="list-row" key={blockout.id}>
              <div>
                <strong>{formatDateInputLabel(blockout.date)} - {blockout.allDay ? 'Dia completo' : formatTimeLabel(blockout.time)}</strong>
                <small>{blockout.reason || 'Sin motivo'}</small>
              </div>
              <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => deleteBlockout(blockout.id)} disabled={saving || !isAdmin}>Eliminar</button>
            </div>
          ))}
          {!sortedBlockouts.length && <p className="empty-state">No hay horarios bloqueados.</p>}
        </div>
      </article>
    </section>
  )

  const renderAiUsageTab = () => (
    <section className="admin-tab-grid">
      <article className="panel-card admin-card ai-usage-card">
        <div className="admin-section-title">
          <div>
            <h2>Uso de IA</h2>
            <p>Conteo mensual de sugerencias generadas desde este sistema.</p>
          </div>
          <StatusBadge severity={aiUsagePercent >= 90 ? 'risk' : aiUsagePercent >= 70 ? 'warning' : 'ok'}>
            {aiUsageTotal}/{MISTRAL_MONTHLY_LIMIT}
          </StatusBadge>
        </div>
        <div className="ai-usage-meter" aria-label="Uso mensual de IA">
          <div className="ai-usage-meter-fill" style={{ width: `${aiUsagePercent}%` }} />
        </div>
        <dl className="compact-facts four-columns ai-usage-facts">
          <div>
            <dt>Mes</dt>
            <dd>{currentAiUsage.month || getCurrentMonthId()}</dd>
          </div>
          <div>
            <dt>IA respondio</dt>
            <dd>{Number(currentAiUsage.aiResponses || 0)}</dd>
          </div>
          <div>
            <dt>Deteccion local</dt>
            <dd>{Number(currentAiUsage.fallbacks || 0) + Number(currentAiUsage.localDetections || 0)}</dd>
          </div>
          <div>
            <dt>Ultimo origen</dt>
            <dd>{getPlanSourceMeta({ provider: currentAiUsage.lastProvider || 'local-rules', model: currentAiUsage.lastModel || '' }).label}</dd>
          </div>
        </dl>
        <p className="ai-source-note">
          Si el asistente no responde, el sistema sigue trabajando con reglas academicas y lo marca como deteccion local.
        </p>
      </article>

      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Ultima actividad</h2>
            <p>Diagnostico simple para saber si la sugerencia vino del asistente o del acomodo local.</p>
          </div>
        </div>
        <dl className="compact-facts two-columns">
          <div>
            <dt>Origen</dt>
            <dd>{getPlanSourceMeta({ provider: currentAiUsage.lastProvider || 'local-rules', model: currentAiUsage.lastModel || '' }).label}</dd>
          </div>
          <div>
            <dt>Modelo</dt>
            <dd>{currentAiUsage.lastModel || 'No registrado'}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{currentAiUsage.lastStatus || 'Sin actividad'}</dd>
          </div>
          <div>
            <dt>Fallos del mes</dt>
            <dd>{Number(currentAiUsage.errors || 0)}</dd>
          </div>
        </dl>
        {currentAiUsage.lastMessage && (
          <p className="system-message section-gap">{currentAiUsage.lastMessage}</p>
        )}
      </article>
    </section>
  )

  const renderAttendanceTab = () => (
    <section className="panel-card admin-card">
      <div className="admin-section-title">
        <div>
          <h2>Asistencias</h2>
          <p>Tabla tipo Excel ordenada por alumno. El teacher pasa lista; admin corrige si hace falta.</p>
        </div>
      </div>
      {renderListTools('attendance', [
        { value: 'name-asc', label: 'Alumno A-Z' },
        { value: 'date-desc', label: 'Fecha reciente' },
        { value: 'missed-first', label: 'Faltas primero' }
      ])}

      <table className="excel-grid-table">
        <thead>
          <tr>
            <th>Alumno</th>
            <th>ID</th>
            <th>Fecha</th>
            <th>Clase</th>
            <th>Teacher</th>
            <th>Resultado</th>
            <th>Horas</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>
          {visibleAttendanceRows.map(record => (
            <tr key={record.id}>
              <td>{record.studentName}</td>
              <td>{record.publicId}</td>
              <td>{formatDateTime(record.startAt)}</td>
              <td>{record.className || '-'}</td>
              <td>{record.teacherName || '-'}</td>
              <td>{record.attended ? 'Asistio' : 'Falto'}</td>
              <td>{record.hoursCredited || 0}</td>
              <td>
                <div className="table-actions">
                  <button className="btn btn-secondary small-btn" type="button" onClick={() => markAttendance(record.id, true)}>Asistio</button>
                  <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => markAttendance(record.id, false)}>Falto</button>
                </div>
              </td>
            </tr>
          ))}
          {!visibleAttendanceRows.length && (
            <tr>
              <td colSpan="8">No hay asistencias con ese filtro.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )

  const renderCatalogTab = () => (
    <section className="admin-tab-grid">
      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Niveles</h2>
            <p>Administra estructura academica del instituto.</p>
          </div>
          <button className="btn btn-secondary small-btn" type="button" onClick={seedAcademicCatalog} disabled={saving || !isAdmin}>Inicializar catalogo</button>
        </div>
        <form className="admin-form-grid" onSubmit={submitLevel}>
          <label className="form-field">
            <span>ID opcional</span>
            <input value={levelForm.id} onChange={event => setLevelForm(prev => ({ ...prev, id: event.target.value }))} placeholder="level-6" />
          </label>
          <label className="form-field">
            <span>Orden</span>
            <input type="number" value={levelForm.order} onChange={event => setLevelForm(prev => ({ ...prev, order: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Nombre</span>
            <input value={levelForm.name} onChange={event => setLevelForm(prev => ({ ...prev, name: event.target.value }))} required />
          </label>
          <label className="form-field">
            <span>Nombre corto</span>
            <input value={levelForm.shortName} onChange={event => setLevelForm(prev => ({ ...prev, shortName: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Meses</span>
            <input type="number" min="1" value={levelForm.durationMonths} onChange={event => setLevelForm(prev => ({ ...prev, durationMonths: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Lecciones meta</span>
            <input type="number" min="0" value={levelForm.targetLessons} onChange={event => setLevelForm(prev => ({ ...prev, targetLessons: event.target.value }))} />
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Guardar nivel</button>
        </form>
        <div className="stack-list section-gap">
          {sortedLevels.map(level => {
            const draft = levelDrafts[level.id] || {}
            return (
              <div className="catalog-row" key={level.id}>
                <input value={draft.order ?? 0} type="number" onChange={event => setLevelDrafts(prev => ({ ...prev, [level.id]: { ...draft, order: event.target.value } }))} />
                <input value={draft.name || ''} onChange={event => setLevelDrafts(prev => ({ ...prev, [level.id]: { ...draft, name: event.target.value } }))} />
                <input value={draft.shortName || ''} onChange={event => setLevelDrafts(prev => ({ ...prev, [level.id]: { ...draft, shortName: event.target.value } }))} />
                <button className="btn btn-secondary small-btn" type="button" onClick={() => updateLevel(level.id, draft)} disabled={saving || !isAdmin}>Guardar</button>
                <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => deleteLevel(level.id)} disabled={saving || !isAdmin}>Eliminar</button>
              </div>
            )
          })}
        </div>
      </article>

      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Lecciones / temas</h2>
            <p>Las reservas automaticas usan estas lecciones para detectar nivel y clase siguiente.</p>
          </div>
        </div>
        {renderListTools('catalog', [
          { value: 'level-asc', label: 'Nivel y orden' },
          { value: 'name-asc', label: 'Nombre A-Z' }
        ])}
        <form className="admin-form-grid" onSubmit={submitLesson}>
          <label className="form-field">
            <span>ID opcional</span>
            <input value={lessonForm.id} onChange={event => setLessonForm(prev => ({ ...prev, id: event.target.value }))} />
          </label>
          <label className="form-field">
            <span>Nivel</span>
            <select value={lessonForm.levelId} onChange={event => setLessonForm(prev => ({ ...prev, levelId: event.target.value }))} required>
              <option value="">Seleccionar nivel</option>
              {sortedLevels.map(level => <option value={level.id} key={level.id}>{level.shortName || level.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Orden</span>
            <input type="number" min="1" value={lessonForm.order} onChange={event => setLessonForm(prev => ({ ...prev, order: event.target.value }))} />
          </label>
          <label className="form-field span-2">
            <span>Nombre</span>
            <input value={lessonForm.name} onChange={event => setLessonForm(prev => ({ ...prev, name: event.target.value }))} required />
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Guardar leccion</button>
        </form>
        <div className="stack-list section-gap">
          {visibleSortedLessons.map(lesson => {
            const draft = lessonDrafts[lesson.id] || {}
            return (
              <div className="catalog-row lesson-row" key={lesson.id}>
                <select value={draft.levelId || ''} onChange={event => setLessonDrafts(prev => ({ ...prev, [lesson.id]: { ...draft, levelId: event.target.value } }))}>
                  {sortedLevels.map(level => <option value={level.id} key={level.id}>{level.shortName || level.name}</option>)}
                </select>
                <input value={draft.order ?? 1} type="number" onChange={event => setLessonDrafts(prev => ({ ...prev, [lesson.id]: { ...draft, order: event.target.value } }))} />
                <input value={draft.name || ''} onChange={event => setLessonDrafts(prev => ({ ...prev, [lesson.id]: { ...draft, name: event.target.value } }))} />
                <input value={draft.estimatedHours ?? 1} type="number" step="0.5" onChange={event => setLessonDrafts(prev => ({ ...prev, [lesson.id]: { ...draft, estimatedHours: event.target.value } }))} />
                <button className="btn btn-secondary small-btn" type="button" onClick={() => updateLesson(lesson.id, draft)} disabled={saving || !isAdmin}>Guardar</button>
                <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => deleteLesson(lesson.id)} disabled={saving || !isAdmin}>Eliminar</button>
              </div>
            )
          })}
          {!visibleSortedLessons.length && <p className="empty-state">No hay lecciones con ese filtro.</p>}
        </div>
      </article>
    </section>
  )

  const renderActiveTab = () => {
    if (activeTab === 'students') return renderStudentsTab()
    if (activeTab === 'roles') return renderRolesTab()
    if (activeTab === 'teachers') return renderTeachersTab()
    if (activeTab === 'payments') return renderPaymentsTab()
    if (activeTab === 'classes') return renderClassesTab()
    if (activeTab === 'attendance') return renderAttendanceTab()
    if (activeTab === 'ai-usage') return renderAiUsageTab()
    return renderCatalogTab()
  }

  return (
    <div className="dashboard-body admin-system excel-system">
      <div className="dashboard-shell">
        <aside className="sidebar admin-sidebar">
          <BrandLogo panel="Admin System" />

          <button
            className="hamburger-menu-button"
            type="button"
            onClick={() => setIsMobileMenuOpen(open => !open)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="admin-tabs-menu"
          >
            {uiText.menu}
          </button>

          <nav id="admin-tabs-menu" className={isMobileMenuOpen ? 'sidebar-nav admin-tabs-nav open' : 'sidebar-nav admin-tabs-nav'}>
            {TABS.map(tab => (
              <button className={activeTab === tab.id ? 'active' : ''} key={tab.id} type="button" onClick={() => {
                setActiveTab(tab.id)
                setIsMobileMenuOpen(false)
              }}>
                {uiLanguage === 'en' ? tab.labelEn : tab.label}
              </button>
            ))}
          </nav>

          <div className="sidebar-card compact">
            <span className="kicker">Sistema</span>
            <strong>{profile?.nombre || profile?.email || 'Sin sesion'}</strong>
            <small>Reservas sin teacher; Admin forma grupos y asigna profesor.</small>
          </div>
        </aside>

        <main className="dashboard-main admin-main">
          <header className="dashboard-header admin-header">
            <div>
              <span className="eyebrow">Operacion academica</span>
              <h1>Panel administrativo</h1>
              <p className="page-subtitle">
                Semana {insights.weekKey}. Admin controla datos; alumnos reservan y teachers pasan lista.
              </p>
            </div>
            <div className="header-actions">
              <SystemControls />
              <Link className="btn btn-primary" to="/show-time" target="_blank" rel="noreferrer">Show time</Link>
              {hasTeacherPanelAccess && (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={switchToTeacherPanel}
                >
                  {uiText.switchTeacher}
                </button>
              )}
              <Link className="btn btn-secondary" to="/login">{uiText.logout}</Link>
            </div>
          </header>

          {authError && <p className="system-message">{authError}</p>}
          {loading && <p className="system-message">Cargando datos del instituto...</p>}

          {requireLogin && (
            <section className="panel-card admin-card">
              <h2>Necesitas iniciar sesion</h2>
              <p>Entra con un usuario autorizado para abrir el panel administrativo.</p>
              <Link className="btn btn-primary" to="/login">Ir al login</Link>
            </section>
          )}

          {!requireLogin && !isAdmin && (
            <section className="panel-card admin-card">
              <h2>Acceso administrativo requerido</h2>
              <p>Tu usuario necesita rol admin en usuarios/{profile?.uid}. Teachers usan su propio panel.</p>
            </section>
          )}

          {!requireLogin && isAdmin && (
            <>
              {renderMetrics()}
              <section className="admin-active-panel">
                {renderActiveTab()}
              </section>
              {renderClassModal()}
              {renderPaymentCaptureModal()}
              {renderAiPlanModal()}
              {renderProgressPreviewModal()}
              <ActionMessageModal message={message} onClose={() => setMessage('')} />
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default AdminDashboard
