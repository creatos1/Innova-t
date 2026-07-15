import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import BrandLogo from '../components/BrandLogo'
import { auth } from '../firebase'
import { dashboardPathForRole, getLoginErrorMessage, resolveLoginRecord, writeAccessProfile } from '../services/loginAccess'

function CreatePassword() {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (auth.currentUser) {
      signOut(auth).catch(error => console.warn('No se pudo limpiar sesion previa.', error))
    }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setMessageType('')

    try {
      if (!password || password.length < 6) {
        throw new Error('La contrasena debe tener minimo 6 caracteres.')
      }

      if (password !== confirmPassword) {
        throw new Error('Las contrasenas no coinciden.')
      }

      const loginRecord = await resolveLoginRecord(loginId)
      if (!loginRecord.role || loginRecord.source === 'email') {
        throw new Error('Ese correo no esta dado de alta como estudiante o teacher. Pide al admin que lo registre primero.')
      }

      if (loginRecord.uid) {
        throw new Error('Este usuario ya tiene contrasena creada. Inicia sesion o usa restablecer contrasena.')
      }

      let credential = null

      try {
        credential = await createUserWithEmailAndPassword(auth, loginRecord.email, password)
      } catch (createError) {
        if (createError.code !== 'auth/email-already-in-use') throw createError

        try {
          credential = await signInWithEmailAndPassword(auth, loginRecord.email, password)
        } catch (signInError) {
          if (signInError.code === 'auth/invalid-credential' || signInError.code === 'auth/wrong-password') {
            await sendPasswordResetEmail(auth, loginRecord.email)
            throw new Error(`Ese correo ya tiene acceso creado. Enviamos un correo de restablecimiento a ${loginRecord.email}.`)
          }
          throw signInError
        }
      }

      await writeAccessProfile(credential.user, loginRecord)
      setMessageType('success')
      setMessage('Acceso vinculado. Entrando al panel...')
      navigate(dashboardPathForRole(loginRecord.role))
    } catch (error) {
      console.error('Create password error:', error.code, error.message)
      setMessageType('error')
      setMessage(error.code ? getLoginErrorMessage(error) : error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-body">
      <main className="auth-layout compact-auth-layout">
        <section className="auth-showcase">
          <BrandLogo />

          <span className="eyebrow">Primer acceso</span>
          <h1>Crea tu contrasena con tu ID oficial.</h1>
          <p>
            Este flujo solo funciona si el admin ya registro tu correo y tu ID en estudiantes o teachers.
          </p>
        </section>

        <section className="auth-panel">
          <div className="auth-card">
            <div className="auth-card-header">
              <span className="eyebrow">Primer ingreso</span>
              <h2>Crea tu contrasena</h2>
              <p>Usa tu ID de alumno, ID de teacher o correo registrado.</p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <label htmlFor="createLoginId">ID o correo</label>
              <input
                id="createLoginId"
                name="createLoginId"
                type="text"
                placeholder="0252, T-001 o correo"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                disabled={loading}
                autoComplete="username"
                required
              />

              <label htmlFor="createPassword">Contrasena</label>
              <input
                id="createPassword"
                name="createPassword"
                type="password"
                placeholder="Minimo 6 caracteres"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
                autoComplete="new-password"
                required
              />

              <label htmlFor="confirmPassword">Confirmar contrasena</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="Repite tu contrasena"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={loading}
                autoComplete="new-password"
                required
              />

              <div className="auth-meta">
                <Link to="/login">Ya tengo contrasena</Link>
                <Link to="/">Volver al inicio</Link>
              </div>

              <p className={`form-message ${messageType}`} aria-live="polite">
                {message}
              </p>

              <button className="btn btn-primary full-width" type="submit" disabled={loading}>
                {loading ? 'Creando...' : 'Crear contrasena'}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  )
}

export default CreatePassword
