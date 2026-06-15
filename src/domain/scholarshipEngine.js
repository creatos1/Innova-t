import { SCHOLARSHIP_RULES } from './academicCatalog'
import { getWeekKey, hoursBetween, toDate } from './dateUtils'

export function getLatestPayment(student, payments = []) {
  const studentPayments = payments
    .filter(payment => payment.studentId === student.id)
    .sort((a, b) => toDate(b.dueDate) - toDate(a.dueDate))

  return studentPayments[0] || {
    studentId: student.id,
    dueDate: student.paymentDueDate,
    status: 'pendiente',
    paidAt: null
  }
}

export function evaluatePayment(student, payments = [], now = new Date()) {
  const payment = getLatestPayment(student, payments)
  const dueDate = toDate(payment.dueDate || student.paymentDueDate)
  const isPaid = payment.status === 'pagado' || Boolean(payment.paidAt)
  const isOverdue = Boolean(dueDate && dueDate < now && !isPaid)

  return {
    payment,
    isPaid,
    isOverdue,
    status: isPaid ? 'pagado' : isOverdue ? 'vencido' : 'pendiente'
  }
}

export function getAbsenceNoticeStatus(attendance) {
  if (attendance.attended) {
    return {
      violationType: 'none',
      noticeValid: true,
      hoursBeforeClass: null
    }
  }

  const classStart = toDate(attendance.startAt)
  const noticeAt = toDate(attendance.absenceNoticeAt)

  if (!noticeAt || !classStart) {
    return {
      violationType: 'no_notice',
      noticeValid: false,
      hoursBeforeClass: 0
    }
  }

  const hoursBeforeClass = hoursBetween(noticeAt, classStart)
  const noticeValid = hoursBeforeClass >= SCHOLARSHIP_RULES.absenceNoticeHours

  return {
    violationType: noticeValid ? 'excused_absence' : 'late_notice',
    noticeValid,
    hoursBeforeClass
  }
}

export function getAttendanceWithViolations(attendance = []) {
  return attendance.map(record => ({
    ...record,
    ...getAbsenceNoticeStatus(record),
    weekKey: getWeekKey(record.startAt)
  }))
}

export function getWeeklyAttendanceSummary(studentId, attendance = [], weekKey) {
  const records = getAttendanceWithViolations(attendance)
    .filter(record => record.studentId === studentId)
    .filter(record => !weekKey || record.weekKey === weekKey)

  const attendedRecords = records.filter(record => record.attended)
  const validAbsences = records.filter(record => !record.attended && record.noticeValid)
  const violations = records.filter(record => !record.attended && !record.noticeValid)
  const hours = attendedRecords.reduce((sum, record) => sum + Number(record.hoursCredited || 0), 0)

  return {
    weekKey,
    records,
    attendedRecords,
    validAbsences,
    violations,
    hours,
    requiredHours: SCHOLARSHIP_RULES.weeklyRequiredHours,
    missingHours: Math.max(0, SCHOLARSHIP_RULES.weeklyRequiredHours - hours),
    meetsWeeklyHours: hours >= SCHOLARSHIP_RULES.weeklyRequiredHours
  }
}

export function getDisciplinarySummary(studentId, attendance = []) {
  const records = getAttendanceWithViolations(attendance)
    .filter(record => record.studentId === studentId)
    .filter(record => !record.attended)

  const unexcused = records.filter(record => !record.noticeValid)
  const validAbsences = records.filter(record => record.noticeValid)

  return {
    totalAbsences: records.length,
    validAbsences: validAbsences.length,
    unexcusedAbsences: unexcused.length,
    unexcusedRecords: unexcused
  }
}

export function evaluateScholarship(student, context = {}) {
  const {
    attendance = [],
    payments = [],
    now = new Date(),
    weekKey = getWeekKey(now)
  } = context

  const paymentEvaluation = evaluatePayment(student, payments, now)
  const weekly = getWeeklyAttendanceSummary(student.id, attendance, weekKey)
  const discipline = getDisciplinarySummary(student.id, attendance)
  const reasons = []
  const actions = []

  let status = 'activa'
  let severity = 'ok'
  let label = 'Beca activa'

  if (discipline.unexcusedAbsences >= SCHOLARSHIP_RULES.reviewUnexcusedAbsences) {
    status = 'revision'
    severity = 'critical'
    label = 'Revision por posible perdida'
    reasons.push('Tercera falta sin aviso registrada')
    actions.push('Citar al estudiante y decidir continuidad de beca')
  } else if (discipline.unexcusedAbsences >= SCHOLARSHIP_RULES.riskUnexcusedAbsences) {
    status = 'riesgo'
    severity = 'risk'
    label = 'Beca en riesgo'
    reasons.push('Segunda falta sin aviso registrada')
    actions.push('Enviar aviso formal de riesgo de beca')
  } else if (discipline.unexcusedAbsences >= SCHOLARSHIP_RULES.firstUnexcusedAbsence) {
    status = 'advertencia'
    severity = 'warning'
    label = 'Advertencia activa'
    reasons.push('Primera falta sin aviso registrada')
    actions.push('Notificar advertencia disciplinaria')
  }

  if (paymentEvaluation.isOverdue) {
    if (status === 'activa' || status === 'advertencia') {
      status = 'riesgo'
      severity = 'risk'
      label = 'Beca en riesgo'
    }
    reasons.push('Pago fuera de fecha limite')
    actions.push('Solicitar regularizacion de pago')
  }

  if (!weekly.meetsWeeklyHours) {
    if (status === 'activa') {
      status = 'advertencia'
      severity = 'warning'
      label = 'Advertencia activa'
    }
    reasons.push(`Faltan ${weekly.missingHours} horas para cumplir la semana`)
    actions.push('Agendar horas de recuperacion antes del cierre semanal')
  }

  if (!reasons.length) {
    reasons.push('Cumple pago, asistencia semanal y avisos de ausencia')
    actions.push('Mantener seguimiento regular')
  }

  return {
    studentId: student.id,
    status,
    label,
    severity,
    reasons,
    actions: [...new Set(actions)],
    weekly,
    discipline,
    payment: paymentEvaluation
  }
}

export function buildScholarshipBoard(students = [], context = {}) {
  const evaluations = students.map(student => ({
    student,
    evaluation: evaluateScholarship(student, context)
  }))

  return {
    evaluations,
    active: evaluations.filter(item => item.evaluation.status === 'activa').length,
    warnings: evaluations.filter(item => item.evaluation.status === 'advertencia').length,
    risks: evaluations.filter(item => item.evaluation.status === 'riesgo').length,
    reviews: evaluations.filter(item => item.evaluation.status === 'revision').length
  }
}
