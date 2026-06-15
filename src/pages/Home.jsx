import { useState } from 'react'
import { Link } from 'react-router-dom'

function Home() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="landing-body">
      <header className="site-header">
        <div className="container nav-wrapper">
          <Link className="brand" to="/">
            <img src="/logo.jpg" alt="Innova-T English Institute" style={{ width: '40px' }} />
            <span>
              <strong>Innova-T</strong>
              <small>English Institute</small>
            </span>
          </Link>

          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <nav className={`main-nav ${menuOpen ? 'open' : ''}`}>
            <a href="#ofrecemos" onClick={() => setMenuOpen(false)}>Lo que ofrecemos</a>
            <a href="#servicios" onClick={() => setMenuOpen(false)}>Servicios</a>
            <a href="#metodologia" onClick={() => setMenuOpen(false)}>Metodologia</a>
            <a href="#contacto" onClick={() => setMenuOpen(false)}>Contacto</a>
            <Link className="btn btn-outline" to="/login" onClick={() => setMenuOpen(false)}>Iniciar sesion</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="container hero-grid">
            <div>
              <span className="eyebrow">Academia premium de ingles</span>
              <h1>Aprende ingles con una experiencia profesional, clara y moderna.</h1>
              <p className="hero-copy">
                Diseñada para estudiantes, profesionales y ninos que buscan clases personalizadas,
                seguimiento real y una plataforma elegante para reservar, estudiar y avanzar.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary" to="/login">Entrar a la plataforma</Link>
                <a className="btn btn-secondary" href="#servicios">Explorar servicios</a>
              </div>

              <div className="hero-stats">
                <article>
                  <strong>+120</strong>
                  <span>estudiantes guiados</span>
                </article>
                <article>
                  <strong>1:1</strong>
                  <span>acompanamiento personalizado</span>
                </article>
                <article>
                  <strong>100%</strong>
                  <span>enfoque practico y conversacional</span>
                </article>
              </div>
            </div>

            <aside>
              <img src="/1.jpg" alt="Innova-T" style={{ width: '200%' }} />
            </aside>
          </div>
        </section>

        <section className="info-strip">
          <div className="container strip-grid">
            <div>
              <span>Clases personalizadas</span>
              <p>Sesiones individuales, grupales y empresariales.</p>
            </div>
            <div>
              <span>Reservas simples</span>
              <p>Visualiza horarios y gestiona tu agenda facilmente.</p>
            </div>
            <div>
              <span>Seguimiento academico</span>
              <p>Temas vistos, workshops y examenes en un mismo lugar.</p>
            </div>
          </div>
        </section>

        <section id="ofrecemos" className="content-section">
          <div className="container">
            <div className="section-heading">
              <span className="eyebrow">Lo que ofrecemos</span>
              <h2>Una propuesta integral para aprender, practicar y avanzar.</h2>
              <p>
                Esta web combina una web informativa con una plataforma para estudiantes y administracion.
              </p>
            </div>

            <div className="feature-grid">
              <article className="feature-card">
                <h3>Programa por niveles</h3>
                <p>Desde basico hasta avanzado con enfoque comunicativo, gramatica aplicada y speaking real.</p>
              </article>
              <article className="feature-card">
                <h3>Teacher asignado</h3>
                <p>Cada estudiante puede ver su clase asignada, su docente y los detalles previos a la sesion.</p>
              </article>
              <article className="feature-card">
                <h3>Workshops tematicos</h3>
                <p>Refuerzos de pronunciacion, entrevistas, business English y talleres intensivos por objetivo.</p>
              </article>
              <article className="feature-card">
                <h3>Seguimiento de progreso</h3>
                <p>Panel con checklist de asistencia, temas vistos y notas de examenes escritos y orales.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="servicios" className="content-section alternate">
          <div className="container">
            <div className="section-heading">
              <span className="eyebrow">Servicios</span>
              <h2>Soluciones academicas adaptadas a cada perfil.</h2>
            </div>

            <div className="service-grid">
              <article className="service-card">
                <h3>Clases particulares</h3>
                <p>Ideal para objetivos especificos, refuerzo escolar o preparacion para entrevistas.</p>
                <ul>
                  <li>Horarios flexibles</li>
                  <li>Plan personalizado</li>
                  <li>Feedback continuo</li>
                </ul>
              </article>



              <article className="service-card">
                <h3>English for business</h3>
                <p>Enfocado en reuniones, presentaciones, correos y comunicacion profesional.</p>
                <ul>
                  <li>Vocabulario laboral</li>
                  <li>Casos practicos</li>
                  <li>Speaking ejecutivo</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section id="metodologia" className="content-section">
          <div className="container methodology-grid">
            <div>
              <span className="eyebrow">Metodologia</span>
              <h2>Una experiencia clara desde la reserva hasta la evaluacion.</h2>
            </div>

            <div className="timeline">
              <article>
                <strong>1. Reserva tu clase</strong>
                <p>El estudiante visualiza horarios disponibles y agenda su sesion.</p>
              </article>
              <article>
                <strong>2. Recibe asignacion</strong>
                <p>La plataforma muestra teacher, horario y acceso disponible minutos antes.</p>
              </article>
              <article>
                <strong>3. Estudia por temas</strong>
                <p>Cada clase deja registro de contenidos, materiales y progreso.</p>
              </article>
              <article>
                <strong>4. Evalua tu avance</strong>
                <p>Se consultan workshops realizados y resultados de examenes para validar el nivel alcanzado.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="content-section alternate">
          <div className="container testimonial-panel">
            <div>
              <span className="eyebrow">Experiencia visual propuesta</span>
              <h2>Elegante, confiable y lista para vender tu servicio.</h2>
              <p>
                La interfaz usa una paleta cafe, beige y dorado inspirada en tu logo para transmitir
                calidez, profesionalismo y valor premium.
              </p>
            </div>
            <div className="quote-card">
              <p>
                "Una plataforma pensada para operar una academia moderna con paneles claros,
                identidad visual fuerte y seguimiento academico real."
              </p>
              <strong>Presentacion comercial</strong>
            </div>
          </div>
        </section>
      </main>

      <footer id="contacto" className="site-footer">
        <div className="container footer-grid">
          <div>
            <Link className="brand footer-brand" to="/">
              <span className="brand-mark">IT</span>
              <span>
                <strong>Innova-T</strong>
                <small>English Institute</small>
              </span>
            </Link>
            <p>Academia de ingles con enfoque premium, visual moderno y seguimiento personalizado.</p>
          </div>

          <div>
            <h3>Contacto</h3>
            <p>hello@innovatenglish.com</p>
            <p>+52 449 000 0000</p>
            <p>Aguascalientes, Mexico</p>
          </div>

          <div>
            <h3>Accesos</h3>
            <Link to="/login">Login</Link>
            <Link to="/student-dashboard">Panel estudiante</Link>
            <Link to="/admin-dashboard">Panel admin</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Home
