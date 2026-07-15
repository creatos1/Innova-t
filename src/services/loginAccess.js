import { collection, doc, getDoc, getDocs, limit as firestoreLimit, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'

export const loginErrorMessages = {
  'auth/invalid-credential': 'Credenciales invalidas. Verifica correo y contrasena. Si es tu primera vez, usa "Crea tu contrasena".',
  'auth/user-not-found': 'Ese correo no tiene acceso creado. Si es tu primera vez, usa "Crea tu contrasena".',
  'auth/wrong-password': 'La contrasena no coincide con el usuario.',
  'auth/invalid-email': 'El correo no tiene un formato valido.',
  'auth/email-already-in-use': 'Ese correo ya tiene contrasena creada. Inicia sesion o restablece tu contrasena.',
  'auth/weak-password': 'La contrasena debe tener minimo 6 caracteres.',
  'auth/user-disabled': 'Este usuario esta deshabilitado.',
  'auth/operation-not-allowed': 'El acceso con correo y contrasena no esta habilitado.',
  'auth/network-request-failed': 'No se pudo conectar. Revisa internet e intenta de nuevo.'
}

export function getLoginErrorMessage(error) {
  return loginErrorMessages[error.code] || `No se pudo completar la operacion (${error.code || 'sin codigo'}).`
}

export function normalizeLoginId(value) {
  const cleanValue = value.trim().toUpperCase().replace(/\s+/g, '')

  if (/^T-?\d+$/.test(cleanValue)) {
    const number = cleanValue.replace(/^T-?/, '')
    return `T-${number.padStart(3, '0')}`
  }

  return cleanValue
}

export function getLoginIdCandidates(value) {
  const cleanValue = value.trim().toUpperCase().replace(/\s+/g, '')
  const normalized = normalizeLoginId(cleanValue)
  const candidates = [cleanValue, normalized]

  if (/^\d+$/.test(cleanValue)) {
    candidates.push(cleanValue.padStart(4, '0'))
  }

  return [...new Set(candidates.filter(Boolean))]
}

async function getFirstByField(collectionName, field, value) {
  const result = await getDocs(query(
    collection(db, collectionName),
    where(field, '==', value),
    firestoreLimit(1)
  ))

  if (result.empty) return null
  const item = result.docs[0]
  return { id: item.id, ...item.data() }
}

async function getFirstByPublicId(collectionName, publicId) {
  return getFirstByField(collectionName, 'publicId', publicId)
}

async function getFirstByEmail(collectionName, email) {
  return getFirstByField(collectionName, 'email', email)
}

export async function resolveLoginRecord(value) {
  const cleanValue = value.trim()
  if (!cleanValue) throw new Error('Escribe tu correo o ID publico.')

  if (cleanValue.includes('@')) {
    const email = cleanValue.toLowerCase()
    const student = await getFirstByEmail('estudiantes', email)
    const teacher = await getFirstByEmail('teachers', email)

    if (student?.email) {
      return {
        publicId: student.publicId || '',
        email: student.email || email,
        role: 'estudiante',
        studentId: student.id,
        fullName: student.fullName || '',
        uid: student.uid || '',
        source: 'estudiantes'
      }
    }

    if (teacher?.email) {
      return {
        publicId: teacher.publicId || '',
        email: teacher.email || email,
        role: 'teacher',
        teacherId: teacher.id,
        name: teacher.name || '',
        uid: teacher.uid || '',
        source: 'teachers'
      }
    }

    return {
      email,
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

export async function writeAccessProfile(user, loginRecord) {
  if (!loginRecord.role || loginRecord.source === 'email') return

  const isTeacher = loginRecord.role === 'teacher'
  const targetCollection = isTeacher ? 'teachers' : 'estudiantes'
  const targetId = isTeacher ? loginRecord.teacherId : loginRecord.studentId

  if (!targetId) {
    throw new Error(isTeacher
      ? 'El teacher no tiene teacherId vinculado.'
      : 'El estudiante no tiene studentId vinculado.')
  }

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

  await updateDoc(doc(db, targetCollection, targetId), {
    uid: user.uid,
    updatedAt: serverTimestamp()
  })

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

export function dashboardPathForRole(role) {
  if (role === 'admin') return '/admin-dashboard/'
  if (role === 'teacher') return '/teacher-dashboard/'
  return '/student-dashboard/'
}
