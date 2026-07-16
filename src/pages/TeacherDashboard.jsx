import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut, updatePassword } from 'firebase/auth'
import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import ActionMessageModal from '../components/ActionMessageModal'
import BrandLogo from '../components/BrandLogo'
import StatusBadge from '../components/StatusBadge'
import SystemControls, { useUiLanguage } from '../components/SystemControls'
import { getLesson, getLessonsByLevel, getLevel, isFreeTopicLesson, isFreeTopicLevelId } from '../domain/academicCatalog'
import { formatDateTime, toDate } from '../domain/dateUtils'
import { getClassDateValue, getMexicoDateInput } from '../domain/scheduleMatcher'
import { auth, db } from '../firebase'
import { activateAdminPanelProfile, getPreferredPanelRole } from '../services/panelRole'
import { useInstituteData } from '../services/useInstituteData'

function sortByName(items = []) {
  return [...items].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es'))
}

function getClassDurationHours(classItem) {
  const hours = Number(classItem?.durationHours || 1)
  return Number.isFinite(hours) ? Math.max(1, hours) : 1
}

function getTakenLessonIds(student, classes = [], attendance = [], lessons = []) {
  const isFreeTopicLessonId = lessonId => isFreeTopicLesson(getLesson(lessonId, lessons))
  const excludedLessonIds = new Set(Array.isArray(student?.excludedLessonIds) ? student.excludedLessonIds : [])
  const lessonIds = new Set((Array.isArray(student?.completedLessonIds) ? student.completedLessonIds : []).filter(lessonId => !isFreeTopicLessonId(lessonId) && !excludedLessonIds.has(lessonId)))
  const attendedClassIds = new Set(
    attendance
      .filter(record => record.studentId === student?.id && record.attended === true)
      .map(record => record.classId)
  )

  attendance
    .filter(record => record.studentId === student?.id && record.attended === true && record.lessonId)
    .filter(record => !isFreeTopicLessonId(record.lessonId))
    .filter(record => !excludedLessonIds.has(record.lessonId))
    .forEach(record => lessonIds.add(record.lessonId))

  classes.forEach(classItem => {
    if ((classItem.status || 'programada') === 'cancelada') return
    if (!attendedClassIds.has(classItem.id)) return
    if (isFreeTopicLevelId(classItem.levelId)) return
    ;(classItem.lessonIds || []).forEach(lessonId => {
      if (lessonId && !isFreeTopicLessonId(lessonId) && !excludedLessonIds.has(lessonId)) lessonIds.add(lessonId)
    })
  })

  return lessonIds
}

