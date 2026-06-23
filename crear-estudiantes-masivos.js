import { initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, getFirestore, setDoc, writeBatch } from 'firebase/firestore'
import { LESSONS } from './src/domain/academicCatalog.js'

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

const adminEmail = process.env.ADMIN_EMAIL || 'admin@innova-t.com'
const adminPassword = process.env.ADMIN_PASSWORD || 'CambiaEstaClave123!'
const bulkPassword = process.env.STUDENT_BULK_PASSWORD || 'QWEQWE'
const count = Number(process.env.STUDENT_COUNT || 50)
const startPublicId = Number(process.env.STUDENT_START_ID || 252)
const today = new Date().toISOString().slice(0, 10)

function publicIdFromNumber(value) {
  return String(value).padStart(4, '0')
}

function getLessonByIndex(index) {
  const starterLessons = LESSONS.filter(lesson => lesson.levelId === 'pre-starter')
  return starterLessons[index % starterLessons.length] || LESSONS[0]
}

async function getOrCreateStudentAuth(email) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, bulkPassword)
    return {
      uid: credential.user.uid,
      created: true
    }
  } catch (error) {
    if (error.code !== 'auth/email-already-in-use') throw error

    const credential = await signInWithEmailAndPassword(auth, email, bulkPassword)
    return {
      uid: credential.user.uid,
      created: false
    }
  }
}

async function main() {
  console.log(`\nCreando ${count} estudiantes demo en ${firebaseConfig.projectId}`)
  console.log(`Contrasena comun: ${bulkPassword}`)
  console.log(`Rango IDs: ${publicIdFromNumber(startPublicId)} - ${publicIdFromNumber(startPublicId + count - 1)}\n`)

  const students = []

  for (let index = 0; index < count; index += 1) {
    const publicId = publicIdFromNumber(startPublicId + index)
    const email = `alumno${publicId}@innova-t.com`
    const fullName = `Alumno Demo ${publicId}`
    const lesson = getLessonByIndex(index)
    const authUser = await getOrCreateStudentAuth(email)

    students.push({
      id: `student-${publicId}`,
      publicId,
      uid: authUser.uid,
      fullName,
      email,
      phone: '',
      status: 'activo',
      scholarshipStatus: 'activa',
      enrollmentDate: today,
      currentLevelId: lesson.levelId,
      currentLessonId: lesson.id,
      progressPercent: 0,
      searchName: fullName.toLowerCase(),
      authCreated: authUser.created
    })

    console.log(`${authUser.created ? 'CREADO' : 'EXISTENTE'} ${publicId} ${email}`)
  }

  await signInWithEmailAndPassword(auth, adminEmail, adminPassword)

  for (let index = 0; index < students.length; index += 400) {
    const batch = writeBatch(db)
    const chunk = students.slice(index, index + 400)

    chunk.forEach(student => {
      const { authCreated, ...studentDoc } = student
      batch.set(doc(db, 'estudiantes', student.id), {
        ...studentDoc,
        updatedAt: new Date().toISOString()
      }, { merge: true })

      batch.set(doc(db, 'usuarios', student.uid), {
        uid: student.uid,
        email: student.email,
        rol: 'estudiante',
        nombre: student.fullName,
        studentId: student.id,
        publicId: student.publicId,
        updatedAt: new Date().toISOString()
      }, { merge: true })

      batch.set(doc(db, 'loginIds', student.publicId), {
        publicId: student.publicId,
        studentId: student.id,
        role: 'estudiante',
        email: student.email,
        fullName: student.fullName,
        uid: student.uid,
        updatedAt: new Date().toISOString()
      }, { merge: true })
    })

    await batch.commit()
  }

  console.log('\nLISTO. Accesos ejemplo:')
  students.slice(0, 10).forEach(student => {
    console.log(`${student.publicId} / ${bulkPassword} / ${student.email}`)
  })
  console.log(`\nTotal estudiantes procesados: ${students.length}\n`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('\nError:', error.code || '', error.message)
    process.exit(1)
  })
