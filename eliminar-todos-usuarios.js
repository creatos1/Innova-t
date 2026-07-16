import admin from 'firebase-admin'
import { readFileSync } from 'fs'

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const auth = admin.auth()

async function deleteAllUsers() {
  console.log('\nIniciando eliminación de todos los usuarios de Firebase Authentication...\n')

  let nextPageToken = null
  let totalDeleted = 0
  const batchSize = 1000

  do {
    const result = nextPageToken 
      ? await auth.listUsers(batchSize, nextPageToken)
      : await auth.listUsers(batchSize)
    
    if (result.users.length === 0) {
      console.log('No hay más usuarios para eliminar.')
      break
    }

    console.log(`Eliminando ${result.users.length} usuarios...`)

    for (const user of result.users) {
      try {
        await auth.deleteUser(user.uid)
        console.log(`✓ Eliminado: ${user.email || user.uid} (${user.uid})`)
        totalDeleted++
      } catch (error) {
        console.error(`✗ Error al eliminar ${user.email || user.uid}:`, error.message)
      }
    }

    nextPageToken = result.pageToken
  } while (nextPageToken)

  console.log(`\n✅ Eliminación completada. Total de usuarios eliminados: ${totalDeleted}`)
}

deleteAllUsers()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\nError durante la eliminación:', error)
    process.exit(1)
  })
