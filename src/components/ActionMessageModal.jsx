function ActionMessageModal({ message, onClose }) {
  if (!message) return null

  return (
    <div className="modal-backdrop action-message-backdrop" role="presentation">
      <section className="modal-card panel-card admin-card action-message-modal" role="dialog" aria-modal="true" aria-labelledby="action-message-title">
        <div className="admin-section-title">
          <div>
            <span className="eyebrow">Aviso</span>
            <h2 id="action-message-title">Operacion del sistema</h2>
          </div>
        </div>
        <p>{message}</p>
        <div className="row-actions">
          <button className="btn btn-primary small-btn" type="button" onClick={onClose}>
            Entendido
          </button>
        </div>
      </section>
    </div>
  )
}

export default ActionMessageModal
