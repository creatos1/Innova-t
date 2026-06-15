import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ProgressBar from '../components/ProgressBar'
import StatusBadge from '../components/StatusBadge'
import { getLesson, getLevel } from '../domain/academicCatalog'
import { formatDate, formatDateTime } from '../domain/dateUtils'
import { getStudentViewModel } from '../domain/instituteState'
import { useInstituteData } from '../services/useInstituteData'

function StudentDashboard() {
  const { data, insights, loading, user, profile, authError, message, notifyAbsence } = useInstituteData()
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [notifiedClassIds, setNotifiedClassIds] = useState([])

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
  const requireLogin = !loading && (!user || !profile)
  const noStudent = !loading && !student

  if (loading) {
    return (
      <div className="dashboard-body">
        <main className="dashboard-main auth-required">
          <section className="panel-card">
            <h1>Cargando panel</h1>
            <p>Conectando con Firebase y leyendo informacion academica.</p>
          </section>
        </main>
      </div>
    )
  }

  if (requireLogin) {
    return (
      <div className="dashboard-body">
        <main className="dashboard-main auth-required">
          <section className="panel-card">
            <h1>Inicia sesion para ver tu panel</h1>
            <p>El panel del estudiante lee tus pagos, asistencias y progreso directamente desde Firebase.</p>
            {authError && <p className="system-message">{authError}</p>}
            <Link className="btn btn-primary" to="/login">Ir al login</Link>
          </section>
        </main>
      </div>
    )
  }

  if (noStudent) {
    return (
      <div className="dashboard-body">
        <main className="dashboard-main auth-required">
          <section className="panel-card">
            <h1>No hay estudiante vinculado</h1>
            <p>Agrega un documento en estudiantes y guarda su id en usuarios/{profile?.uid}.studentId.</p>
            {message && <p className="system-message">{message}</p>}
            <Link className="btn btn-secondary" to="/admin-dashboard">Ir al admin</Link>
          </section>
        </main>
      </div>
    )
  }

  const scholarship = student.scholarshipEvaluation
  const recommendation = student.academicRecommendation
  const latestPayment = payments[0]

  const handleNotifyAbsence = async (classId) => {
    setNotifiedClassIds(prev => (
      prev.includes(classId) ? prev : [...prev, classId]
    ))
    const attendanceRecord = attendance.find(record => record.classId === classId && !record.attended)
    if (attendanceRecord) {
      await notifyAbsence(attendanceRecord.id)
    }
  }

  return (
    <div className="dashboard-body">
      <div className="dashboard-shell">
        <aside className="sidebar">
          <Link className="brand" to="/">
            <span className="brand-mark">IT</span>
            <span>
              <strong>Innova-T</strong>
              <small>Student Space</small>
            </span>
          </Link>

          <nav className="sidebar-nav">
            <Link className="active" to="/student-dashboard">Resumen</Link>
            <a href="#beca">Beca</a>
            <a href="#academico">Academico</a>
            <a href="#clases">Clases</a>
            <a href="#historial">Historial</a>
            <a href="#perfil">Perfil</a>
          </nav>

          <div className="sidebar-card compact">
            <span className="kicker">Firebase</span>
            <label className="field-label" htmlFor="student-select">Perfil visible</label>
            <select
              id="student-select"
              className="select-input"
              value={student.id}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              disabled={profile?.rol === 'estudiante' || profile?.rol === 'student'}
            >
              {insights.students.map(item => (
                <option value={item.id} key={item.id}>{item.fullName}</option>
              ))}
            </select>
            <small>Datos en tiempo real desde Firestore.</small>
          </div>
        </aside>

        <main className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <span className="eyebrow">Panel del estudiante</span>
              <h1>Hola, {student.fullName}</h1>
              <p className="page-subtitle">
                Tu beca se mantiene con pago puntual, 6 horas por semana y avisos de ausencia con minimo 2 horas.
              </p>
            </div>
            <div className="header-actions">
              <Link className="btn btn-secondary" to="/admin-dashboard">Vista admin</Link>
              <Link className="btn btn-secondary" to="/login">Cerrar sesion</Link>
            </div>
          </header>

          {loading && <p className="system-message">Cargando informacion academica...</p>}
          {message && <p className="system-message">{message}</p>}

          <section className="dashboard-grid top-grid">
            <article className="metric-card">
              <span>Estado de beca</span>
              <strong className="metric-text">{scholarship.label}</strong>
              <small>{scholarship.reasons[0]}</small>
            </article>
            <article className="metric-card">
              <span>Horas semanales</span>
              <strong>{scholarship.weekly.hours}/6</strong>
              <small>Faltan {scholarship.weekly.missingHours} horas</small>
            </article>
            <article className="metric-card">
              <span>Pago</span>
              <strong className="metric-text">{scholarship.payment.status}</strong>
              <small>Limite {formatDate(latestPayment?.dueDate || student.paymentDueDate)}</small>
            </article>
            <article className="metric-card">
              <span>Proxima clase</span>
              <strong className="metric-text">{recommendation.nextLesson?.name || 'Checkpoint'}</strong>
              <small>{recommendation.action}</small>
            </article>
          </section>

          <section id="beca" className="dashboard-grid split-grid">
            <article className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Semaforo de beca</h2>
                  <p>Reglas del instituto aplicadas automaticamente.</p>
                </div>
                <StatusBadge severity={scholarship.severity}>{scholarship.label}</StatusBadge>
              </div>

              <div className="rule-checklist">
                <div className={scholarship.payment.isOverdue ? 'rule-item danger' : 'rule-item ok'}>
                  <strong>Pago a tiempo</strong>
                  <small>{scholarship.payment.isOverdue ? 'Pago vencido' : 'Sin bloqueo financiero'}</small>
                </div>
                <div className={scholarship.weekly.meetsWeeklyHours ? 'rule-item ok' : 'rule-item warning'}>
                  <strong>Minimo 6 horas por semana</strong>
                  <small>{scholarship.weekly.hours} horas registradas en {insights.weekKey}</small>
                </div>
                <div className={scholarship.discipline.unexcusedAbsences ? 'rule-item warning' : 'rule-item ok'}>
                  <strong>Avisar 2 horas antes</strong>
                  <small>{scholarship.discipline.unexcusedAbsences} faltas sin aviso valido</small>
                </div>
              </div>

              <ProgressBar value={scholarship.weekly.hours} max={6} label="Cumplimiento semanal" />
            </article>

            <article className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Acciones recomendadas</h2>
                  <p>Prioridades para conservar beca y avanzar.</p>
                </div>
              </div>
              <div className="stack-list">
                {scholarship.actions.map(action => (
                  <div className="list-row" key={action}>
                    <div>
                      <strong>{action}</strong>
                      <small>Regla operativa del programa de becas</small>
                    </div>
                  </div>
                ))}
                {recommendation.reinforcementTopics.map(topic => (
                  <div className="list-row" key={topic}>
                    <div>
                      <strong>Refuerzo: {topic}</strong>
                      <small>Sugerido por matching academico</small>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section id="academico" className="panel-card">
            <div className="panel-head">
              <div>
                <h2>Progreso academico</h2>
                <p>Nivel, leccion actual, siguiente clase y ritmo.</p>
              </div>
              <StatusBadge severity={recommendation.isBehind ? 'warning' : 'ok'}>
                {recommendation.isBehind ? 'Atraso detectado' : 'En ruta'}
              </StatusBadge>
            </div>

            <div className="dashboard-grid split-grid">
              <div>
                <ProgressBar value={student.progressPercent} label={`${getLevel(student.currentLevelId, data.levels)?.shortName || 'Nivel'} completado`} />
                <dl className="compact-facts two-columns">
                  <div>
                    <dt>Nivel actual</dt>
                    <dd>{getLevel(student.currentLevelId, data.levels)?.name}</dd>
                  </div>
                  <div>
                    <dt>Leccion actual</dt>
                    <dd>{recommendation.currentLesson?.name}</dd>
                  </div>
                  <div>
                    <dt>Siguiente clase</dt>
                    <dd>{recommendation.nextLesson?.name || 'Evaluacion de cierre'}</dd>
                  </div>
                  <div>
                    <dt>Ritmo</dt>
                    <dd>{recommendation.pace}</dd>
                  </div>
                </dl>
              </div>

              <div className="highlight-panel">
                <span className="kicker">Matching academico</span>
                <h3>{recommendation.action}</h3>
                <p>
                  El sistema compara tu progreso, horas registradas y leccion actual para sugerir la siguiente accion.
                </p>
                <div className="chip-list">
                  {recommendation.reinforcementTopics.length ? recommendation.reinforcementTopics.map(topic => (
                    <span className="chip" key={topic}>{topic}</span>
                  )) : <span className="chip">avance normal</span>}
                </div>
              </div>
            </div>
          </section>

          <section id="clases" className="dashboard-grid split-grid">
            <article className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Clases programadas</h2>
                  <p>Gestiona avisos de ausencia desde tu panel.</p>
                </div>
              </div>
              <div className="stack-list">
                {upcomingClasses.length === 0 && <p className="empty-state">No hay clases futuras asignadas.</p>}
                {upcomingClasses.map(classItem => {
                  const alreadyNotified = notifiedClassIds.includes(classItem.id)
                  return (
                    <div className="list-row" key={classItem.id}>
                      <div>
                        <strong>{getLesson(classItem.lessonIds?.[0], data.lessons)?.name}</strong>
                        <small>{formatDateTime(classItem.startAt)} - {classItem.teacherName} - {classItem.mode}</small>
                      </div>
                      <button
                        className="btn btn-secondary small-btn"
                        type="button"
                        onClick={() => handleNotifyAbsence(classItem.id)}
                        disabled={alreadyNotified}
                      >
                        {alreadyNotified ? 'Aviso enviado' : 'Avisar ausencia'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </article>

            <article className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Pagos</h2>
                  <p>La fecha limite impacta directamente en la beca.</p>
                </div>
              </div>
              <div className="stack-list">
                {payments.map(payment => (
                  <div className="list-row" key={payment.id}>
                    <div>
                      <strong>Periodo {payment.period}</strong>
                      <small>Limite {formatDate(payment.dueDate)}</small>
                    </div>
                    <StatusBadge severity={payment.status === 'pagado' ? 'ok' : scholarship.payment.isOverdue ? 'risk' : 'warning'}>
                      {payment.status === 'pagado' ? 'Pagado' : 'Pendiente'}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section id="historial" className="dashboard-grid split-grid">
            <article className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Historial de asistencia</h2>
                  <p>Base para horas semanales y disciplina.</p>
                </div>
              </div>
              <div className="stack-list">
                {attendance.map(record => (
                  <div className="list-row" key={record.id}>
                    <div>
                      <strong>{record.className}</strong>
                      <small>{formatDateTime(record.startAt)}</small>
                    </div>
                    <StatusBadge severity={record.attended ? 'ok' : record.absenceNoticeAt ? 'warning' : 'risk'}>
                      {record.attended ? `${record.hoursCredited} h` : record.absenceNoticeAt ? 'Aviso' : 'Sin aviso'}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Calificaciones</h2>
                  <p>Evaluaciones oral y escrita por nivel.</p>
                </div>
              </div>
              <div className="stack-list">
                {grades.map(grade => (
                  <div className="list-row" key={grade.id}>
                    <div>
                      <strong>{getLevel(grade.levelId, data.levels)?.shortName}</strong>
                      <small>Oral {grade.oral ?? '-'} / Escrito {grade.written ?? '-'}</small>
                    </div>
                    <StatusBadge severity={grade.oral && grade.written ? 'ok' : 'info'}>
                      {grade.oral && grade.written ? 'Cerrado' : 'Pendiente'}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section id="perfil" className="panel-card">
            <div className="panel-head">
              <div>
                <h2>Perfil de estudiante</h2>
                <p>Datos operativos para administracion academica.</p>
              </div>
            </div>
            <dl className="compact-facts four-columns">
              <div>
                <dt>ID</dt>
                <dd>{student.publicId}</dd>
              </div>
              <div>
                <dt>Nombre completo</dt>
                <dd>{student.fullName}</dd>
              </div>
              <div>
                <dt>Inscripcion</dt>
                <dd>{formatDate(student.enrollmentDate)}</dd>
              </div>
              <div>
                <dt>Disponibilidad</dt>
                <dd>{student.availability.join(', ')}</dd>
              </div>
            </dl>
          </section>
        </main>
      </div>
    </div>
  )
}

export default StudentDashboard
