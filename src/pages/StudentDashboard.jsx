import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { updatePassword } from 'firebase/auth'
import ActionMessageModal from '../components/ActionMessageModal'
import BrandLogo from '../components/BrandLogo'
import StatusBadge from '../components/StatusBadge'
import SystemControls, { useUiLanguage } from '../components/SystemControls'
import { getLesson, getLevel } from '../domain/academicCatalog'
import { formatDate, formatDateTime, toDate } from '../domain/dateUtils'
import { getStudentViewModel } from '../domain/instituteState'
import {
  addHoursToTimeValue,
  buildAutoClassAssignment,
  formatTimeLabel,
  formatTimeRangeLabel,
  formatDateInputLabel,
  getClassDateValue,
  getConsecutiveReservationDurations,
  getDefaultReservationSlot,
  getNextReservationDate,
  getScheduleHoursForDate,
  isCancelableClass,
  isValidReservationSlot
} from '../domain/scheduleMatcher'
import { downloadPaymentReceipt } from '../services/paymentReceiptPdf'
import { useInstituteData } from '../services/useInstituteData'

const TABS = [
  { id: 'reserve', label: 'Reservar clase', labelEn: 'Book class' },
  { id: 'info', label: 'Info', labelEn: 'Info' },
  { id: 'attendance', label: 'Asistencias', labelEn: 'Attendance' },
  { id: 'payments', label: 'Pagos', labelEn: 'Payments' },
  { id: 'grades', label: 'Calificaciones', labelEn: 'Grades' }
]

function formatDateSafe(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDateInputLabel(value)
  }

  return formatDate(value)
}

