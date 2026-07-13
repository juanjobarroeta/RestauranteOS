// Small shared UI helpers.

export const mxn = (n) =>
  (n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

export const UNIDADES = ['KG', 'G', 'L', 'ML', 'PZA']

export function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${wide ? ' modal-wide' : ''}`}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function ErrorBox({ error }) {
  if (!error) return null
  return <div className="form-error">{error}</div>
}

/** Local midnight → ISO string, for the dashboard "today" window. */
export function localMidnightISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
