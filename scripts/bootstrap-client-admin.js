import { readFileSync } from 'fs'
import { initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth'
import { doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore'

function loadEnv(path = '.env') {
  const content = readFileSync(path, 'utf8')
  content.split(/\r?\n/).forEach(line => {
    const cleanLine = line.trim()
    if (!cleanLine || cleanLine.startsWith('#')) return
    const separatorIndex = cleanLine.indexOf('=')
    if (separatorIndex < 0) return
    const key = cleanLine.slice(0, separatorIndex).trim()
    const value = cleanLine.slice(separatorIndex + 1).trim()
    process.env[key] = value
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

const email = process.env.ADMIN_EMAIL || 'www.axelelquincle@gmail.com'
const password = process.env.ADMIN_PASSWORD || 'Innova-2ZcG2p6wp_A!'
const name = process.env.ADMIN_NAME || 'Administrador Innova-T'

async function main() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error('Faltan variables VITE_FIREBASE_* en .env')
  }

  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = getFirestore(app)

  console.log(`Creando admin en proyecto: ${firebaseConfig.projectId}`)
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  const uid = credential.user.uid

  await setDoc(doc(db, 'usuarios', uid), {
    uid,
    email,
    rol: 'admin',
    role: 'admin',
    nombre: name,
    status: 'activo',
    updatedAt: serverTimestamp()
  })

  console.log('\nADMIN CREADO EN EL PROYECTO CORRECTO')
  console.log(`Proyecto: ${firebaseConfig.projectId}`)
  console.log(`Correo: ${email}`)
  console.log(`Contrasena: ${password}`)
  console.log(`UID: ${uid}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    if (error.code === 'auth/email-already-in-use') {
      console.error('\nEse correo ya existe en Authentication del proyecto correcto.')
      console.error('Usa "Restablecer contrasena" en la pantalla de login o borralo desde Firebase Console.')
    } else if (error.code === 'permission-denied') {
      console.error('\nFirestore rechazo crear el perfil admin. Publica primero las reglas actualizadas.')
    } else {
      console.error('\nError creando admin:', error.code || '', error.message)
    }
    process.exit(1)
  })
