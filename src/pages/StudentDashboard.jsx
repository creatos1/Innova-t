import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

function StudentDashboard() {
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [studentData, setStudentData] = useState({
    id: 'EST-001',
    nombreCompleto: 'Valentina Montoya',
    nivelActual: 'Intermediate B1',
    fechaInscripcion: '2026-01-15',
    horasAsistidas: 3,
    horasTotales: 6,
    reservas: [
      { id: 'RES-001', fecha: '2026-05-22', horario: '5:00 PM', cancelable: true, avisoActivado: false, tema: 'Speaking Fluency' },
      { id: 'RES-002', fecha: '2026-05-24', horario: '6:30 PM', cancelable: false, avisoActivado: false, tema: 'Business English' }
    ],
    calificaciones: [
      { nivel: 'Pre-Starter', oral: 88, escrito: 85 },
      { nivel: 'Nivel 1', oral: 91, escrito: 88 },
      { nivel: 'Nivel 2', oral: 89, escrito: 90 },
      { nivel: 'Nivel 3', oral: null, escrito: null }
    ]
  })

  const slots = [
    { dia: 'Lunes', horario: '5:00 PM' },
    { dia: 'Martes', horario: '7:00 PM' },
    { dia: 'Miércoles', horario: '6:30 PM' },
    { dia: 'Viernes', horario: '5:30 PM' }
  ]

  const handleCancelarReserva = (reservaId) => {
    setStudentData(prev => ({
      ...prev,
      reservas: prev.reservas.filter(r => r.id !== reservaId)
    }))
  }

  const handleAvisarAusencia = (reservaId) => {
    setStudentData(prev => ({
      ...prev,
      reservas: prev.reservas.map(r => 
        r.id === reservaId ? { ...r, avisoActivado: true } : r
      )
    }))
  }

  const handleReservarClase = () => {
    if (selectedSlot) {
      const nuevaReserva = {
        id: `RES-${Date.now()}`,
        fecha: '2026-05-26',
        horario: selectedSlot.horario,
        cancelable: true,
        avisoActivado: false,
        tema: 'Nueva clase'
      }
      setStudentData(prev => ({
        ...prev,
        reservas: [...prev.reservas, nuevaReserva]
      }))
      setSelectedSlot(null)
    }
  }

  return (
    <div className="dashboard-body">
      <div className="dashboard-shell">
        <aside className="sidebar">
          <Link className="brand" to="/">
            <span className="brand-mark">IT</span>
            <span>
              <strong>Innova-T</strong>
              <small>Student Space</small>
            </span>
          </Link>

          <nav className="sidebar-nav">
            <Link className="active" to="/student-dashboard">Resumen</Link>
            <a href="#reservas">Reservas</a>
            <a href="#asistencia">Asistencia</a>
            <a href="#calificaciones">Calificaciones</a>
            <a href="#perfil">Perfil</a>
          </nav>
        </aside>

        <main className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <span className="eyebrow">Panel del estudiante</span>
              <h1>Hola, {studentData.nombreCompleto}</h1>
            </div>
            <div className="header-actions">
              <Link className="btn btn-secondary" to="/login">Cerrar sesion</Link>
            </div>
          </header>

          <section id="perfil" className="panel-card">
            <div className="panel-head">
              <h2>Información del Estudiante</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <strong style={{ display: 'block', color: 'var(--gold-500)' }}>ID</strong>
                <span>{studentData.id}</span>
              </div>
              <div>
                <strong style={{ display: 'block', color: 'var(--gold-500)' }}>Nombre Completo</strong>
                <span>{studentData.nombreCompleto}</span>
              </div>
              <div>
                <strong style={{ display: 'block', color: 'var(--gold-500)' }}>Nivel Actual</strong>
                <span>{studentData.nivelActual}</span>
              </div>
              <div>
                <strong style={{ display: 'block', color: 'var(--gold-500)' }}>Fecha de Inscripción</strong>
                <span>{studentData.fechaInscripcion}</span>
              </div>
            </div>
          </section>

          <section id="asistencia" className="panel-card" style={{ marginTop: '24px' }}>
            <div className="panel-head">
              <h2>Asistencia Semanal</h2>
              <span style={{ color: 'var(--gold-500)', fontWeight: 700 }}>
                {studentData.horasAsistidas} / {studentData.horasTotales} horas
              </span>
            </div>
            <div style={{ 
              height: '24px', 
              background: 'rgba(94, 64, 51, 0.1)', 
              borderRadius: '999px',
              overflow: 'hidden',
              marginTop: '16px'
            }}>
              <div style={{ 
                height: '100%', 
                width: `${(studentData.horasAsistidas / studentData.horasTotales) * 100}%`, 
                background: 'linear-gradient(90deg, var(--gold-500), var(--gold-400))',
                borderRadius: '999px',
                transition: 'width 0.3s ease'
              }}></div>
            </div>
          </section>

          <section id="reservas" className="dashboard-grid split-grid" style={{ marginTop: '24px' }}>
            <article className="panel-card">
              <div className="panel-head">
                <h2>Reservar Clase</h2>
              </div>
              <p>Selecciona el horario que mejor se adapte a tu agenda.</p>
              <div className="slot-grid">
                {slots.map((slot, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`slot-btn ${selectedSlot?.dia === slot.dia && selectedSlot?.horario === slot.horario ? 'selected' : ''}`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {slot.dia} {slot.horario}
                  </button>
                ))}
              </div>
              {selectedSlot && (
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ marginTop: '16px' }}
                  onClick={handleReservarClase}
                >
                  Confirmar Reserva
                </button>
              )}
            </article>

            <article className="panel-card">
              <div className="panel-head">
                <h2>Clases Reservadas</h2>
              </div>
              <div style={{ display: 'grid', gap: '16px' }}>
                {studentData.reservas.map((reserva) => (
                  <div key={reserva.id} style={{ 
                    padding: '16px', 
                    border: '1px solid var(--line)', 
                    borderRadius: '16px',
                    background: 'rgba(255, 255, 255, 0.56)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                      <div>
                        <strong style={{ display: 'block' }}>{reserva.tema}</strong>
                        <span style={{ color: 'var(--text-soft)' }}>{reserva.fecha} - {reserva.horario}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {reserva.cancelable && !reserva.avisoActivado && (
                        <>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                            onClick={() => handleCancelarReserva(reserva.id)}
                          >
                            Cancelar
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-primary" 
                            style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                            onClick={() => handleAvisarAusencia(reserva.id)}
                          >
                            Avisar Ausencia
                          </button>
                        </>
                      )}
                      {reserva.avisoActivado && (
                        <span style={{ 
                          color: 'var(--gold-500)', 
                          fontWeight: 700,
                          fontSize: '0.9rem'
                        }}>
                          ✓ Aviso enviado
                        </span>
                      )}
                      {!reserva.cancelable && !reserva.avisoActivado && (
                        <span style={{ 
                          color: 'var(--text-soft)', 
                          fontSize: '0.9rem'
                        }}>
                          No se puede cancelar
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section id="calificaciones" className="panel-card" style={{ marginTop: '24px' }}>
            <div className="panel-head">
              <h2>Calificaciones por Nivel</h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                marginTop: '16px'
              }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700 }}>Nivel</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 700 }}>Examen Oral</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 700 }}>Examen Escrito</th>
                  </tr>
                </thead>
                <tbody>
                  {studentData.calificaciones.map((cal, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '12px' }}>{cal.nivel}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {cal.oral !== null ? `${cal.oral}/100` : '-'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {cal.escrito !== null ? `${cal.escrito}/100` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default StudentDashboard
