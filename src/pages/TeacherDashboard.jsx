import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { updatePassword } from 'firebase/auth'
import StatusBadge from '../components/StatusBadge'
import { getLesson, getLevel } from '../domain/academicCatalog'
import { formatDateTime, toDate } from '../domain/dateUtils'
import { useInstituteData } from '../services/useInstituteData'

function sortByName(items = []) {
  return [...items].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'es'))
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
    createBulkAttendance,
    saveGrade
  } = useInstituteData()
  const [selectedClassId, setSelectedClassId] = useState('')
  const [attendanceChecked, setAttendanceChecked] = useState({})
  const [gradeForm, setGradeForm] = useState({
    studentId: '',
    levelId: '',
    oral: '',
    written: ''
  })
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  const requireLogin = !loading && (!user || !profile)
  const teacherId = profile?.teacherId || data.teachers.find(teacher => teacher.name === profile?.nombre)?.id || ''
  const teacherProfile = data.teachers.find(teacher => teacher.id === teacherId)
  const teacherClasses = useMemo(() => (
    data.classes
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
  const teacherStudents = useMemo(() => {
    const ids = new Set(teacherClasses.flatMap(classItem => classItem.studentIds || []))
    return sortByName(data.students.filter(student => ids.has(student.id)))
  }, [data.students, teacherClasses])

  useEffect(() => {
    if (!selectedClassId && teacherClasses[0]?.id) {
      setSelectedClassId(teacherClasses[0].id)
    }
  }, [selectedClassId, teacherClasses])

  useEffect(() => {
    if (!selectedClass) {
      setAttendanceChecked({})
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
    if (!gradeForm.studentId && teacherStudents[0]?.id) {
      setGradeForm(prev => ({
        ...prev,
        studentId: teacherStudents[0].id,
        levelId: teacherStudents[0].currentLevelId || ''
      }))
    }
  }, [gradeForm.studentId, teacherStudents])

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

  const submitGrade = async (event) => {
    event.preventDefault()
    await saveGrade(gradeForm)
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
          <Link className="brand" to="/">
            <span className="brand-mark">IT</span>
            <span>
              <strong>Innova-T</strong>
              <small>Teacher Panel</small>
            </span>
          </Link>
          <nav className="sidebar-nav">
            <a className="active" href="#clases">Clases</a>
            <a href="#asistencia">Asistencia</a>
            <a href="#calificaciones">Calificaciones</a>
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
              <p className="page-subtitle">Toma asistencia y captura solo examen oral y escrito por nivel.</p>
            </div>
            <div className="header-actions">
              <Link className="btn btn-secondary" to="/student-dashboard">Vista estudiante</Link>
              <Link className="btn btn-secondary" to="/login">Cerrar sesion</Link>
            </div>
          </header>

          {message && <p className="system-message">{message}</p>}

          <section id="clases" className="panel-card admin-card">
            <div className="admin-section-title">
              <div>
                <h2>Clases asignadas</h2>
                <p>Tabla operativa para seleccionar la clase de trabajo.</p>
              </div>
            </div>
            <div className="excel-table">
              <div className="excel-row excel-head">
                <span>Fecha</span>
                <span>Nivel</span>
                <span>Leccion</span>
                <span>Alumnos</span>
                <span>Estatus</span>
              </div>
              {teacherClasses.map(classItem => {
                const lesson = getLesson(classItem.lessonIds?.[0], data.lessons)
                return (
                  <button className={selectedClass?.id === classItem.id ? 'excel-row excel-button active' : 'excel-row excel-button'} key={classItem.id} type="button" onClick={() => setSelectedClassId(classItem.id)}>
                    <span>{formatDateTime(classItem.startAt)}</span>
                    <span>{getLevel(classItem.levelId || lesson?.levelId, data.levels)?.shortName || '-'}</span>
                    <span>{lesson?.name || '-'}</span>
                    <span>{classItem.studentIds?.length || 0}</span>
                    <span>{classItem.status || 'programada'}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section id="asistencia" className="panel-card admin-card">
            <div className="admin-section-title">
              <div>
                <h2>Tomar asistencia</h2>
                <p>{selectedClass ? getLesson(selectedClass.lessonIds?.[0], data.lessons)?.name : 'Selecciona una clase'}.</p>
              </div>
              {selectedClass && <StatusBadge severity="info">{formatDateTime(selectedClass.startAt)}</StatusBadge>}
            </div>
            <form className="attendance-form" onSubmit={submitAttendance}>
              <div className="attendance-check-grid">
                {classStudents.map(student => (
                  <label className="attendance-check" key={student.id}>
                    <input type="checkbox" checked={attendanceChecked[student.id] === true} onChange={event => setAttendanceChecked(prev => ({ ...prev, [student.id]: event.target.checked }))} />
                    <span>
                      <strong>{student.fullName}</strong>
                      <small>{student.publicId}</small>
                    </span>
                  </label>
                ))}
                {!classStudents.length && <p className="empty-state">La clase seleccionada no tiene alumnos asignados.</p>}
              </div>
              <button className="btn btn-primary small-btn" type="submit" disabled={saving || !classStudents.length}>Confirmar lista</button>
            </form>
          </section>

          <section id="calificaciones" className="panel-card admin-card">
            <div className="admin-section-title">
              <div>
                <h2>Calificaciones</h2>
                <p>Solo examen oral y examen escrito por nivel.</p>
              </div>
            </div>
            <form className="admin-form-grid" onSubmit={submitGrade}>
              <label className="form-field span-2">
                <span>Alumno</span>
                <select value={gradeForm.studentId} onChange={event => {
                  const student = teacherStudents.find(item => item.id === event.target.value)
                  setGradeForm(prev => ({ ...prev, studentId: event.target.value, levelId: student?.currentLevelId || prev.levelId }))
                }} required>
                  <option value="">Seleccionar alumno</option>
                  {teacherStudents.map(student => <option value={student.id} key={student.id}>{student.fullName}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Nivel</span>
                <select value={gradeForm.levelId} onChange={event => setGradeForm(prev => ({ ...prev, levelId: event.target.value }))} required>
                  <option value="">Seleccionar nivel</option>
                  {data.levels.map(level => <option value={level.id} key={level.id}>{level.shortName || level.name}</option>)}
                </select>
              </label>
              <label className="form-field">
                <span>Oral</span>
                <input type="number" min="0" max="100" value={gradeForm.oral} onChange={event => setGradeForm(prev => ({ ...prev, oral: event.target.value }))} />
              </label>
              <label className="form-field">
                <span>Escrito</span>
                <input type="number" min="0" max="100" value={gradeForm.written} onChange={event => setGradeForm(prev => ({ ...prev, written: event.target.value }))} />
              </label>
              <button className="btn btn-primary small-btn" type="submit" disabled={saving}>Guardar calificacion</button>
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
            {passwordMessage && <p className="system-message">{passwordMessage}</p>}
          </section>
        </main>
      </div>
    </div>
  )
}

export default TeacherDashboard
