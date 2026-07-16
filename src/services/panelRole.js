import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '../firebase'

const PANEL_ROLE_KEY = 'innova-preferred-panel-role'

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function setPreferredPanelRole(role) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PANEL_ROLE_KEY, role)
}

export function getPreferredPanelRole() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(PANEL_ROLE_KEY) || ''
}

export async function activateTeacherPanelProfile({ user, profile, teacher }) {
  setPreferredPanelRole('teacher')

  if (!user?.uid || !teacher?.id) {
    throw new Error('No se encontro un teacher vinculado a este correo.')
  }

  const email = normalizeEmail(teacher.email || profile?.email || user.email)

  await setDoc(doc(db, 'usuarios', user.uid), {
    uid: user.uid,
    email,
    rol: 'teacher',
    role: 'teacher',
    nombre: teacher.name || profile?.nombre || email,
    teacherId: teacher.id,
    publicId: teacher.publicId || '',
    accessDocId: teacher.id,
    updatedAt: serverTimestamp()
  }, { merge: true })

  await setDoc(doc(db, 'teachers', teacher.id), {
    uid: user.uid,
    email,
    updatedAt: serverTimestamp()
  }, { merge: true })

  if (teacher.publicId) {
    await setDoc(doc(db, 'loginIds', teacher.publicId), {
      uid: user.uid,
      email,
      role: 'teacher',
      teacherId: teacher.id,
      publicId: teacher.publicId,
      name: teacher.name || profile?.nombre || email,
      updatedAt: serverTimestamp()
    }, { merge: true })
  }
}

export async function activateAdminPanelProfile({ user, profile }) {
  setPreferredPanelRole('admin')

  if (!user?.uid) {
    throw new Error('No hay usuario activo.')
  }

  const email = normalizeEmail(profile?.email || user.email)
  const adminSnapshot = await getDocs(query(
    collection(db, 'usuarios'),
    where('email', '==', email),
    where('rol', '==', 'admin'),
    limit(1)
  ))
  const adminDoc = adminSnapshot.docs[0]

  if (!adminDoc) {
    throw new Error('Este correo no tiene rol admin registrado.')
  }

  const adminData = adminDoc.data()
  await setDoc(doc(db, 'usuarios', user.uid), {
    uid: user.uid,
    email,
    rol: 'admin',
    role: 'admin',
    nombre: adminData.nombre || profile?.nombre || email,
    status: adminData.status || 'activo',
    accessDocId: adminData.accessDocId || adminDoc.id,
    updatedAt: serverTimestamp()
  }, { merge: true })
}
