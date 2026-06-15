import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore'
import { db } from '../firebase'
import { ACADEMIC_LEVELS, LESSONS } from '../domain/academicCatalog'

const COLLECTIONS = {
  students: 'estudiantes',
  users: 'usuarios',
  levels: 'niveles',
  lessons: 'lecciones',
  classes: 'clases',
  attendance: 'asistencias',
  payments: 'pagos',
  grades: 'calificaciones',
  alerts: 'becaEventos',
  aiRecommendations: 'aiRecommendations'
}

export const EMPTY_INSTITUTE_DATA = {
  source: 'firebase',
  students: [],
  levels: [],
  lessons: [],
  classes: [],
  attendance: [],
  payments: [],
  grades: [],
  alerts: []
}

function docsFromSnapshot(snapshot) {
  return snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }))
}

function getRole(profile) {
  return profile?.rol || profile?.role || ''
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

export function subscribeInstituteData({ profile, onData, onError }) {
  const state = { ...EMPTY_INSTITUTE_DATA }
  const emit = () => onData({ ...state })
  const unsubs = []

  const attach = (key, target) => {
    unsubs.push(subscribeCollection(target, value => {
      state[key] = value
      emit()
    }, onError))
  }

  attach('levels', collection(db, COLLECTIONS.levels))
  attach('lessons', collection(db, COLLECTIONS.lessons))
  attach('classes', collection(db, COLLECTIONS.classes))

  if (isStaff(profile)) {
    attach('students', collection(db, COLLECTIONS.students))
    attach('attendance', collection(db, COLLECTIONS.attendance))
    attach('payments', collection(db, COLLECTIONS.payments))
    attach('grades', collection(db, COLLECTIONS.grades))
    attach('alerts', collection(db, COLLECTIONS.alerts))
  } else {
    const studentId = getStudentId(profile)

    if (!studentId) {
      onError(new Error('El usuario estudiante no tiene studentId en usuarios/{uid}.'))
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

export async function createStudentRecord(payload) {
  const studentRef = doc(collection(db, COLLECTIONS.students))
  await setDoc(studentRef, {
    ...payload,
    id: studentRef.id,
    status: payload.status || 'activo',
    scholarshipStatus: payload.scholarshipStatus || 'activa',
    progressPercent: Number(payload.progressPercent || 0),
    availability: payload.availability || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return studentRef.id
}

export async function createClassRecord(payload) {
  const result = await addDoc(collection(db, COLLECTIONS.classes), {
    ...payload,
    capacity: Number(payload.capacity || 1),
    studentIds: payload.studentIds || [],
    lessonIds: payload.lessonIds || [],
    status: payload.status || 'programada',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return result.id
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
