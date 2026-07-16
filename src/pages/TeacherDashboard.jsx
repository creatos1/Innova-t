import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { updatePassword } from 'firebase/auth'
import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import ActionMessageModal from '../components/ActionMessageModal'
import BrandLogo from '../components/BrandLogo'
import StatusBadge from '../components/StatusBadge'
import SystemControls, { useUiLanguage } from '../components/SystemControls'
import { getLesson, getLessonsByLevel, getLevel } from '../domain/academicCatalog'
import { formatDateTime, toDate } from '../domain/dateUtils'
import { getClassDateValue, getMexicoDateInput } from '../domain/scheduleMatcher'
import { db } from '../firebase'
import { activateAdminPanelProfile, getPreferredPanelRole } from '../services/panelRole'
import { useInstituteData } from '../services/useInstituteData'

function sortByName(items = []) {
  return [...items].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es'))
}

function getEffectiveClassStatus(classItem) {
  if (classItem.status === 'cancelada') return 'cancelada'
  const endAt = toDate(classItem.endAt)
  return endAt && endAt < new Date() ? 'completada' : 'programada'
}

function getClassDurationHours(classItem) {
  const hours = Number(classItem?.durationHours || 1)
  return Number.isFinite(hours) ? Math.max(1, hours) : 1
}

function getTakenLessonIds(student, classes = [], attendance = []) {
  const studentId = student?.id
  const attendedClassIds = new Set(
    attendance
      .filter(record => record.studentId === studentId && record.attended === true)
      .map(record => record.classId)
  )

  return new Set(
    [
      ...(Array.isArray(student?.completedLessonIds) ? student.completedLessonIds : []),
      ...classes
      .filter(classItem => attendedClassIds.has(classItem.id))
      .flatMap(classItem => classItem.lessonIds || [])
      .filter(Boolean)
    ]
  )
}

function TeacherDashboard() {
  const uiLanguage = useUiLanguage()
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
  const [selectedClassId, setSelectedClassId] = useState('')
  const [attendanceChecked, setAttendanceChecked] = useState({})
  const [progressStudentId, setProgressStudentId] = useState('')
  const [classroomForm, setClassroomForm] = useState({ name: '' })
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [classViewMode, setClassViewMode] = useState('current')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [hasAdminPanelAccess, setHasAdminPanelAccess] = useState(false)
  const navigate = useNavigate()
  const todayMexico = useMemo(() => getMexicoDateInput(), [])
  const uiText = {
    menu: uiLanguage === 'en' ? 'Menu' : 'Menu',
    classes: uiLanguage === 'en' ? 'Classes' : 'Clases',
    attendance: uiLanguage === 'en' ? 'Attendance' : 'Asistencia',
    switchAdmin: uiLanguage === 'en' ? 'Switch to admin' : 'Cambiar a admin',
    logout: uiLanguage === 'en' ? 'Log out' : 'Cerrar sesion'
  }

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
  const getAttendanceStatusForClass = (classItem) => {
    const studentIds = classItem?.studentIds || []
    if (!studentIds.length) return 'Sin alumnos'
    const records = data.attendance.filter(record => record.classId === classItem.id)
    const recordedStudentIds = new Set(records.map(record => record.studentId))
    return studentIds.every(studentId => recordedStudentIds.has(studentId))
      ? 'Capturada'
      : `${recordedStudentIds.size}/${studentIds.length}`
  }

  useEffect(() => {
    if (loading || !profile) return
    const role = profile.rol || profile.role
    if (role === 'admin' && (!isAdminTeacherView || !teacherByEmail)) navigate('/admin-dashboard/', { replace: true })
    if (role === 'estudiante') navigate('/student-dashboard/', { replace: true })
  }, [isAdminTeacherView, loading, navigate, profile, teacherByEmail])

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
            <h1>Cargando panel teacher</h1>
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
            <h1>Inicia sesion</h1>
            {authError && <p className="system-message">{authError}</p>}
            <Link className="btn btn-primary" to="/login">Ir al login</Link>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="dashboard-body admin-system excel-system">
      <div className="dashboard-shell">
        <aside className="sidebar admin-sidebar">
          <BrandLogo panel="Teacher Panel" />
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
            <a href="#classrooms" onClick={() => setIsMobileMenuOpen(false)}>Classrooms</a>
          </nav>
          <div className="sidebar-card compact">
            <span className="kicker">Teacher</span>
            <strong>{profile?.nombre || profile?.email}</strong>
            <small>{teacherProfile?.publicId || teacherId || 'Vista general'}</small>
          </div>
        </aside>

        <main className="dashboard-main admin-main">
          <header className="dashboard-header admin-header">
            <div>
              <span className="eyebrow">Operacion teacher</span>
              <h1>Mis clases y alumnos</h1>
              <p className="page-subtitle">Toma asistencia y revisa progreso de tus alumnos.</p>
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
              <Link className="btn btn-secondary" to="/login">{uiText.logout}</Link>
            </div>
          </header>

          <section id="clases" className="panel-card admin-card">
            <div className="admin-section-title">
              <div>
                <h2>Clases asignadas</h2>
                <p>{classViewMode === 'history' ? 'Historial de clases anteriores o listas ya capturadas.' : 'Clases de hoy o proximas pendientes de asistencia.'}</p>
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
                  Hoy / proximas ({teacherCurrentClasses.length})
                </button>
                <button
                  className={classViewMode === 'history' ? 'btn btn-primary small-btn' : 'btn btn-secondary small-btn'}
                  type="button"
                  onClick={() => {
                    setClassViewMode('history')
                    setSelectedClassId('')
                  }}
                >
                  Anteriores / capturadas ({teacherPreviousClasses.length})
                </button>
              </div>
            </div>
            <div className="excel-table teacher-class-table">
              <div className="excel-row excel-head">
                <span>Fecha</span>
                <span>Nivel</span>
                <span>Leccion</span>
                <span>Classroom</span>
                <span>Alumnos</span>
                <span>Horas</span>
                <span>Lista</span>
                <span>Estatus</span>
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
                  const takenLessonIds = getTakenLessonIds(student, data.classes, data.attendance)
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
                          {sortedLevels.map(level => (
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

          <section id="classrooms" className="panel-card admin-card">
            <div className="admin-section-title">
              <div>
                <h2>Classrooms</h2>
                <p>Alta rapida de salones disponibles para operacion.</p>
              </div>
            </div>
            <form className="admin-form-grid" onSubmit={submitClassroom}>
              <label className="form-field span-2">
                <span>Nombre</span>
                <input value={classroomForm.name} onChange={event => setClassroomForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Classroom 1" required />
              </label>
              <button className="btn btn-primary small-btn" type="submit" disabled={saving}>Agregar classroom</button>
            </form>
            <div className="stack-list section-gap">
              {(data.classrooms || []).map(classroom => (
                <div className="list-row" key={classroom.id}>
                  <div>
                    <strong>{classroom.name}</strong>
                    <small>{classroom.active === false ? 'Inactivo' : 'Activo'}</small>
                  </div>
                </div>
              ))}
              {!data.classrooms?.length && <p className="empty-state">Aun no hay classrooms registrados.</p>}
            </div>
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
