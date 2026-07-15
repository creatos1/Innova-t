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
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore'
import { db } from '../firebase'
import {
  ACADEMIC_LEVELS,
  LESSONS,
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
  authDeletionRequests: 'authDeletionRequests'
}

export const EMPTY_INSTITUTE_DATA = {
  source: 'firebase',
  students: [],
  levels: [],
  lessons: [],
  teachers: [],
  classrooms: [],
  classes: [],
  attendance: [],
  payments: [],
  grades: [],
  alerts: [],
  blockouts: []
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

  if (!currentLesson?.globalOrder) return []

  return LESSONS
    .filter(lesson => lesson.globalOrder && lesson.globalOrder < currentLesson.globalOrder)
    .sort((a, b) => a.globalOrder - b.globalOrder)
    .map(lesson => lesson.id)
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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function getPublicIdDocumentId(publicId) {
  return normalizePublicId(publicId).replace(/\//g, '-')
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
  const publicId = normalizePublicId(payload.publicId)
  const email = normalizeEmail(payload.email)
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

  if (completedLessonIds.length) {
    updatePayload.completedLessonIds = arrayUnion(...completedLessonIds)
  }

  await updateDoc(doc(db, COLLECTIONS.students, studentId), updatePayload)

  if (publicId && email) {
    await setDoc(doc(db, COLLECTIONS.loginIds, publicId), {
      publicId,
      studentId,
      role: 'estudiante',
      email,
      fullName: payload.fullName || '',
      updatedAt: serverTimestamp()
    }, { merge: true })
  }
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

    if (
      isOnlyStudent
      && classItem.reservationSource === 'student-auto'
      && classItem.status === 'pendiente_asignacion'
      && !classItem.teacherId
    ) {
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
  const result = await addDoc(collection(db, COLLECTIONS.attendance), {
    ...payload,
    attended: payload.attended === true,
    hoursCredited: Number(payload.hoursCredited || 0),
    absenceNoticeAt: payload.absenceNoticeAt || null,
    recordedAt: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return result.id
}

export async function createAttendanceRecords(records = []) {
  if (!records.length) return []

  const batch = writeBatch(db)
  const ids = []

  records.forEach(record => {
    const attendanceId = record.id || (record.classId && record.studentId ? `${record.classId}-${record.studentId}` : '')
    const attendanceRef = attendanceId
      ? doc(db, COLLECTIONS.attendance, attendanceId)
      : doc(collection(db, COLLECTIONS.attendance))
    ids.push(attendanceRef.id)
    batch.set(attendanceRef, {
      ...record,
      id: attendanceRef.id,
      attended: record.attended === true,
      hoursCredited: Number(record.hoursCredited || 0),
      absenceNoticeAt: record.absenceNoticeAt || null,
      recordedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true })
  })

  await batch.commit()
  return ids
}

export async function createTeacherRecord(payload) {
  const name = payload.name.trim()
  const id = normalizeTeacherId(name) || doc(collection(db, COLLECTIONS.teachers)).id
  const publicId = normalizePublicId(payload.publicId)
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
  const name = payload.name.trim()
  const publicId = normalizePublicId(payload.publicId)
  const email = normalizeEmail(payload.email)
  await updateDoc(doc(db, COLLECTIONS.teachers, teacherId), {
    publicId,
    name,
    email,
    updatedAt: serverTimestamp()
  })

  if (publicId && email) {
    await setDoc(doc(db, COLLECTIONS.loginIds, publicId), {
      publicId,
      teacherId,
      role: 'teacher',
      email,
      name,
      ...(payload.uid ? { uid: payload.uid } : {}),
      updatedAt: serverTimestamp()
    }, { merge: true })
  }

  if (payload.uid) {
    await setDoc(doc(db, COLLECTIONS.users, payload.uid), {
      email,
      rol: 'teacher',
      nombre: name,
      teacherId,
      publicId,
      updatedAt: serverTimestamp()
    }, { merge: true })
  }
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
  await updateDoc(doc(db, COLLECTIONS.attendance, attendanceId), {
    ...payload,
    recordedAt: new Date().toISOString(),
    updatedAt: serverTimestamp()
  })
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

export { COLLECTIONS, isStaff, getStudentId }
