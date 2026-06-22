import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ProgressBar from '../components/ProgressBar'
import StatusBadge from '../components/StatusBadge'
import { getLesson, getLessonsByLevel, getLevel } from '../domain/academicCatalog'
import { formatDateTime, toDate } from '../domain/dateUtils'
import {
  buildClassSlotKey,
  buildMexicoDateTimeIso,
  formatDateInputLabel,
  getClassDateValue,
  getClassTimeValue,
  getMexicoDateInput,
  getScheduleHoursForDate
} from '../domain/scheduleMatcher'
import { createAuthUser } from '../services/authProvisioning'
import { useInstituteData } from '../services/useInstituteData'

const TABS = [
  { id: 'students', label: 'CRUD Estudiantes' },
  { id: 'teachers', label: 'CRUD Teachers' },
  { id: 'payments', label: 'Pagos' },
  { id: 'classes', label: 'Clases' },
  { id: 'attendance', label: 'Asistencias' },
  { id: 'catalog', label: 'Lecciones/Niveles' }
]

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

function sortByName(items = []) {
  return [...items].sort((a, b) => (a.fullName || a.name || '').localeCompare(b.fullName || b.name || '', 'es'))
}

function nextTeacherPublicId(teachers = []) {
  const maxNumber = teachers.reduce((max, teacher) => {
    const match = String(teacher.publicId || '').match(/^T-(\d+)$/i)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)

  return `T-${String(maxNumber + 1).padStart(3, '0')}`
}

function emptyStudentForm(today) {
  return {
    publicId: '',
    fullName: '',
    email: '',
    phone: '',
    currentLevelId: '',
    currentLessonId: '',
    enrollmentDate: today,
    status: 'activo',
    scholarshipStatus: 'activa',
    progressPercent: 0,
    password: ''
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
    password: ''
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
    createClass,
    createLesson,
    createLevel,
    createPayment,
    createStudent,
    createTeacher,
    deleteClass,
    deleteLesson,
    deleteLevel,
    deletePayment,
    deleteStudent,
    deleteTeacher,
    markAttendance,
    seedAcademicCatalog,
    seedTeachers,
    updateClass,
    updateLesson,
    updateLevel,
    updatePayment,
    updateStudent,
    updateTeacher
  } = useInstituteData()

  const todayMexico = useMemo(() => getMexicoDateInput(), [])
  const [activeTab, setActiveTab] = useState('students')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentForm, setStudentForm] = useState(() => emptyStudentForm(todayMexico))
  const [studentDraft, setStudentDraft] = useState(() => emptyStudentForm(todayMexico))
  const [teacherForm, setTeacherForm] = useState({ publicId: '', name: '', email: '', password: '' })
  const [teacherDrafts, setTeacherDrafts] = useState({})
  const [editingClassId, setEditingClassId] = useState('')
  const [classForm, setClassForm] = useState({
    lessonId: '',
    teacherId: '',
    date: todayMexico,
    time: '08:00',
    status: 'programada'
  })
  const [classStudentIds, setClassStudentIds] = useState([])
  const [selectedAttendanceClassId, setSelectedAttendanceClassId] = useState('')
  const [attendanceChecked, setAttendanceChecked] = useState({})
  const [paymentForm, setPaymentForm] = useState({
    studentId: '',
    dueDate: '',
    period: '',
    amount: 0,
    status: 'pendiente'
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
  const sortedLevels = useMemo(() => [...data.levels].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)), [data.levels])
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
  const studentFormLessons = useMemo(() => (
    getLessonsByLevel(studentForm.currentLevelId, data.lessons)
  ), [studentForm.currentLevelId, data.lessons])
  const studentDraftLessons = useMemo(() => (
    getLessonsByLevel(studentDraft.currentLevelId, data.lessons)
  ), [studentDraft.currentLevelId, data.lessons])
  const classLesson = getLesson(classForm.lessonId, data.lessons)
  const classLevel = getLevel(classLesson?.levelId, data.levels)
  const classTimeOptions = useMemo(() => getScheduleHoursForDate(classForm.date), [classForm.date])

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

  const resetClassForm = () => {
    setEditingClassId('')
    setClassForm({ lessonId: '', teacherId: '', date: todayMexico, time: '08:00', status: 'programada' })
    setClassStudentIds([])
  }

  const submitStudent = async (event) => {
    event.preventDefault()
    try {
      const uid = studentForm.email && studentForm.password
        ? await createAuthUser(studentForm.email, studentForm.password)
        : ''

      await createStudent({ ...studentForm, uid })
      setStudentForm(emptyStudentForm(todayMexico))
    } catch (error) {
      setMessage(error.message || 'No se pudo crear el usuario Auth del estudiante.')
    }
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
    try {
      if (!teacherForm.name.trim()) return

      const uid = teacherForm.email && teacherForm.password
        ? await createAuthUser(teacherForm.email, teacherForm.password)
        : ''

      await createTeacher({ ...teacherForm, uid })
      setTeacherForm({ publicId: nextTeacherPublicId(sortedTeachers), name: '', email: '', password: '' })
    } catch (error) {
      setMessage(error.message || 'No se pudo crear el usuario Auth del teacher.')
    }
  }

  const toggleClassStudent = (studentId, checked) => {
    setClassStudentIds(prev => {
      if (!checked) return prev.filter(id => id !== studentId)
      if (prev.includes(studentId)) return prev
      return [...prev, studentId]
    })
  }

  const buildClassPayload = () => {
    const lesson = getLesson(classForm.lessonId, data.lessons)
    const teacher = sortedTeachers.find(item => item.id === classForm.teacherId)
    const levelId = lesson?.levelId || ''
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
      endAt: buildMexicoDateTimeIso(classForm.date, classForm.time, 1),
      durationHours: 1,
      studentIds: classStudentIds,
      room: classLevel?.shortName ? `Salon ${classLevel.shortName}` : 'Salon por asignar',
      mode: 'presencial',
      status: classForm.status || 'programada',
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

  const submitClass = async (event) => {
    event.preventDefault()
    if (!classForm.teacherId || !classForm.lessonId || !classForm.time) return

    const payload = buildClassPayload()
    if (editingClassId) {
      await updateClass(editingClassId, payload)
    } else {
      await createClass(payload)
    }
    resetClassForm()
  }

  const editClass = (classItem) => {
    setEditingClassId(classItem.id)
    setClassForm({
      lessonId: classItem.lessonIds?.[0] || '',
      teacherId: classItem.teacherId || '',
      date: classItem.date || getClassDateValue(classItem.startAt),
      time: classItem.time || getClassTimeValue(classItem.startAt),
      status: classItem.status || 'programada'
    })
    setClassStudentIds(classItem.studentIds || [])
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

  const renderMetrics = () => (
    <section className="dashboard-grid top-grid admin-metrics">
      <article className="metric-card">
        <span>Estudiantes activos</span>
        <strong>{insights.metrics.activeStudents}</strong>
        <small>Perfiles con seguimiento</small>
      </article>
      <article className="metric-card">
        <span>Becas en riesgo</span>
        <strong>{insights.metrics.scholarshipRisk}</strong>
        <small>Requieren accion</small>
      </article>
      <article className="metric-card">
        <span>Pagos vencidos</span>
        <strong>{insights.metrics.overduePayments}</strong>
        <small>Impactan la beca</small>
      </article>
      <article className="metric-card">
        <span>Clases auto/manual</span>
        <strong>{data.classes.length}</strong>
        <small>Reservas y correcciones</small>
      </article>
    </section>
  )

  const renderStudentsTab = () => (
    <section className="admin-tab-grid">
      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Nuevo estudiante</h2>
            <p>Admin crea el registro. Si no pones contrasena, el alumno la crea en su primer login.</p>
          </div>
        </div>
        <form className="admin-form-grid" onSubmit={submitStudent}>
          <label className="form-field">
            <span>ID</span>
            <input value={studentForm.publicId} onChange={event => setStudentForm(prev => ({ ...prev, publicId: event.target.value }))} placeholder="EST-006" required />
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
            <select value={studentForm.currentLevelId} onChange={event => setStudentForm(prev => ({ ...prev, currentLevelId: event.target.value, currentLessonId: '' }))} required>
              <option value="">Seleccionar nivel</option>
              {sortedLevels.map(level => <option value={level.id} key={level.id}>{level.shortName || level.name}</option>)}
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
          <label className="form-field">
            <span>Contrasena inicial</span>
            <input type="password" value={studentForm.password} onChange={event => setStudentForm(prev => ({ ...prev, password: event.target.value }))} placeholder="Minimo 6 caracteres" />
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
          <div className="record-list">
            {sortedStudents.map(student => (
              <button className={selectedStudentId === student.id ? 'record-button active' : 'record-button'} key={student.id} type="button" onClick={() => setSelectedStudentId(student.id)}>
                <strong>{student.fullName}</strong>
                <span>{student.publicId} - {getLevel(student.currentLevelId, data.levels)?.shortName || 'Sin nivel'}</span>
              </button>
            ))}
            {!sortedStudents.length && <p className="empty-state">Aun no hay estudiantes.</p>}
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

              <ProgressBar value={studentDraft.progressPercent} label="Progreso del nivel" />

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
                  <select value={studentDraft.currentLevelId} onChange={event => setStudentDraft(prev => ({ ...prev, currentLevelId: event.target.value, currentLessonId: '' }))} required>
                    <option value="">Seleccionar nivel</option>
                    {sortedLevels.map(level => <option value={level.id} key={level.id}>{level.shortName || level.name}</option>)}
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
                  <span>Progreso %</span>
                  <input type="number" min="0" max="100" value={studentDraft.progressPercent} onChange={event => setStudentDraft(prev => ({ ...prev, progressPercent: event.target.value }))} />
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
            <p>Admin crea ID, nombre y correo. Si no hay contrasena, el teacher la crea en su primer login.</p>
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
          <label className="form-field">
            <span>Contrasena inicial</span>
            <input type="password" value={teacherForm.password} onChange={event => setTeacherForm(prev => ({ ...prev, password: event.target.value }))} placeholder="Minimo 6 caracteres" />
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Agregar teacher</button>
        </form>

        <div className="teacher-list section-gap">
          {sortedTeachers.map(teacher => {
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
          {!sortedTeachers.length && <p className="empty-state">Aun no hay teachers. Usa Crear 5 base o agrega uno con correo.</p>}
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
            <p>Actualiza estatus o elimina registros financieros.</p>
          </div>
        </div>
        <div className="stack-list">
          {data.payments.map(payment => {
            const student = data.students.find(item => item.id === payment.studentId)
            const overdue = insights.overduePayments.some(item => item.id === payment.id)
            return (
              <div className="list-row" key={payment.id}>
                <div>
                  <strong>{student?.fullName || payment.studentId}</strong>
                  <small>{payment.period} - vence {formatDateInputLabel(payment.dueDate)} - ${payment.amount || 0}</small>
                </div>
                <div className="row-actions">
                  <StatusBadge severity={payment.status === 'pagado' ? 'ok' : overdue ? 'risk' : 'warning'}>{payment.status === 'pagado' ? 'Pagado' : overdue ? 'Vencido' : 'Pendiente'}</StatusBadge>
                  <button className="btn btn-secondary small-btn" type="button" onClick={() => updatePayment(payment.id, { ...payment, status: payment.status === 'pagado' ? 'pendiente' : 'pagado' })} disabled={saving || !isAdmin}>Cambiar</button>
                  <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => deletePayment(payment.id)} disabled={saving || !isAdmin}>Eliminar</button>
                </div>
              </div>
            )
          })}
          {!data.payments.length && <p className="empty-state">Aun no hay pagos.</p>}
        </div>
      </article>
    </section>
  )

  const renderClassesTab = () => (
    <section className="admin-tab-grid">
      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>{editingClassId ? 'Editar clase' : 'Crear clase manual'}</h2>
            <p>El flujo normal es automatico por reservas; aqui el admin solo corrige o crea excepciones.</p>
          </div>
          {classLevel && <StatusBadge severity="info">{classLevel.shortName}</StatusBadge>}
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
            <span>Fecha</span>
            <input type="date" value={classForm.date} onChange={event => setClassForm(prev => ({ ...prev, date: event.target.value }))} required />
          </label>
          <label className="form-field">
            <span>Hora</span>
            <select value={classForm.time} onChange={event => setClassForm(prev => ({ ...prev, time: event.target.value }))} required>
              {classTimeOptions.map(time => <option value={time} key={time}>{time}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Estatus</span>
            <select value={classForm.status} onChange={event => setClassForm(prev => ({ ...prev, status: event.target.value }))}>
              <option value="programada">Programada</option>
              <option value="completada">Completada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </label>
          <div className="form-field span-2">
            <span>Estudiantes asignados ({classStudentIds.length})</span>
            <div className="attendance-check-grid compact-check-grid">
              {sortedStudents.map(student => {
                const checked = classStudentIds.includes(student.id)
                return (
                  <label className="attendance-check" key={student.id}>
                    <input type="checkbox" checked={checked} onChange={event => toggleClassStudent(student.id, event.target.checked)} />
                    <span>
                      <strong>{student.fullName}</strong>
                      <small>{student.publicId}</small>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
          <div className="row-actions form-wide-actions">
            <button className="btn btn-primary small-btn" type="submit" disabled={saving}>{editingClassId ? 'Actualizar clase' : 'Guardar clase'}</button>
            {editingClassId && <button className="btn btn-secondary small-btn" type="button" onClick={resetClassForm}>Cancelar edicion</button>}
          </div>
        </form>
      </article>

      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Clases registradas</h2>
            <p>Reservas automaticas, teachers asignados y correcciones manuales.</p>
          </div>
        </div>
        <div className="stack-list">
          {classesByRecentDate.map(classItem => {
            const lesson = getLesson(classItem.lessonIds?.[0], data.lessons)
            const level = getLevel(classItem.levelId || lesson?.levelId, data.levels)
            return (
              <div className="list-row" key={classItem.id}>
                <div>
                  <strong>{level?.shortName || 'Nivel'} - {lesson?.name || 'Sin leccion'}</strong>
                  <small>{formatDateTime(classItem.startAt)} - {classItem.teacherName || 'Por asignar'} - {classItem.studentIds?.length || 0} estudiantes - {classItem.reservationSource || 'manual'}</small>
                </div>
                <div className="row-actions">
                  <StatusBadge severity={classItem.status === 'cancelada' ? 'warning' : 'info'}>{classItem.status}</StatusBadge>
                  <button className="btn btn-secondary small-btn" type="button" onClick={() => editClass(classItem)}>Editar</button>
                  <button className="btn btn-secondary small-btn danger-btn" type="button" onClick={() => deleteClass(classItem.id)} disabled={saving}>Eliminar</button>
                </div>
              </div>
            )
          })}
          {!classesByRecentDate.length && <p className="empty-state">Aun no hay clases. Se crearan cuando los alumnos reserven.</p>}
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
          {attendanceRows.map(record => (
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
          {!attendanceRows.length && (
            <tr>
              <td colSpan="8">Aun no hay asistencia registrada por teachers.</td>
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
          {sortedLessons.map(lesson => {
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
          <Link className="brand" to="/">
            <span className="brand-mark">IT</span>
            <span>
              <strong>Innova-T</strong>
              <small>Admin System</small>
            </span>
          </Link>

          <nav className="sidebar-nav admin-tabs-nav">
            {TABS.map(tab => (
              <button className={activeTab === tab.id ? 'active' : ''} key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}>
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="sidebar-card compact">
            <span className="kicker">Firebase</span>
            <strong>{profile?.nombre || profile?.email || 'Sin sesion'}</strong>
            <small>El acomodo de clases usa IA local: reglas, nivel, leccion, horario y carga de teacher.</small>
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
              <Link className="btn btn-secondary" to="/student-dashboard">Vista estudiante</Link>
              <Link className="btn btn-secondary" to="/teacher-dashboard">Vista teacher</Link>
              <Link className="btn btn-secondary" to="/login">Cerrar sesion</Link>
            </div>
          </header>

          {message && <p className="system-message">{message}</p>}
          {authError && <p className="system-message">{authError}</p>}
          {loading && <p className="system-message">Cargando datos del instituto...</p>}

          {requireLogin && (
            <section className="panel-card admin-card">
              <h2>Necesitas iniciar sesion</h2>
              <p>Entra con un usuario registrado en Firebase Auth y en la coleccion usuarios.</p>
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
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default AdminDashboard
