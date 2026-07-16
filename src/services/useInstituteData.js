import { useEffect, useMemo, useState } from 'react'
import { buildInstituteInsights } from '../domain/instituteState'
import {
  createAttendanceRecord,
  createAttendanceRecords,
  createAdminRecord,
  createClassRecord,
  createBlockoutRecord,
  createClassroomRecord,
  createLevelRecord,
  createLessonRecord,
  createPaymentRecord,
  createStudentRecord,
  createTeacherRecord,
  cancelStudentReservationRecord,
  deleteClassRecord,
  deleteBlockoutRecord,
  deleteAdminRecord,
  deleteClassroomRecord,
  deleteLevelRecord,
  deleteLessonRecord,
  deletePaymentRecord,
  deleteStudentRecord,
  deleteTeacherRecord,
  EMPTY_INSTITUTE_DATA,
  initializeAcademicCatalog,
  initializeClassrooms,
  initializeTeachers,
  registerAbsenceNotice,
  reserveStudentClassRecord,
  subscribeInstituteData,
  syncAttendanceProgressRecords,
  updateAttendanceStatus,
  updateAdminRecord,
  updateClassRecord,
  updateClassroomRecord,
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
  const [lastProgressSyncKey, setLastProgressSyncKey] = useState('')

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
          ? 'No tienes permisos para ver esta informacion. Revisa que tu usuario tenga el rol correcto.'
          : error.message || 'No se pudo cargar la informacion. Revisa tu acceso e intenta de nuevo.')
        setLoading(false)
      }
    })

    return unsubscribe
  }, [authLoading, user, profile])

  const insights = useMemo(() => (
    buildInstituteInsights(data, { now: new Date() })
  ), [data])

  useEffect(() => {
    const role = profile?.rol || profile?.role
    if (!['admin', 'teacher'].includes(role)) return
    if (!data.attendance.length || !data.classes.length) return

    const syncKey = data.attendance
      .filter(record => record.attended === true)
      .map(record => `${record.id || record.classId}-${record.studentId}-${record.lessonId || ''}`)
      .sort()
      .join('|')

    if (!syncKey || syncKey === lastProgressSyncKey) return
    setLastProgressSyncKey(syncKey)

    syncAttendanceProgressRecords(data.attendance, data.classes).catch(error => {
      console.warn('No se pudo sincronizar progreso desde asistencias.', error)
    })
  }, [data.attendance, data.classes, lastProgressSyncKey, profile])

  async function runWrite(action, successMessage) {
    try {
      setSaving(true)
      await action()
      setMessage(successMessage)
    } catch (error) {
      console.warn(error)
      const permissionDenied = error.code === 'permission-denied'
        || (error.message || '').toLowerCase().includes('insufficient permissions')
      setMessage(permissionDenied
        ? 'No tienes permisos para guardar este cambio.'
        : error.message || 'No se pudo guardar. Revisa los datos e intenta de nuevo.')
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
      'Asistencia actualizada.'
    )
  }

  async function notifyAbsence(attendanceId) {
    await runWrite(
      () => registerAbsenceNotice(attendanceId, new Date()),
      'Aviso de ausencia registrado.'
    )
  }

  async function createStudent(payload) {
    await runWrite(
      () => createStudentRecord(payload),
      'Estudiante creado.'
    )
  }

  async function updateStudent(studentId, payload) {
    await runWrite(
      () => updateStudentRecord(studentId, payload),
      'Estudiante actualizado.'
    )
  }

  async function deleteStudent(studentId, publicId) {
    await runWrite(
      () => deleteStudentRecord(studentId, publicId),
      'Estudiante eliminado.'
    )
  }

  async function createAdmin(payload) {
    await runWrite(
      () => createAdminRecord(payload),
      'Admin guardado. Ya puede crear su contrasena o restablecer acceso con su correo.'
    )
  }

  async function updateAdmin(adminId, payload) {
    await runWrite(
      () => updateAdminRecord(adminId, payload),
      'Admin actualizado.'
    )
  }

  async function deleteAdmin(adminId) {
    await runWrite(
      () => deleteAdminRecord(adminId, user?.uid || ''),
      'Admin eliminado.'
    )
  }

  async function createClass(payload) {
    await runWrite(
      () => createClassRecord(payload),
      'Clase creada.'
    )
  }

  async function updateClass(classId, payload) {
    await runWrite(
      () => updateClassRecord(classId, payload),
      'Clase actualizada.'
    )
  }

  async function deleteClass(classId) {
    await runWrite(
      () => deleteClassRecord(classId),
      'Clase eliminada.'
    )
  }

  async function createBlockout(payload) {
    await runWrite(
      () => createBlockoutRecord(payload),
      'Bloqueo de horario guardado.'
    )
  }

  async function deleteBlockout(blockoutId) {
    await runWrite(
      () => deleteBlockoutRecord(blockoutId),
      'Bloqueo de horario eliminado.'
    )
  }

  async function createClassroom(payload) {
    await runWrite(
      () => createClassroomRecord(payload),
      'Classroom guardado.'
    )
  }

  async function updateClassroom(classroomId, payload) {
    await runWrite(
      () => updateClassroomRecord(classroomId, payload),
      'Classroom actualizado.'
    )
  }

  async function deleteClassroom(classroomId) {
    await runWrite(
      () => deleteClassroomRecord(classroomId),
      'Classroom eliminado.'
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
      'Reserva guardada. Admin formara las clases y asignara teacher.'
    )
  }

  async function cancelStudentReservation(classId, studentId) {
    await runWrite(
      () => cancelStudentReservationRecord(classId, studentId),
      'Reserva cancelada.'
    )
  }

  async function createPayment(payload) {
    await runWrite(
      () => createPaymentRecord(payload),
      'Pago creado.'
    )
  }

  async function updatePayment(paymentId, payload) {
    await runWrite(
      () => updatePaymentRecord(paymentId, payload),
      'Pago actualizado.'
    )
  }

  async function deletePayment(paymentId) {
    await runWrite(
      () => deletePaymentRecord(paymentId),
      'Pago eliminado.'
    )
  }

  async function createAttendance(payload) {
    await runWrite(
      () => createAttendanceRecord(payload),
      'Asistencia creada.'
    )
  }

  async function createBulkAttendance(records) {
    await runWrite(
      () => createAttendanceRecords(records),
      'Asistencia guardada por clase.'
    )
  }

  async function createTeacher(payload) {
    await runWrite(
      () => createTeacherRecord(payload),
      'Teacher guardado.'
    )
  }

  async function updateTeacher(teacherId, payload) {
    await runWrite(
      () => updateTeacherRecord(teacherId, payload),
      'Teacher actualizado.'
    )
  }

  async function deleteTeacher(teacherId, publicId) {
    await runWrite(
      () => deleteTeacherRecord(teacherId, publicId),
      'Teacher eliminado.'
    )
  }

  async function saveGrade(payload) {
    await runWrite(
      () => upsertGradeRecord(payload),
      'Calificacion oral/escrita guardada.'
    )
  }

  async function deleteGrade(gradeId) {
    await runWrite(
      () => deleteGradeRecord(gradeId),
      'Calificacion eliminada.'
    )
  }

  async function createLevel(payload) {
    await runWrite(
      () => createLevelRecord(payload),
      'Nivel guardado.'
    )
  }

  async function updateLevel(levelId, payload) {
    await runWrite(
      () => updateLevelRecord(levelId, payload),
      'Nivel actualizado.'
    )
  }

  async function deleteLevel(levelId) {
    await runWrite(
      () => deleteLevelRecord(levelId),
      'Nivel eliminado.'
    )
  }

  async function createLesson(payload) {
    await runWrite(
      () => createLessonRecord(payload),
      'Leccion guardada.'
    )
  }

  async function updateLesson(lessonId, payload) {
    await runWrite(
      () => updateLessonRecord(lessonId, payload),
      'Leccion actualizada.'
    )
  }

  async function deleteLesson(lessonId) {
    await runWrite(
      () => deleteLessonRecord(lessonId),
      'Leccion eliminada.'
    )
  }

  async function seedAcademicCatalog() {
    await runWrite(
      () => initializeAcademicCatalog(),
      'Catalogo academico inicializado.'
    )
  }

  async function seedTeachers() {
    await runWrite(
      () => initializeTeachers(),
      'Teachers base inicializados.'
    )
  }

  async function seedClassrooms() {
    await runWrite(
      () => initializeClassrooms(),
      'Classrooms base inicializados.'
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
    createAdmin,
    updateAdmin,
    deleteAdmin,
    createClass,
    updateClass,
    deleteClass,
    createBlockout,
    deleteBlockout,
    createClassroom,
    updateClassroom,
    deleteClassroom,
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
    seedTeachers,
    seedClassrooms
  }
}
