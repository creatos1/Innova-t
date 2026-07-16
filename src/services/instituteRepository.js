import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  increment,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import {
  ACADEMIC_LEVELS,
  LESSONS,
  isFreeTopicLesson,
  isLegacyCatalogLevelId,
  isLegacyLessonId
} from '../domain/academicCatalog'

const COLLECTIONS = {
  students: 'estudiantes',
  users: 'usuarios',
  levels: 'niveles',
  lessons: 'lecciones',
  teachers: 'teachers',
  classrooms: 'classrooms',
  loginIds: 'loginIds',
  classes: 'clases',
  attendance: 'asistencias',
  payments: 'pagos',
  grades: 'calificaciones',
  alerts: 'becaEventos',
  blockouts: 'bloqueos',
  aiRecommendations: 'aiRecommendations',
  aiUsage: 'aiUsage',
  authDeletionRequests: 'authDeletionRequests'
}

export const EMPTY_INSTITUTE_DATA = {
  source: 'firebase',
  students: [],
  users: [],
  levels: [],
  lessons: [],
  teachers: [],
  classrooms: [],
  classes: [],
  attendance: [],
  payments: [],
  grades: [],
  alerts: [],
  blockouts: [],
  aiUsage: []
}

export const DEFAULT_TEACHERS = [
  { id: 'rolando', publicId: 'T-001', name: 'Rolando', email: 'rolando@innova-t.com' },
  { id: 'cintli', publicId: 'T-002', name: 'Cintli', email: 'cintli@innova-t.com' },
  { id: 'alan', publicId: 'T-003', name: 'Alan', email: 'alan@innova-t.com' },
  { id: 'manny', publicId: 'T-004', name: 'Manny', email: 'manny@innova-t.com' },
  { id: 'fabian', publicId: 'T-005', name: 'Fabian', email: 'fabian@innova-t.com' }
]

export const DEFAULT_CLASSROOMS = [
  { id: 'classroom-1', name: 'Classroom 1', active: true },
  { id: 'classroom-2', name: 'Classroom 2', active: true },
  { id: 'classroom-3', name: 'Classroom 3', active: true }
]

function docsFromSnapshot(snapshot) {
  return snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }))
}

function getRole(profile) {
  return profile?.rol || profile?.role || ''
}

function getPreviousLessonIds(currentLessonId) {
  const cleanLessonId = String(currentLessonId || '').trim()
  const currentLesson = LESSONS.find(lesson => (
    lesson.id === cleanLessonId
    || lesson.code === cleanLessonId.toUpperCase()
  ))

  if (isFreeTopicLesson(currentLesson)) return []
  if (!currentLesson?.globalOrder) return []

  return LESSONS
    .filter(lesson => !isFreeTopicLesson(lesson) && lesson.globalOrder && lesson.globalOrder < currentLesson.globalOrder)
    .sort((a, b) => a.globalOrder - b.globalOrder)
    .map(lesson => lesson.id)
}

function isFreeTopicLessonId(lessonId) {
  const cleanLessonId = String(lessonId || '').trim()
  const lesson = LESSONS.find(item => item.id === cleanLessonId || item.code === cleanLessonId.toUpperCase())
  return isFreeTopicLesson(lesson)
}

function isStaff(profile) {
  return ['admin', 'teacher'].includes(getRole(profile))
}

function getStudentId(profile) {
  return profile?.studentId || profile?.estudianteId || profile?.idEstudiante || ''
}

function subscribeCollection(target, onValue, onError) {
  return onSnapshot(
    target,
    snapshot => onValue(docsFromSnapshot(snapshot)),
    error => onError(error)
  )
}

function subscribeDocAsList(path, id, onValue, onError) {
  return onSnapshot(
    doc(db, path, id),
    snapshot => onValue(snapshot.exists() ? [{ id: snapshot.id, ...snapshot.data() }] : []),
    error => onError(error)
  )
}

function mergeCatalogDocs(key, docs) {
  if (key === 'levels') {
    const byId = new Map(ACADEMIC_LEVELS.map(level => [level.id, level]))

    docs.forEach(item => {
      if (!isLegacyCatalogLevelId(item.id)) {
        byId.set(item.id, {
          ...(byId.get(item.id) || {}),
          ...item
        })
      }
    })

    return Array.from(byId.values())
  }

  if (key === 'lessons') {
    const byId = new Map(LESSONS.map(lesson => [lesson.id, lesson]))

    docs.forEach(item => {
      if (!isLegacyLessonId(item.id)) {
        byId.set(item.id, {
          ...(byId.get(item.id) || {}),
          ...item
        })
      }
    })

    return Array.from(byId.values())
  }

  return docs
}

export function subscribeInstituteData({ profile, onData, onError }) {
  const state = { ...EMPTY_INSTITUTE_DATA }
  const emit = () => onData({ ...state })
  const unsubs = []

  const attach = (key, target) => {
    unsubs.push(subscribeCollection(target, value => {
      state[key] = mergeCatalogDocs(key, value)
      emit()
    }, onError))
  }

  attach('levels', collection(db, COLLECTIONS.levels))
  attach('lessons', collection(db, COLLECTIONS.lessons))
  attach('teachers', collection(db, COLLECTIONS.teachers))
  attach('classrooms', collection(db, COLLECTIONS.classrooms))
  attach('classes', collection(db, COLLECTIONS.classes))
  attach('blockouts', collection(db, COLLECTIONS.blockouts))

  if (isStaff(profile)) {
    attach('students', collection(db, COLLECTIONS.students))
    attach('attendance', collection(db, COLLECTIONS.attendance))
    attach('payments', collection(db, COLLECTIONS.payments))
    attach('grades', collection(db, COLLECTIONS.grades))
    attach('alerts', collection(db, COLLECTIONS.alerts))
    attach('aiUsage', collection(db, COLLECTIONS.aiUsage))
    if (getRole(profile) === 'admin') {
      attach('users', collection(db, COLLECTIONS.users))
    }
  } else {
    const studentId = getStudentId(profile)

    if (!studentId) {
      onError(new Error('Tu acceso de alumno no esta vinculado a un perfil. Pide al admin revisarlo.'))
      emit()
      return () => unsubs.forEach(unsub => unsub())
    }

    unsubs.push(subscribeDocAsList(COLLECTIONS.students, studentId, value => {
      state.students = value
      emit()
    }, onError))
    attach('attendance', query(collection(db, COLLECTIONS.attendance), where('studentId', '==', studentId)))
    attach('payments', query(collection(db, COLLECTIONS.payments), where('studentId', '==', studentId)))
    attach('grades', query(collection(db, COLLECTIONS.grades), where('studentId', '==', studentId)))
    attach('alerts', query(collection(db, COLLECTIONS.alerts), where('studentId', '==', studentId)))
  }

  emit()

  return () => unsubs.forEach(unsub => unsub())
}

