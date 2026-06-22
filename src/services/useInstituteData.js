import { useEffect, useMemo, useState } from 'react'
import { buildInstituteInsights } from '../domain/instituteState'
import {
  createAttendanceRecord,
  createAttendanceRecords,
  createClassRecord,
  createLevelRecord,
  createLessonRecord,
  createPaymentRecord,
  createStudentRecord,
  createTeacherRecord,
  cancelStudentReservationRecord,
  deleteClassRecord,
  deleteLevelRecord,
  deleteLessonRecord,
  deletePaymentRecord,
  deleteStudentRecord,
  deleteTeacherRecord,
  EMPTY_INSTITUTE_DATA,
  initializeAcademicCatalog,
  initializeTeachers,
  registerAbsenceNotice,
  reserveStudentClassRecord,
  subscribeInstituteData,
  updateAttendanceStatus,
  updateClassRecord,
  updateClassRosterRecord,
  updateLevelRecord,
  updateLessonRecord,
  updatePaymentRecord,
  updateStudentRecord,
  updateTeacherRecord,
  upsertGradeRecord,
  deleteGradeRecord
} from './instituteRepository'
import { useAuthProfile } from './useAuthProfile'

export function useInstituteData() {
  const { user, profile, loading: authLoading, error: authError } = useAuthProfile()
  const [data, setData] = useState(EMPTY_INSTITUTE_DATA)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (authLoading) return undefined

    if (!user || !profile) {
      setData(EMPTY_INSTITUTE_DATA)
      setLoading(false)
      return undefined
    }

    setLoading(true)

    const unsubscribe = subscribeInstituteData({
      profile,
      onData: nextData => {
        setData(nextData)
        setLoading(false)
      },
      onError: error => {
        console.warn(error)
        const permissionDenied = error.code === 'permission-denied'
          || (error.message || '').toLowerCase().includes('insufficient permissions')
        setMessage(permissionDenied
          ? 'Firebase rechazo permisos. Publica firestore.rules actualizado y confirma que tu usuario tenga rol admin o teacher.'
          : error.message || 'Firebase rechazo una lectura. Revisa reglas y rol del usuario.')
        setLoading(false)
      }
    })

    return unsubscribe
  }, [authLoading, user, profile])

  const insights = useMemo(() => (
    buildInstituteInsights(data, { now: new Date() })
  ), [data])

  async function runWrite(action, successMessage) {
    try {
      setSaving(true)
      await action()
      setMessage(successMessage)
    } catch (error) {
      console.warn(error)
      setMessage(error.message || 'Firebase rechazo la escritura. Revisa permisos y datos.')
    } finally {
      setSaving(false)
    }
  }

  async function markAttendance(attendanceId, attended) {
    await runWrite(
      () => updateAttendanceStatus(attendanceId, {
        attended,
        hoursCredited: attended ? 1 : 0
      }),
      'Asistencia actualizada en Firebase.'
    )
  }

  async function notifyAbsence(attendanceId) {
    await runWrite(
      () => registerAbsenceNotice(attendanceId, new Date()),
      'Aviso de ausencia registrado en Firebase.'
    )
  }

  async function createStudent(payload) {
    await runWrite(
      () => createStudentRecord(payload),
      'Estudiante creado en Firestore.'
    )
  }

  async function updateStudent(studentId, payload) {
    await runWrite(
      () => updateStudentRecord(studentId, payload),
      'Estudiante actualizado en Firestore.'
    )
  }

  async function deleteStudent(studentId, publicId) {
    await runWrite(
      () => deleteStudentRecord(studentId, publicId),
      'Estudiante eliminado de Firestore.'
    )
  }

  async function createClass(payload) {
    await runWrite(
      () => createClassRecord(payload),
      'Clase creada en Firestore.'
    )
  }

  async function updateClass(classId, payload) {
    await runWrite(
      () => updateClassRecord(classId, payload),
      'Clase actualizada en Firestore.'
    )
  }

  async function deleteClass(classId) {
    await runWrite(
      () => deleteClassRecord(classId),
      'Clase eliminada de Firestore.'
    )
  }

  async function updateClassRoster(classId, studentIds) {
    await runWrite(
      () => updateClassRosterRecord(classId, studentIds),
      'Lista de estudiantes de la clase actualizada.'
    )
  }

  async function reserveStudentClass(assignment) {
    await runWrite(
      () => reserveStudentClassRecord(assignment),
      'Clase reservada. El sistema acomodo nivel, leccion y teacher automaticamente.'
    )
  }

  async function cancelStudentReservation(classId, studentId) {
    await runWrite(
      () => cancelStudentReservationRecord(classId, studentId),
      'Reserva cancelada en Firestore.'
    )
  }

  async function createPayment(payload) {
    await runWrite(
      () => createPaymentRecord(payload),
      'Pago creado en Firestore.'
    )
  }

  async function updatePayment(paymentId, payload) {
    await runWrite(
      () => updatePaymentRecord(paymentId, payload),
      'Pago actualizado en Firestore.'
    )
  }

  async function deletePayment(paymentId) {
    await runWrite(
      () => deletePaymentRecord(paymentId),
      'Pago eliminado de Firestore.'
    )
  }

  async function createAttendance(payload) {
    await runWrite(
      () => createAttendanceRecord(payload),
      'Asistencia creada en Firestore.'
    )
  }

  async function createBulkAttendance(records) {
    await runWrite(
      () => createAttendanceRecords(records),
      'Asistencia guardada por clase en Firestore.'
    )
  }

  async function createTeacher(payload) {
    await runWrite(
      () => createTeacherRecord(payload),
      'Teacher guardado en Firestore.'
    )
  }

  async function updateTeacher(teacherId, payload) {
    await runWrite(
      () => updateTeacherRecord(teacherId, payload),
      'Teacher actualizado en Firestore.'
    )
  }

  async function deleteTeacher(teacherId, publicId) {
    await runWrite(
      () => deleteTeacherRecord(teacherId, publicId),
      'Teacher eliminado de Firestore.'
    )
  }

  async function saveGrade(payload) {
    await runWrite(
      () => upsertGradeRecord(payload),
      'Calificacion oral/escrita guardada en Firestore.'
    )
  }

  async function deleteGrade(gradeId) {
    await runWrite(
      () => deleteGradeRecord(gradeId),
      'Calificacion eliminada de Firestore.'
    )
  }

  async function createLevel(payload) {
    await runWrite(
      () => createLevelRecord(payload),
      'Nivel guardado en Firestore.'
    )
  }

  async function updateLevel(levelId, payload) {
    await runWrite(
      () => updateLevelRecord(levelId, payload),
      'Nivel actualizado en Firestore.'
    )
  }

  async function deleteLevel(levelId) {
    await runWrite(
      () => deleteLevelRecord(levelId),
      'Nivel eliminado de Firestore.'
    )
  }

  async function createLesson(payload) {
    await runWrite(
      () => createLessonRecord(payload),
      'Leccion guardada en Firestore.'
    )
  }

  async function updateLesson(lessonId, payload) {
    await runWrite(
      () => updateLessonRecord(lessonId, payload),
      'Leccion actualizada en Firestore.'
    )
  }

  async function deleteLesson(lessonId) {
    await runWrite(
      () => deleteLessonRecord(lessonId),
      'Leccion eliminada de Firestore.'
    )
  }

  async function seedAcademicCatalog() {
    await runWrite(
      () => initializeAcademicCatalog(),
      'Catalogo academico inicializado en Firestore.'
    )
  }

  async function seedTeachers() {
    await runWrite(
      () => initializeTeachers(),
      'Teachers base inicializados en Firestore.'
    )
  }

  return {
    user,
    profile,
    authLoading,
    authError,
    data,
    insights,
    loading: authLoading || loading,
    saving,
    message,
    setMessage,
    markAttendance,
    notifyAbsence,
    createStudent,
    updateStudent,
    deleteStudent,
    createClass,
    updateClass,
    deleteClass,
    updateClassRoster,
    reserveStudentClass,
    cancelStudentReservation,
    createPayment,
    updatePayment,
    deletePayment,
    createAttendance,
    createBulkAttendance,
    createTeacher,
    updateTeacher,
    deleteTeacher,
    saveGrade,
    deleteGrade,
    createLevel,
    updateLevel,
    deleteLevel,
    createLesson,
    updateLesson,
    deleteLesson,
    seedAcademicCatalog,
    seedTeachers
  }
}
