import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { ErrorBox } from '../components/ui'

const ESTACIONES = ['TODAS', 'COCINA', 'BARRA', 'POSTRES']

const NEXT = {
  PENDIENTE: { to: 'EN_PREPARACION', label: 'Empezar' },
  EN_PREPARACION: { to: 'LISTO', label: 'Listo' },
  LISTO: { to: 'ENTREGADO', label: 'Entregado' },
}

function edad(createdAt) {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function Cocina() {
  const { activeCompany } = useAuth()
  const companyId = activeCompany?.id
  const [estacion, setEstacion] = useState('TODAS')
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const [, forceTick] = useState(0)

  const cargar = useCallback(async () => {
    if (!companyId) return
    try {
      const qs = estacion !== 'TODAS' ? `&estacion=${estacion}` : ''
      const data = await apiFetch(`/api/restaurante/cocina?companyId=${companyId}${qs}`)
      setItems(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [companyId, estacion])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    const t = setInterval(() => { cargar(); forceTick((n) => n + 1) }, 8_000)
    return () => clearInterval(t)
  }, [cargar])

  const avanzar = async (item) => {
    const next = NEXT[item.estadoCocina]
    if (!next) return
    // Optimistic: move it locally, reconcile on next poll.
    setItems((arr) =>
      next.to === 'ENTREGADO'
        ? arr.filter((i) => i.id !== item.id)
        : arr.map((i) => (i.id === item.id ? { ...i, estadoCocina: next.to } : i))
    )
    try {
      await apiFetch(`/api/restaurante/ordenes/${item.orden.id}/items/${item.id}`, {
        method: 'PATCH',
        body: { estadoCocina: next.to },
      })
    } catch (err) {
      setError(err.message)
      cargar()
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Cocina</h1>
          <p className="page-sub">{items.length} partidas en cola · se actualiza solo</p>
        </div>
        <div className="filters">
          {ESTACIONES.map((e) => (
            <button key={e} className={`chip${estacion === e ? ' active' : ''}`} onClick={() => setEstacion(e)}>
              {e}
            </button>
          ))}
        </div>
      </div>

      <ErrorBox error={error} />

      {items.length === 0 ? (
        <div className="empty-state">Sin pendientes. 🧑‍🍳</div>
      ) : (
        <div className="kds-grid">
          {items.map((item) => {
            const next = NEXT[item.estadoCocina]
            return (
              <div key={item.id} className={`card kds-card ${item.estadoCocina}`}>
                <div className="kds-meta">
                  <span>
                    #{item.orden.folio}
                    {item.orden.tipo === 'MESA'
                      ? item.orden.mesa ? ` · Mesa ${item.orden.mesa}` : ''
                      : ` · ${item.orden.tipo}`}
                  </span>
                  <span className="kds-age">⏱ {edad(item.createdAt)}</span>
                </div>
                <div className="kds-nombre">{item.cantidad}× {item.menuItem.nombre}</div>
                {item.notas && <div className="kds-notas">⚠ {item.notas}</div>}
                <div className="kds-meta">
                  <span className={`badge ${item.estadoCocina}`}>{item.estadoCocina.replace('_', ' ')}</span>
                  <span className="muted">{item.estacion}</span>
                </div>
                {next && (
                  <button className={`btn ${next.to === 'LISTO' ? 'btn-ok' : 'btn-primary'}`} onClick={() => avanzar(item)}>
                    {next.label}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
