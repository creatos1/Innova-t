import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import BrandLogo from '../components/BrandLogo'
import StatusBadge from '../components/StatusBadge'
import { getLesson, getLevel } from '../domain/academicCatalog'
import { formatMexicoDate, formatMexicoTime, toDate } from '../domain/dateUtils'
import { fetchMexicoClock, getFallbackMexicoNow, getSyncedNow } from '../services/mexicoTime'
import { useInstituteData } from '../services/useInstituteData'

function getStudentLabel(studentId, students = []) {
  const student = students.find(item => item.id === studentId)
  if (!student) return studentId
  return `${student.publicId || student.id} - ${student.fullName || 'Alumno'}`
}

function isReadyForShowTime(classItem) {
  if ((classItem.status || 'programada') === 'cancelada') return false
  return !!classItem.teacherId && !!(classItem.classroomId || classItem.classroomName || classItem.room)
}

function getHourKey(classItem) {
  const startAt = toDate(classItem.startAt)
  if (!startAt) return ''
  return startAt.toISOString()
}

function ShowTimeDisplay() {
  const { user, profile, authError, data, loading, message } = useInstituteData()
  const [tick, setTick] = useState(0)
  const [clockState, setClockState] = useState(() => ({
    baseTime: getFallbackMexicoNow(),
    syncedAt: Date.now(),
    source: 'local'
  }))
  const [clockError, setClockError] = useState('')
  const [selectedHourKey, setSelectedHourKey] = useState('')

  const now = useMemo(() => getSyncedNow(clockState), [clockState, tick])

  useEffect(() => {
    let isMounted = true

    const syncClock = async () => {
      try {
        const nextClock = await fetchMexicoClock()
        if (!isMounted) return
        setClockState(nextClock)
        setClockError('')
      } catch (error) {
        if (!isMounted) return
        setClockError('No se pudo sincronizar la hora exacta; se usa la hora de este dispositivo.')
      }
    }

    syncClock()
    const apiTimer = window.setInterval(syncClock, 5 * 60000)
    return () => {
      isMounted = false
      window.clearInterval(apiTimer)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setTick(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const readyFutureClasses = useMemo(() => (
    data.classes
      .filter(isReadyForShowTime)
      .filter(classItem => {
        const startAt = toDate(classItem.startAt)
        return startAt && startAt.getTime() >= now.getTime()
      })
      .sort((a, b) => (toDate(a.startAt)?.getTime() || 0) - (toDate(b.startAt)?.getTime() || 0))
      .slice(0, 40)
  ), [data.classes, now])

  const hourOptions = useMemo(() => {
    const optionsByHour = new Map()

    readyFutureClasses.forEach(classItem => {
      const key = getHourKey(classItem)
      if (!key || optionsByHour.has(key)) return

      optionsByHour.set(key, {
        key,
        label: `${formatMexicoDate(classItem.startAt)} ${formatMexicoTime(classItem.startAt)}`,
        count: 0
      })
    })

    readyFutureClasses.forEach(classItem => {
      const key = getHourKey(classItem)
      const option = optionsByHour.get(key)
      if (option) option.count += 1
    })

    return Array.from(optionsByHour.values())
  }, [readyFutureClasses])

  useEffect(() => {
    if (selectedHourKey && hourOptions.some(option => option.key === selectedHourKey)) return
    setSelectedHourKey(hourOptions[0]?.key || '')
  }, [hourOptions, selectedHourKey])

  const showTimeRows = useMemo(() => (
    readyFutureClasses
      .filter(classItem => !selectedHourKey || getHourKey(classItem) === selectedHourKey)
      .map(classItem => {
        const lesson = getLesson(classItem.lessonIds?.[0], data.lessons)
        const level = getLevel(classItem.levelId || lesson?.levelId, data.levels)
        const startAt = toDate(classItem.startAt)
        const endAt = toDate(classItem.endAt)
        const isLive = startAt && endAt && startAt <= now && endAt >= now

        return {
          id: classItem.id,
          date: formatMexicoDate(classItem.startAt),
          time: `${formatMexicoTime(classItem.startAt)} - ${formatMexicoTime(classItem.endAt)}`,
          classroom: classItem.classroomName || classItem.room || 'Salon asignado',
          teacher: classItem.teacherName || 'Teacher asignado',
          lesson: lesson?.name || classItem.lessonName || 'Clase',
          level: level?.shortName || 'Nivel',
          students: (classItem.studentIds || []).map(studentId => getStudentLabel(studentId, data.students)),
          isLive
        }
      })
  ), [data.lessons, data.levels, data.students, now, readyFutureClasses, selectedHourKey])

  const needsLogin = !loading && (!user || !profile)

  return (
    <div className="showtime-screen excel-system">
      <header className="showtime-header">
        <div>
          <BrandLogo panel="Show time" />
          <span className="eyebrow">Show time</span>
          <h1>Clases listas</h1>
          <p>Asignaciones confirmadas por admin para alumnos y teachers.</p>
        </div>
        <div className="showtime-clock">
          <strong>{formatMexicoTime(now)}</strong>
          <small>{formatMexicoDate(now)} - hora de Mexico</small>
        </div>
      </header>

      {(message || authError) && <p className="system-message">{message || authError}</p>}
      {clockError && <p className="system-message">{clockError}</p>}

      {needsLogin && (
        <section className="panel-card admin-card">
          <h2>Necesitas iniciar sesion</h2>
          <p>Abre esta pantalla desde una sesion admin o teacher para mostrar clases asignadas.</p>
          <Link className="btn btn-primary" to="/login">Ir al login</Link>
        </section>
      )}

      {!needsLogin && (
        <>
          <section className="showtime-hour-options" aria-label="Horas proximas">
            {hourOptions.map(option => (
              <button
                className={selectedHourKey === option.key ? 'active' : ''}
                type="button"
                onClick={() => setSelectedHourKey(option.key)}
                key={option.key}
              >
                <strong>{option.label}</strong>
                <small>{option.count} {option.count === 1 ? 'clase' : 'clases'}</small>
              </button>
            ))}
            {!hourOptions.length && <p className="empty-state">No hay horas proximas con clases listas.</p>}
          </section>

          <section className="panel-card admin-card showtime-table-card">
            <table className="excel-grid-table showtime-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Salon</th>
                  <th>Teacher</th>
                  <th>Nivel / tema</th>
                  <th>Alumnos</th>
                </tr>
              </thead>
              <tbody>
                {showTimeRows.map(row => (
                  <tr className={row.isLive ? 'showtime-live-row' : ''} key={row.id}>
                    <td>
                      <StatusBadge severity={row.isLive ? 'ok' : 'info'}>{row.isLive ? 'En curso' : 'Lista'}</StatusBadge>
                    </td>
                    <td>{row.date}</td>
                    <td>{row.time}</td>
                    <td><strong>{row.classroom}</strong></td>
                    <td>{row.teacher}</td>
                    <td>
                      <strong>{row.level}</strong>
                      <small>{row.lesson}</small>
                    </td>
                    <td>
                      <div className="showtime-students">
                        {row.students.map(student => <span key={student}>{student}</span>)}
                      </div>
                    </td>
                  </tr>
                ))}
                {!showTimeRows.length && (
                  <tr>
                    <td colSpan="7">No hay clases listas para la hora seleccionada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}

export default ShowTimeDisplay
