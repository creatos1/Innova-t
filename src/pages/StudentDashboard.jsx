import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { updatePassword } from 'firebase/auth'
import StatusBadge from '../components/StatusBadge'
import { getLesson, getLevel } from '../domain/academicCatalog'
import { formatDate, formatDateTime } from '../domain/dateUtils'
import { getStudentViewModel } from '../domain/instituteState'
import {
  buildAutoClassAssignment,
  formatDateInputLabel,
  getDefaultReservationSlot,
  getScheduleHoursForDate,
  isCancelableClass,
  isValidReservationSlot
} from '../domain/scheduleMatcher'
import { useInstituteData } from '../services/useInstituteData'

const TABS = [
  { id: 'reserve', label: 'Reservar clase' },
  { id: 'info', label: 'Info' },
  { id: 'attendance', label: 'Asistencias' },
  { id: 'payments', label: 'Pagos' },
  { id: 'grades', label: 'Calificaciones' }
]

function formatDateSafe(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDateInputLabel(value)
  }

  return formatDate(value)
}

function StudentDashboard() {
  const {
    data,
    insights,
    loading,
    user,
    profile,
    authError,
    message,
    saving,
    setMessage,
    reserveStudentClass,
    cancelStudentReservation
  } = useInstituteData()
  const defaultSlot = useMemo(() => getDefaultReservationSlot(), [])
  const [activeTab, setActiveTab] = useState('reserve')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [reservationForm, setReservationForm] = useState(defaultSlot)
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    if (profile?.studentId) {
      setSelectedStudentId(profile.studentId)
      return
    }

    if (!selectedStudentId && insights.students[0]?.id) {
      setSelectedStudentId(insights.students[0].id)
    }
  }, [profile, selectedStudentId, insights.students])

  const viewModel = useMemo(() => (
    getStudentViewModel(selectedStudentId, data, insights)
  ), [selectedStudentId, data, insights])

  const { student, attendance, payments, grades, upcomingClasses } = viewModel
  const reservationTimes = useMemo(() => (
    getScheduleHoursForDate(reservationForm.date)
      .filter(time => isValidReservationSlot(reservationForm.date, time))
  ), [reservationForm.date])
  const reservationPlan = useMemo(() => {
    if (!student) return null

    try {
      return buildAutoClassAssignment({
        student,
        recommendation: student.academicRecommendation,
        data,
        date: reservationForm.date,
        time: reservationForm.time
      })
    } catch {
      return null
    }
  }, [data, reservationForm.date, reservationForm.time, student])
  const requireLogin = !loading && (!user || !profile)
  const noStudent = !loading && !student

  useEffect(() => {
    if (reservationTimes.includes(reservationForm.time)) return
    setReservationForm(prev => ({
      ...prev,
      time: reservationTimes[0] || ''
    }))
  }, [reservationForm.time, reservationTimes])

  const canCancelClass = (classItem) => isCancelableClass(classItem.startAt)

  const reserveClass = async (event) => {
    event.preventDefault()
    try {
      const assignment = buildAutoClassAssignment({
        student,
        recommendation: student.academicRecommendation,
        data,
        date: reservationForm.date,
        time: reservationForm.time
      })
      await reserveStudentClass(assignment)
    } catch (error) {
      setMessage(error.message || 'No se pudo crear la reserva.')
    }
  }

  const cancelClass = async (classItem) => {
    if (!canCancelClass(classItem)) return
    await cancelStudentReservation(classItem.id, student.id)
  }

  const changePassword = async (event) => {
    event.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      setMessage('La nueva contrasena debe tener minimo 6 caracteres.')
      return
    }

    try {
      await updatePassword(user, newPassword)
      setNewPassword('')
      setMessage('Contrasena actualizada.')
    } catch (error) {
      setMessage(error.code === 'auth/requires-recent-login'
        ? 'Por seguridad, cierra sesion, vuelve a entrar y cambia la contrasena de nuevo.'
        : error.message || 'No se pudo cambiar la contrasena.')
    }
  }

  if (loading) {
    return (
      <div className="dashboard-body admin-system excel-system">
        <main className="dashboard-main auth-required">
          <section className="panel-card admin-card">
            <h1>Cargando panel</h1>
          </section>
        </main>
      </div>
    )
  }

  if (requireLogin) {
    return (
      <div className="dashboard-body admin-system excel-system">
        <main className="dashboard-main auth-required">
          <section className="panel-card admin-card">
            <h1>Inicia sesion</h1>
            {authError && <p className="system-message">{authError}</p>}
            <Link className="btn btn-primary" to="/login">Ir al login</Link>
          </section>
        </main>
      </div>
    )
  }

  if (noStudent) {
    return (
      <div className="dashboard-body admin-system excel-system">
        <main className="dashboard-main auth-required">
          <section className="panel-card admin-card">
            <h1>No hay estudiante vinculado</h1>
            <p>El usuario necesita studentId en usuarios/{profile?.uid}.</p>
            {message && <p className="system-message">{message}</p>}
          </section>
        </main>
      </div>
    )
  }

  const scholarship = student.scholarshipEvaluation
  const recommendation = student.academicRecommendation
  const currentLevel = getLevel(student.currentLevelId, data.levels)
  const currentLesson = getLesson(student.currentLessonId, data.lessons)

  const renderReserveTab = () => (
    <section className="admin-tab-grid">
      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Reservar clase</h2>
            <p>Elige dia y hora. El sistema acomoda nivel, leccion y teacher automaticamente.</p>
          </div>
          <StatusBadge severity="info">1 hora</StatusBadge>
        </div>

        <dl className="compact-facts four-columns">
          <div>
            <dt>Nivel</dt>
            <dd>{currentLevel?.shortName || '-'}</dd>
          </div>
          <div>
            <dt>Leccion actual</dt>
            <dd>{currentLesson?.name || '-'}</dd>
          </div>
          <div>
            <dt>Siguiente clase</dt>
            <dd>{reservationPlan?.lesson?.name || recommendation.nextLesson?.name || '-'}</dd>
          </div>
          <div>
            <dt>Teacher sugerido</dt>
            <dd>{reservationPlan?.teacher?.name || 'Por asignar'}</dd>
          </div>
        </dl>

        <form className="admin-form-grid section-gap" onSubmit={reserveClass}>
          <label className="form-field">
            <span>Fecha</span>
            <input
              type="date"
              value={reservationForm.date}
              min={defaultSlot.date}
              onChange={event => setReservationForm(prev => ({ ...prev, date: event.target.value }))}
              required
            />
          </label>
          <label className="form-field">
            <span>Hora</span>
            <select value={reservationForm.time} onChange={event => setReservationForm(prev => ({ ...prev, time: event.target.value }))} required>
              {reservationTimes.map(time => <option value={time} key={time}>{time}</option>)}
            </select>
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving || !reservationPlan}>
            Reservar clase
          </button>
        </form>

        {reservationPlan ? (
          <div className="list-row section-gap">
            <div>
              <strong>{reservationPlan.level?.shortName || 'Nivel'} - {reservationPlan.lesson?.name}</strong>
              <small>{formatDateInputLabel(reservationForm.date)} {reservationForm.time} - {reservationPlan.reason}</small>
            </div>
            <StatusBadge severity="ok">Disponible</StatusBadge>
          </div>
        ) : (
          <p className="empty-state section-gap">Selecciona un horario con minimo 24 horas de anticipacion.</p>
        )}
      </article>

      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Mis clases</h2>
            <p>Cancelacion disponible hasta 2 horas antes.</p>
          </div>
        </div>
        <table className="excel-grid-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Clase</th>
              <th>Teacher</th>
              <th>Estatus</th>
              <th>Accion</th>
            </tr>
          </thead>
          <tbody>
            {upcomingClasses.map(classItem => (
              <tr key={classItem.id}>
                <td>{formatDateTime(classItem.startAt)}</td>
                <td>{getLesson(classItem.lessonIds?.[0], data.lessons)?.name || classItem.lessonName || '-'}</td>
                <td>{classItem.teacherName || 'Por asignar'}</td>
                <td>{classItem.status || 'programada'}</td>
                <td>
                  <button className="btn btn-secondary small-btn" type="button" onClick={() => cancelClass(classItem)} disabled={!canCancelClass(classItem)}>
                    {canCancelClass(classItem) ? 'Cancelar' : 'Cerrado'}
                  </button>
                </td>
              </tr>
            ))}
            {!upcomingClasses.length && (
              <tr>
                <td colSpan="5">No tienes clases reservadas.</td>
              </tr>
            )}
          </tbody>
        </table>
      </article>
    </section>
  )

  const renderInfoTab = () => (
    <section className="admin-tab-grid">
      <article className="panel-card admin-card">
        <div className="admin-section-title">
          <div>
            <h2>Info</h2>
            <p>Estado general de beca y datos personales.</p>
          </div>
          <StatusBadge severity={scholarship.severity}>{scholarship.label}</StatusBadge>
        </div>
        <dl className="compact-facts four-columns">
          <div>
            <dt>ID</dt>
            <dd>{student.publicId}</dd>
          </div>
          <div>
            <dt>Nombre</dt>
            <dd>{student.fullName}</dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>{student.email || '-'}</dd>
          </div>
          <div>
            <dt>Telefono</dt>
            <dd>{student.phone || '-'}</dd>
          </div>
          <div>
            <dt>Inscripcion</dt>
            <dd>{formatDateSafe(student.enrollmentDate)}</dd>
          </div>
          <div>
            <dt>Beca</dt>
            <dd>{student.scholarshipStatus || 'activa'}</dd>
          </div>
          <div>
            <dt>Horas semana</dt>
            <dd>{scholarship.weekly.hours}/6</dd>
          </div>
          <div>
            <dt>Pago</dt>
            <dd>{scholarship.payment.status}</dd>
          </div>
        </dl>
      </article>

      <article className="panel-card admin-card">
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
      </article>
    </section>
  )

  const renderAttendanceTab = () => (
    <section className="panel-card admin-card">
      <div className="admin-section-title">
        <div>
          <h2>Asistencias</h2>
          <p>Tabla de clases tomadas y faltas registradas.</p>
        </div>
      </div>
      <table className="excel-grid-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Clase</th>
            <th>Resultado</th>
            <th>Horas</th>
            <th>Aviso</th>
          </tr>
        </thead>
        <tbody>
          {attendance.map(record => (
            <tr key={record.id}>
              <td>{formatDateTime(record.startAt)}</td>
              <td>{record.className || '-'}</td>
              <td>{record.attended ? 'Asistio' : 'Falto'}</td>
              <td>{record.hoursCredited || 0}</td>
              <td>{record.absenceNoticeAt ? 'Con aviso' : '-'}</td>
            </tr>
          ))}
          {!attendance.length && (
            <tr>
              <td colSpan="5">Aun no hay asistencias.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )

  const renderPaymentsTab = () => (
    <section className="panel-card admin-card">
      <div className="admin-section-title">
        <div>
          <h2>Pagos</h2>
          <p>El pago puntual mantiene la beca activa.</p>
        </div>
      </div>
      <table className="excel-grid-table">
        <thead>
          <tr>
            <th>Periodo</th>
            <th>Limite</th>
            <th>Monto</th>
            <th>Estatus</th>
          </tr>
        </thead>
        <tbody>
          {payments.map(payment => (
            <tr key={payment.id}>
              <td>{payment.period || '-'}</td>
              <td>{formatDateSafe(payment.dueDate)}</td>
              <td>${payment.amount || 0}</td>
              <td>{payment.status || 'pendiente'}</td>
            </tr>
          ))}
          {!payments.length && (
            <tr>
              <td colSpan="4">Aun no hay pagos registrados.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )

  const renderGradesTab = () => (
    <section className="panel-card admin-card">
      <div className="admin-section-title">
        <div>
          <h2>Calificaciones</h2>
          <p>Solo examen oral y escrito por nivel.</p>
        </div>
      </div>
      <table className="excel-grid-table">
        <thead>
          <tr>
            <th>Nivel</th>
            <th>Oral</th>
            <th>Escrito</th>
            <th>Estatus</th>
          </tr>
        </thead>
        <tbody>
          {grades.map(grade => (
            <tr key={grade.id}>
              <td>{getLevel(grade.levelId, data.levels)?.shortName || grade.levelId}</td>
              <td>{grade.oral ?? '-'}</td>
              <td>{grade.written ?? '-'}</td>
              <td>{grade.oral != null && grade.written != null ? 'Capturada' : 'Pendiente'}</td>
            </tr>
          ))}
          {!grades.length && (
            <tr>
              <td colSpan="4">Aun no hay calificaciones.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )

  const renderActiveTab = () => {
    if (activeTab === 'reserve') return renderReserveTab()
    if (activeTab === 'info') return renderInfoTab()
    if (activeTab === 'attendance') return renderAttendanceTab()
    if (activeTab === 'payments') return renderPaymentsTab()
    return renderGradesTab()
  }

  return (
    <div className="dashboard-body admin-system excel-system">
      <div className="dashboard-shell">
        <aside className="sidebar admin-sidebar">
          <Link className="brand" to="/">
            <span className="brand-mark">IT</span>
            <span>
              <strong>Innova-T</strong>
              <small>Student Panel</small>
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
            <span className="kicker">Alumno</span>
            <strong>{student.publicId}</strong>
            <small>{currentLevel?.shortName || 'Sin nivel'} - {currentLesson?.name || 'Sin leccion'}</small>
          </div>
        </aside>

        <main className="dashboard-main admin-main">
          <header className="dashboard-header admin-header">
            <div>
              <span className="eyebrow">Panel alumno</span>
              <h1>{student.fullName}</h1>
              <p className="page-subtitle">Reserva clases, revisa pagos, asistencias y calificaciones.</p>
            </div>
            <div className="header-actions">
              <Link className="btn btn-secondary" to="/login">Cerrar sesion</Link>
            </div>
          </header>

          {message && <p className="system-message">{message}</p>}
          <section className="admin-active-panel">
            {renderActiveTab()}
          </section>
        </main>
      </div>
    </div>
  )
}

export default StudentDashboard
