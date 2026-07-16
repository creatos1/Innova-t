import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import BrandLogo from '../components/BrandLogo'

const PHONE = '+52 449 312 5789'
const WHATSAPP_URL = 'https://wa.me/524493125789?text=Hola%20Innova-T%2C%20quiero%20informacion%20sobre%20las%20clases%20de%20ingles.'

function Home() {
  const [menuOpen, setMenuOpen] = useState(false)
  const pageRef = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.gsap-rise', {
        y: 22,
        opacity: 0,
        duration: 0.75,
        ease: 'power3.out',
        stagger: 0.08
      })
      gsap.from('.system-preview-card', {
        scale: 0.96,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.out',
        delay: 0.15
      })
      gsap.from('.showtime-line', {
        x: 18,
        opacity: 0,
        duration: 0.65,
        ease: 'power3.out',
        stagger: 0.08,
        delay: 0.35
      })
      gsap.to('.brand-logo', {
        y: -2,
        duration: 1.8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      })
    }, pageRef)

    return () => ctx.revert()
  }, [])

  return (
    <div className="landing-body landing-system" ref={pageRef}>
      <header className="site-header">
        <div className="container nav-wrapper">
          <BrandLogo />

          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Abrir menu"
            type="button"
          >

          </button>

          <nav className={`main-nav ${menuOpen ? 'open' : ''}`}>
            <a href="#operacion" onClick={() => setMenuOpen(false)}>Operacion</a>
            <a href="#programa" onClick={() => setMenuOpen(false)}>Programa</a>
            <a href="#contacto" onClick={() => setMenuOpen(false)}>Contacto</a>
            <Link className="btn btn-outline" to="/login" onClick={() => setMenuOpen(false)}>Iniciar sesion</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-section system-hero">
          <div className="container system-hero-grid">
            <div>
              <span className="eyebrow gsap-rise">Innova-T English Institute</span>
              <h1 className="gsap-rise">Ingles con seguimiento claro, horarios ordenados y avance visible.</h1>
              <p className="hero-copy gsap-rise">
                Aprende y reserva clases con una operacion organizada: alumnos, teachers y administracion trabajan sobre la misma informacion.
              </p>
              <div className="hero-actions gsap-rise">
                <Link className="btn btn-primary" to="/login">Entrar al sistema</Link>
                <a className="btn btn-secondary" href={WHATSAPP_URL} target="_blank" rel="noreferrer">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Mas informacion
                </a>
              </div>

              <div className="hero-stats gsap-rise">
                <article>
                  <strong>6 horas</strong>
                  <span>Por semana</span>
                </article>
                <article>
                  <strong>Horarios</strong>
                  <span>Tu creas tu propio horario</span>
                </article>
                
                <article>
                  <strong>5</strong>
                  <span>niveles academicos</span>
                </article>
              </div>
            </div>

            <aside className="system-preview-card gsap-rise" aria-label="Vista operativa Innova-T">
             <img src = "/1.jpg" alt="Vista operativa Innova-T" />
            </aside>
          </div>
        </section>

        <section id="operacion" className="content-section system-band">
          <div className="container">
            <div className="section-heading">
              <h2>Nuestro sistema flexible</h2>
              <p>Nos dices tu disponibilidad un dia antes y nosotros te asignamos una clase.</p>
            </div>

            <div className="feature-grid system-feature-grid">
              <article className="feature-card gsap-rise">
                <h3>Programa por niveles</h3>
                <p>Desde basico hasta avanzado con enfoque comunicativo, gramatica aplicada y speaking real.</p>
              </article>
              <article className="feature-card gsap-rise">
                <h3>Teacher asignado</h3>
                <p>Cada estudiante puede ver su clase asignada, su docente y los detalles previos a la sesion.</p>
              </article>
              <article className="feature-card gsap-rise">
                <h3>Workshops tematicos</h3>
                <p>Refuerzos de pronunciacion, entrevistas, business English y talleres intensivos por objetivo.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="programa" className="content-section">
          <div className="container methodology-grid">
            <div>
              <span className="eyebrow">Programa</span>
              <h2>Ruta academica ordenada por niveles.</h2>
            </div>

            <div className="timeline system-timeline">
              <article>
                <strong>Pre-Starter</strong>
                <p>Base inicial, alfabeto, estructura y seguridad para empezar a hablar.</p>
              </article>
              <article>
                <strong>Starter y Beginner</strong>
                <p>Rutinas, preguntas, pasado, futuro cercano y conversacion funcional.</p>
              </article>
              <article>
                <strong>Intermediate y Advanced</strong>
                <p>Estructuras avanzadas, fluidez, temas libres y practica guiada.</p>
              </article>
            </div>
          </div>
        </section>
        




      <section id="contacto" className="content-section">
          <div className="container contact-grid">
            <div>
              <span className="eyebrow">Acercate con nosotros</span>
              <h2 className="contact-title">Contacto</h2>
            </div>

            <div className="timeline system-timeline">
              <article>
                <p>Mandanos un WhatsApp y te contestaremos lo mas rapido posible.</p>
                 <div className="hero-actions gsap-rise">
                <a className="btn btn-secondary" href={WHATSAPP_URL} target="_blank" rel="noreferrer">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Mas informacion
                </a>
              </div>
              </article>
              
    
            </div>
          </div>
        </section>











      </main>

      <footer id="contacto" className="site-footer">
        <div className="container footer-grid">
          <div>
            <BrandLogo className="footer-brand" />
            <p>Innova-T English Institute. Ingles con seguimiento academico, control de clases y atencion cercana.</p>
          </div>

          <div>
            <h3>Contacto</h3>
            <a className="footer-link" href={WHATSAPP_URL} target="_blank" rel="noreferrer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{marginRight: '8px', verticalAlign: 'middle'}}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </a>
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
