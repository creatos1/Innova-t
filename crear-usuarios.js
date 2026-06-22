import { initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, getFirestore, setDoc } from 'firebase/firestore'
import { ACADEMIC_LEVELS, LESSONS } from './src/domain/academicCatalog.js'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDa86VtEK8XlPuNgjHhGJ-0rT7VKN_iSQ0',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'innova-t-f16bb.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'innova-t-f16bb',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'innova-t-f16bb.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '488554463220',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:488554463220:web:8cae020e6851d8e3e803a1',
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-W6YNZ74S6L'
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

const defaultPassword = process.env.DEFAULT_PASSWORD || 'CambiaEstaClave123!'
const defaultTeachers = [
  { id: 'rolando', publicId: 'T-001', name: 'Rolando', email: process.env.ROLANDO_EMAIL || 'rolando@innova-t.com' },
  { id: 'cintli', publicId: 'T-002', name: 'Cintli', email: process.env.CINTLI_EMAIL || 'cintli@innova-t.com' },
  { id: 'alan', publicId: 'T-003', name: 'Alan', email: process.env.ALAN_EMAIL || 'alan@innova-t.com' },
  { id: 'manny', publicId: 'T-004', name: 'Manny', email: process.env.MANNY_EMAIL || 'manny@innova-t.com' },
  { id: 'fabian', publicId: 'T-005', name: 'Fabian', email: process.env.FABIAN_EMAIL || 'fabian@innova-t.com' }
]

const users = [
  {
    email: process.env.ADMIN_EMAIL || 'admin@innova-t.com',
    password: process.env.ADMIN_PASSWORD || defaultPassword,
    profile: {
      rol: 'admin',
      nombre: process.env.ADMIN_NAME || 'Administrador Innova-T'
    }
  },
  ...defaultTeachers.map(teacher => ({
    email: teacher.email,
    password: process.env.TEACHER_PASSWORD || defaultPassword,
    profile: {
      rol: 'teacher',
      nombre: teacher.name,
      teacherId: teacher.id,
      publicId: teacher.publicId
    }
  })),
  {
    email: process.env.STUDENT_EMAIL || 'student@innova-t.com',
    password: process.env.STUDENT_PASSWORD || defaultPassword,
    profile: {
      rol: 'estudiante',
      nombre: process.env.STUDENT_NAME || 'Estudiante Innova-T',
      studentId: 'student-inicial',
      publicId: 'EST-001'
    }
  }
]

async function getOrCreateUser({ email, password }) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    console.log(`Usuario creado en ${firebaseConfig.projectId}: ${email}`)
    return credential.user
  } catch (error) {
    if (error.code !== 'auth/email-already-in-use') throw error

    const credential = await signInWithEmailAndPassword(auth, email, password)
    console.log(`Usuario existente validado en ${firebaseConfig.projectId}: ${email}`)
    return credential.user
  }
}

async function main() {
  console.log(`\nCreando usuarios en el proyecto WEB: ${firebaseConfig.projectId}\n`)

  const createdUsers = []
  const firestoreErrors = []

  for (const userConfig of users) {
    const user = await getOrCreateUser(userConfig)

    createdUsers.push({
      rol: userConfig.profile.rol,
      email: userConfig.email,
      password: userConfig.password,
      uid: user.uid,
      profile: userConfig.profile
    })
  }

  console.log('\nACCESOS PARA /login\n')
  createdUsers.forEach(user => {
    console.log(`${user.rol.toUpperCase()}`)
    console.log(`Correo: ${user.email}`)
    console.log(`Contrasena: ${user.password}`)
    console.log(`UID: ${user.uid}\n`)
  })

  const adminAccess = users.find(user => user.profile.rol === 'admin')
  const studentAccess = createdUsers.find(user => user.rol === 'estudiante')

  if (adminAccess && studentAccess) {
    try {
      await signInWithEmailAndPassword(auth, adminAccess.email, adminAccess.password)

      for (const createdUser of createdUsers) {
        await setDoc(doc(db, 'usuarios', createdUser.uid), {
          uid: createdUser.uid,
          email: createdUser.email,
          ...createdUser.profile,
          updatedAt: new Date().toISOString()
        }, { merge: true })
      }

      await setDoc(doc(db, 'estudiantes', 'student-inicial'), {
        id: 'student-inicial',
        publicId: 'EST-001',
        uid: studentAccess.uid,
        fullName: 'Estudiante Innova-T',
        email: studentAccess.email,
        phone: '',
        status: 'activo',
        scholarshipStatus: 'activa',
        enrollmentDate: new Date().toISOString().slice(0, 10),
        currentLevelId: 'pre-starter',
        currentLessonId: 'pre-starter-lesson-01',
        progressPercent: 0,
        searchName: 'estudiante innova-t',
        updatedAt: new Date().toISOString()
      }, { merge: true })

      await setDoc(doc(db, 'loginIds', 'EST-001'), {
        publicId: 'EST-001',
        studentId: 'student-inicial',
        role: 'estudiante',
        email: studentAccess.email,
        fullName: 'Estudiante Innova-T',
        uid: studentAccess.uid,
        updatedAt: new Date().toISOString()
      }, { merge: true })

      for (const level of ACADEMIC_LEVELS) {
        await setDoc(doc(db, 'niveles', level.id), {
          ...level,
          updatedAt: new Date().toISOString()
        }, { merge: true })
      }

      for (const lesson of LESSONS) {
        await setDoc(doc(db, 'lecciones', lesson.id), {
          ...lesson,
          updatedAt: new Date().toISOString()
        }, { merge: true })
      }

      for (const teacher of defaultTeachers) {
        const teacherAccess = createdUsers.find(user => user.profile.teacherId === teacher.id)
        await setDoc(doc(db, 'teachers', teacher.id), {
          id: teacher.id,
          publicId: teacher.publicId,
          name: teacher.name,
          email: teacher.email,
          uid: teacherAccess?.uid || '',
          active: true,
          updatedAt: new Date().toISOString()
        }, { merge: true })

        await setDoc(doc(db, 'loginIds', teacher.publicId), {
          publicId: teacher.publicId,
          teacherId: teacher.id,
          role: 'teacher',
          email: teacher.email,
          name: teacher.name,
          uid: teacherAccess?.uid || '',
          updatedAt: new Date().toISOString()
        }, { merge: true })
      }

      console.log('Firestore inicializado con estudiante, niveles, lecciones y teachers en el proyecto correcto.\n')
    } catch (error) {
      firestoreErrors.push({
        email: adminAccess.email,
        uid: createdUsers.find(user => user.rol === 'admin')?.uid || '',
        rol: 'admin',
        error: `${error.code || ''} ${error.message}`
      })
    }
  }

  if (firestoreErrors.length) {
    console.log('AUTH YA ESTA CREADO, PERO FIRESTORE NO DEJO GUARDAR PERFILES.')
    console.log('Solucion rapida: sube firestore.rules en Firebase Console o crea estos docs manualmente:\n')

    firestoreErrors.forEach(item => {
      console.log(`usuarios/${item.uid}`)
      console.log(JSON.stringify({
        uid: item.uid,
        email: item.email,
        rol: item.rol,
        nombre: item.rol === 'admin'
          ? 'Administrador Innova-T'
          : item.rol === 'teacher'
            ? 'Teacher Innova-T'
            : 'Estudiante Innova-T',
        ...(item.rol === 'estudiante' ? { studentId: 'student-inicial' } : {})
      }, null, 2))
      console.log('')
    })
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\nError:', error.code || '', error.message)
    process.exit(1)
  })
