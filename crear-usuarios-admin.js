import admin from 'firebase-admin'
import { readFileSync } from 'fs'

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const auth = admin.auth()
const db = admin.firestore()

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Falta variable de entorno: ${name}`)
  }
  return value
}

async function upsertAdminUser() {
  const email = requireEnv('ADMIN_EMAIL')
  const password = requireEnv('ADMIN_PASSWORD')
  const nombre = process.env.ADMIN_NAME || 'Administrador Innova-T'
  const telefono = process.env.ADMIN_PHONE || ''

  let userRecord

  try {
    userRecord = await auth.getUserByEmail(email)
    console.log(`Usuario existente: ${email}`)
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error

    userRecord = await auth.createUser({
      email,
      password,
      emailVerified: true,
      disabled: false
    })
    console.log(`Usuario Auth creado: ${email}`)
  }

  await db.collection('usuarios').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email,
    nombre,
    telefono,
    rol: 'admin',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true })

  console.log('Perfil admin guardado en Firestore.')
  console.log(`UID: ${userRecord.uid}`)
}

upsertAdminUser()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error.message)
    process.exit(1)
  })
