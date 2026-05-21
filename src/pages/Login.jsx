import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function Login() {
  const [role, setRole] = useState('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    const passwordValid = password.trim().length >= 6

    setMessageType('')

    if (!emailValid || !passwordValid) {
      setMessageType('error')
      setMessage('Verifica el correo y usa una contrasena de al menos 6 caracteres.')
      return
    }

    setMessageType('success')
    setMessage('Datos validados correctamente. Redirigiendo a la vista demo...')

    setTimeout(() => {
      navigate(role === 'admin' ? '/admin-dashboard' : '/student-dashboard')
    }, 700)
  }

  return (
    <div className="auth-body">
      <main className="auth-layout">
        <section className="auth-showcase">
          <Link className="brand" to="/">
            <span className="brand-mark">IT</span>
            <span>
              <strong>Innova-T</strong>
              <small>English Institute</small>
            </span>
          </Link>

          <span className="eyebrow">Acceso</span>
          <h1>Una experiencia de login premium para estudiantes y administracion.</h1>
          <p>
            Esta pantalla valida formato de correo y longitud minima de clave.
          </p>

          <div className="auth-preview-list">
            <article className="preview-item">
              <strong>Reserva de clases</strong>
              <span>Acceso al panel con agenda y sesiones disponibles.</span>
            </article>
            <article className="preview-item">
              <strong>Teacher asignado</strong>
              <span>El estudiante consulta su clase 10 minutos antes del inicio.</span>
            </article>
            <article className="preview-item">
              <strong>Resultados y workshops</strong>
              <span>Historial visual con asistencia y calificaciones.</span>
            </article>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-card">
            <div className="tabs">
              <button
                className={`tab-btn ${role === 'student' ? 'active' : ''}`}
                type="button"
                onClick={() => setRole('student')}
              >
                Estudiante
              </button>
              <button
                className={`tab-btn ${role === 'admin' ? 'active' : ''}`}
                type="button"
                onClick={() => setRole('admin')}
              >
                Admin / Teacher
              </button>
            </div>

            <div className="auth-card-header">
              <span className="eyebrow">Bienvenido</span>
              <h2>Inicia sesion</h2>
              <p>Ingresa tus datos para entrar a la plataforma academica.</p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <label htmlFor="email">Correo electronico</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="estudiante@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <label htmlFor="password">Contrasena</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Minimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <div className="auth-meta">
                <span className="role-badge">
                  Rol actual: {role === 'admin' ? 'Admin / Teacher' : 'Estudiante'}
                </span>
                <Link to="/">Volver al inicio</Link>
              </div>

              <p
                className={`form-message ${messageType ? messageType : ''}`}
                aria-live="polite"
              >
                {message}
              </p>

              <button className="btn btn-primary full-width" type="submit">
                Entrar
              </button>
            </form>


          </div>
        </section>
      </main>
    </div>
  )
}

export default Login
