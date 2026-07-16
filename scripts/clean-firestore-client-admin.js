import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { collection, deleteDoc, doc, getDocs, getFirestore } from 'firebase/firestore'

function loadEnv(path = '.env') {
  const content = readFileSync(path, 'utf8')
  content.split(/\r?\n/).forEach(line => {
    const cleanLine = line.trim()
    if (!cleanLine || cleanLine.startsWith('#')) return
    const separatorIndex = cleanLine.indexOf('=')
    if (separatorIndex < 0) return
    process.env[cleanLine.slice(0, separatorIndex).trim()] = cleanLine.slice(separatorIndex + 1).trim()
  })
}

loadEnv()

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID
}

const adminEmail = process.env.ADMIN_EMAIL || 'www.axelelquincle@gmail.com'
const adminPassword = process.env.ADMIN_PASSWORD || 'Innova-2ZcG2p6wp_A!'

const COLLECTIONS_TO_DELETE = [
  'loginIds',
  'estudiantes',
  'teachers',
  'clases',
  'asistencias',
  'pagos',
  'calificaciones',
  'becaEventos',
  'aiRecommendations',
  'authDeletionRequests',
  'bloqueos'
]

async function deleteCollection(db, collectionName) {
  const snapshot = await getDocs(collection(db, collectionName))
  let deleted = 0

  for (const item of snapshot.docs) {
    await deleteDoc(item.ref)
    deleted += 1
  }

  return deleted
}

async function main() {
  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = getFirestore(app)
  const credential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword)
  const currentUid = credential.user.uid

  console.log(`Limpiando Firestore en proyecto ${firebaseConfig.projectId}`)

  for (const collectionName of COLLECTIONS_TO_DELETE) {
    const deleted = await deleteCollection(db, collectionName)
    console.log(`${collectionName}: ${deleted} documentos borrados`)
  }

  const usersSnapshot = await getDocs(collection(db, 'usuarios'))
  let deletedUsers = 0

  for (const userDocument of usersSnapshot.docs) {
    if (userDocument.id === currentUid) continue
    await deleteDoc(doc(db, 'usuarios', userDocument.id))
    deletedUsers += 1
  }

  console.log(`usuarios: ${deletedUsers} documentos borrados; se conserva el admin ${adminEmail}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error limpiando Firestore:', error.code || '', error.message)
    process.exit(1)
  })
