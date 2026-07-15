import admin from 'firebase-admin'
import { readFileSync } from 'fs'

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const auth = admin.auth()
const db = admin.firestore()

async function deleteAuthUser(uid) {
  try {
    await auth.deleteUser(uid)
    return 'deleted'
  } catch (error) {
    if (error.code === 'auth/user-not-found') return 'not-found'
    throw error
  }
}

async function processAuthDeletions() {
  const snapshot = await db
    .collection('authDeletionRequests')
    .where('status', '==', 'pending')
    .get()

  if (snapshot.empty) {
    console.log('No hay usuarios pendientes por borrar de Firebase Auth.')
    return
  }

  let deletedCount = 0
  let failedCount = 0

  for (const requestDoc of snapshot.docs) {
    const request = requestDoc.data()
    const uid = request.uid || requestDoc.id

    try {
      const result = await deleteAuthUser(uid)
      await requestDoc.ref.delete()
      deletedCount += 1
      console.log(`${result.toUpperCase()} Auth uid=${uid} email=${request.email || '-'}`)
    } catch (error) {
      failedCount += 1
      await requestDoc.ref.set({
        status: 'failed',
        errorCode: error.code || '',
        errorMessage: error.message || 'Error desconocido',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true })
      console.error(`ERROR uid=${uid}:`, error.code || '', error.message)
    }
  }

  console.log(`\nProcesados: ${snapshot.size}. Borrados: ${deletedCount}. Fallidos: ${failedCount}.\n`)
}

processAuthDeletions()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
