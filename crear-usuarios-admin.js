import admin from 'firebase-admin'
import { readFileSync } from 'fs'

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const auth = admin.auth()
const db = admin.firestore()

const defaultPassword = process.env.DEFAULT_PASSWORD || 'CambiaEstaClave123!'

const accessUsers = [
  {
    email: process.env.ADMIN_EMAIL || 'admin@innova-t.com',
    password: process.env.ADMIN_PASSWORD || defaultPassword,
    profile: {
      rol: 'admin',
      nombre: process.env.ADMIN_NAME || 'Administrador Innova-T',
      telefono: process.env.ADMIN_PHONE || ''
    }
  },
  {
    email: process.env.TEACHER_EMAIL || 'teacher@innova-t.com',
    password: process.env.TEACHER_PASSWORD || defaultPassword,
    profile: {
      rol: 'teacher',
      nombre: process.env.TEACHER_NAME || 'Teacher Innova-T',
      telefono: process.env.TEACHER_PHONE || ''
    }
  },
  {
    email: process.env.STUDENT_EMAIL || 'student@innova-t.com',
    password: process.env.STUDENT_PASSWORD || defaultPassword,
    profile: {
      rol: 'estudiante',
      nombre: process.env.STUDENT_NAME || 'Estudiante Innova-T',
      telefono: process.env.STUDENT_PHONE || '',
      studentId: 'student-inicial'
    }
  }
]

async function upsertAuthUser({ email, password }) {
  try {
    const existingUser = await auth.getUserByEmail(email)
    await auth.updateUser(existingUser.uid, {
      password,
      emailVerified: true,
      disabled: false
    })
    console.log(`Usuario actualizado: ${email}`)
    return existingUser
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error

    const createdUser = await auth.createUser({
      email,
      password,
      emailVerified: true,
      disabled: false
    })
    console.log(`Usuario creado: ${email}`)
    return createdUser
  }
}

async function upsertProfile(userRecord, profile) {
  await db.collection('usuarios').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email: userRecord.email,
    ...profile,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true })
}

async function upsertInitialStudent(studentUid) {
  await db.collection('estudiantes').doc('student-inicial').set({
    id: 'student-inicial',
    publicId: 'EST-001',
    uid: studentUid,
    fullName: process.env.STUDENT_NAME || 'Estudiante Innova-T',
    email: process.env.STUDENT_EMAIL || 'student@innova-t.com',
    phone: process.env.STUDENT_PHONE || '',
    status: 'activo',
    scholarshipStatus: 'activa',
    enrollmentDate: new Date().toISOString().slice(0, 10),
    paymentDueDate: new Date().toISOString().slice(0, 10),
    currentLevelId: 'pre-starter',
    currentLessonId: 'pre-starter-lesson-01',
    progressPercent: 0,
    availability: ['Lunes 17:00', 'Miercoles 17:00'],
    preferredMode: 'presencial',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true })
}

async function main() {
  console.log('\nCreando accesos iniciales en Firebase...\n')

  const created = []

  for (const accessUser of accessUsers) {
    const userRecord = await upsertAuthUser(accessUser)
    await upsertProfile(userRecord, accessUser.profile)
    created.push({
      email: accessUser.email,
      password: accessUser.password,
      rol: accessUser.profile.rol,
      uid: userRecord.uid
    })

    if (accessUser.profile.rol === 'estudiante') {
      await upsertInitialStudent(userRecord.uid)
    }
  }

  console.log('\nACCESOS LISTOS')
  console.log('Usa estos datos en /login:\n')

  created.forEach(user => {
    console.log(`${user.rol.toUpperCase()}`)
    console.log(`Correo: ${user.email}`)
    console.log(`Contrasena: ${user.password}`)
    console.log(`UID: ${user.uid}\n`)
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\nError creando usuarios:', error.message)
    process.exit(1)
  })
