import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth, db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessageType('')

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const user = userCredential.user

      const userDoc = await getDoc(doc(db, 'usuarios', user.uid))
      if (userDoc.exists()) {
        const userData = userDoc.data()
        if (userData.rol === 'admin' || userData.rol === 'teacher') {
          navigate('/admin-dashboard')
        } else {
          navigate('/student-dashboard')
        }
      } else {
        setMessageType('error')
        setMessage('No se encontró el perfil de usuario.')
      }
    } catch (error) {
      setMessageType('error')
      setMessage('Correo o contraseña incorrectos.')
    } finally {
      setLoading(false)
    }
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
                disabled={loading}
              />

              <label htmlFor="password">Contrasena</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Minimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />

              <div className="auth-meta">
                <Link to="/">Volver al inicio</Link>
              </div>

              <p
                className={`form-message ${messageType ? messageType : ''}`}
                aria-live="polite"
              >
                {message}
              </p>

              <button className="btn btn-primary full-width" type="submit" disabled={loading}>
                {loading ? 'Iniciando...' : 'Entrar'}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  )
}

export default Login
