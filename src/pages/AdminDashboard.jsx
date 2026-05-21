import { Link } from 'react-router-dom'

function AdminDashboard() {
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
            <a href="#agenda">Agenda</a>
            <a href="#asignaciones">Asignaciones</a>
            <a href="#progreso">Progreso</a>
            <a href="#reportes">Reportes</a>
          </nav>

          <div className="sidebar-card">
            <span>Resumen del dia</span>
            <strong>18 estudiantes</strong>
            <small>6 clases activas</small>
          </div>
        </aside>

        <main className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <span className="eyebrow">Panel admin / teacher</span>
              <h1>Control academico</h1>
              <p>Vista para gestionar clases, asignaciones y seguimiento de estudiantes.</p>
            </div>
            <div className="header-actions">
              <Link className="btn btn-secondary" to="/login">Cerrar sesion</Link>
            </div>
          </header>

          <section className="dashboard-grid top-grid">
            <article className="metric-card">
              <span>Clases hoy</span>
              <strong>06</strong>
              <small>3 grupales y 3 individuales</small>
            </article>
            <article className="metric-card">
              <span>Estudiantes activos</span>
              <strong>42</strong>
              <small>8 nuevos este mes</small>
            </article>
            <article className="metric-card">
              <span>Tasa de aprobacion</span>
              <strong>94%</strong>
              <small>Promedio trimestral</small>
            </article>
          </section>

          <section id="agenda" className="dashboard-grid split-grid">
            <article className="panel-card">
              <div className="panel-head">
                <h2>Agenda del dia</h2>
              </div>
              <div className="topic-list">
                <div>
                  <strong>4:00 PM - Basic Grammar</strong>
                  <span>Grupo A2</span>
                </div>
                <div>
                  <strong>6:00 PM - Speaking Fluency</strong>
                  <span>Valentina M.</span>
                </div>
                <div>
                  <strong>7:30 PM - Business English</strong>
                  <span>Corporate Team</span>
                </div>
              </div>
            </article>

            <article id="asignaciones" className="panel-card highlight-card">
              <div className="panel-head">
                <h2>Asignar clase</h2>
                <span className="tag">Solo vista</span>
              </div>
              <div className="topic-list">
                <div>
                  <strong>Estudiante</strong>
                  <span>Valentina Montoya</span>
                </div>
                <div>
                  <strong>Teacher</strong>
                  <span>Camila Rojas</span>
                </div>
                <div>
                  <strong>Horario</strong>
                  <span>Hoy - 6:00 PM</span>
                </div>
              </div>
              <button type="button" className="btn btn-primary">Guardar asignacion</button>
            </article>
          </section>

          <section id="progreso" className="dashboard-grid split-grid">
            <article className="panel-card">
              <div className="panel-head">
                <h2>Seguimiento del estudiante</h2>
              </div>
              <ul className="check-list">
                <li className="done">Asistio a Pronunciation Booster</li>
                <li className="done">Completo Oral Assessment</li>
                <li className="done">Reviso Topic Session 16</li>
                <li>Pendiente Written Mock Test</li>
              </ul>
            </article>

            <article id="reportes" className="panel-card">
              <div className="panel-head">
                <h2>Resultados recientes</h2>
              </div>
              <div className="grades-grid">
                <article className="grade-card success">
                  <span>Oral exam</span>
                  <strong>91/100</strong>
                  <small>Passed</small>
                </article>
                <article className="grade-card neutral">
                  <span>Written exam</span>
                  <strong>86/100</strong>
                  <small>Approved</small>
                </article>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  )
}

export default AdminDashboard
