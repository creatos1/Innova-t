import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore'
import { auth, db } from '../firebase'

const loginErrorMessages = {
  'auth/invalid-credential': 'Credenciales invalidas. Verifica correo y contrasena, o crea el usuario en Firebase Auth.',
  'auth/user-not-found': 'Ese correo no existe en Firebase Auth.',
  'auth/wrong-password': 'La contrasena no coincide con el usuario.',
  'auth/invalid-email': 'El correo no tiene un formato valido.',
  'auth/user-disabled': 'Este usuario esta deshabilitado en Firebase Auth.',
  'auth/operation-not-allowed': 'El login con correo y contrasena no esta habilitado en Firebase Authentication.',
  'auth/network-request-failed': 'No se pudo conectar con Firebase. Revisa internet o la configuracion del proyecto.'
}

function getLoginErrorMessage(error) {
  return loginErrorMessages[error.code] || `Firebase rechazo el login (${error.code || 'sin codigo'}).`
}

function normalizeLoginId(value) {
  const cleanValue = value.trim().toUpperCase().replace(/\s+/g, '')

  if (/^T-?\d+$/.test(cleanValue)) {
    const number = cleanValue.replace(/^T-?/, '')
    return `T-${number.padStart(3, '0')}`
  }

  return cleanValue
}

function getLoginIdCandidates(value) {
  const cleanValue = value.trim().toUpperCase().replace(/\s+/g, '')
  const normalized = normalizeLoginId(cleanValue)
  const candidates = [cleanValue, normalized]

  if (/^\d+$/.test(cleanValue)) {
    candidates.push(cleanValue.padStart(4, '0'))
  }

  return [...new Set(candidates.filter(Boolean))]
}

async function getFirstByPublicId(collectionName, publicId) {
  const result = await getDocs(query(
    collection(db, collectionName),
    where('publicId', '==', publicId),
    firestoreLimit(1)
  ))

  if (result.empty) return null
  const item = result.docs[0]
  return { id: item.id, ...item.data() }
}

