import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ActionMessageModal from '../components/ActionMessageModal'
import BrandLogo from '../components/BrandLogo'
import StatusBadge from '../components/StatusBadge'
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
import { useInstituteData } from '../services/useInstituteData'

const TABS = [
  { id: 'students', label: 'ESTUDIANTES' },
  { id: 'teachers', label: 'TEACHERS' },
  { id: 'payments', label: 'PAGOS' },
  { id: 'classes', label: 'CLASES' },
  { id: 'attendance', label: 'ASISTENCIAS' },
  { id: 'catalog', label: 'LECCIONES' }
]

const DEFAULT_STUDENT_LEVEL_ID = 'pre-starter'
const DEFAULT_STUDENT_LESSON_ID = 'L1'
const PAYMENT_MONTH_COLUMNS = 12

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

function getRegisteredLessonIdsForStudent(studentId, classes = [], attendance = [], students = []) {
  const student = students.find(item => item.id === studentId)
  const lessonIds = new Set(Array.isArray(student?.completedLessonIds) ? student.completedLessonIds : [])
  const attendedClassIds = new Set(
    attendance
      .filter(record => record.studentId === studentId && record.attended === true)
      .map(record => record.classId)
  )

  classes.forEach(classItem => {
    if ((classItem.status || 'programada') === 'cancelada') return
    if (!classItem.studentIds?.includes(studentId) && !attendedClassIds.has(classItem.id)) return
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

function splitStudentIdsByLevelProximity(studentIds = [], students = [], levels = [], classCount = 1) {
  const studentsById = new Map(students.map(student => [student.id, student]))
  const cleanStudentIds = uniqueValues(studentIds)
  const count = Math.max(1, Math.min(Number(classCount) || 1, cleanStudentIds.length || 1))
  const orderedStudentIds = [...cleanStudentIds].sort((a, b) => {
    const studentA = studentsById.get(a)
    const studentB = studentsById.get(b)
    return getLevelOrderForStudent(studentA, levels) - getLevelOrderForStudent(studentB, levels)
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
  const levelDistance = getStudentGroupLevelDistance(studentIds, students, levels)
  const freeTopicLesson = lessons.find(lesson => isFreeTopicLevelId(lesson.levelId))

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
    .find(Boolean)

  return lessons.find(lesson => lesson.id === currentLessonId && !isFreeTopicLevelId(lesson.levelId))?.id
    || lessons.find(lesson => getCanonicalLevelId(lesson.levelId) === preferredLevelId && !isFreeTopicLevelId(lesson.levelId))?.id
    || lessons.find(lesson => !isFreeTopicLevelId(lesson.levelId))?.id
    || ''
}

function getHourWord(hours) {
  return Number(hours) === 1 ? 'hora' : 'horas'
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
    progressPercent: 0
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
    progressPercent: Number(student?.progressPercent || 0)
  }
}

function AdminDashboard() {
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
    createStudent,
    createTeacher,
    deleteClass,
    deleteBlockout,
    deleteClassroom,
    deleteLesson,
    deleteLevel,
    deleteStudent,
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
    saveGrade,
    deleteGrade,
    updateStudent,
    updateTeacher
  } = useInstituteData()

  const todayMexico = useMemo(() => getMexicoDateInput(), [])
  const [activeTab, setActiveTab] = useState('students')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentForm, setStudentForm] = useState(() => emptyStudentForm(todayMexico))
  const [studentDraft, setStudentDraft] = useState(() => emptyStudentForm(todayMexico))
  const [teacherForm, setTeacherForm] = useState({ publicId: '', name: '', email: '' })
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
    payments: { search: '', order: 'name-asc' },
    classes: { search: '', order: 'date-asc' },
    attendance: { search: '', order: 'name-asc' },
    catalog: { search: '', order: 'level-asc' }
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
  const requireLogin = !loading && (!user || !profile)
  const sortedStudents = useMemo(() => sortByName(data.students), [data.students])
  const sortedTeachers = useMemo(() => sortByName(data.teachers), [data.teachers])
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
  const pendingAssignmentSlotGroups = useMemo(() => (
    buildPendingSlotGroups(pendingAssignmentClasses, sortedStudents)
  ), [pendingAssignmentClasses, sortedStudents])
  const reservationStudentRows = useMemo(() => (
    buildReservationStudentRows(pendingAssignmentClasses, sortedStudents)
  ), [pendingAssignmentClasses, sortedStudents])
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
    getRegisteredLessonIdsForStudent(selectedStudentId, data.classes, data.attendance, data.students)
  ), [data.attendance, data.classes, data.students, selectedStudentId])
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
  ), [classesByRecentDate, data.lessons, listFilters.classes])
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
    if (teacherForm.publicId) return
    setTeacherForm(prev => ({ ...prev, publicId: nextTeacherPublicId(sortedTeachers) }))
  }, [sortedTeachers, teacherForm.publicId])

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

  const submitTeacher = async (event) => {
    event.preventDefault()
    if (!teacherForm.name.trim()) return
    await createTeacher(teacherForm)
    setTeacherForm({ publicId: nextTeacherPublicId(sortedTeachers), name: '', email: '' })
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
    const studentLimit = slotGroup?.studentIds?.length || 1
    return Math.max(1, Math.min(classroomLimit, studentLimit))
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
    const chunks = splitStudentIdsByLevelProximity(slotGroup.studentIds, sortedStudents, data.levels, classCount)
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

      return {
        id: previous.id || `${slotGroup.id}-draft-${index + 1}`,
        title: `Clase ${index + 1}`,
        classId,
        sourceClassIds,
        lessonId: previous.lessonId || (shouldIgnoreFreeTopic ? '' : suggestion.lessonId) || defaultLessonId,
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
    setAiPlanDrafts(prev => buildAiPlanDrafts(aiPlanGroup, aiClassPlan?.suggestions || [], count, prev))
  }

  const updateAiPlanDraft = (draftId, patch) => {
    setAiPlanDrafts(prev => prev.map(draft => (
      draft.id === draftId ? { ...draft, ...patch } : draft
    )))
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

    const duplicatedClassrooms = drafts
      .map(draft => draft.classroomId)
      .filter((classroomId, index, list) => classroomId && list.indexOf(classroomId) !== index)
    if (duplicatedClassrooms.length) {
      setMessage('No repitas classroom en clases del mismo horario.')
      return
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
        targetSlot
      })
      const nextPlan = {
        ...plan,
        groupId: slotGroup.id,
        groupLabel: `${formatDateTime(slotGroup.startAt)} - ${slotGroup.studentIds.length}/8 estudiantes`
      }
      const initialClassCount = Math.max(1, Math.min(
        getAiPlanMaxClasses(slotGroup),
        plan.suggestions?.length || 1
      ))

      setAiClassPlan(nextPlan)
      setAiPlanGroup(slotGroup)
      setAiPlanClassCount(initialClassCount)
      setAiPlanDrafts(buildAiPlanDrafts(slotGroup, plan.suggestions || [], initialClassCount))
      setAiPlanCloseConfirm(false)
      setIsAiPlanModalOpen(true)
      setMessage(plan.provider === 'mistral-ai'
        ? `La IA sugirio ${plan.suggestions.length} acomodo(s) para ${formatDateTime(slotGroup.startAt)}.`
        : `Se genero acomodo local: ${plan.summary}`)
    } catch (error) {
      setMessage(error.message || 'No se pudo generar la sugerencia.')
    } finally {
      setAiClassLoading(false)
    }
  }

  const applySlotGroup = (slotGroup) => {
    const classItem = data.classes.find(item => item.id === slotGroup.sourceClassIds[0])
    if (!classItem) return

    editClass(classItem, {
      lessonId: classItem.lessonIds?.[0] || '',
      teacherId: '',
      status: 'pendiente_asignacion',
      sourceClassIds: slotGroup.sourceClassIds,
      studentIds: slotGroup.studentIds
    })
    setMessage('Grupo por horario cargado. Elige leccion, asigna teacher, classroom y guarda una sola clase.')
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
                        {getLessonsByLevel(level.id, data.lessons).map(lesson => (
                          <label className="lesson-history-row" key={lesson.id}>
                            <input type="checkbox" checked={selectedStudentRegisteredLessons.has(lesson.id)} readOnly />
                            <span>{lesson.order}. {lesson.name}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
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

  const renderTeachersTab = () => (
    <section className="admin-tab-grid">
      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>CRUD Teachers</h2>
            <p>Admin crea ID, nombre y correo. El teacher crea su contrasena desde el login.</p>
          </div>
          <button className="btn btn-secondary small-btn" type="button" onClick={seedTeachers} disabled={saving || !isAdmin}>Crear 5 base</button>
        </div>

        <form className="admin-form-grid" onSubmit={submitTeacher}>
          <label className="form-field">
            <span>ID publico</span>
            <input value={teacherForm.publicId} onChange={event => setTeacherForm(prev => ({ ...prev, publicId: event.target.value.toUpperCase() }))} placeholder="T-001" required />
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
                <input value={draft.publicId || ''} onChange={event => setTeacherDrafts(prev => ({ ...prev, [teacher.id]: { ...draft, publicId: event.target.value.toUpperCase() } }))} />
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

  const renderAiPlanModal = () => {
    if (!isAiPlanModalOpen || !aiPlanGroup) return null

    const maxClasses = getAiPlanMaxClasses(aiPlanGroup)
    const groupStudents = aiPlanGroup.students?.length
      ? aiPlanGroup.students
      : aiPlanGroup.studentIds.map(studentId => sortedStudents.find(student => student.id === studentId)).filter(Boolean)

    return (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-card panel-card admin-card ai-plan-modal" role="dialog" aria-modal="true" aria-labelledby="ai-plan-modal-title">
          <div className="admin-section-title">
            <div>
              <h2 id="ai-plan-modal-title">Propuesta IA para formar clases</h2>
              <p>{formatDateTime(aiPlanGroup.startAt)}. Puedes formar hasta {maxClasses} {maxClasses === 1 ? 'clase' : 'clases'} por los classrooms activos.</p>
            </div>
            <div className="row-actions">
              <StatusBadge severity={aiClassPlan?.provider === 'mistral-ai' || aiClassPlan?.provider === 'firebase-ai-logic' ? 'ok' : 'warning'}>
                Asistente academico
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
            <button className="btn btn-primary" type="button" onClick={submitAiPlanClasses} disabled={saving}>
              Guardar clases formadas
            </button>
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
            <StatusBadge severity={pendingAssignmentSlotGroups.length ? 'warning' : 'ok'}>{pendingAssignmentSlotGroups.length} bloques / {pendingAssignmentClasses.length} reservas</StatusBadge>
          </div>
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
        <div className="excel-scroll">
          <table className="excel-grid-table reservation-student-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Horas reservadas</th>
              </tr>
            </thead>
            <tbody>
              {reservationStudentRows.map(row => (
                <tr key={`${row.studentId}-${row.date}-${row.time}`}>
                  <td>{row.publicId}</td>
                  <td>{row.fullName}</td>
                  <td>{row.hours} {getHourWord(row.hours)}</td>
                </tr>
              ))}
              {!reservationStudentRows.length && (
                <tr>
                  <td colSpan="3">No hay reservas pendientes por estudiante.</td>
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
    if (activeTab === 'teachers') return renderTeachersTab()
    if (activeTab === 'payments') return renderPaymentsTab()
    if (activeTab === 'classes') return renderClassesTab()
    if (activeTab === 'attendance') return renderAttendanceTab()
    return renderCatalogTab()
  }

  return (
    <div className="dashboard-body admin-system excel-system">
      <div className="dashboard-shell">
        <aside className="sidebar admin-sidebar">
          <BrandLogo panel="Admin System" />

          <nav className="sidebar-nav admin-tabs-nav">
            {TABS.map(tab => (
              <button className={activeTab === tab.id ? 'active' : ''} key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}>
                {tab.label}
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
              <Link className="btn btn-primary" to="/show-time" target="_blank" rel="noreferrer">Show time</Link>
              <Link className="btn btn-secondary" to="/student-dashboard">Vista estudiante</Link>
              <Link className="btn btn-secondary" to="/teacher-dashboard">Vista teacher</Link>
              <Link className="btn btn-secondary" to="/login">Cerrar sesion</Link>
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
              <ActionMessageModal message={message} onClose={() => setMessage('')} />
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default AdminDashboard
