import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { updatePassword } from 'firebase/auth'
import ActionMessageModal from '../components/ActionMessageModal'
import BrandLogo from '../components/BrandLogo'
import StatusBadge from '../components/StatusBadge'
import { getLesson, getLessonsByLevel, getLevel } from '../domain/academicCatalog'
import { formatDateTime, toDate } from '../domain/dateUtils'
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
  const navigate = useNavigate()

  const requireLogin = !loading && (!user || !profile)
  const teacherId = profile?.teacherId || data.teachers.find(teacher => teacher.name === profile?.nombre)?.id || ''
  const teacherProfile = data.teachers.find(teacher => teacher.id === teacherId)
  const teacherClasses = useMemo(() => (
    data.classes
      .filter(classItem => classItem.teacherId || classItem.teacherName)
      .filter(classItem => profile?.rol === 'admin' || !teacherId || classItem.teacherId === teacherId || classItem.teacherName === profile?.nombre)
      .sort((a, b) => (toDate(a.startAt)?.getTime() || 0) - (toDate(b.startAt)?.getTime() || 0))
  ), [data.classes, profile, teacherId])
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

  useEffect(() => {
    if (loading || !profile) return
    const role = profile.rol || profile.role
    if (role === 'admin') navigate('/admin-dashboard/', { replace: true })
    if (role === 'estudiante') navigate('/student-dashboard/', { replace: true })
  }, [loading, navigate, profile])

  useEffect(() => {
    if (!selectedClassId && teacherClasses[0]?.id) {
      setSelectedClassId(teacherClasses[0].id)
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
          <nav className="sidebar-nav">
            <a className="active" href="#clases">Clases</a>
            <a href="#asistencia">Asistencia</a>
            <a href="#classrooms">Classrooms</a>
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
              <Link className="btn btn-secondary" to="/login">Cerrar sesion</Link>
            </div>
          </header>

          <section id="clases" className="panel-card admin-card">
            <div className="admin-section-title">
              <div>
                <h2>Clases asignadas</h2>
                <p>Tabla operativa para seleccionar la clase de trabajo.</p>
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
                <span>Estatus</span>
              </div>
              {teacherClasses.map(classItem => {
                const lesson = getLesson(classItem.lessonIds?.[0], data.lessons)
                return (
                  <button className={selectedClass?.id === classItem.id ? 'excel-row excel-button active' : 'excel-row excel-button'} key={classItem.id} type="button" onClick={() => setSelectedClassId(classItem.id)}>
                    <span>{formatDateTime(classItem.startAt)}</span>
                    <span>{getLevel(classItem.levelId || lesson?.levelId, data.levels)?.shortName || '-'}</span>
                    <span>{lesson?.name || '-'}</span>
                    <span>{classItem.classroomName || classItem.room || '-'}</span>
                    <span>{classItem.studentIds?.length || 0}</span>
                    <span>{getClassDurationHours(classItem)}</span>
                    <span>{getEffectiveClassStatus(classItem)}</span>
                  </button>
                )
              })}
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