function normalizeTeacherId(name) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeDocumentId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizePublicId(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '')
}

function normalizeTeacherPublicId(value) {
  const cleanValue = normalizePublicId(value)
  if (/^T-?\d+$/.test(cleanValue)) {
    const number = cleanValue.replace(/^T-?/, '')
    return `T-${number.padStart(3, '0')}`
  }
  return cleanValue
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

async function requestAuthEmailUpdate(uid, email) {
  if (!uid || !email) return

  const token = await auth.currentUser?.getIdToken()
  if (!token) {
    throw new Error('Inicia sesion de nuevo para cambiar correos de acceso.')
  }

  const response = await fetch('/api/auth-update-email', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ uid, email })
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'No se pudo cambiar el correo en Authentication.')
  }
}

function uniqueValues(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function getPublicIdDocumentId(publicId) {
  return normalizePublicId(publicId).replace(/\//g, '-')
}

function getAdminDocumentId(email) {
  return `admin-${normalizeDocumentId(email)}`
}

async function commitBatchOperations(operations = []) {
  for (let index = 0; index < operations.length; index += 450) {
    const batch = writeBatch(db)
    operations.slice(index, index + 450).forEach(operation => operation(batch))
    await batch.commit()
  }
}

async function getDocsForField(collectionName, fieldName, operator, value) {
  const snapshot = await getDocs(query(collection(db, collectionName), where(fieldName, operator, value)))
  return snapshot.docs
}

function enqueueAuthDeletion(operations, payload) {
  if (!payload?.uid) return

  operations.push(batch => batch.set(doc(db, COLLECTIONS.authDeletionRequests, payload.uid), {
    uid: payload.uid,
    email: payload.email || '',
    role: payload.role || '',
    sourceId: payload.sourceId || '',
    publicId: payload.publicId || '',
    status: 'pending',
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true }))
}

export async function initializeAcademicCatalog() {
  const batch = writeBatch(db)

  ACADEMIC_LEVELS.forEach(level => {
    batch.set(doc(db, COLLECTIONS.levels, level.id), {
      ...level,
      updatedAt: serverTimestamp()
    }, { merge: true })
  })

  LESSONS.forEach(lesson => {
    batch.set(doc(db, COLLECTIONS.lessons, lesson.id), {
      ...lesson,
      updatedAt: serverTimestamp()
    }, { merge: true })
  })

  await batch.commit()
}

export async function initializeTeachers() {
  const batch = writeBatch(db)

  DEFAULT_TEACHERS.forEach(teacher => {
    const id = teacher.id || normalizeTeacherId(teacher.name)
    batch.set(doc(db, COLLECTIONS.teachers, id), {
      id,
      publicId: teacher.publicId,
      name: teacher.name,
      email: teacher.email || '',
      active: true,
      updatedAt: serverTimestamp()
    }, { merge: true })

    batch.set(doc(db, COLLECTIONS.loginIds, teacher.publicId), {
      publicId: teacher.publicId,
      teacherId: id,
      role: 'teacher',
      email: teacher.email || '',
      name: teacher.name,
      updatedAt: serverTimestamp()
    }, { merge: true })
  })

  await batch.commit()
}

export async function initializeClassrooms() {
  const batch = writeBatch(db)

  DEFAULT_CLASSROOMS.forEach(classroom => {
    batch.set(doc(db, COLLECTIONS.classrooms, classroom.id), {
      ...classroom,
      updatedAt: serverTimestamp()
    }, { merge: true })
  })

  await batch.commit()
}

export async function createStudentRecord(payload) {
  const publicId = normalizePublicId(payload.publicId)
  const email = normalizeEmail(payload.email)
  const completedLessonIds = getPreviousLessonIds(payload.currentLessonId)
  const studentDocId = getPublicIdDocumentId(publicId) || doc(collection(db, COLLECTIONS.students)).id
  const studentRef = doc(db, COLLECTIONS.students, studentDocId)
  const existingStudent = await getDoc(studentRef)

  if (existingStudent.exists()) {
    throw new Error(`Ya existe un estudiante con ID ${publicId}. Abre su perfil para editarlo.`)
  }

  await setDoc(studentRef, {
    id: studentRef.id,
    publicId,
    fullName: payload.fullName,
    email,
    phone: payload.phone || '',
    currentLevelId: payload.currentLevelId,
    currentLessonId: payload.currentLessonId,
    completedLessonIds,
    excludedLessonIds: [],
    enrollmentDate: payload.enrollmentDate,
    ...(payload.uid ? { uid: payload.uid } : {}),
    status: payload.status || 'activo',
    scholarshipStatus: payload.scholarshipStatus || 'activa',
    progressPercent: Number(payload.progressPercent || 0),
    searchName: (payload.fullName || '').toLowerCase(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })

  if (publicId && email) {
    await setDoc(doc(db, COLLECTIONS.loginIds, publicId), {
      publicId,
      studentId: studentRef.id,
      role: 'estudiante',
      email,
      fullName: payload.fullName || '',
      ...(payload.uid ? { uid: payload.uid } : {}),
      updatedAt: serverTimestamp()
    }, { merge: true })
  }

  if (payload.uid) {
    await setDoc(doc(db, COLLECTIONS.users, payload.uid), {
      uid: payload.uid,
      email,
      rol: 'estudiante',
      nombre: payload.fullName || '',
      studentId: studentRef.id,
      publicId,
      updatedAt: serverTimestamp()
    }, { merge: true })
  }

  return studentRef.id
}

export async function updateStudentRecord(studentId, payload) {
  const studentRef = doc(db, COLLECTIONS.students, studentId)
  const studentSnapshot = await getDoc(studentRef)
  const previousStudent = studentSnapshot.exists() ? studentSnapshot.data() : {}
  const publicId = normalizePublicId(payload.publicId)
  const email = normalizeEmail(payload.email)
  const oldPublicId = normalizePublicId(previousStudent.publicId)
  const oldEmail = normalizeEmail(previousStudent.email)
  const oldLoginSnapshot = oldPublicId ? await getDoc(doc(db, COLLECTIONS.loginIds, oldPublicId)) : null
  const oldLoginData = oldLoginSnapshot?.exists() ? oldLoginSnapshot.data() : {}
  const uid = payload.uid || previousStudent.uid || oldLoginData.uid || ''
  const completedLessonIds = getPreviousLessonIds(payload.currentLessonId)
  const updatePayload = {
    publicId,
    fullName: payload.fullName,
    email,
    phone: payload.phone || '',
    currentLevelId: payload.currentLevelId,
    currentLessonId: payload.currentLessonId,
    enrollmentDate: payload.enrollmentDate,
    status: payload.status || 'activo',
    scholarshipStatus: payload.scholarshipStatus || 'activa',
    progressPercent: Number(payload.progressPercent || 0),
    searchName: (payload.fullName || '').toLowerCase(),
    updatedAt: serverTimestamp()
  }

  if (Array.isArray(payload.completedLessonIds)) {
    updatePayload.completedLessonIds = payload.completedLessonIds.filter(lessonId => !isFreeTopicLessonId(lessonId))
  }

  if (Array.isArray(payload.excludedLessonIds)) {
    updatePayload.excludedLessonIds = payload.excludedLessonIds.filter(lessonId => !isFreeTopicLessonId(lessonId))
  }

  if (completedLessonIds.length) {
    updatePayload.completedLessonIds = Array.isArray(updatePayload.completedLessonIds)
      ? uniqueValues([...updatePayload.completedLessonIds, ...completedLessonIds])
      : arrayUnion(...completedLessonIds)
    updatePayload.excludedLessonIds = Array.isArray(updatePayload.excludedLessonIds)
      ? updatePayload.excludedLessonIds.filter(lessonId => !completedLessonIds.includes(lessonId))
      : arrayRemove(...completedLessonIds)
  }

  if (uid && email && oldEmail !== email) {
    await requestAuthEmailUpdate(uid, email)
  }

  const userDocsWithOldEmail = oldEmail && oldEmail !== email
    ? await getDocs(query(collection(db, COLLECTIONS.users), where('email', '==', oldEmail)))
    : null
  const batch = writeBatch(db)

  batch.update(studentRef, {
    ...updatePayload,
    ...(uid ? { uid } : {})
  })

  if (oldPublicId && oldPublicId !== publicId) {
    batch.delete(doc(db, COLLECTIONS.loginIds, oldPublicId))
  }

  if (publicId && email) {
    batch.set(doc(db, COLLECTIONS.loginIds, publicId), {
      publicId,
      studentId,
      role: 'estudiante',
      email,
      fullName: payload.fullName || '',
      ...(uid ? { uid } : {}),
      updatedAt: serverTimestamp()
    }, { merge: true })
  }

  if (uid) {
    batch.set(doc(db, COLLECTIONS.users, uid), {
      uid,
      email,
      rol: 'estudiante',
      role: 'estudiante',
      nombre: payload.fullName || '',
      studentId,
      publicId,
      updatedAt: serverTimestamp()
    }, { merge: true })
  }

  userDocsWithOldEmail?.docs.forEach(userDoc => {
    batch.set(userDoc.ref, {
      email,
      updatedAt: serverTimestamp()
    }, { merge: true })
  })

  await batch.commit()
}

export async function deleteStudentRecord(studentId, publicId = '') {
  const studentRef = doc(db, COLLECTIONS.students, studentId)
  const studentSnapshot = await getDoc(studentRef)
  const student = studentSnapshot.exists() ? studentSnapshot.data() : {}
  const cleanPublicId = normalizePublicId(publicId || student.publicId)
  const loginSnapshot = cleanPublicId ? await getDoc(doc(db, COLLECTIONS.loginIds, cleanPublicId)) : null
  const loginData = loginSnapshot?.exists() ? loginSnapshot.data() : {}
  const uid = student.uid || loginData.uid || ''
  const operations = []

  operations.push(batch => batch.delete(studentRef))

  if (cleanPublicId) {
    operations.push(batch => batch.delete(doc(db, COLLECTIONS.loginIds, cleanPublicId)))
  }

  if (uid) {
    operations.push(batch => batch.delete(doc(db, COLLECTIONS.users, uid)))
    enqueueAuthDeletion(operations, {
      uid,
      email: student.email || loginData.email || '',
      role: 'estudiante',
      sourceId: studentId,
      publicId: cleanPublicId
    })
  }

  const relatedCollections = [
    COLLECTIONS.attendance,
    COLLECTIONS.payments,
    COLLECTIONS.grades,
    COLLECTIONS.alerts,
    COLLECTIONS.aiRecommendations
  ]

  for (const collectionName of relatedCollections) {
    const relatedDocs = await getDocsForField(collectionName, 'studentId', '==', studentId)
    relatedDocs.forEach(snapshot => {
      operations.push(batch => batch.delete(snapshot.ref))
    })
  }

  const classDocs = await getDocsForField(COLLECTIONS.classes, 'studentIds', 'array-contains', studentId)
  classDocs.forEach(snapshot => {
    const classItem = snapshot.data()
    const remainingStudentIds = (classItem.studentIds || []).filter(id => id !== studentId)

    if (!remainingStudentIds.length) {
      operations.push(batch => batch.delete(snapshot.ref))
      return
    }

    operations.push(batch => batch.update(snapshot.ref, {
      studentIds: remainingStudentIds,
      updatedAt: serverTimestamp()
    }))
  })

  await commitBatchOperations(operations)
}

export async function createAdminRecord(payload) {
  const email = normalizeEmail(payload.email)
  const nombre = String(payload.nombre || payload.name || email).trim()

  if (!email) throw new Error('Escribe el correo del admin.')

  const id = payload.id || getAdminDocumentId(email)
  await setDoc(doc(db, COLLECTIONS.users, id), {
    id,
    accessDocId: id,
    email,
    nombre,
    rol: 'admin',
    role: 'admin',
    status: payload.status || 'pendiente',
    uid: payload.uid || '',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  }, { merge: true })

  return id
}

export async function updateAdminRecord(adminId, payload) {
  const email = normalizeEmail(payload.email)
  const nombre = String(payload.nombre || payload.name || email).trim()

  if (!adminId) throw new Error('Selecciona un admin.')
  if (!email) throw new Error('El admin necesita correo.')

  await setDoc(doc(db, COLLECTIONS.users, adminId), {
    email,
    nombre,
    rol: 'admin',
    role: 'admin',
    status: payload.status || 'activo',
    uid: payload.uid || '',
    accessDocId: payload.accessDocId || adminId,
    updatedAt: serverTimestamp()
  }, { merge: true })
}

export async function deleteAdminRecord(adminId, currentUid = '') {
  if (!adminId) return
  if (adminId === currentUid) {
    throw new Error('No puedes eliminar el admin con el que estas conectado.')
  }

  const adminRef = doc(db, COLLECTIONS.users, adminId)
  const adminSnapshot = await getDoc(adminRef)
  const adminData = adminSnapshot.exists() ? adminSnapshot.data() : {}
  const uid = adminData.uid || ''

  const operations = [batch => batch.delete(adminRef)]
  if (uid && uid !== currentUid && uid !== adminId) {
    operations.push(batch => batch.delete(doc(db, COLLECTIONS.users, uid)))
  }

  if (uid && uid !== currentUid) {
    enqueueAuthDeletion(operations, {
      uid,
      email: adminData.email || '',
      role: 'admin',
      sourceId: adminId,
      publicId: ''
    })
  }

  await commitBatchOperations(operations)
}

export async function createClassRecord(payload) {
  const result = await addDoc(collection(db, COLLECTIONS.classes), {
    slotKey: payload.slotKey || '',
    levelId: payload.levelId,
    lessonIds: payload.lessonIds || [],
    lessonName: payload.lessonName || '',
    teacherId: payload.teacherId || '',
    teacherName: payload.teacherName,
    date: payload.date,
    time: payload.time || '',
    startAt: payload.startAt,
    endAt: payload.endAt,
    durationHours: Number(payload.durationHours || 1),
    studentIds: payload.studentIds || [],
    classroomId: payload.classroomId || '',
    classroomName: payload.classroomName || payload.room || '',
    room: payload.room || payload.classroomName || 'Por definir',
    mode: payload.mode || 'presencial',
    status: payload.status || 'programada',
    reservationSource: payload.reservationSource || 'admin-manual',
    aiAssignment: payload.aiAssignment || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return result.id
}

export async function updateClassRecord(classId, payload) {
  await updateDoc(doc(db, COLLECTIONS.classes, classId), {
    slotKey: payload.slotKey || '',
    levelId: payload.levelId,
    lessonIds: payload.lessonIds || [],
    lessonName: payload.lessonName || '',
    teacherId: payload.teacherId || '',
    teacherName: payload.teacherName,
    date: payload.date,
    time: payload.time || '',
    startAt: payload.startAt,
    endAt: payload.endAt,
    durationHours: Number(payload.durationHours || 1),
    studentIds: payload.studentIds || [],
    classroomId: payload.classroomId || '',
    classroomName: payload.classroomName || payload.room || '',
    room: payload.room || payload.classroomName || 'Por definir',
    mode: payload.mode || 'presencial',
    status: payload.status || 'programada',
    reservationSource: payload.reservationSource || 'admin-manual',
    aiAssignment: payload.aiAssignment || null,
    updatedAt: serverTimestamp()
  })
}

export async function deleteClassRecord(classId) {
  await deleteDoc(doc(db, COLLECTIONS.classes, classId))
}

function sanitizeClassIdSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function dissolveClassToPendingReservationsRecord(classId) {
  const classRef = doc(db, COLLECTIONS.classes, classId)
  const classSnapshot = await getDoc(classRef)

  if (!classSnapshot.exists()) return

  const classItem = classSnapshot.data()
  const studentIds = Array.isArray(classItem.studentIds) ? classItem.studentIds : []
  const isAlreadyPending = classItem.status === 'pendiente_asignacion'
    || (classItem.reservationSource === 'student-auto' && !classItem.teacherId)

  if (!studentIds.length || isAlreadyPending) {
    await deleteDoc(classRef)
    return
  }

  const batch = writeBatch(db)
  const cleanClassId = sanitizeClassIdSegment(classId)
  const date = classItem.date || ''
  const time = classItem.time || ''
  const durationHours = Number(classItem.durationHours || 1) || 1

  studentIds.forEach(studentId => {
    const cleanStudentId = sanitizeClassIdSegment(studentId)
    const restoredId = `restored-${cleanClassId}-${cleanStudentId}`
    const reservationRef = doc(db, COLLECTIONS.classes, restoredId)
    const reservationBlockId = `restored-block-${cleanClassId}-${cleanStudentId}`

    batch.set(reservationRef, {
      id: restoredId,
      slotKey: `${date}-${time}-${cleanStudentId}`,
      levelId: classItem.levelId || '',
      lessonIds: classItem.lessonIds || [],
      lessonName: classItem.lessonName || '',
      teacherId: '',
      teacherName: '',
      date,
      time,
      startAt: classItem.startAt || null,
      endAt: classItem.endAt || null,
      durationHours,
      studentIds: [studentId],
      classroomId: '',
      classroomName: '',
      room: 'Por asignar',
      mode: classItem.mode || 'presencial',
      status: 'pendiente_asignacion',
      reservationSource: 'student-auto',
      reservationBlockId,
      reservationBlockHours: durationHours,
      reservationBlockStartTime: time,
      restoredFromClassId: classId,
      aiAssignment: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true })
  })

  batch.delete(classRef)
  await batch.commit()
}

export async function createBlockoutRecord(payload) {
  const result = await addDoc(collection(db, COLLECTIONS.blockouts), {
    date: payload.date,
    time: payload.allDay ? '' : payload.time || '',
    allDay: payload.allDay === true,
    reason: payload.reason || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return result.id
}

export async function deleteBlockoutRecord(blockoutId) {
  await deleteDoc(doc(db, COLLECTIONS.blockouts, blockoutId))
}

export async function createClassroomRecord(payload) {
  const id = normalizeDocumentId(payload.id || payload.name) || doc(collection(db, COLLECTIONS.classrooms)).id
  await setDoc(doc(db, COLLECTIONS.classrooms, id), {
    id,
    name: payload.name,
    active: payload.active !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true })
  return id
}

export async function updateClassroomRecord(classroomId, payload) {
  await setDoc(doc(db, COLLECTIONS.classrooms, classroomId), {
    id: classroomId,
    name: payload.name,
    active: payload.active !== false,
    updatedAt: serverTimestamp()
  }, { merge: true })
}

export async function deleteClassroomRecord(classroomId) {
  await deleteDoc(doc(db, COLLECTIONS.classrooms, classroomId))
}

export async function updateClassRosterRecord(classId, studentIds = []) {
  await updateDoc(doc(db, COLLECTIONS.classes, classId), {
    studentIds,
    updatedAt: serverTimestamp()
  })
}

export async function reserveStudentClassRecord(assignment) {
  const assignments = Array.isArray(assignment.assignments) && assignment.assignments.length
    ? assignment.assignments
    : [assignment]

  if (assignments.length > 1) {
    const batch = writeBatch(db)

    for (const classAssignment of assignments) {
      const classId = classAssignment.classId || classAssignment.payload?.id
      const studentId = classAssignment.studentId || assignment.studentId
      const classRef = doc(db, COLLECTIONS.classes, classId)
      const classSnapshot = await getDoc(classRef)

      if (classSnapshot.exists()) {
        batch.update(classRef, {
          studentIds: arrayUnion(studentId),
          updatedAt: serverTimestamp()
        })
      } else {
        batch.set(classRef, {
          ...classAssignment.payload,
          id: classId,
          studentIds: [studentId],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true })
      }
    }

    await batch.commit()
    return assignment.reservationBlockId || assignments[0].classId
  }

  const classAssignment = assignments[0]
  const classId = classAssignment.classId || classAssignment.payload?.id
  const studentId = classAssignment.studentId || assignment.studentId
  const classRef = doc(db, COLLECTIONS.classes, classId)
  const classSnapshot = await getDoc(classRef)

  if (classSnapshot.exists()) {
    await updateDoc(classRef, {
      studentIds: arrayUnion(studentId),
      updatedAt: serverTimestamp()
    })
    return classId
  }

  await setDoc(classRef, {
    ...classAssignment.payload,
    id: classId,
    studentIds: [studentId],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true })

  return classId
}

export async function cancelStudentReservationRecord(classId, studentId) {
  const classRef = doc(db, COLLECTIONS.classes, classId)
  const classSnapshot = await getDoc(classRef)

  if (classSnapshot.exists()) {
    const classItem = classSnapshot.data()
    const studentIds = classItem.studentIds || []
    const isOnlyStudent = studentIds.length === 1 && studentIds[0] === studentId
    const canStudentCancel = classItem.reservationSource === 'student-auto'
      && classItem.status === 'pendiente_asignacion'
      && !classItem.teacherId

    if (!canStudentCancel) {
      throw new Error('Esta clase ya fue formada por admin y ya no se puede cancelar desde alumno.')
    }

    const reservationBlockId = classItem.reservationBlockId || ''
    if (reservationBlockId) {
      const blockDocs = await getDocs(query(collection(db, COLLECTIONS.classes), where('reservationBlockId', '==', reservationBlockId)))
      const operations = []

      blockDocs.docs.forEach(snapshot => {
        const blockClass = snapshot.data()
        const blockStudentIds = blockClass.studentIds || []
        const blockCanCancel = blockClass.reservationSource === 'student-auto'
          && blockClass.status === 'pendiente_asignacion'
          && !blockClass.teacherId
          && blockStudentIds.includes(studentId)

        if (!blockCanCancel) return
        if (blockStudentIds.length === 1) {
          operations.push(batch => batch.delete(snapshot.ref))
        } else {
          operations.push(batch => batch.update(snapshot.ref, {
            studentIds: arrayRemove(studentId),
            updatedAt: serverTimestamp()
          }))
        }
      })

      if (operations.length) {
        await commitBatchOperations(operations)
        return
      }
    }

    if (isOnlyStudent) {
      await deleteDoc(classRef)
      return
    }
  }

  await updateDoc(classRef, {
    studentIds: arrayRemove(studentId),
    updatedAt: serverTimestamp()
  })
}

export async function createPaymentRecord(payload) {
  const result = await addDoc(collection(db, COLLECTIONS.payments), {
    ...payload,
    amount: Number(payload.amount || 0),
    status: payload.status || 'pendiente',
    paidAt: payload.status === 'pagado' ? payload.paidAt || new Date().toISOString() : payload.paidAt || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return result.id
}

export async function updatePaymentRecord(paymentId, payload) {
  await updateDoc(doc(db, COLLECTIONS.payments, paymentId), {
    ...payload,
    amount: Number(payload.amount || 0),
    paidAt: payload.status === 'pagado' ? payload.paidAt || new Date().toISOString() : null,
    updatedAt: serverTimestamp()
  })
}

export async function deletePaymentRecord(paymentId) {
  await deleteDoc(doc(db, COLLECTIONS.payments, paymentId))
}

export async function upsertGradeRecord(payload) {
  const id = payload.id || `${payload.studentId}-${payload.levelId}`
  await setDoc(doc(db, COLLECTIONS.grades, id), {
    id,
    studentId: payload.studentId,
    levelId: payload.levelId,
    oral: payload.oral === '' || payload.oral === null || payload.oral === undefined ? null : Number(payload.oral),
    written: payload.written === '' || payload.written === null || payload.written === undefined ? null : Number(payload.written),
    updatedAt: serverTimestamp()
  }, { merge: true })
  return id
}

export async function deleteGradeRecord(gradeId) {
  await deleteDoc(doc(db, COLLECTIONS.grades, gradeId))
}

export async function createAttendanceRecord(payload) {
  let lessonId = payload.lessonId || ''

  if (!lessonId && payload.classId) {
    const classSnapshot = await getDoc(doc(db, COLLECTIONS.classes, payload.classId))
    lessonId = classSnapshot.exists() ? classSnapshot.data().lessonIds?.[0] || '' : ''
  }

  const attendancePayload = {
    ...payload,
    ...(lessonId ? { lessonId } : {}),
    attended: payload.attended === true,
    hoursCredited: Number(payload.hoursCredited || 0),
    absenceNoticeAt: payload.absenceNoticeAt || null,
    recordedAt: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }
  const result = await addDoc(collection(db, COLLECTIONS.attendance), attendancePayload)

  if (attendancePayload.attended && attendancePayload.studentId && attendancePayload.lessonId && !isFreeTopicLessonId(attendancePayload.lessonId)) {
    await updateDoc(doc(db, COLLECTIONS.students, attendancePayload.studentId), {
      completedLessonIds: arrayUnion(attendancePayload.lessonId),
      excludedLessonIds: arrayRemove(attendancePayload.lessonId),
      updatedAt: serverTimestamp()
    })
  }

  return result.id
}

export async function createAttendanceRecords(records = []) {
  if (!records.length) return []

  const batch = writeBatch(db)
  const ids = []
  const classLessonById = new Map()
  const classIds = uniqueValues(records.map(record => record.classId))
  const classSnapshots = await Promise.all(
    classIds.map(async classId => [classId, await getDoc(doc(db, COLLECTIONS.classes, classId))])
  )

  classSnapshots.forEach(([classId, classSnapshot]) => {
    if (!classSnapshot.exists()) return
    classLessonById.set(classId, classSnapshot.data().lessonIds?.[0] || '')
  })

  records.forEach(record => {
    const attendanceId = record.id || (record.classId && record.studentId ? `${record.classId}-${record.studentId}` : '')
    const attendanceRef = attendanceId
      ? doc(db, COLLECTIONS.attendance, attendanceId)
      : doc(collection(db, COLLECTIONS.attendance))
    ids.push(attendanceRef.id)
    const attendancePayload = {
      ...record,
      id: attendanceRef.id,
      lessonId: record.lessonId || classLessonById.get(record.classId) || '',
      attended: record.attended === true,
      hoursCredited: Number(record.hoursCredited || 0),
      absenceNoticeAt: record.absenceNoticeAt || null,
      recordedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }

    batch.set(attendanceRef, attendancePayload, { merge: true })

    if (attendancePayload.attended && attendancePayload.studentId && attendancePayload.lessonId && !isFreeTopicLessonId(attendancePayload.lessonId)) {
      batch.update(doc(db, COLLECTIONS.students, attendancePayload.studentId), {
        completedLessonIds: arrayUnion(attendancePayload.lessonId),
        excludedLessonIds: arrayRemove(attendancePayload.lessonId),
        updatedAt: serverTimestamp()
      })
    }
  })

  await batch.commit()
  return ids
}

export async function createTeacherRecord(payload) {
  const name = payload.name.trim()
  const id = normalizeTeacherId(name) || doc(collection(db, COLLECTIONS.teachers)).id
  const publicId = normalizeTeacherPublicId(payload.publicId)
  const email = normalizeEmail(payload.email)

  await setDoc(doc(db, COLLECTIONS.teachers, id), {
    id,
    publicId,
    name,
    email,
    ...(payload.uid ? { uid: payload.uid } : {}),
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true })

  if (publicId && email) {
    await setDoc(doc(db, COLLECTIONS.loginIds, publicId), {
      publicId,
      teacherId: id,
      role: 'teacher',
      email,
      name,
      ...(payload.uid ? { uid: payload.uid } : {}),
      updatedAt: serverTimestamp()
    }, { merge: true })
  }

  if (payload.uid) {
    await setDoc(doc(db, COLLECTIONS.users, payload.uid), {
      uid: payload.uid,
      email,
      rol: 'teacher',
      nombre: name,
      teacherId: id,
      publicId,
      updatedAt: serverTimestamp()
    }, { merge: true })
  }

  return id
}

export async function updateTeacherRecord(teacherId, payload) {
  const teacherRef = doc(db, COLLECTIONS.teachers, teacherId)
  const teacherSnapshot = await getDoc(teacherRef)
  const previousTeacher = teacherSnapshot.exists() ? teacherSnapshot.data() : {}
  const name = payload.name.trim()
  const publicId = normalizeTeacherPublicId(payload.publicId)
  const email = normalizeEmail(payload.email)
  const oldPublicId = normalizePublicId(previousTeacher.publicId)
  const oldEmail = normalizeEmail(previousTeacher.email)
  const oldLoginSnapshot = oldPublicId ? await getDoc(doc(db, COLLECTIONS.loginIds, oldPublicId)) : null
  const oldLoginData = oldLoginSnapshot?.exists() ? oldLoginSnapshot.data() : {}
  const uid = payload.uid || previousTeacher.uid || oldLoginData.uid || ''
  const activeUserSnapshot = uid ? await getDoc(doc(db, COLLECTIONS.users, uid)) : null
  const activeUser = activeUserSnapshot?.exists() ? activeUserSnapshot.data() : {}

  if (uid && email && oldEmail !== email) {
    await requestAuthEmailUpdate(uid, email)
  }

  const userDocsWithOldEmail = oldEmail && oldEmail !== email
    ? await getDocs(query(collection(db, COLLECTIONS.users), where('email', '==', oldEmail)))
    : null
  const batch = writeBatch(db)

  batch.update(teacherRef, {
    publicId,
    name,
    email,
    ...(uid ? { uid } : {}),
    updatedAt: serverTimestamp()
  })

  if (oldPublicId && oldPublicId !== publicId) {
    batch.delete(doc(db, COLLECTIONS.loginIds, oldPublicId))
  }

  if (publicId && email) {
    batch.set(doc(db, COLLECTIONS.loginIds, publicId), {
      publicId,
      teacherId,
      role: 'teacher',
      email,
      name,
      ...(payload.uid ? { uid: payload.uid } : {}),
      updatedAt: serverTimestamp()
    }, { merge: true })
  }

  if (uid) {
    batch.set(doc(db, COLLECTIONS.users, uid), {
      uid,
      email,
      rol: activeUser.rol || activeUser.role || 'teacher',
      role: activeUser.role || activeUser.rol || 'teacher',
      nombre: name,
      teacherId,
      publicId,
      updatedAt: serverTimestamp()
    }, { merge: true })
  }

  userDocsWithOldEmail?.docs.forEach(userDoc => {
    batch.set(userDoc.ref, {
      email,
      updatedAt: serverTimestamp()
    }, { merge: true })
  })

  await batch.commit()
}

export async function deleteTeacherRecord(teacherId, publicId = '') {
  const teacherRef = doc(db, COLLECTIONS.teachers, teacherId)
  const teacherSnapshot = await getDoc(teacherRef)
  const teacher = teacherSnapshot.exists() ? teacherSnapshot.data() : {}
  const cleanPublicId = normalizePublicId(publicId || teacher.publicId)
  const loginSnapshot = cleanPublicId ? await getDoc(doc(db, COLLECTIONS.loginIds, cleanPublicId)) : null
  const loginData = loginSnapshot?.exists() ? loginSnapshot.data() : {}
  const uid = teacher.uid || loginData.uid || ''
  const operations = []

  operations.push(batch => batch.delete(teacherRef))

  if (cleanPublicId) {
    operations.push(batch => batch.delete(doc(db, COLLECTIONS.loginIds, cleanPublicId)))
  }

  if (uid) {
    operations.push(batch => batch.delete(doc(db, COLLECTIONS.users, uid)))
    enqueueAuthDeletion(operations, {
      uid,
      email: teacher.email || loginData.email || '',
      role: 'teacher',
      sourceId: teacherId,
      publicId: cleanPublicId
    })
  }

  const classDocsById = new Map()
  const teacherClassDocs = await getDocsForField(COLLECTIONS.classes, 'teacherId', '==', teacherId)
  teacherClassDocs.forEach(snapshot => classDocsById.set(snapshot.id, snapshot))

  if (teacher.name) {
    const teacherNameClassDocs = await getDocsForField(COLLECTIONS.classes, 'teacherName', '==', teacher.name)
    teacherNameClassDocs.forEach(snapshot => classDocsById.set(snapshot.id, snapshot))
  }

  classDocsById.forEach(snapshot => {
    operations.push(batch => batch.update(snapshot.ref, {
      teacherId: '',
      teacherName: '',
      status: 'pendiente_asignacion',
      updatedAt: serverTimestamp()
    }))
  })

  await commitBatchOperations(operations)
}

export async function createLevelRecord(payload) {
  const id = normalizeDocumentId(payload.id || payload.shortName || payload.name)
  await setDoc(doc(db, COLLECTIONS.levels, id), {
    id,
    order: Number(payload.order || 0),
    name: payload.name,
    shortName: payload.shortName || payload.name,
    durationMonths: Number(payload.durationMonths || 1),
    targetLessons: Number(payload.targetLessons || 0),
    description: payload.description || '',
    updatedAt: serverTimestamp()
  }, { merge: true })
  return id
}

export async function updateLevelRecord(levelId, payload) {
  await setDoc(doc(db, COLLECTIONS.levels, levelId), {
    id: levelId,
    order: Number(payload.order || 0),
    name: payload.name,
    shortName: payload.shortName || payload.name,
    durationMonths: Number(payload.durationMonths || 1),
    targetLessons: Number(payload.targetLessons || 0),
    description: payload.description || '',
    updatedAt: serverTimestamp()
  }, { merge: true })
}

export async function deleteLevelRecord(levelId) {
  await deleteDoc(doc(db, COLLECTIONS.levels, levelId))
}

export async function createLessonRecord(payload) {
  const id = normalizeDocumentId(payload.id || `${payload.levelId}-${payload.name}`)
  await setDoc(doc(db, COLLECTIONS.lessons, id), {
    id,
    levelId: payload.levelId,
    order: Number(payload.order || 1),
    name: payload.name,
    estimatedHours: 1,
    activities: payload.activities || [],
    objectives: payload.objectives || [],
    updatedAt: serverTimestamp()
  }, { merge: true })
  return id
}

export async function updateLessonRecord(lessonId, payload) {
  await setDoc(doc(db, COLLECTIONS.lessons, lessonId), {
    id: lessonId,
    levelId: payload.levelId,
    order: Number(payload.order || 1),
    name: payload.name,
    estimatedHours: 1,
    activities: payload.activities || [],
    objectives: payload.objectives || [],
    updatedAt: serverTimestamp()
  }, { merge: true })
}

export async function deleteLessonRecord(lessonId) {
  await deleteDoc(doc(db, COLLECTIONS.lessons, lessonId))
}

export async function updateAttendanceStatus(attendanceId, payload) {
  const attendanceRef = doc(db, COLLECTIONS.attendance, attendanceId)
  const attendanceSnapshot = await getDoc(attendanceRef)
  const existingAttendance = attendanceSnapshot.exists() ? attendanceSnapshot.data() : {}
  let lessonId = payload.lessonId || existingAttendance.lessonId || ''

  if (payload.attended === true && !lessonId && existingAttendance.classId) {
    const classSnapshot = await getDoc(doc(db, COLLECTIONS.classes, existingAttendance.classId))
    lessonId = classSnapshot.exists() ? classSnapshot.data().lessonIds?.[0] || '' : ''
  }

  await updateDoc(attendanceRef, {
    ...payload,
    ...(lessonId ? { lessonId } : {}),
    recordedAt: new Date().toISOString(),
    updatedAt: serverTimestamp()
  })

  if (payload.attended === true && existingAttendance.studentId && lessonId && !isFreeTopicLessonId(lessonId)) {
    await updateDoc(doc(db, COLLECTIONS.students, existingAttendance.studentId), {
      completedLessonIds: arrayUnion(lessonId),
      excludedLessonIds: arrayRemove(lessonId),
      updatedAt: serverTimestamp()
    })
  }
}

export async function syncAttendanceProgressRecords(records = [], classes = [], students = []) {
  const classLessonById = new Map(
    classes.map(classItem => [classItem.id, classItem.lessonIds?.[0] || ''])
  )
  const excludedByStudentId = new Map(
    students.map(student => [student.id, new Set(Array.isArray(student.excludedLessonIds) ? student.excludedLessonIds : [])])
  )
  const operations = records
    .filter(record => record.attended === true && record.studentId)
    .map(record => ({
      studentId: record.studentId,
      lessonId: record.lessonId || classLessonById.get(record.classId) || ''
    }))
    .filter(item => item.lessonId)
    .filter(item => !isFreeTopicLessonId(item.lessonId))
    .filter(item => !excludedByStudentId.get(item.studentId)?.has(item.lessonId))

  if (!operations.length) return 0

  await commitBatchOperations(operations.map(item => batch => {
    batch.update(doc(db, COLLECTIONS.students, item.studentId), {
      completedLessonIds: arrayUnion(item.lessonId),
      excludedLessonIds: arrayRemove(item.lessonId),
      updatedAt: serverTimestamp()
    })
  }))

  return operations.length
}

export async function registerAbsenceNotice(attendanceId, noticeAt = new Date()) {
  await updateDoc(doc(db, COLLECTIONS.attendance, attendanceId), {
    absenceNoticeAt: noticeAt.toISOString(),
    updatedAt: serverTimestamp()
  })
}

export async function saveAiRecommendation(recommendation) {
  const id = recommendation.id || `${recommendation.studentId || 'group'}-${Date.now()}`
  await setDoc(doc(db, COLLECTIONS.aiRecommendations, id), {
    ...recommendation,
    id,
    status: recommendation.status || 'pendiente',
    createdAt: recommendation.createdAt || new Date().toISOString(),
    updatedAt: serverTimestamp()
  })
  return id
}

export async function recordAiUsageEvent(payload = {}) {
  const month = payload.month || new Date().toISOString().slice(0, 7)
  const provider = payload.provider || 'local-rules'
  const status = payload.status || 'local'
  const isAiResponse = provider === 'mistral-ai' || provider === 'firebase-ai-logic'
  const isFallback = provider === 'local-rules-fallback'
  const isManual = provider === 'admin-manual'

  await setDoc(doc(db, COLLECTIONS.aiUsage, month), {
    id: month,
    month,
    totalRequests: increment(1),
    aiResponses: increment(isAiResponse ? 1 : 0),
    localDetections: increment(provider === 'local-rules' ? 1 : 0),
    fallbacks: increment(isFallback ? 1 : 0),
    manualFormations: increment(isManual ? 1 : 0),
    errors: increment(payload.error ? 1 : 0),
    lastProvider: provider,
    lastModel: payload.model || '',
    lastStatus: status,
    lastMessage: payload.message || '',
    updatedAt: serverTimestamp()
  }, { merge: true })
}

export { COLLECTIONS, isStaff, getStudentId }