function Login() {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (auth.currentUser) {
      signOut(auth).catch(error => console.warn('No se pudo limpiar sesion previa.', error))
    }
  }, [])

  const resolveLoginRecord = async (value) => {
    const cleanValue = value.trim()
    if (cleanValue.includes('@')) {
      return {
        email: cleanValue,
        role: '',
        source: 'email'
      }
    }

    const candidates = getLoginIdCandidates(cleanValue)
    let loginSnapshot = null
    let publicId = ''

    for (const candidate of candidates) {
      const snapshot = await getDoc(doc(db, 'loginIds', candidate))
      if (snapshot.exists()) {
        loginSnapshot = snapshot
        publicId = candidate
        break
      }
    }

    if (loginSnapshot) {
      const loginData = loginSnapshot.data()
      if (!loginData.email) {
        throw new Error('El ID existe, pero no tiene correo vinculado.')
      }

      return {
        publicId: loginData.publicId || publicId,
        email: loginData.email,
        role: loginData.role || (loginData.teacherId ? 'teacher' : 'estudiante'),
        studentId: loginData.studentId || '',
        teacherId: loginData.teacherId || '',
        fullName: loginData.fullName || '',
        name: loginData.name || '',
        uid: loginData.uid || '',
        source: 'loginIds'
      }
    }

    for (const candidate of candidates) {
      const student = await getFirstByPublicId('estudiantes', candidate)
      if (student?.email) {
        return {
          publicId: student.publicId || candidate,
          email: student.email,
          role: 'estudiante',
          studentId: student.id,
          fullName: student.fullName || '',
          uid: student.uid || '',
          source: 'estudiantes'
        }
      }

      const teacher = await getFirstByPublicId('teachers', candidate)
      if (teacher?.email) {
        return {
          publicId: teacher.publicId || candidate,
          email: teacher.email,
          role: 'teacher',
          teacherId: teacher.id,
          name: teacher.name || '',
          uid: teacher.uid || '',
          source: 'teachers'
        }
      }
    }

    throw new Error('No encontramos ese ID publico. Revisa que este dado de alta en alumnos o teachers.')
  }

  const writeFirstLoginProfile = async (user, loginRecord) => {
    if (!loginRecord.role || loginRecord.source === 'email') return

    const isTeacher = loginRecord.role === 'teacher'
    const targetCollection = isTeacher ? 'teachers' : 'estudiantes'
    const targetId = isTeacher ? loginRecord.teacherId : loginRecord.studentId
    const profile = {
      uid: user.uid,
      email: user.email,
      rol: loginRecord.role,
      nombre: loginRecord.fullName || loginRecord.name || user.email,
      publicId: loginRecord.publicId,
      ...(isTeacher ? { teacherId: targetId } : { studentId: targetId }),
      updatedAt: serverTimestamp()
    }

    await setDoc(doc(db, 'usuarios', user.uid), profile, { merge: true })

    if (targetId) {
      await updateDoc(doc(db, targetCollection, targetId), {
        uid: user.uid,
        updatedAt: serverTimestamp()
      })
    }

    if (loginRecord.publicId) {
      await setDoc(doc(db, 'loginIds', loginRecord.publicId), {
        publicId: loginRecord.publicId,
        email: user.email,
        role: loginRecord.role,
        ...(isTeacher ? { teacherId: targetId } : { studentId: targetId }),
        uid: user.uid,
        updatedAt: serverTimestamp()
      }, { merge: true })
    }
  }

  const getCredential = async (loginRecord) => {
    try {
      return await signInWithEmailAndPassword(auth, loginRecord.email, password)
    } catch (error) {
      const canCreateFirstAccess = loginRecord.source !== 'email'
        && !loginRecord.uid
        && ['auth/invalid-credential', 'auth/user-not-found'].includes(error.code)

      if (!canCreateFirstAccess) throw error

      try {
        const credential = await createUserWithEmailAndPassword(auth, loginRecord.email, password)
        await writeFirstLoginProfile(credential.user, loginRecord)
        return credential
      } catch (createError) {
        if (createError.code === 'auth/email-already-in-use') {
          throw new Error('Este ID ya tiene una contrasena creada. Verifica la contrasena o pide restablecimiento.')
        }
        throw createError
      }
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setMessageType('')

    try {
      if (auth.currentUser) {
        await signOut(auth)
      }

      const loginRecord = await resolveLoginRecord(loginId)
      const userCredential = await getCredential(loginRecord)
      const user = userCredential.user
      const userDoc = await getDoc(doc(db, 'usuarios', user.uid))

      if (!userDoc.exists() || !userDoc.data()?.rol) {
        await writeFirstLoginProfile(user, loginRecord)
      }

      const refreshedUserDoc = userDoc.exists() && userDoc.data()?.rol
        ? userDoc
        : await getDoc(doc(db, 'usuarios', user.uid))
      if (!refreshedUserDoc.exists()) {
        setMessageType('error')
        setMessage('El usuario existe en Firebase Auth, pero falta su perfil en usuarios/{uid}. Entra con ID publico o pide al admin vincularlo.')
        return
      }

      const userData = refreshedUserDoc.data()
      if (userData.rol === 'admin') {
        navigate('/admin-dashboard/')
      } else if (userData.rol === 'teacher') {
        navigate('/teacher-dashboard/')
      } else {
        navigate('/student-dashboard/')
      }
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
          <Link className="brand" to="/">
            <span className="brand-mark">IT</span>
            <span>
              <strong>Innova-T</strong>
              <small>English Institute</small>
            </span>
          </Link>

          <span className="eyebrow">Acceso</span>
          <h1>Acceso conectado a Firebase Auth y Firestore.</h1>
          <p>
            Entra con un usuario creado en Firebase Authentication y con perfil en la coleccion usuarios.
          </p>

          <div className="auth-preview-list">
            <article className="preview-item">
              <strong>Control de becas</strong>
              <span>Pago, asistencia minima y avisos de ausencia desde Firebase.</span>
            </article>
            <article className="preview-item">
              <strong>Operacion academica</strong>
              <span>Niveles, lecciones, clases, asistencia y progreso en tiempo real.</span>
            </article>
            <article className="preview-item">
              <strong>IA bajo demanda</strong>
              <span>Recomendaciones academicas sin modificar reglas deterministicas.</span>
            </article>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-card">
            <div className="auth-card-header">
              <span className="eyebrow">Bienvenido</span>
              <h2>Inicia sesion</h2>
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
                onChange={(event) => setLoginId(event.target.value)}
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
