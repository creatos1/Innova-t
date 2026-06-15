const labelBySeverity = {
  ok: 'Activo',
  warning: 'Advertencia',
  risk: 'Riesgo',
  critical: 'Revision',
  info: 'Info'
}

function StatusBadge({ severity = 'info', children }) {
  return (
    <span className={`status-badge ${severity}`}>
      {children || labelBySeverity[severity] || 'Estado'}
    </span>
  )
}

export default StatusBadge
