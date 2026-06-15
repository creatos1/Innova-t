import { useEffect, useMemo, useState } from 'react'
import { buildInstituteInsights } from '../domain/instituteState'
import {
  createAttendanceRecord,
  createClassRecord,
  createPaymentRecord,
  createStudentRecord,
  EMPTY_INSTITUTE_DATA,
  initializeAcademicCatalog,
  registerAbsenceNotice,
  subscribeInstituteData,
  updateAttendanceStatus
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
        setMessage(error.message || 'Firebase rechazo una lectura. Revisa reglas y rol del usuario.')
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
        hoursCredited: attended ? 2 : 0
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

  async function createClass(payload) {
    await runWrite(
      () => createClassRecord(payload),
      'Clase creada en Firestore.'
    )
  }

  async function createPayment(payload) {
    await runWrite(
      () => createPaymentRecord(payload),
      'Pago creado en Firestore.'
    )
  }

  async function createAttendance(payload) {
    await runWrite(
      () => createAttendanceRecord(payload),
      'Asistencia creada en Firestore.'
    )
  }

  async function seedAcademicCatalog() {
    await runWrite(
      () => initializeAcademicCatalog(),
      'Catalogo academico inicializado en Firestore.'
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
    createClass,
    createPayment,
    createAttendance,
    seedAcademicCatalog
  }
}
