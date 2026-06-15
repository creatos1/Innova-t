import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ProgressBar from '../components/ProgressBar'
import StatusBadge from '../components/StatusBadge'
import { getLesson, getLevel } from '../domain/academicCatalog'
import { formatDate, formatDateTime } from '../domain/dateUtils'
import { generateGroupRecommendations, generateStudentAiRecommendation } from '../services/aiAdvisor'
import { saveAiRecommendation } from '../services/instituteRepository'
import { useInstituteData } from '../services/useInstituteData'

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
    createAttendance,
    createClass,
    createPayment,
    createStudent,
    markAttendance,
    seedAcademicCatalog
  } = useInstituteData()
  const [aiRecommendations, setAiRecommendations] = useState([])
  const [aiLoadingId, setAiLoadingId] = useState('')
  const [studentForm, setStudentForm] = useState({
    publicId: '',
    uid: '',
    fullName: '',
    email: '',
    phone: '',
    currentLevelId: '',
    currentLessonId: '',
    paymentDueDate: '',
    availability: ''
  })
  const [classForm, setClassForm] = useState({
    levelId: '',
    lessonId: '',
    teacherName: '',
    startAt: '',
    endAt: '',
    capacity: 6,
    studentId: ''
  })
  const [paymentForm, setPaymentForm] = useState({
    studentId: '',
    period: '',
    amount: 0,
    dueDate: '',
    status: 'pendiente'
  })
  const [attendanceForm, setAttendanceForm] = useState({
    studentId: '',
    classId: '',
    attended: 'true',
    hoursCredited: 2
  })

  const groupRecommendations = useMemo(() => (
    generateGroupRecommendations(insights.students, insights.academicBoard.recommendations, data.levels)
  ), [insights.students, insights.academicBoard.recommendations, data.levels])

  const handleGenerateAi = async (student) => {
    setAiLoadingId(student.id)
    const recommendation = await generateStudentAiRecommendation(student, student.scholarshipEvaluation, {
      levels: data.levels,
      lessons: data.lessons
    })
    setAiRecommendations(prev => [
      recommendation,
      ...prev.filter(item => item.studentId !== student.id)
    ])

    await saveAiRecommendation({
      ...recommendation,
      inputSnapshot: {
        studentId: student.id,
        scholarshipEvaluation: student.scholarshipEvaluation
      },
      outputJson: recommendation.aiSummary
    })

    setAiLoadingId('')
  }

  const studentsInRisk = insights.students.filter(student => (
    ['riesgo', 'revision', 'advertencia'].includes(student.scholarshipEvaluation.status)
  ))

  const lessonsForStudentForm = data.lessons.filter(lesson => lesson.levelId === studentForm.currentLevelId)
  const lessonsForClassForm = data.lessons.filter(lesson => lesson.levelId === classForm.levelId)

  const requireLogin = !loading && (!user || !profile)
  const isAdmin = profile?.rol === 'admin'
  const canManage = ['admin', 'teacher'].includes(profile?.rol)

  const submitStudent = async (event) => {
    event.preventDefault()
    await createStudent({
      ...studentForm,
      currentLevelId: studentForm.currentLevelId,
      currentLessonId: studentForm.currentLessonId,
      progressPercent: 0,
      availability: studentForm.availability
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    })
    setStudentForm({
      publicId: '',
      uid: '',
      fullName: '',
      email: '',
      phone: '',
      currentLevelId: '',
      currentLessonId: '',
      paymentDueDate: '',
      availability: ''
    })
  }

  const submitClass = async (event) => {
    event.preventDefault()
    await createClass({
      levelId: classForm.levelId,
      lessonIds: classForm.lessonId ? [classForm.lessonId] : [],
      teacherName: classForm.teacherName,
      startAt: classForm.startAt,
      endAt: classForm.endAt,
      capacity: Number(classForm.capacity || 1),
      studentIds: classForm.studentId ? [classForm.studentId] : [],
      room: 'Por definir',
      mode: 'presencial'
    })
    setClassForm({ levelId: '', lessonId: '', teacherName: '', startAt: '', endAt: '', capacity: 6, studentId: '' })
  }

  const submitPayment = async (event) => {
    event.preventDefault()
    await createPayment(paymentForm)
    setPaymentForm({ studentId: '', period: '', amount: 0, dueDate: '', status: 'pendiente' })
  }

  const submitAttendance = async (event) => {
    event.preventDefault()
    const classItem = data.classes.find(item => item.id === attendanceForm.classId)
    const lesson = getLesson(classItem?.lessonIds?.[0], data.lessons)
    await createAttendance({
      studentId: attendanceForm.studentId,
      classId: attendanceForm.classId,
      className: lesson?.name || 'Clase registrada',
      levelId: classItem?.levelId || '',
      startAt: classItem?.startAt || new Date().toISOString(),
      endAt: classItem?.endAt || new Date().toISOString(),
      attended: attendanceForm.attended === 'true',
      hoursCredited: attendanceForm.attended === 'true' ? Number(attendanceForm.hoursCredited || 0) : 0
    })
    setAttendanceForm({ studentId: '', classId: '', attended: 'true', hoursCredited: 2 })
  }

  return (
    <div className="dashboard-body">
      <div className="dashboard-shell">
        <aside className="sidebar">
          <Link className="brand" to="/">
            <span className="brand-mark">IT</span>
            <span>
              <strong>Innova-T</strong>
              <small>Admin Space</small>
            </span>
          </Link>

          <nav className="sidebar-nav">
            <Link className="active" to="/admin-dashboard">Dashboard</Link>
            <a href="#altas">Altas</a>
            <a href="#becas">Becas</a>
            <a href="#finanzas">Finanzas</a>
            <a href="#academico">Academico</a>
            <a href="#horarios">Horarios</a>
            <a href="#ia">IA</a>
          </nav>

          <div className="sidebar-card compact">
            <span className="kicker">Firebase</span>
            <strong>{profile?.nombre || profile?.email || 'Sin sesion'}</strong>
            <small>Lectura en tiempo real desde Firestore.</small>
            <button className="btn btn-secondary full-width small-btn" type="button" onClick={seedAcademicCatalog} disabled={saving || !isAdmin}>
              {saving ? 'Guardando...' : 'Inicializar catalogo'}
            </button>
          </div>
        </aside>

        <main className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <span className="eyebrow">Operacion academica</span>
              <h1>Control de becas, pagos y progreso</h1>
              <p className="page-subtitle">
                Semana operativa {insights.weekKey}. Las becas se evaluan por pago, 6 horas semanales y avisos con 2 horas de anticipacion.
              </p>
            </div>
            <div className="header-actions">
              <Link className="btn btn-secondary" to="/student-dashboard">Vista estudiante</Link>
              <Link className="btn btn-secondary" to="/login">Cerrar sesion</Link>
            </div>
          </header>

          {message && <p className="system-message">{message}</p>}
          {authError && <p className="system-message">{authError}</p>}
          {loading && <p className="system-message">Cargando datos del instituto...</p>}
          {requireLogin && (
            <section className="panel-card">
              <h2>Necesitas iniciar sesion</h2>
              <p>Para leer Firestore debes entrar con un usuario registrado en Firebase Auth y en la coleccion usuarios.</p>
              <Link className="btn btn-primary" to="/login">Ir al login</Link>
            </section>
          )}

          {!requireLogin && !canManage && (
            <section className="panel-card">
              <h2>Acceso administrativo requerido</h2>
              <p>Tu usuario no tiene rol admin o teacher. Pide que en usuarios/{profile?.uid} el campo rol sea admin o teacher.</p>
            </section>
          )}

          {!requireLogin && canManage && data.levels.length === 0 && (
            <section className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Firestore esta conectado, pero falta catalogo academico</h2>
                  <p>Inicializa niveles y lecciones para que los formularios y el matching academico trabajen con datos reales.</p>
                </div>
                <button className="btn btn-primary small-btn" type="button" onClick={seedAcademicCatalog} disabled={saving || !isAdmin}>
                  Inicializar catalogo
                </button>
              </div>
            </section>
          )}

          {!requireLogin && canManage && (
            <>

          <section id="altas" className="panel-card">
            <div className="panel-head">
              <div>
                <h2>Altas dinamicas en Firebase</h2>
                <p>Todo lo que captures aqui se guarda en Firestore y actualiza los dashboards en tiempo real.</p>
              </div>
            </div>

            <div className="form-grid">
              <form className="ops-form" onSubmit={submitStudent}>
                <h3>Nuevo estudiante</h3>
                <input placeholder="ID publico EST-006" value={studentForm.publicId} onChange={event => setStudentForm(prev => ({ ...prev, publicId: event.target.value }))} required />
                <input placeholder="UID Firebase Auth del estudiante (opcional)" value={studentForm.uid} onChange={event => setStudentForm(prev => ({ ...prev, uid: event.target.value }))} />
                <input placeholder="Nombre completo" value={studentForm.fullName} onChange={event => setStudentForm(prev => ({ ...prev, fullName: event.target.value }))} required />
                <input placeholder="Correo" type="email" value={studentForm.email} onChange={event => setStudentForm(prev => ({ ...prev, email: event.target.value }))} />
                <input placeholder="Telefono" value={studentForm.phone} onChange={event => setStudentForm(prev => ({ ...prev, phone: event.target.value }))} />
                <select value={studentForm.currentLevelId} onChange={event => setStudentForm(prev => ({ ...prev, currentLevelId: event.target.value, currentLessonId: '' }))} required>
                  <option value="">Nivel actual</option>
                  {data.levels.map(level => <option value={level.id} key={level.id}>{level.shortName || level.name}</option>)}
                </select>
                <select value={studentForm.currentLessonId} onChange={event => setStudentForm(prev => ({ ...prev, currentLessonId: event.target.value }))} required>
                  <option value="">Leccion actual</option>
                  {lessonsForStudentForm.map(lesson => <option value={lesson.id} key={lesson.id}>{lesson.order}. {lesson.name}</option>)}
                </select>
                <input type="date" value={studentForm.paymentDueDate} onChange={event => setStudentForm(prev => ({ ...prev, paymentDueDate: event.target.value }))} required />
                <input placeholder="Disponibilidad separada por comas" value={studentForm.availability} onChange={event => setStudentForm(prev => ({ ...prev, availability: event.target.value }))} />
                <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Guardar estudiante</button>
              </form>

              <form className="ops-form" onSubmit={submitClass}>
                <h3>Nueva clase</h3>
                <select value={classForm.levelId} onChange={event => setClassForm(prev => ({ ...prev, levelId: event.target.value, lessonId: '' }))} required>
                  <option value="">Nivel</option>
                  {data.levels.map(level => <option value={level.id} key={level.id}>{level.shortName || level.name}</option>)}
                </select>
                <select value={classForm.lessonId} onChange={event => setClassForm(prev => ({ ...prev, lessonId: event.target.value }))} required>
                  <option value="">Leccion</option>
                  {lessonsForClassForm.map(lesson => <option value={lesson.id} key={lesson.id}>{lesson.order}. {lesson.name}</option>)}
                </select>
                <input placeholder="Teacher" value={classForm.teacherName} onChange={event => setClassForm(prev => ({ ...prev, teacherName: event.target.value }))} required />
                <input type="datetime-local" value={classForm.startAt} onChange={event => setClassForm(prev => ({ ...prev, startAt: event.target.value }))} required />
                <input type="datetime-local" value={classForm.endAt} onChange={event => setClassForm(prev => ({ ...prev, endAt: event.target.value }))} required />
                <input type="number" min="1" placeholder="Cupo" value={classForm.capacity} onChange={event => setClassForm(prev => ({ ...prev, capacity: event.target.value }))} required />
                <select value={classForm.studentId} onChange={event => setClassForm(prev => ({ ...prev, studentId: event.target.value }))}>
                  <option value="">Asignar estudiante opcional</option>
                  {data.students.map(student => <option value={student.id} key={student.id}>{student.fullName}</option>)}
                </select>
                <button className="btn btn-primary small-btn" type="submit" disabled={saving}>Guardar clase</button>
              </form>

              <form className="ops-form" onSubmit={submitPayment}>
                <h3>Nuevo pago</h3>
                <select value={paymentForm.studentId} onChange={event => setPaymentForm(prev => ({ ...prev, studentId: event.target.value }))} required>
                  <option value="">Estudiante</option>
                  {data.students.map(student => <option value={student.id} key={student.id}>{student.fullName}</option>)}
                </select>
                <input placeholder="Periodo 2026-06" value={paymentForm.period} onChange={event => setPaymentForm(prev => ({ ...prev, period: event.target.value }))} required />
                <input type="number" min="0" placeholder="Monto" value={paymentForm.amount} onChange={event => setPaymentForm(prev => ({ ...prev, amount: event.target.value }))} required />
                <input type="date" value={paymentForm.dueDate} onChange={event => setPaymentForm(prev => ({ ...prev, dueDate: event.target.value }))} required />
                <select value={paymentForm.status} onChange={event => setPaymentForm(prev => ({ ...prev, status: event.target.value }))}>
                  <option value="pendiente">Pendiente</option>
                  <option value="pagado">Pagado</option>
                </select>
                <button className="btn btn-primary small-btn" type="submit" disabled={saving || !isAdmin}>Guardar pago</button>
              </form>

              <form className="ops-form" onSubmit={submitAttendance}>
                <h3>Nueva asistencia</h3>
                <select value={attendanceForm.studentId} onChange={event => setAttendanceForm(prev => ({ ...prev, studentId: event.target.value }))} required>
                  <option value="">Estudiante</option>
                  {data.students.map(student => <option value={student.id} key={student.id}>{student.fullName}</option>)}
                </select>
                <select value={attendanceForm.classId} onChange={event => setAttendanceForm(prev => ({ ...prev, classId: event.target.value }))} required>
                  <option value="">Clase</option>
                  {data.classes.map(classItem => <option value={classItem.id} key={classItem.id}>{formatDateTime(classItem.startAt)} - {getLesson(classItem.lessonIds?.[0], data.lessons)?.name || classItem.id}</option>)}
                </select>
                <select value={attendanceForm.attended} onChange={event => setAttendanceForm(prev => ({ ...prev, attended: event.target.value }))}>
                  <option value="true">Asistio</option>
                  <option value="false">Falto</option>
                </select>
                <input type="number" min="0" step="0.5" value={attendanceForm.hoursCredited} onChange={event => setAttendanceForm(prev => ({ ...prev, hoursCredited: event.target.value }))} />
                <button className="btn btn-primary small-btn" type="submit" disabled={saving}>Guardar asistencia</button>
              </form>
            </div>
          </section>

          <section className="dashboard-grid top-grid">
            <article className="metric-card">
              <span>Estudiantes activos</span>
              <strong>{insights.metrics.activeStudents}</strong>
              <small>Perfiles con seguimiento academico</small>
            </article>
            <article className="metric-card">
              <span>Becas en riesgo</span>
              <strong>{insights.metrics.scholarshipRisk}</strong>
              <small>Requieren accion administrativa</small>
            </article>
            <article className="metric-card">
              <span>Pagos vencidos</span>
              <strong>{insights.metrics.overduePayments}</strong>
              <small>Afectan continuidad de beca</small>
            </article>
            <article className="metric-card">
              <span>Avance lento</span>
              <strong>{insights.metrics.slowProgress}</strong>
              <small>Candidatos a refuerzo</small>
            </article>
          </section>

          <section id="becas" className="panel-card">
            <div className="panel-head">
              <div>
                <h2>Motor de becas</h2>
                <p>Evaluacion automatica por pago, asistencia minima y disciplina.</p>
              </div>
              <StatusBadge severity={studentsInRisk.length ? 'risk' : 'ok'}>
                {studentsInRisk.length} alertas
              </StatusBadge>
            </div>

            <div className="data-table">
              <div className="table-row table-head">
                <span>Estudiante</span>
                <span>Estado</span>
                <span>Horas</span>
                <span>Faltas</span>
                <span>Accion</span>
              </div>
              {insights.students.map(student => (
                <div className="table-row" key={student.id}>
                  <div>
                    <strong>{student.fullName}</strong>
                    <small>{student.publicId} - {getLevel(student.currentLevelId, data.levels)?.shortName}</small>
                  </div>
                  <StatusBadge severity={student.scholarshipEvaluation.severity}>
                    {student.scholarshipEvaluation.label}
                  </StatusBadge>
                  <div>
                    <strong>{student.scholarshipEvaluation.weekly.hours}/6 h</strong>
                    <small>faltan {student.scholarshipEvaluation.weekly.missingHours} h</small>
                  </div>
                  <div>
                    <strong>{student.scholarshipEvaluation.discipline.unexcusedAbsences}</strong>
                    <small>sin aviso valido</small>
                  </div>
                  <div>
                    <small>{student.scholarshipEvaluation.actions[0]}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="finanzas" className="dashboard-grid split-grid">
            <article className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Control financiero</h2>
                  <p>Pagos que condicionan continuidad de beca.</p>
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
                        <small>Periodo {payment.period} - limite {formatDate(payment.dueDate)}</small>
                      </div>
                      <StatusBadge severity={payment.status === 'pagado' ? 'ok' : overdue ? 'risk' : 'warning'}>
                        {payment.status === 'pagado' ? 'Pagado' : overdue ? 'Vencido' : 'Pendiente'}
                      </StatusBadge>
                    </div>
                  )
                })}
              </div>
            </article>

            <article className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Asistencia reciente</h2>
                  <p>Registro usado por el motor disciplinario.</p>
                </div>
              </div>
              <div className="stack-list">
                {data.attendance.slice(0, 6).map(record => {
                  const student = data.students.find(item => item.id === record.studentId)
                  return (
                    <div className="list-row attendance-row" key={record.id}>
                      <div>
                        <strong>{student?.fullName}</strong>
                        <small>{record.className} - {formatDateTime(record.startAt)}</small>
                      </div>
                      <div className="row-actions">
                        <button className="btn btn-secondary small-btn" type="button" onClick={() => markAttendance(record.id, true)}>
                          Asistio
                        </button>
                        <button className="btn btn-secondary small-btn" type="button" onClick={() => markAttendance(record.id, false)}>
                          Falto
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </article>
          </section>

          <section id="academico" className="panel-card">
            <div className="panel-head">
              <div>
                <h2>Planeacion academica</h2>
                <p>Matching entre nivel, leccion actual, progreso y siguiente clase.</p>
              </div>
              <StatusBadge severity="info">{insights.academicBoard.readyToAdvance} listos para avanzar</StatusBadge>
            </div>

            <div className="student-grid">
              {insights.students.map(student => {
                const recommendation = student.academicRecommendation
                return (
                  <article className="student-card" key={student.id}>
                    <div className="student-card-head">
                      <div>
                        <strong>{student.fullName}</strong>
                        <small>{recommendation.levelName} - ritmo {recommendation.pace}</small>
                      </div>
                      <StatusBadge severity={recommendation.priority === 'alta' ? 'critical' : recommendation.priority === 'media' ? 'warning' : 'ok'}>
                        {recommendation.priority}
                      </StatusBadge>
                    </div>
                    <ProgressBar value={student.progressPercent} label="Progreso del nivel" />
                    <dl className="compact-facts">
                      <div>
                        <dt>Actual</dt>
                        <dd>{recommendation.currentLesson?.name || 'Sin leccion'}</dd>
                      </div>
                      <div>
                        <dt>Siguiente</dt>
                        <dd>{recommendation.nextLesson?.name || 'Checkpoint'}</dd>
                      </div>
                    </dl>
                    <p>{recommendation.action}</p>
                  </article>
                )
              })}
            </div>
          </section>

          <section id="horarios" className="dashboard-grid split-grid">
            <article className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Horarios y clases</h2>
                  <p>Clases programadas con cupos y asignaciones.</p>
                </div>
              </div>
              <div className="stack-list">
                {data.classes.map(classItem => (
                  <div className="list-row" key={classItem.id}>
                    <div>
                      <strong>{getLevel(classItem.levelId, data.levels)?.shortName} - {getLesson(classItem.lessonIds?.[0], data.lessons)?.name}</strong>
                      <small>{formatDateTime(classItem.startAt)} - {classItem.teacherName} - {classItem.room}</small>
                    </div>
                    <StatusBadge severity="info">
                      {classItem.studentIds?.length || 0}/{classItem.capacity}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel-card">
              <div className="panel-head">
                <div>
                  <h2>Grupos sugeridos</h2>
                  <p>Agrupacion por nivel, ritmo y necesidad academica.</p>
                </div>
              </div>
              <div className="stack-list">
                {groupRecommendations.map(group => (
                  <div className="list-row vertical" key={group.id}>
                    <div>
                      <strong>{group.levelName} - {group.focus}</strong>
                      <small>Cupo sugerido {group.recommendedCapacity}. {group.recommendation}</small>
                    </div>
                    <div className="chip-list">
                      {group.students.map(student => (
                        <span className="chip" key={student.id}>{student.name}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section id="ia" className="panel-card">
            <div className="panel-head">
              <div>
                <h2>IA - recomendaciones inteligentes</h2>
                <p>La IA sugiere; el admin decide. Las becas se calculan con reglas deterministicas.</p>
              </div>
              <StatusBadge severity="info">
                {import.meta.env.VITE_ENABLE_FIREBASE_AI === 'true' ? 'Firebase AI Logic' : 'Reglas locales'}
              </StatusBadge>
            </div>

            <div className="ai-workbench">
              <div className="stack-list">
                {studentsInRisk.concat(insights.students.filter(student => !studentsInRisk.includes(student)).slice(0, 2)).map(student => (
                  <div className="list-row" key={student.id}>
                    <div>
                      <strong>{student.fullName}</strong>
                      <small>{student.scholarshipEvaluation.reasons.join(' | ')}</small>
                    </div>
                    <button className="btn btn-primary small-btn" type="button" onClick={() => handleGenerateAi(student)} disabled={aiLoadingId === student.id}>
                      {aiLoadingId === student.id ? 'Analizando...' : 'Generar match'}
                    </button>
                  </div>
                ))}
              </div>

              <div className="stack-list">
                {aiRecommendations.length === 0 && (
                  <p className="empty-state">Genera una recomendacion para ver el match academico.</p>
                )}
                {aiRecommendations.map(item => (
                  <article className="recommendation-card" key={item.studentId}>
                    <div className="student-card-head">
                      <strong>{insights.students.find(student => student.id === item.studentId)?.fullName}</strong>
                      <StatusBadge severity={item.aiSummary.prioridad === 'alta' ? 'critical' : item.aiSummary.prioridad === 'media' ? 'warning' : 'ok'}>
                        {item.provider}
                      </StatusBadge>
                    </div>
                    <p>{item.aiSummary.accionRecomendada}</p>
                    <small>{item.aiSummary.motivoAtraso}</small>
                    <div className="chip-list">
                      {item.aiSummary.refuerzos.map(topic => (
                        <span className="chip" key={topic}>{topic}</span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default AdminDashboard
