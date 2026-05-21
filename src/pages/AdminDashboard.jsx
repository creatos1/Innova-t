import { useState } from 'react'
import { Link } from 'react-router-dom'

function AdminDashboard() {
  const [estudiantes] = useState([
    { id: 'EST-001', nombre: 'Valentina Montoya', nivel: 'Intermediate B1', estatus: 'activo', nuevo: false },
    { id: 'EST-002', nombre: 'Carlos García', nivel: 'Nivel 1', estatus: 'activo', nuevo: true },
    { id: 'EST-003', nombre: 'María López', nivel: 'Pre-Starter', estatus: 'activo', nuevo: true },
    { id: 'EST-004', nombre: 'Juan Pérez', nivel: 'Nivel 3', estatus: 'activo', nuevo: false },
    { id: 'EST-005', nombre: 'Ana Ruiz', nivel: 'Nivel 2', estatus: 'activo', nuevo: true }
  ])

  const [clasesAsignadas] = useState([
    { id: 'CLS-001', nivel: 'Nivel 1', teacher: 'Camila Rojas', horario: 'Hoy, 4:00 PM', estudiantes: 5, proximasEn1h: true },
    { id: 'CLS-002', nivel: 'Intermediate B1', teacher: 'Juan Gómez', horario: 'Hoy, 6:00 PM', estudiantes: 3, proximasEn1h: false },
    { id: 'CLS-003', nivel: 'Nivel 3', teacher: 'María Fernández', horario: 'Mañana, 5:00 PM', estudiantes: 6, proximasEn1h: false }
  ])

  const [asistencias, setAsistencias] = useState([
    { id: 'ASIST-001', estudiante: 'Valentina Montoya', clase: 'Speaking Fluency', fecha: '2026-05-20', estado: 'pendiente' },
    { id: 'ASIST-002', estudiante: 'Carlos García', clase: 'Basic Grammar', fecha: '2026-05-20', estado: 'pendiente' }
  ])

  const [calificaciones, setCalificaciones] = useState([
    { id: 'CAL-001', estudiante: 'Valentina Montoya', nivel: 'Nivel 2', oral: null, escrito: null }
  ])

  const handleConfirmarAsistencia = (asistenciaId, estado) => {
    setAsistencias(prev => prev.map(a => 
      a.id === asistenciaId ? { ...a, estado } : a
    ))
  }

  const handleGuardarCalificacion = (calId, tipo, valor) => {
    setCalificaciones(prev => prev.map(c => 
      c.id === calId ? { ...c, [tipo]: valor } : c
    ))
  }

  return (
    <div className="dashboard-body">
      <div className="dashboard-shell">
        <aside className="sidebar">
          <Link className="brand" to="/">
            <span className="brand-mark">IT</span>
            <span>
              <strong>Innova-T</strong>
              <small>Admin Space</small>
            </span>
          </Link>

          <nav className="sidebar-nav">
            <Link className="active" to="/admin-dashboard">Dashboard</Link>
            <a href="#estudiantes">Estudiantes</a>
            <a href="#asistencias">Asistencias</a>
            <a href="#calificaciones">Calificaciones</a>
            <a href="#ia">IA - Asignaciones</a>
            <a href="#clases-proximas">Clases Próximas</a>
          </nav>
        </aside>

        <main className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <span className="eyebrow">Panel admin</span>
              <h1>Control academico</h1>
            </div>
            <div className="header-actions">
              <Link className="btn btn-secondary" to="/login">Cerrar sesion</Link>
            </div>
          </header>

          <section className="dashboard-grid top-grid">
            <article className="metric-card">
              <span>Estudiantes activos</span>
              <strong>{estudiantes.filter(e => e.estatus === 'activo').length}</strong>
              <small>Total en el instituto</small>
            </article>
            <article className="metric-card">
              <span>Nuevos del mes</span>
              <strong>{estudiantes.filter(e => e.nuevo).length}</strong>
              <small>Inscritos este mes</small>
            </article>
            <article className="metric-card">
              <span>Clases próximas</span>
              <strong>{clasesAsignadas.length}</strong>
              <small>Programadas</small>
            </article>
          </section>

          <section id="estudiantes" className="panel-card" style={{ marginTop: '24px' }}>
            <div className="panel-head">
              <h2>Estudiantes</h2>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              {estudiantes.map(est => (
                <div key={est.id} style={{ 
                  padding: '16px', 
                  border: '1px solid var(--line)', 
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.56)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <strong>{est.nombre}</strong>
                    <span style={{ display: 'block', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
                      {est.id} • {est.nivel}
                    </span>
                  </div>
                  {est.nuevo && (
                    <span style={{ 
                      padding: '6px 12px', 
                      background: 'rgba(200, 155, 60, 0.14)', 
                      borderRadius: '999px',
                      color: 'var(--brown-900)',
                      fontSize: '0.8rem',
                      fontWeight: 700
                    }}>
                      Nuevo
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section id="asistencias" className="panel-card" style={{ marginTop: '24px' }}>
            <div className="panel-head">
              <h2>Confirmar Asistencias</h2>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              {asistencias.map(asist => (
                <div key={asist.id} style={{ 
                  padding: '16px', 
                  border: '1px solid var(--line)', 
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.56)'
                }}>
                  <div style={{ marginBottom: '12px' }}>
                    <strong>{asist.estudiante}</strong>
                    <span style={{ display: 'block', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
                      {asist.clase} • {asist.fecha}
                    </span>
                  </div>
                  {asist.estado === 'pendiente' ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        type="button" 
                        className="btn btn-primary" 
                        style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                        onClick={() => handleConfirmarAsistencia(asist.id, 'asistio')}
                      >
                        Asistió
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ padding: '8px 16px', fontSize: '0.9rem' }}
                        onClick={() => handleConfirmarAsistencia(asist.id, 'falto')}
                      >
                        Faltó
                      </button>
                    </div>
                  ) : (
                    <span style={{ 
                      color: asist.estado === 'asistio' ? '#26784d' : '#b14545', 
                      fontWeight: 700 
                    }}>
                      {asist.estado === 'asistio' ? '✓ Asistencia confirmada' : '✗ Faltó'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section id="calificaciones" className="panel-card" style={{ marginTop: '24px' }}>
            <div className="panel-head">
              <h2>Subir Calificaciones</h2>
            </div>
            <div style={{ display: 'grid', gap: '16px' }}>
              {calificaciones.map(cal => (
                <div key={cal.id} style={{ 
                  padding: '16px', 
                  border: '1px solid var(--line)', 
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.56)'
                }}>
                  <div style={{ marginBottom: '16px' }}>
                    <strong>{cal.estudiante}</strong>
                    <span style={{ display: 'block', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
                      {cal.nivel}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                        Examen Oral
                      </label>
                      <input 
                        type="number" 
                        min="0" 
                        max="100" 
                        value={cal.oral || ''}
                        onChange={(e) => handleGuardarCalificacion(cal.id, 'oral', e.target.value ? parseInt(e.target.value) : null)}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          borderRadius: '16px',
                          border: '1px solid rgba(94, 64, 51, 0.14)',
                          background: '#fffdf9'
                        }}
                        placeholder="0-100"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                        Examen Escrito
                      </label>
                      <input 
                        type="number" 
                        min="0" 
                        max="100" 
                        value={cal.escrito || ''}
                        onChange={(e) => handleGuardarCalificacion(cal.id, 'escrito', e.target.value ? parseInt(e.target.value) : null)}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          borderRadius: '16px',
                          border: '1px solid rgba(94, 64, 51, 0.14)',
                          background: '#fffdf9'
                        }}
                        placeholder="0-100"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="ia" className="panel-card" style={{ marginTop: '24px' }}>
            <div className="panel-head">
              <h2>IA - Asignación de Clases</h2>
            </div>
            <p style={{ marginBottom: '16px' }}>Asigna clases a teachers y estudiantes (manual o con IA).</p>
            <div style={{ display: 'grid', gap: '12px' }}>
              {clasesAsignadas.map(clase => (
                <div key={clase.id} style={{ 
                  padding: '16px', 
                  border: '1px solid var(--line)', 
                  borderRadius: '16px',
                  background: clase.proximasEn1h 
                    ? 'linear-gradient(135deg, rgba(200, 155, 60, 0.18), rgba(255, 250, 244, 0.95))' 
                    : 'rgba(255, 255, 255, 0.56)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div>
                      <strong>{clase.nivel}</strong>
                      <span style={{ display: 'block', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
                        Teacher: {clase.teacher}
                      </span>
                    </div>
                    {clase.proximasEn1h && (
                      <span style={{ 
                        color: 'var(--gold-500)', 
                        fontWeight: 700,
                        fontSize: '0.85rem'
                      }}>
                        ⏰ En 1 hora
                      </span>
                    )}
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--line)'
                  }}>
                    <span style={{ color: 'var(--text-soft)', fontSize: '0.9rem' }}>
                      {clase.horario} • {clase.estudiantes} estudiantes
                    </span>
                    <button type="button" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="clases-proximas" className="panel-card" style={{ marginTop: '24px' }}>
            <div className="panel-head">
              <h2>Clases Próximas (1 hora antes)</h2>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              {clasesAsignadas.filter(c => c.proximasEn1h).map(clase => (
                <div key={clase.id} style={{ 
                  padding: '16px', 
                  border: '2px solid var(--gold-500)', 
                  borderRadius: '16px',
                  background: 'rgba(200, 155, 60, 0.1)'
                }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>{clase.nivel}</strong>
                    <span style={{ display: 'block', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
                      Teacher: {clase.teacher}
                    </span>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center'
                  }}>
                    <span style={{ color: 'var(--gold-500)', fontWeight: 700 }}>
                      {clase.horario}
                    </span>
                    <button type="button" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
                      Gestionar
                    </button>
                  </div>
                </div>
              ))}
              {clasesAsignadas.filter(c => c.proximasEn1h).length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text-soft)' }}>
                  No hay clases próximas en la próxima hora.
                </p>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default AdminDashboard