function getReservationWeekKey(dateValue) {
  if (!dateValue) return ''
  const date = new Date(`${dateValue}T12:00:00-06:00`)
  date.setUTCDate(date.getUTCDate() - date.getUTCDay())
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function getEffectiveClassStatus(classItem) {
  if (classItem.status === 'cancelada') return 'cancelada'
  if (classItem.status === 'pendiente_asignacion' || !classItem.teacherId) return 'pendiente_asignacion'
  const endAt = toDate(classItem.endAt)
  return endAt && endAt < new Date() ? 'completada' : 'programada'
}

function getReservedClassHours(classItem) {
  const hours = Number(classItem.durationHours || 1)
  return Number.isFinite(hours) ? Math.max(1, hours) : 1
}

function buildUntilOptions(startTime, durations = []) {
  return durations.map(durationHours => {
    const endTime = addHoursToTimeValue(startTime, durationHours)
    return {
      durationHours,
      endTime,
      label: formatTimeRangeLabel(startTime, endTime)
    }
  })
}

function StudentDashboard() {
  const uiLanguage = useUiLanguage()
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
  const defaultSlot = useMemo(() => {
    const slot = getDefaultReservationSlot()
    return { ...slot, endTime: addHoursToTimeValue(slot.time, 1) }
  }, [])
  const [activeTab, setActiveTab] = useState('reserve')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [reservationForm, setReservationForm] = useState(defaultSlot)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const navigate = useNavigate()
  const logoutLabel = uiLanguage === 'en' ? 'Log out' : 'Cerrar sesion'
  const menuLabel = uiLanguage === 'en' ? 'Menu' : 'Menu'

  useEffect(() => {
    if (loading || !profile) return
    const role = profile.rol || profile.role
    if (role === 'admin') navigate('/admin-dashboard/', { replace: true })
    if (role === 'teacher') navigate('/teacher-dashboard/', { replace: true })
  }, [loading, navigate, profile])

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
  const tomorrowDate = useMemo(() => getNextReservationDate(), [])
  const studentReservations = useMemo(() => (
    data.classes.filter(classItem => (
      classItem.studentIds?.includes(student?.id)
      && (classItem.status || 'programada') !== 'cancelada'
    ))
  ), [data.classes, student?.id])
  const dayReservedHours = useMemo(() => (
    studentReservations.filter(classItem => (
      (classItem.date || getClassDateValue(classItem.startAt)) === reservationForm.date
    )).reduce((sum, classItem) => sum + getReservedClassHours(classItem), 0)
  ), [reservationForm.date, studentReservations])
  const weekReservedHours = useMemo(() => {
    const targetWeek = getReservationWeekKey(reservationForm.date)
    return studentReservations.filter(classItem => (
      getReservationWeekKey(classItem.date || getClassDateValue(classItem.startAt)) === targetWeek
    )).reduce((sum, classItem) => sum + getReservedClassHours(classItem), 0)
  }, [reservationForm.date, studentReservations])
  const remainingDayHours = Math.max(0, 3 - dayReservedHours)
  const remainingWeekHours = Math.max(0, 6 - weekReservedHours)
  const hasReservedBlockForDate = dayReservedHours > 0
  const maxReservationHours = hasReservedBlockForDate ? 0 : Math.min(3, remainingDayHours, remainingWeekHours)
  const reservationTimes = useMemo(() => (
    getScheduleHoursForDate(reservationForm.date)
      .filter(time => isValidReservationSlot(reservationForm.date, time, new Date(), data.blockouts))
  ), [data.blockouts, reservationForm.date])
  const reservationDurations = useMemo(() => (
    getConsecutiveReservationDurations(reservationForm.date, reservationForm.time, new Date(), data.blockouts)
      .filter(hours => hours <= maxReservationHours)
  ), [data.blockouts, maxReservationHours, reservationForm.date, reservationForm.time])
  const reservationUntilOptions = useMemo(() => (
    buildUntilOptions(reservationForm.time, reservationDurations)
  ), [reservationDurations, reservationForm.time])
  const selectedReservationDuration = useMemo(() => {
    const selected = reservationUntilOptions.find(option => option.endTime === reservationForm.endTime)
    return selected?.durationHours || reservationUntilOptions[0]?.durationHours || 1
  }, [reservationForm.endTime, reservationUntilOptions])
  const reservationPlan = useMemo(() => {
    if (!student) return null

    try {
      return buildAutoClassAssignment({
        student,
        recommendation: student.academicRecommendation,
        data,
        date: reservationForm.date,
        time: reservationForm.time,
        durationHours: selectedReservationDuration
      })
    } catch {
      return null
    }
  }, [data, reservationForm.date, reservationForm.time, selectedReservationDuration, student])
  const requireLogin = !loading && (!user || !profile)
  const noStudent = !loading && !student

  useEffect(() => {
    if (reservationForm.date !== tomorrowDate) {
      setReservationForm(prev => ({ ...prev, date: tomorrowDate }))
      return
    }

    if (reservationTimes.includes(reservationForm.time)) return
    setReservationForm(prev => ({
      ...prev,
      time: reservationTimes[0] || '',
      endTime: addHoursToTimeValue(reservationTimes[0] || '', 1)
    }))
  }, [reservationForm.date, reservationForm.time, reservationTimes, tomorrowDate])

  useEffect(() => {
    if (!reservationUntilOptions.length) return
    if (reservationUntilOptions.some(option => option.endTime === reservationForm.endTime)) return
    setReservationForm(prev => ({ ...prev, endTime: reservationUntilOptions[0].endTime }))
  }, [reservationForm.endTime, reservationUntilOptions])

  const canCancelClass = (classItem) => (
    isCancelableClass(classItem.startAt)
    && classItem.reservationSource === 'student-auto'
    && classItem.status === 'pendiente_asignacion'
    && !classItem.teacherId
  )

  const reserveClass = async (event) => {
    event.preventDefault()
    try {
      if (remainingDayHours <= 0) {
        setMessage('Ya tienes 3 horas reservadas para ese dia.')
        return
      }
      if (hasReservedBlockForDate) {
        setMessage('Ya tienes un bloque reservado para ese dia. Cancela ese bloque si necesitas cambiar el rango.')
        return
      }
      if (remainingWeekHours <= 0) {
        setMessage('Ya tienes las 6 horas de esta semana. Se reinicia el domingo.')
        return
      }
      if (!reservationDurations.includes(selectedReservationDuration)) {
        setMessage('Elige un bloque disponible de 1 a 3 horas seguidas.')
        return
      }

      const assignment = buildAutoClassAssignment({
        student,
        recommendation: student.academicRecommendation,
        data,
        date: reservationForm.date,
        time: reservationForm.time,
        durationHours: selectedReservationDuration
      })
      await reserveStudentClass(assignment)
    } catch (error) {
      setMessage(error.message || 'No se pudo crear la reserva.')
    }
  }

  const cancelClass = async (classItem) => {
    if (!canCancelClass(classItem)) {
      setMessage('Esta clase ya fue formada por admin y ya no se puede cancelar desde alumno.')
      return
    }
    await cancelStudentReservation(classItem.id, student.id)
  }

  const changePassword = async (event) => {
    event.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      setMessage('La nueva contrasena debe tener minimo 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage('La confirmacion de contrasena no coincide.')
      return
    }

    try {
      await updatePassword(user, newPassword)
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Contrasena actualizada.')
    } catch (error) {
      setMessage(error.code === 'auth/requires-recent-login'
        ? 'Por seguridad, cierra sesion, vuelve a entrar y cambia la contrasena de nuevo.'
        : error.message || 'No se pudo cambiar la contrasena.')
    }
  }

  const downloadReceipt = async (payment) => {
    try {
      await downloadPaymentReceipt({ student, payment })
    } catch (error) {
      console.warn(error)
      setMessage('No se pudo descargar el recibo. Intenta nuevamente.')
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
            <p>Este acceso todavia no esta conectado a un perfil de alumno. Pide al administrador que revise el registro.</p>
          </section>
          <ActionMessageModal message={message} onClose={() => setMessage('')} />
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
            <p>Reserva de 1 a 3 horas por dia sin pasar 6 horas por semana.</p>
          </div>
          <StatusBadge severity="info">{selectedReservationDuration} h</StatusBadge>
        </div>

        <dl className="compact-facts four-columns">
          <div>
            <dt>Nivel actual</dt>
            <dd>{currentLevel?.shortName || '-'}</dd>
          </div>
          <div>
            <dt>Semana</dt>
            <dd>{weekReservedHours}/6 horas</dd>
          </div>
          <div>
            <dt>Disponible</dt>
            <dd>{maxReservationHours} horas</dd>
          </div>
        </dl>

        <form className="admin-form-grid section-gap" onSubmit={reserveClass}>
          <label className="form-field">
            <span>Hora</span>
            <select value={reservationForm.time} onChange={event => setReservationForm(prev => ({ ...prev, time: event.target.value }))} required>
              {reservationTimes.map(time => <option value={time} key={time}>{formatTimeLabel(time)}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Hasta</span>
            <select value={reservationForm.endTime || ''} onChange={event => setReservationForm(prev => ({ ...prev, endTime: event.target.value }))} required>
              {reservationUntilOptions.map(option => (
                <option value={option.endTime} key={option.endTime}>{option.label}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary small-btn" type="submit" disabled={saving || !reservationPlan || !reservationDurations.length || hasReservedBlockForDate || remainingDayHours <= 0 || remainingWeekHours <= 0}>
            Reservar bloque
          </button>
        </form>

        {!reservationTimes.length && <p className="empty-state section-gap">No hay horarios disponibles para reservar.</p>}
        {hasReservedBlockForDate && <p className="empty-state section-gap">Ya tienes un bloque reservado para ese dia. Para cambiarlo, cancela el bloque actual y reserva de nuevo.</p>}
        {!!reservationTimes.length && !reservationDurations.length && <p className="empty-state section-gap">No hay un bloque seguido disponible en ese horario o ya llegaste al limite diario/semanal.</p>}
        {remainingWeekHours <= 0 && <p className="empty-state section-gap">Ya completaste tus 6 horas de la semana.</p>}
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
              <th>Accion</th>
              <th>Clase</th>
              <th>Teacher</th>
              <th>Horas</th>
              <th>Estatus</th>
            </tr>
          </thead>
          <tbody>
            {upcomingClasses.map(classItem => (
              <tr key={classItem.id}>
                <td>{formatDateTime(classItem.startAt)}</td>
                <td>
                  <button className="btn btn-secondary small-btn" type="button" onClick={() => cancelClass(classItem)} disabled={!canCancelClass(classItem)}>
                    {canCancelClass(classItem) ? 'Cancelar' : 'Cerrado'}
                  </button>
                </td>
                <td>{getLesson(classItem.lessonIds?.[0], data.lessons)?.name || classItem.lessonName || 'Pendiente'}</td>
                <td>{classItem.teacherName || 'Pendiente admin'}</td>
                <td>{getReservedClassHours(classItem)}</td>
                <td>{getEffectiveClassStatus(classItem)}</td>
              </tr>
            ))}
            {!upcomingClasses.length && (
              <tr>
                <td colSpan="6">No tienes clases reservadas.</td>
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
          <label className="form-field span-2">
            <span>Confirmar contrasena</span>
            <input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Repite tu contrasena" />
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
            <th>Recibo</th>
          </tr>
        </thead>
        <tbody>
          {payments.map(payment => (
            <tr key={payment.id}>
              <td>{payment.period || '-'}</td>
              <td>{formatDateSafe(payment.dueDate)}</td>
              <td>${payment.amount || 0}</td>
              <td>{payment.status || 'pendiente'}</td>
              <td>
                <button className="btn btn-secondary small-btn" type="button" onClick={() => downloadReceipt(payment)} disabled={payment.status !== 'pagado' && !payment.paidAt}>
                  Descargar PDF
                </button>
              </td>
            </tr>
          ))}
          {!payments.length && (
            <tr>
              <td colSpan="5">Aun no hay pagos registrados.</td>
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
          <BrandLogo panel="Student Panel" />

          <button
            className="hamburger-menu-button"
            type="button"
            onClick={() => setIsMobileMenuOpen(open => !open)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="student-tabs-menu"
          >
            {menuLabel}
          </button>

          <nav id="student-tabs-menu" className={isMobileMenuOpen ? 'sidebar-nav admin-tabs-nav open' : 'sidebar-nav admin-tabs-nav'}>
            {TABS.map(tab => (
              <button
                className={activeTab === tab.id ? 'active' : ''}
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id)
                  setIsMobileMenuOpen(false)
                }}
              >
                {uiLanguage === 'en' ? tab.labelEn : tab.label}
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
              <SystemControls />
              <Link className="btn btn-secondary" to="/login">{logoutLabel}</Link>
            </div>
          </header>

          <section className="admin-active-panel">
            {renderActiveTab()}
          </section>
          <ActionMessageModal message={message} onClose={() => setMessage('')} />
        </main>
      </div>
    </div>
  )
}

export default StudentDashboard
