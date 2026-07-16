import { Link } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import BrandLogo from '../components/BrandLogo'
import StatusBadge from '../components/StatusBadge'
import { getLesson, getLevel } from '../domain/academicCatalog'
import { formatMexicoDate, formatMexicoTime, toDate } from '../domain/dateUtils'
import { getClassDateValue } from '../domain/scheduleMatcher'
import { fetchMexicoClock, getFallbackMexicoNow, getSyncedNow } from '../services/mexicoTime'
import { useInstituteData } from '../services/useInstituteData'

function getStudentLabel(studentId, students = []) {
  const student = students.find(item => item.id === studentId)
  if (!student) return studentId
  return `${student.publicId || student.id} - ${student.fullName || 'Student'}`
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

function getDateKey(classItem) {
  return getClassDateValue(classItem.startAt) || classItem.date || ''
}

function formatDateKeyForPicker(dateKey) {
  if (!dateKey) return ''
  const [year, month, day] = dateKey.split('-')
  if (!year || !month || !day) return dateKey
  return `${month}/${day}/${String(year).slice(-2)}`
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
  const [selectedDateKey, setSelectedDateKey] = useState('')
  const [selectedHourKey, setSelectedHourKey] = useState('')
  const dateInputRef = useRef(null)

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
        setClockError('Could not sync the exact time; using this device\'s time instead.')
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

    const classesForDate = readyFutureClasses.filter(classItem => !selectedDateKey || getDateKey(classItem) === selectedDateKey)

    classesForDate.forEach(classItem => {
      const key = getHourKey(classItem)
      if (!key || optionsByHour.has(key)) return

      optionsByHour.set(key, {
        key,
        label: `${formatMexicoDate(classItem.startAt)} ${formatMexicoTime(classItem.startAt)}`,
        count: 0
      })
    })

    classesForDate.forEach(classItem => {
      const key = getHourKey(classItem)
      const option = optionsByHour.get(key)
      if (option) option.count += 1
    })

    return Array.from(optionsByHour.values())
  }, [readyFutureClasses, selectedDateKey])

  const dateOptions = useMemo(() => {
    const optionsByDate = new Map()

    readyFutureClasses.forEach(classItem => {
      const key = getDateKey(classItem)
      if (!key) return

      const previous = optionsByDate.get(key)
      optionsByDate.set(key, {
        key,
        label: formatMexicoDate(classItem.startAt),
        count: (previous?.count || 0) + 1
      })
    })

    return Array.from(optionsByDate.values())
  }, [readyFutureClasses])

  useEffect(() => {
    if (selectedDateKey) return
    setSelectedDateKey(dateOptions[0]?.key || '')
  }, [dateOptions, selectedDateKey])

  useEffect(() => {
    if (selectedHourKey && hourOptions.some(option => option.key === selectedHourKey)) return
    setSelectedHourKey(hourOptions[0]?.key || '')
  }, [hourOptions, selectedHourKey])

  const showTimeRows = useMemo(() => (
    readyFutureClasses
      .filter(classItem => !selectedDateKey || getDateKey(classItem) === selectedDateKey)
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
          classroom: classItem.classroomName || classItem.room || 'Assigned classroom',
          teacher: classItem.teacherName || 'Assigned teacher',
          lesson: lesson?.name || classItem.lessonName || 'Class',
          level: level?.shortName || 'Level',
          students: (classItem.studentIds || []).map(studentId => getStudentLabel(studentId, data.students)),
          isLive
        }
      })
  ), [data.lessons, data.levels, data.students, now, readyFutureClasses, selectedDateKey, selectedHourKey])

  const needsLogin = !loading && (!user || !profile)

  return (
    <div className="showtime-screen excel-system">

      <header className="showtime-header">
        <div>
          <BrandLogo panel="Show time" />
          <h1>Are You Ready?</h1>
          <p>Check your name and your classroom.
          </p>
        </div>
        
        <div className="showtime-clock">
          <strong>{formatMexicoTime(now)}</strong>
          <section className="showtime-filter-panel" aria-label="Date filter" lang="en-US">
            <label className="showtime-date-picker">
              <br></br>
              <div className="showtime-date-picker-control">
                <input
                  className="showtime-date-display"
                  type="text"
                  value={formatDateKeyForPicker(selectedDateKey)}
                  placeholder="MM/DD/YY"
                  readOnly
                  onClick={() => dateInputRef.current?.showPicker?.()}
                />
                <button
                  className="showtime-date-trigger"
                  type="button"
                  aria-label="Open date picker"
                  onClick={() => {
                    if (dateInputRef.current?.showPicker) {
                      dateInputRef.current.showPicker()
                      return
                    }
                    dateInputRef.current?.click()
                  }}
                >
                  Calendar
                </button>
                <input
                  ref={dateInputRef}
                  className="showtime-native-date-input"
                  type="date"
                  lang="en-US"
                  value={selectedDateKey}
                  min={dateOptions[0]?.key || ''}
                  onChange={event => {
                    setSelectedDateKey(event.target.value)
                    setSelectedHourKey('')
                  }}
                  tabIndex="-1"
                />
              </div>
            </label>
            {selectedDateKey && (
              <small>

              </small>
            )}
          </section>
        </div>
        
      </header>

      {(message || authError) && <p className="system-message">{message || authError}</p>}


      {needsLogin && (
        <section className="panel-card admin-card">
          <h2>You need to log in</h2>
          <p>Open this screen from an admin or teacher session to show assigned classes.</p>
          <Link className="btn btn-primary" to="/login">Go to login</Link>
        </section>
      )}

      {!needsLogin && (
        <>
          

          <section className="showtime-hour-options" aria-label="Upcoming hours">
            
            {hourOptions.map(option => (
              <button
                className={selectedHourKey === option.key ? 'active' : ''}
                type="button"
                onClick={() => setSelectedHourKey(option.key)}
                key={option.key}
              >
                <strong>{option.label}</strong>
                <small>{option.count} {option.count === 1 ? 'class' : 'classes'}</small>
              </button>
            ))}
            {!hourOptions.length && <p className="empty-state">No upcoming hours with ready classes.</p>}
          </section>

          <section className="panel-card admin-card showtime-table-card">
            <table className="excel-grid-table showtime-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Students</th>
                  <th>Classroom</th>
                  <th>Teacher</th>
                  <th>Level / Topic</th>
                </tr>
              </thead>
              <tbody>
                {showTimeRows.map(row => (
                  <tr className={row.isLive ? 'showtime-live-row' : ''} key={row.id}>
                    <td>
                      <StatusBadge severity={row.isLive ? 'ok' : 'info'}>{row.isLive ? 'Live' : 'Ready'}</StatusBadge>
                    </td>
                    <td>{row.date}</td>
                    <td>{row.time}</td>
                    <td>
                      <div className="showtime-students">
                        {row.students.map(student => <span key={student}>{student}</span>)}
                      </div>
                    </td>
                    <td><strong>{row.classroom}</strong></td>
                    <td>{row.teacher}</td>
                    <td>
                      <strong>{row.level}</strong>
                      <small>{row.lesson}</small>
                    </td>
                  </tr>
                ))}
                {!showTimeRows.length && (
                  <tr>
                    <td colSpan="7">No classes ready for the selected time.</td>
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
