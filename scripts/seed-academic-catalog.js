import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { ACADEMIC_LEVELS, LESSONS } from '../src/domain/academicCatalog.js'

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

async function seedAcademicCatalog() {
  const batch = db.batch()

  ACADEMIC_LEVELS.forEach(level => {
    batch.set(db.collection('niveles').doc(level.id), {
      ...level,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true })
  })

  LESSONS.forEach(lesson => {
    batch.set(db.collection('lecciones').doc(lesson.id), {
      ...lesson,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true })
  })

  await batch.commit()
  console.log(`Catalogo academico guardado: ${ACADEMIC_LEVELS.length} niveles, ${LESSONS.length} lecciones.`)
}

seedAcademicCatalog()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
