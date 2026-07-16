import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { randomBytes } from 'crypto'

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))

function loadEnvProjectId(path = '.env') {
  try {
    const content = readFileSync(path, 'utf8')
    const line = content.split(/\r?\n/).find(item => item.startsWith('VITE_FIREBASE_PROJECT_ID='))
    return line?.split('=').slice(1).join('=').trim() || ''
  } catch {
    return ''
  }
}

const expectedProjectId = loadEnvProjectId()

if (expectedProjectId && serviceAccount.project_id !== expectedProjectId) {
  console.error(`La llave serviceAccountKey.json es del proyecto "${serviceAccount.project_id}", pero la app usa "${expectedProjectId}".`)
  console.error('Descarga la llave correcta desde Firebase Console antes de ejecutar este reset destructivo.')
  process.exit(1)
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const auth = admin.auth()
const db = admin.firestore()

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'www.axelelquincle@gmail.com'
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador Innova-T'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || `Innova-${randomBytes(8).toString('base64url')}!`

const COLLECTIONS_TO_CLEAN = [
  'usuarios',
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

async function deleteCollection(collectionPath, batchSize = 400) {
  const collectionRef = db.collection(collectionPath)
  let deletedTotal = 0

  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get()
    if (snapshot.empty) break

    const batch = db.batch()
    snapshot.docs.forEach(document => batch.delete(document.ref))
    await batch.commit()
    deletedTotal += snapshot.size
  }

  return deletedTotal
}

async function deleteAllAuthUsers() {
  let totalDeleted = 0
  let pageToken

  do {
    const result = await auth.listUsers(1000, pageToken)
    const uids = result.users.map(user => user.uid)

    for (let index = 0; index < uids.length; index += 1000) {
      const chunk = uids.slice(index, index + 1000)
      if (!chunk.length) continue
      await auth.deleteUsers(chunk)
      totalDeleted += chunk.length
    }

    pageToken = result.pageToken
  } while (pageToken)

  return totalDeleted
}

async function createAdmin() {
  const userRecord = await auth.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    emailVerified: true,
    disabled: false
  })

  await db.collection('usuarios').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email: ADMIN_EMAIL,
    rol: 'admin',
    role: 'admin',
    nombre: ADMIN_NAME,
    status: 'activo',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  })

  return userRecord
}

async function main() {
  console.log('\nRESET INNOVA-T')
  console.log('Se borraran usuarios, alumnos, teachers, clases, pagos, asistencias y datos operativos.')
  console.log('Se conservaran niveles, lecciones y classrooms.\n')

  for (const collectionName of COLLECTIONS_TO_CLEAN) {
    const deleted = await deleteCollection(collectionName)
    console.log(`${collectionName}: ${deleted} documentos borrados`)
  }

  const deletedAuth = await deleteAllAuthUsers()
  console.log(`Authentication: ${deletedAuth} usuarios borrados`)

  const adminUser = await createAdmin()
  console.log('\nADMIN CREADO')
  console.log(`Correo: ${ADMIN_EMAIL}`)
  console.log(`Contrasena temporal: ${ADMIN_PASSWORD}`)
  console.log(`UID: ${adminUser.uid}`)
  console.log('\nEntra al sistema y cambia la contrasena despues del primer acceso.\n')
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\nError en reset:', error)
    process.exit(1)
  })
