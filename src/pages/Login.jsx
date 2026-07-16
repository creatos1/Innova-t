import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import BrandLogo from '../components/BrandLogo'
import { auth, db } from '../firebase'
import { dashboardPathForRole, formatLoginIdentifierInput, getLoginErrorMessage, resolveLoginRecord, writeAccessProfile } from '../services/loginAccess'
import { useAuthProfile } from '../services/useAuthProfile'

function Login() {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { user, profile, loading: authLoading } = useAuthProfile()

  useEffect(() => {
    const role = profile?.rol || profile?.role
    if (!authLoading && user && role) {
      navigate(dashboardPathForRole(role), { replace: true })
    }
  }, [authLoading, navigate, profile, user])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setMessageType('')

    try {
      const loginRecord = await resolveLoginRecord(loginId)
      const userCredential = await signInWithEmailAndPassword(auth, loginRecord.email, password)
      const user = userCredential.user
      const userDoc = await getDoc(doc(db, 'usuarios', user.uid))

      if ((!userDoc.exists() || !userDoc.data()?.rol) && loginRecord.role) {
        await writeAccessProfile(user, loginRecord)
      }

      const refreshedUserDoc = userDoc.exists() && userDoc.data()?.rol
        ? userDoc
        : await getDoc(doc(db, 'usuarios', user.uid))
      if (!refreshedUserDoc.exists()) {
        setMessageType('error')
        setMessage('Tu acceso existe, pero falta vincularlo a un perfil. Entra con tu ID publico o pide al admin revisarlo.')
        return
      }

      const userData = refreshedUserDoc.data()
      navigate(dashboardPathForRole(userData.rol))
    } catch (error) {
      console.error('Firebase login error:', error.code, error.message)
      setMessageType('error')
      setMessage(error.code ? getLoginErrorMessage(error) : error.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    setLoading(true)
    setMessage('')
    setMessageType('')

    try {
      if (!loginId.trim()) {
        setMessageType('error')
        setMessage('Escribe tu correo, ID de alumno o ID de teacher para enviar el restablecimiento.')
        return
      }

      const loginRecord = await resolveLoginRecord(loginId)
      if (!loginRecord.email) {
        setMessageType('error')
        setMessage('No encontramos un correo vinculado a ese usuario.')
        return
      }

      await sendPasswordResetEmail(auth, loginRecord.email)
      setMessageType('success')
      setMessage(`Enviamos un correo de restablecimiento a ${loginRecord.email}.`)
    } catch (error) {
      setMessageType('error')
      setMessage(error.code ? getLoginErrorMessage(error) : error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-body">
      <main className="auth-layout">
        <section className="auth-showcase">
          <BrandLogo />

          <span className="eyebrow">Acceso</span>
          <h1>Acceso al sistema escolar.</h1>
          <p>
            Entra con tu correo, ID de alumno o ID de teacher para consultar tu informacion.
          </p>

          <div className="auth-preview-list">
            <article className="preview-item">
              <strong>Control de becas: </strong>
              <span>Pago, asistencia minima y avisos de ausencia en un solo lugar.</span>
            </article>
            <article className="preview-item">
              <strong>Operacion academica: </strong>
              <span>Niveles, lecciones, clases, asistencia y progreso actualizados.</span>
            </article>
            <article className="preview-item">
              <strong>Apoyo academico: </strong>
              <span>Recomendaciones para organizar clases y dar seguimiento.</span>
            </article>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-card">
            <div className="auth-card-header">
              <span className="eyebrow">Bienvenido a Innova-t</span>
              <h2>Inicia sesión</h2>
              <p>Solo para usuarios inscritos en Innova-T</p>
              <p>Ingresa con correo, ID de alumno o ID de teacher.</p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <label htmlFor="loginId">Correo o ID publico</label>
              <input
                id="loginId"
                name="loginId"
                type="text"
                placeholder="admin@innova-t.com, 0252 o T-001"
                value={loginId}
                onChange={(event) => setLoginId(formatLoginIdentifierInput(event.target.value))}
                disabled={loading}
                autoComplete="username"
                required
              />

              <label htmlFor="password">Contrasena</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Minimo 6 caracteres"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
                autoComplete="current-password"
                required
              />

              <div className="auth-meta">
                <Link to="/">Volver al inicio</Link>
                <Link className="underlined-auth-link" to="/crear-contrasena">Crea tu contrasena</Link>
                <button className="text-link-button" type="button" onClick={handlePasswordReset} disabled={loading}>
                  Restablecer contrasena
                </button>
              </div>

              <p className={`form-message ${messageType}`} aria-live="polite">
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