function TeacherDashboard() {
  const navigate = useNavigate()
  const uiLanguage = useUiLanguage()
  
  const uiText = {
    menu: uiLanguage === 'en' ? 'Menu' : 'Menu',
    classes: uiLanguage === 'en' ? 'Classes' : 'Clases',
    attendance: uiLanguage === 'en' ? 'Attendance' : 'Asistencia',
    switchAdmin: uiLanguage === 'en' ? 'Switch to admin' : 'Cambiar a admin',
    logout: uiLanguage === 'en' ? 'Log out' : 'Cerrar sesion',
    loading: uiLanguage === 'en' ? 'Loading teacher panel' : 'Cargando panel teacher',
    loginRequired: uiLanguage === 'en' ? 'Sign in' : 'Inicia sesion',
    goToLogin: uiLanguage === 'en' ? 'Go to login' : 'Ir al login',
    teacherPanel: uiLanguage === 'en' ? 'Teacher Panel' : 'Teacher Panel',
    teacherOperation: uiLanguage === 'en' ? 'Teacher operation' : 'Operacion teacher',
    myClassesAndStudents: uiLanguage === 'en' ? 'My classes and students' : 'Mis clases y alumnos',
    takeAttendanceAndReview: uiLanguage === 'en' ? 'Take attendance and review your students\' progress.' : 'Toma asistencia y revisa progreso de tus alumnos.',
    assignedClasses: uiLanguage === 'en' ? 'Assigned classes' : 'Clases asignadas',
    historyOrCaptured: uiLanguage === 'en' ? 'History of previous classes or already captured lists.' : 'Historial de clases anteriores o listas ya capturadas.',
    todayOrUpcoming: uiLanguage === 'en' ? 'Today or upcoming classes pending attendance.' : 'Clases de hoy o proximas pendientes de asistencia.',
    todayUpcomingCount: uiLanguage === 'en' ? 'Today / upcoming' : 'Hoy / proximas',
    previousCapturedCount: uiLanguage === 'en' ? 'Previous / captured' : 'Anteriores / capturadas',
    date: uiLanguage === 'en' ? 'Date' : 'Fecha',
    level: uiLanguage === 'en' ? 'Level' : 'Nivel',
    lesson: uiLanguage === 'en' ? 'Lesson' : 'Leccion',
    classroom: uiLanguage === 'en' ? 'Classroom' : 'Classroom',
    students: uiLanguage === 'en' ? 'Students' : 'Alumnos',
    hours: uiLanguage === 'en' ? 'Hours' : 'Horas',
    list: uiLanguage === 'en' ? 'List' : 'Lista',
    status: uiLanguage === 'en' ? 'Status' : 'Estatus',
    noStudents: uiLanguage === 'en' ? 'No students' : 'Sin alumnos',
    captured: uiLanguage === 'en' ? 'Captured' : 'Capturada',
    canceled: uiLanguage === 'en' ? 'Canceled' : 'Cancelada',
    completed: uiLanguage === 'en' ? 'Completed' : 'Completada',
    scheduled: uiLanguage === 'en' ? 'Scheduled' : 'Programada',
    noPreviousClasses: uiLanguage === 'en' ? 'No previous or captured classes.' : 'No hay clases anteriores o capturadas.',
    noTodayClasses: uiLanguage === 'en' ? 'No today or upcoming classes pending.' : 'No tienes clases pendientes de hoy o proximas.',
    reservationsByStudent: uiLanguage === 'en' ? 'Reservations by student' : 'Reservaciones por alumno',
    takeAttendanceAndReviewClass: uiLanguage === 'en' ? 'Take attendance and review progress' : 'toma asistencia y revisa progreso',
    selectAClass: uiLanguage === 'en' ? 'Select a class' : 'Selecciona una clase',
    noLevel: uiLanguage === 'en' ? 'No level' : 'Sin nivel',
    showProgress: uiLanguage === 'en' ? 'Show progress' : 'Ver progreso',
    hideProgress: uiLanguage === 'en' ? 'Hide progress' : 'Ocultar progreso',
    noStudentsInClass: uiLanguage === 'en' ? 'Selected class has no students assigned.' : 'La clase seleccionada no tiene alumnos asignados.',
    confirmList: uiLanguage === 'en' ? 'Confirm list' : 'Confirmar lista',
    changePassword: uiLanguage === 'en' ? 'Change password' : 'Cambiar contrasena',
    updateIndividualAccess: uiLanguage === 'en' ? 'Update your individual access.' : 'Actualiza tu acceso individual.',
    newPassword: uiLanguage === 'en' ? 'New password' : 'Nueva contrasena',
    min6Chars: uiLanguage === 'en' ? 'Min 6 characters' : 'Minimo 6 caracteres',
    savePassword: uiLanguage === 'en' ? 'Save password' : 'Guardar contrasena',
    passwordUpdated: uiLanguage === 'en' ? 'Password updated.' : 'Contrasena actualizada.',
    newPasswordMin6: uiLanguage === 'en' ? 'The new password must be at least 6 characters.' : 'La nueva contrasena debe tener minimo 6 caracteres.',
    securityLogoutAgain: uiLanguage === 'en' ? 'For security, sign out, sign back in, and change the password again.' : 'Por seguridad, cierra sesion, vuelve a entrar y cambia la contrasena de nuevo.',
    couldNotChangePassword: uiLanguage === 'en' ? 'Could not change the password.' : 'No se pudo cambiar la contrasena.',
    attended: uiLanguage === 'en' ? 'Attended' : 'Asistio',
    absent: uiLanguage === 'en' ? 'Absent' : 'Falto',
    withNotice: uiLanguage === 'en' ? 'With notice' : 'Con aviso'
  }

  const getEffectiveClassStatus = (classItem) => {
    if (classItem.status === 'cancelada') return uiText.canceled
    const endAt = toDate(classItem.endAt)
    return endAt && endAt < new Date() ? uiText.completed : uiText.scheduled
  }

  const getAttendanceStatusForClass = (classItem) => {
    const studentIds = classItem?.studentIds || []
    if (!studentIds.length) return uiText.noStudents
    const recordedStudentIds = new Set(data.attendance.filter(record => record.classId === classItem.id).map(record => record.studentId))
    return studentIds.every(studentId => recordedStudentIds.has(studentId))
      ? uiText.captured
      : `${recordedStudentIds.size}/${studentIds.length}`
  }

  const {
    data,
    loading,
    user,
    profile,
    authError,
    message,
    saving,
    setMessage,
    createClassroom,
    createBulkAttendance
  } = useInstituteData()

  const todayMexico = useMemo(() => getMexicoDateInput(), [])
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState('')
  const [attendanceChecked, setAttendanceChecked] = useState({})
  const [progressStudentId, setProgressStudentId] = useState('')
  const [classroomForm, setClassroomForm] = useState({ name: '' })
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [classViewMode, setClassViewMode] = useState('current')
  const [hasAdminPanelAccess, setHasAdminPanelAccess] = useState(false)

  const requireLogin = !loading && (!user || !profile)
  const teacherByEmail = data.teachers.find(teacher => (
    String(teacher.email || '').toLowerCase() === String(profile?.email || user?.email || '').toLowerCase()
  ))
  const teacherId = profile?.teacherId || teacherByEmail?.id || data.teachers.find(teacher => teacher.name === profile?.nombre)?.id || ''
  const teacherProfile = data.teachers.find(teacher => teacher.id === teacherId)
  const isAdminTeacherView = (profile?.rol || profile?.role) === 'admin' && getPreferredPanelRole() === 'teacher'
  const canSwitchToAdmin = (profile?.rol || profile?.role) === 'admin' || hasAdminPanelAccess
  const teacherClassPool = useMemo(() => (
    data.classes
      .filter(classItem => classItem.teacherId || classItem.teacherName)
      .filter(classItem => (classItem.status || 'programada') !== 'cancelada')
      .filter(classItem => !teacherId || classItem.teacherId === teacherId || classItem.teacherName === teacherProfile?.name || classItem.teacherName === profile?.nombre)
      .sort((a, b) => (toDate(a.startAt)?.getTime() || 0) - (toDate(b.startAt)?.getTime() || 0))
  ), [data.classes, profile, teacherId, teacherProfile?.name])
  const hasCapturedAttendanceForClass = (classItem) => {
    const studentIds = classItem?.studentIds || []
    if (!studentIds.length) return false
    const recordedStudentIds = new Set(
      data.attendance
        .filter(record => record.classId === classItem.id)
        .map(record => record.studentId)
    )

    return studentIds.every(studentId => recordedStudentIds.has(studentId))
  }
  const teacherCurrentClasses = useMemo(() => (
    teacherClassPool.filter(classItem => (
      (classItem.date || getClassDateValue(classItem.startAt)) >= todayMexico
      && !hasCapturedAttendanceForClass(classItem)
    ))
  ), [data.attendance, teacherClassPool, todayMexico])
  const teacherPreviousClasses = useMemo(() => (
    teacherClassPool
      .filter(classItem => (
        (classItem.date || getClassDateValue(classItem.startAt)) < todayMexico
        || hasCapturedAttendanceForClass(classItem)
      ))
      .sort((a, b) => (toDate(b.startAt)?.getTime() || 0) - (toDate(a.startAt)?.getTime() || 0))
  ), [data.attendance, teacherClassPool, todayMexico])
  const teacherClasses = classViewMode === 'history' ? teacherPreviousClasses : teacherCurrentClasses
  const selectedClass = teacherClasses.find(classItem => classItem.id === selectedClassId) || teacherClasses[0]
  const classStudents = useMemo(() => {
    const ids = new Set(selectedClass?.studentIds || [])
    return sortByName(data.students.filter(student => ids.has(student.id)))
  }, [data.students, selectedClass])
  const attendanceByStudentId = useMemo(() => {
    const entries = data.attendance
      .filter(record => record.classId === selectedClass?.id)
      .map(record => [record.studentId, record])
    return new Map(entries)
  }, [data.attendance, selectedClass])
  const sortedLevels = useMemo(() => (
    [...data.levels].sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
  ), [data.levels])
  const academicLevels = useMemo(() => (
    sortedLevels.filter(level => !isFreeTopicLevelId(level.id))
  ), [sortedLevels])

  useEffect(() => {
    if (loading || !profile) return
    const role = profile.rol || profile.role
    const allowedAdminTeacherView = role === 'admin' && isAdminTeacherView && teacherByEmail
    if (role !== 'teacher' && !allowedAdminTeacherView) {
      signOut(auth).finally(() => navigate('/login', { replace: true }))
    }
  }, [isAdminTeacherView, loading, navigate, profile, teacherByEmail])

  const logout = () => {
    signOut(auth).finally(() => navigate('/login', { replace: true }))
  }

  useEffect(() => {
    const email = String(profile?.email || user?.email || '').toLowerCase()
    if (!email || (profile?.rol || profile?.role) === 'admin') {
      setHasAdminPanelAccess((profile?.rol || profile?.role) === 'admin')
      return
    }

    getDocs(query(
      collection(db, 'usuarios'),
      where('email', '==', email),
      where('rol', '==', 'admin'),
      limit(1)
    ))
      .then(snapshot => setHasAdminPanelAccess(!snapshot.empty))
      .catch(() => setHasAdminPanelAccess(false))
  }, [profile, user?.email])

  useEffect(() => {
    if ((!selectedClassId || !teacherClasses.some(classItem => classItem.id === selectedClassId)) && teacherClasses[0]?.id) {
      setSelectedClassId(teacherClasses[0].id)
    } else if (selectedClassId && !teacherClasses.length) {
      setSelectedClassId('')
    }
  }, [selectedClassId, teacherClasses])

  useEffect(() => {
    if (!selectedClass) {
      setAttendanceChecked({})
      setProgressStudentId('')
      return
    }

    setAttendanceChecked(
      classStudents.reduce((checked, student) => ({
        ...checked,
        [student.id]: attendanceByStudentId.get(student.id)?.attended === true
      }), {})
    )
  }, [attendanceByStudentId, classStudents, selectedClass])

  useEffect(() => {
    setProgressStudentId('')
  }, [selectedClass?.id])

  const submitAttendance = async (event) => {
    event.preventDefault()
    if (!selectedClass) return

    const lesson = getLesson(selectedClass.lessonIds?.[0], data.lessons)
    const records = classStudents
      .map(student => {
        const attended = attendanceChecked[student.id] === true
        return {
          id: `${selectedClass.id}-${student.id}`,
          studentId: student.id,
          classId: selectedClass.id,
          className: lesson?.name || 'Clase registrada',
          lessonId: lesson?.id || selectedClass.lessonIds?.[0] || '',
          levelId: selectedClass.levelId || lesson?.levelId || '',
          startAt: selectedClass.startAt,
          endAt: selectedClass.endAt,
          attended,
          hoursCredited: attended ? 1 : 0,
          recordedBy: profile?.uid || '',
          recordedByName: profile?.nombre || profile?.email || ''
        }
      })

    if (!records.length) return
    await createBulkAttendance(records)
  }

  const submitClassroom = async (event) => {
    event.preventDefault()
    if (!classroomForm.name.trim()) return
    await createClassroom({ ...classroomForm, active: true })
    setClassroomForm({ name: '' })
  }

  const changePassword = async (event) => {
    event.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      setPasswordMessage('La nueva contrasena debe tener minimo 6 caracteres.')
      return
    }

    try {
      await updatePassword(user, newPassword)
      setNewPassword('')
      setPasswordMessage('Contrasena actualizada.')
    } catch (error) {
      console.warn(error)
      setPasswordMessage(error.code === 'auth/requires-recent-login'
        ? 'Por seguridad, cierra sesion, vuelve a entrar y cambia la contrasena de nuevo.'
        : 'No se pudo cambiar la contrasena.')
    }
  }

  const switchToAdminPanel = async () => {
    try {
      await activateAdminPanelProfile({ user, profile })
      navigate('/admin-dashboard/')
    } catch (error) {
      console.warn(error)
      setMessage(error.message || 'No se pudo cambiar al panel admin.')
    }
  }

  if (loading) {
    return (
      <div className="dashboard-body admin-system excel-system">
        <main className="dashboard-main">
          <section className="panel-card admin-card">
            <h1>{uiText.loading}</h1>
          </section>
        </main>
      </div>
    )
  }

  if (requireLogin) {
    return (
      <div className="dashboard-body admin-system excel-system">
        <main className="dashboard-main">
          <section className="panel-card admin-card">
            <h1>{uiText.loginRequired}</h1>
            {authError && <p className="system-message">{authError}</p>}
            <Link className="btn btn-primary" to="/login">{uiText.goToLogin}</Link>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="dashboard-body admin-system excel-system">
      <div className="dashboard-shell">
        <aside className="sidebar admin-sidebar">
          <BrandLogo panel={uiText.teacherPanel} />
          <button
            className="hamburger-menu-button"
            type="button"
            onClick={() => setIsMobileMenuOpen(open => !open)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="teacher-tabs-menu"
          >
            {uiText.menu}
          </button>
          <nav id="teacher-tabs-menu" className={isMobileMenuOpen ? 'sidebar-nav open' : 'sidebar-nav'}>
            <a className="active" href="#clases" onClick={() => setIsMobileMenuOpen(false)}>{uiText.classes}</a>
            <a href="#asistencia" onClick={() => setIsMobileMenuOpen(false)}>{uiText.attendance}</a>
          </nav>
          <div className="sidebar-card compact">
            <span className="kicker">Teacher</span>
            <strong>{profile?.nombre || profile?.email}</strong>
            <small>{teacherProfile?.publicId || teacherId || (uiLanguage === 'en' ? 'General view' : 'Vista general')}</small>
          </div>
        </aside>

        <main className="dashboard-main admin-main">
          <header className="dashboard-header admin-header">
            <div>
              <span className="eyebrow">{uiText.teacherOperation}</span>
              <h1>{uiText.myClassesAndStudents}</h1>
              <p className="page-subtitle">{uiText.takeAttendanceAndReview}</p>
            </div>
            <div className="header-actions">
              <SystemControls />
              {canSwitchToAdmin && (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={switchToAdminPanel}
                >
                  {uiText.switchAdmin}
                </button>
              )}
              <button className="btn btn-secondary" type="button" onClick={logout}>{uiText.logout}</button>
            </div>
          </header>

          <section id="clases" className="panel-card admin-card">
            <div className="admin-section-title">
              <div>
                <h2>{uiText.assignedClasses}</h2>
                <p>{classViewMode === 'history' ? uiText.historyOrCaptured : uiText.todayOrUpcoming}</p>
              </div>
              <div className="teacher-class-toolbar">
                <button
                  className={classViewMode === 'current' ? 'btn btn-primary small-btn' : 'btn btn-secondary small-btn'}
                  type="button"
                  onClick={() => {
                    setClassViewMode('current')
                    setSelectedClassId('')
                  }}
                >
                  {uiText.todayUpcomingCount} ({teacherCurrentClasses.length})
                </button>
                <button
                  className={classViewMode === 'history' ? 'btn btn-primary small-btn' : 'btn btn-secondary small-btn'}
                  type="button"
                  onClick={() => {
                    setClassViewMode('history')
                    setSelectedClassId('')
                  }}
                >
                  {uiText.previousCapturedCount} ({teacherPreviousClasses.length})
                </button>
              </div>
            </div>
            <div className="excel-table teacher-class-table">
              <div className="excel-row excel-head">
                <span>{uiText.date}</span>
                <span>{uiText.level}</span>
                <span>{uiText.lesson}</span>
                <span>{uiText.classroom}</span>
                <span>{uiText.students}</span>
                <span>{uiText.hours}</span>
                <span>{uiText.list}</span>
                <span>{uiText.status}</span>
              </div>
              {teacherClasses.map(classItem => {
                const lesson = getLesson(classItem.lessonIds?.[0], data.lessons)
                const attendanceStatus = getAttendanceStatusForClass(classItem)
                return (
                  <button className={selectedClass?.id === classItem.id ? 'excel-row excel-button active' : 'excel-row excel-button'} key={classItem.id} type="button" onClick={() => setSelectedClassId(classItem.id)}>
                    <span data-label="Fecha">{formatDateTime(classItem.startAt)}</span>
                    <span data-label="Nivel">{getLevel(classItem.levelId || lesson?.levelId, data.levels)?.shortName || '-'}</span>
                    <span data-label="Leccion">{lesson?.name || '-'}</span>
                    <span data-label="Classroom">{classItem.classroomName || classItem.room || '-'}</span>
                    <span data-label="Alumnos">{classItem.studentIds?.length || 0}</span>
                    <span data-label="Horas">{getClassDurationHours(classItem)}</span>
                    <span data-label="Lista">{attendanceStatus}</span>
                    <span data-label="Estatus">{getEffectiveClassStatus(classItem)}</span>
                  </button>
                )
              })}
              {!teacherClasses.length && (
                <p className="empty-state teacher-empty-state">
                  {classViewMode === 'history' ? 'No hay clases anteriores o capturadas.' : 'No tienes clases pendientes de hoy o proximas.'}
                </p>
              )}
            </div>
          </section>

          <section id="asistencia" className="panel-card admin-card">
            <div className="admin-section-title">
              <div>
                <h2>Reservaciones por alumno</h2>
                <p>{selectedClass ? `${getLesson(selectedClass.lessonIds?.[0], data.lessons)?.name || 'Clase'} - toma asistencia y revisa progreso` : 'Selecciona una clase'}.</p>
              </div>
              {selectedClass && <StatusBadge severity="info">{formatDateTime(selectedClass.startAt)}</StatusBadge>}
            </div>
            <form className="attendance-form" onSubmit={submitAttendance}>
              <div className="attendance-check-grid">
                {classStudents.map(student => {
                  const takenLessonIds = getTakenLessonIds(student, data.classes, data.attendance, data.lessons)
                  const showProgress = progressStudentId === student.id
                  return (
                    <div className="student-attendance-row" key={student.id}>
                      <label className="attendance-check">
                        <input type="checkbox" checked={attendanceChecked[student.id] === true} onChange={event => setAttendanceChecked(prev => ({ ...prev, [student.id]: event.target.checked }))} />
                        <span>
                          <strong>{student.fullName}</strong>
                          <small>{student.publicId} - {getLevel(student.currentLevelId, data.levels)?.shortName || 'Sin nivel'}</small>
                        </span>
                      </label>
                      <button className="btn btn-secondary small-btn" type="button" onClick={() => setProgressStudentId(showProgress ? '' : student.id)}>
                        {showProgress ? 'Ocultar progreso' : 'Ver progreso'}
                      </button>
                      {showProgress && (
                        <div className="student-progress-panel">
                          {academicLevels.map(level => (
                            <div className="lesson-progress-group" key={level.id}>
                              <strong>{level.shortName || level.name}</strong>
                              <div className="progress-lesson-grid">
                                {getLessonsByLevel(level.id, data.lessons).map(lesson => (
                                  <label className="lesson-check-row" key={lesson.id}>
                                    <input type="checkbox" checked={takenLessonIds.has(lesson.id)} readOnly />
                                    <span>{lesson.order}. {lesson.name}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {!classStudents.length && <p className="empty-state">La clase seleccionada no tiene alumnos asignados.</p>}
              </div>
              <button className="btn btn-primary small-btn" type="submit" disabled={saving || !classStudents.length}>Confirmar lista</button>
            </form>
          </section>


          <section className="panel-card admin-card">
            <div className="admin-section-title">
              <div>
                <h2>Cambiar contrasena</h2>
                <p>Actualiza tu acceso individual.</p>
              </div>
            </div>
            <form className="admin-form-grid" onSubmit={changePassword}>
              <label className="form-field span-2">
                <span>Nueva contrasena</span>
                <input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="Minimo 6 caracteres" />
              </label>
              <button className="btn btn-primary small-btn" type="submit">Guardar contrasena</button>
            </form>
          </section>
          <ActionMessageModal message={message || passwordMessage} onClose={() => {
            if (message) setMessage('')
            setPasswordMessage('')
          }} />
        </main>
      </div>
    </div>
  )
}

export default TeacherDashboard
