import { buildAcademicBoard, buildSuggestedGroups } from './academicMatcher'
import { buildScholarshipBoard } from './scholarshipEngine'
import { getWeekKey, toDate } from './dateUtils'

export function getOperationalWeekKey(attendance = [], now = new Date()) {
  const weekKeys = attendance
    .map(record => getWeekKey(record.startAt))
    .filter(Boolean)
    .sort()

  return weekKeys[weekKeys.length - 1] || getWeekKey(now)
}

export function buildInstituteInsights(data, options = {}) {
  const now = options.now || new Date()
  const weekKey = options.weekKey || getOperationalWeekKey(data.attendance, now)
  const scholarshipBoard = buildScholarshipBoard(data.students, {
    attendance: data.attendance,
    payments: data.payments,
    now,
    weekKey
  })
  const academicBoard = buildAcademicBoard(data.students, scholarshipBoard.evaluations, {
    levels: data.levels,
    lessons: data.lessons
  })
  const groups = buildSuggestedGroups(data.students, academicBoard.recommendations, data.levels)
  const scholarshipByStudentId = new Map(
    scholarshipBoard.evaluations.map(item => [item.student.id, item.evaluation])
  )
  const recommendationByStudentId = new Map(
    academicBoard.recommendations.map(item => [item.studentId, item])
  )

  const enrichedStudents = data.students.map(student => ({
    ...student,
    scholarshipEvaluation: scholarshipByStudentId.get(student.id),
    academicRecommendation: recommendationByStudentId.get(student.id)
  }))

  const overduePayments = data.payments.filter(payment => {
    const dueDate = toDate(payment.dueDate)
    return payment.status !== 'pagado' && !payment.paidAt && dueDate && dueDate < now
  })

  const upcomingClasses = data.classes
    .filter(classItem => toDate(classItem.startAt) >= now)
    .sort((a, b) => toDate(a.startAt) - toDate(b.startAt))

  const pendingAttendance = data.attendance.filter(record => record.attended === null || record.status === 'pendiente')

  return {
    now,
    weekKey,
    students: enrichedStudents,
    scholarshipBoard,
    academicBoard,
    groups,
    metrics: {
      activeStudents: data.students.filter(student => student.status === 'activo').length,
      scholarshipRisk: scholarshipBoard.risks + scholarshipBoard.reviews,
      overduePayments: overduePayments.length,
      upcomingClasses: upcomingClasses.length,
      slowProgress: academicBoard.slowPace,
      pendingAttendance: pendingAttendance.length
    },
    overduePayments,
    upcomingClasses,
    pendingAttendance
  }
}

export function getStudentViewModel(studentId, data, insights) {
  const student = insights.students.find(item => item.id === studentId) || insights.students[0]
  if (!student) {
    return {
      student: null,
      attendance: [],
      payments: [],
      grades: [],
      upcomingClasses: []
    }
  }

  const attendance = data.attendance
    .filter(record => record.studentId === student.id)
    .sort((a, b) => toDate(b.startAt) - toDate(a.startAt))
  const payments = data.payments
    .filter(payment => payment.studentId === student.id)
    .sort((a, b) => toDate(b.dueDate) - toDate(a.dueDate))
  const grades = data.grades.filter(grade => grade.studentId === student.id)
  const upcomingClasses = data.classes
    .filter(classItem => classItem.studentIds?.includes(student.id))
    .filter(classItem => toDate(classItem.startAt) >= insights.now)
    .sort((a, b) => toDate(a.startAt) - toDate(b.startAt))

  return {
    student,
    attendance,
    payments,
    grades,
    upcomingClasses
  }
}
