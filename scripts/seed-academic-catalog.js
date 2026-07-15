import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import {
  ACADEMIC_LEVELS,
  LESSONS,
  getCanonicalLessonId,
  getCanonicalLevelId,
  isLegacyCatalogLevelId,
  isLegacyLessonId
} from '../src/domain/academicCatalog.js'

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()
const shouldCleanLegacyCatalog = process.env.CLEAN_LEGACY_CATALOG === '1'
const shouldMigrateLegacyProgress = process.env.MIGRATE_LEGACY_PROGRESS === '1'

async function commitBatchInChunks(operations, chunkSize = 450) {
  for (let index = 0; index < operations.length; index += chunkSize) {
    const batch = db.batch()
    operations.slice(index, index + chunkSize).forEach(operation => operation(batch))
    await batch.commit()
  }
}

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

async function cleanLegacyCatalog() {
  const operations = []

  const levelsSnapshot = await db.collection('niveles').get()
  levelsSnapshot.docs.forEach(snapshot => {
    if (isLegacyCatalogLevelId(snapshot.id)) {
      operations.push(batch => batch.delete(snapshot.ref))
    }
  })

  const lessonsSnapshot = await db.collection('lecciones').get()
  lessonsSnapshot.docs.forEach(snapshot => {
    if (isLegacyLessonId(snapshot.id)) {
      operations.push(batch => batch.delete(snapshot.ref))
    }
  })

  if (!operations.length) {
    console.log('No habia catalogo demo para limpiar.')
    return
  }

  await commitBatchInChunks(operations)
  console.log(`Catalogo demo eliminado: ${operations.length} documentos.`)
}

async function migrateLegacyProgress() {
  const operations = []
  const studentsSnapshot = await db.collection('estudiantes').get()

  studentsSnapshot.docs.forEach(snapshot => {
    const student = snapshot.data()
    const currentLevelId = getCanonicalLevelId(student.currentLevelId)
    const currentLessonId = getCanonicalLessonId(student.currentLessonId)
    const payload = {}

    if (currentLevelId && currentLevelId !== student.currentLevelId) payload.currentLevelId = currentLevelId
    if (currentLessonId && currentLessonId !== student.currentLessonId) payload.currentLessonId = currentLessonId

    if (Object.keys(payload).length) {
      operations.push(batch => batch.update(snapshot.ref, {
        ...payload,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }))
    }
  })

  const classesSnapshot = await db.collection('clases').get()
  classesSnapshot.docs.forEach(snapshot => {
    const classItem = snapshot.data()
    const levelId = getCanonicalLevelId(classItem.levelId)
    const lessonIds = Array.isArray(classItem.lessonIds)
      ? classItem.lessonIds.map(getCanonicalLessonId)
      : []
    const payload = {}

    if (levelId && levelId !== classItem.levelId) payload.levelId = levelId
    if (lessonIds.length && JSON.stringify(lessonIds) !== JSON.stringify(classItem.lessonIds || [])) {
      payload.lessonIds = lessonIds
    }

    if (Object.keys(payload).length) {
      operations.push(batch => batch.update(snapshot.ref, {
        ...payload,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }))
    }
  })

  if (!operations.length) {
    console.log('No habia progreso viejo para migrar.')
    return
  }

  await commitBatchInChunks(operations)
  console.log(`Progreso legado migrado: ${operations.length} documentos.`)
}

seedAcademicCatalog()
  .then(() => shouldMigrateLegacyProgress ? migrateLegacyProgress() : undefined)
  .then(() => shouldCleanLegacyCatalog ? cleanLegacyCatalog() : undefined)
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
