function ProgressBar({ value = 0, max = 100, tone = 'gold', label }) {
  const percent = Math.min(100, Math.max(0, (Number(value) / Number(max || 1)) * 100))

  return (
    <div className="progress-block" aria-label={label}>
      {label && (
        <div className="progress-label">
          <span>{label}</span>
          <strong>{Math.round(percent)}%</strong>
        </div>
      )}
      <div className="progress-track">
        <div className={`progress-fill ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export default ProgressBar
