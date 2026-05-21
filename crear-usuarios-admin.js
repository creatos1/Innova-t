
import admin from 'firebase-admin'
import { readFileSync } from 'fs'

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const auth = admin.auth()
const db = admin.firestore()

async function crearUsuario(email, password, datosUsuario) {
  try {
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      emailVerified: true,
      disabled: false
    })

    await db.collection('usuarios').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email,
      ...datosUsuario
    })

    console.log(`✅ Usuario creado: ${email}`)
    console.log(`   UID: ${userRecord.uid}`)
    return userRecord.uid
  } catch (error) {
    console.error(`❌ Error al crear ${email}:`, error.message)
    throw error
  }
}

async function main() {
  console.log('Creando usuarios...\n')

  try {
    // AGREGA TUS USUARIOS AQUÍ:
    // Ejemplo para ADMIN:
    // await crearUsuario(
    //   'tu-correo-admin@ejemplo.com',
    //   'tu-contraseña-segura',
    //   {
    //     rol: 'admin',
    //     nombre: 'Tu Nombre',
    //     telefono: '1234567890'
    //   }
    // )

    // Ejemplo para ESTUDIANTE:
    // await crearUsuario(
    //   'correo-estudiante@ejemplo.com',
    //   'contraseña-segura',
    //   {
    //     rol: 'estudiante',
    //     nombre: 'Nombre Completo',
    //     idEstudiante: 'EST001',
    //     nivel: 'Pre-Starter',
    //     fechaRegistro: new Date().toISOString().split('T')[0],
    //     beca: true,
    //     horasAsistidasSemana: 0,
    //     horasTotalesSemana: 6
    //   }
    // )

    console.log('\n✨ Edita el script y agrega tus usuarios!')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  }
}

main()

