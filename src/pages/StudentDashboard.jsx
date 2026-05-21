import { useState } from 'react'
import { Link } from 'react-router-dom'

function StudentDashboard() {
  const [selectedSlot, setSelectedSlot] = useState('Lun 5:00 PM')
  const slots = ['Lun 5:00 PM', 'Mar 7:00 PM', 'Mie 6:30 PM', 'Vie 5:30 PM']

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
            <a href="#reservas">Reservas</a>
            <a href="#clase-asignada">Clase asignada</a>
            <a href="#temas">Temas</a>
            <a href="#workshops">Workshops</a>
            <a href="#calificaciones">Calificaciones</a>
          </nav>

          <div className="sidebar-card">
            <span>Estado actual</span>
            <strong>Intermediate B1</strong>
            <small>Meta siguiente: B2 Conversation</small>
          </div>
        </aside>

        <main className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <span className="eyebrow">Panel del estudiante</span>
              <h1>Hola, Valentina</h1>
              <p>Visualiza tus clases, temas cubiertos, asistencia y resultados academicos.</p>
            </div>
            <div className="header-actions">
              <Link className="btn btn-secondary" to="/login">Cerrar sesion</Link>
            </div>
          </header>

          <section className="dashboard-grid top-grid">
            <article className="metric-card">
              <span>Clases reservadas</span>
              <strong>08</strong>
              <small>2 para esta semana</small>
            </article>
            <article className="metric-card">
              <span>Workshops completados</span>
              <strong>12</strong>
              <small>Ultimo: Interview Skills</small>
            </article>
            <article className="metric-card">
              <span>Promedio general</span>
              <strong>89/100</strong>
              <small>Resultado sobresaliente</small>
            </article>
          </section>

          <section id="reservas" className="dashboard-grid split-grid">
            <article className="panel-card">
              <div className="panel-head">
                <h2>Reservar clase</h2>

              </div>
              <p>Selecciona el horario que mejor se adapte a tu agenda.</p>
              <div className="slot-grid">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={`slot-btn ${selectedSlot === slot ? 'selected' : ''}`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </article>

            <article id="clase-asignada" className="panel-card highlight-card">
              <div className="panel-head">
                <h2>Clase asignada por el teacher</h2>
                <span className="availability">Disponible en 10 min</span>
              </div>
              <div className="assigned-class">
                <strong>Speaking Fluency Session</strong>
                <p>Teacher Camila Rojas</p>
                <small>Hoy, 6:00 PM - Sala 02</small>
              </div>
              <a className="btn btn-primary" href="#">Entrar a la clase</a>
            </article>
          </section>

          <section id="temas" className="dashboard-grid split-grid">
            <article className="panel-card">
              <div className="panel-head">
                <h2>Temas de tus clases</h2>
              </div>
              <div className="topic-list">
                <div>
                  <strong>Present Perfect vs Past Simple</strong>
                  <span>Sesion 14</span>
                </div>
                <div>
                  <strong>Business introductions</strong>
                  <span>Sesion 15</span>
                </div>
                <div>
                  <strong>Pronunciation: ending sounds</strong>
                  <span>Sesion 16</span>
                </div>
              </div>
            </article>

            <article id="workshops" className="panel-card">
              <div className="panel-head">
                <h2>Workshops asistidos</h2>
              </div>
              <ul className="check-list">
                <li className="done">Pronunciation Booster</li>
                <li className="done">CV & Interview Lab</li>
                <li className="done">Speaking Confidence Workshop</li>
                <li>Business Email Writing</li>
              </ul>
            </article>
          </section>

          <section id="calificaciones" className="panel-card">
            <div className="panel-head">
              <h2>Calificaciones de examenes</h2>
              <span className="tag">Estado academico</span>
            </div>

            <div className="grades-grid">
              <article className="grade-card success">
                <span>Examen escrito</span>
                <strong>86/100</strong>
                <small>Passed</small>
              </article>
              <article className="grade-card success">
                <span>Examen oral</span>
                <strong>91/100</strong>
                <small>Passed</small>
              </article>
              <article className="grade-card neutral">
                <span>Resultado final</span>
                <strong>Aprobado</strong>
                <small>Listo para siguiente nivel</small>
              </article>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default StudentDashboard
