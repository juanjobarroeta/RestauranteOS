import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { ErrorBox, Modal, mxn } from '../components/ui'

export default function Compras() {
  const { activeCompany } = useAuth()
  const companyId = activeCompany?.id
  const [compras, setCompras] = useState([])
  const [insumos, setInsumos] = useState([])
  const [error, setError] = useState(null)
  const [nueva, setNueva] = useState(false)
  const [pagar, setPagar] = useState(null)

  const cargar = useCallback(async () => {
    if (!companyId) return
    setError(null)
    try {
      const [c, i] = await Promise.all([
        apiFetch(`/api/restaurante/compras?companyId=${companyId}`),
        apiFetch(`/api/restaurante/insumos?companyId=${companyId}`),
      ])
      setCompras(Array.isArray(c) ? c : [])
      setInsumos(Array.isArray(i) ? i : [])
    } catch (err) {
      setError(err.message)
    }
  }, [companyId])

  useEffect(() => { cargar() }, [cargar])

  const recibir = async (compra) => {
    if (!window.confirm(`¿Recibir ${compra.folio}? Se cargará el inventario y el costo promedio.`)) return
    try {
      await apiFetch(`/api/restaurante/compras/${compra.id}/recibir`, { method: 'POST', body: {} })
      cargar()
    } catch (err) { setError(err.message) }
  }

  const cancelar = async (compra) => {
    if (!window.confirm(`¿Cancelar ${compra.folio}?`)) return
    try {
      await apiFetch(`/api/restaurante/compras/${compra.id}`, { method: 'PATCH', body: { estado: 'CANCELADA' } })
      cargar()
    } catch (err) { setError(err.message) }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Compras</h1>
          <p className="page-sub">Ordenar → recibir (inventario + costo) → pagar (bancos/caja)</p>
        </div>
        <button className="btn btn-primary" onClick={() => setNueva(true)}>+ Nueva compra</button>
      </div>

      <ErrorBox error={error} />

      {compras.length === 0 ? (
        <div className="empty-state">Sin compras registradas.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Folio</th><th>Proveedor</th><th>Partidas</th>
                <th className="num">Subtotal</th><th className="num">IVA</th><th className="num">Total</th>
                <th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => (
                <tr key={c.id}>
                  <td>{c.folio}<div className="muted">{new Date(c.fecha).toLocaleDateString('es-MX')}</div></td>
                  <td>{c.supplier?.razonSocial ?? '—'}</td>
                  <td className="muted">
                    {c.items.map((i) => `${i.cantidad} ${i.insumo.unidad} ${i.insumo.nombre}`).join(', ')}
                  </td>
                  <td className="num">{mxn(c.subtotal)}</td>
                  <td className="num">{mxn(c.iva)}</td>
                  <td className="num money">{mxn(c.subtotal + c.iva)}</td>
                  <td><span className={`badge ${c.estado}`}>{c.estado}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {(c.estado === 'BORRADOR' || c.estado === 'ORDENADA') && (
                      <>
                        <button className="btn btn-sm btn-ok" onClick={() => recibir(c)}>Recibir</button>{' '}
                        <button className="btn btn-sm btn-danger" onClick={() => cancelar(c)}>✕</button>
                      </>
                    )}
                    {c.estado === 'RECIBIDA' && (
                      <button className="btn btn-sm btn-primary" onClick={() => setPagar(c)}>Pagar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nueva && (
        <NuevaCompraModal
          companyId={companyId}
          insumos={insumos}
          onClose={() => setNueva(false)}
          onDone={() => { setNueva(false); cargar() }}
        />
      )}
      {pagar && (
        <PagarModal
          companyId={companyId}
          compra={pagar}
          onClose={() => setPagar(null)}
          onDone={() => { setPagar(null); cargar() }}
        />
      )}
    </div>
  )
}

function NuevaCompraModal({ companyId, insumos, onClose, onDone }) {
  const [proveedores, setProveedores] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [items, setItems] = useState([]) // { insumoId, cantidad, costoUnitario }
  const [iva, setIva] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch(`/api/restaurante/suppliers?companyId=${companyId}`)
      .then((d) => setProveedores(Array.isArray(d) ? d : []))
      .catch(() => setProveedores([]))
  }, [companyId])

  const insumoById = (id) => insumos.find((i) => i.id === id)

  const addLinea = () => {
    const usado = new Set(items.map((r) => r.insumoId))
    const libre = insumos.find((i) => !usado.has(i.id))
    if (libre) {
      setItems([...items, { insumoId: libre.id, cantidad: '', costoUnitario: String(libre.costoPromedio || '') }])
    }
  }

  const subtotal = items.reduce(
    (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.costoUnitario) || 0), 0
  )

  const submit = async () => {
    const lineas = items
      .filter((i) => i.insumoId && Number(i.cantidad) > 0)
      .map((i) => ({
        insumoId: i.insumoId,
        cantidad: Number(i.cantidad),
        costoUnitario: Number(i.costoUnitario) || 0,
      }))
    if (lineas.length === 0) { setError('Agrega al menos una partida'); return }
    setSaving(true)
    setError(null)
    try {
      await apiFetch('/api/restaurante/compras', {
        method: 'POST',
        body: {
          companyId,
          supplierId: supplierId || null,
          iva: iva ? Number(iva) : 0,
          notas: notas || null,
          items: lineas,
        },
      })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Nueva compra" onClose={onClose} wide>
      <label>Proveedor</label>
      <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
        <option value="">— sin proveedor —</option>
        {proveedores.map((p) => <option key={p.id} value={p.id}>{p.razonSocial}</option>)}
      </select>
      <p className="muted">Los proveedores se administran en contabilidad-os (o vía API); aquí sólo se seleccionan.</p>

      <label>Partidas</label>
      {insumos.length === 0 ? (
        <p className="muted">Crea insumos primero.</p>
      ) : (
        <>
          {items.map((r, idx) => {
            const ins = insumoById(r.insumoId)
            return (
              <div className="ticket-line" key={idx}>
                <select
                  style={{ flex: 2 }}
                  value={r.insumoId}
                  onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, insumoId: e.target.value } : x)))}
                >
                  {insumos.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
                <input
                  style={{ flex: 1 }} type="number" step="0.001" min="0" placeholder={`cant. (${ins?.unidad ?? ''})`}
                  value={r.cantidad}
                  onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, cantidad: e.target.value } : x)))}
                />
                <input
                  style={{ flex: 1 }} type="number" step="0.0001" min="0" placeholder="$ unitario s/IVA"
                  value={r.costoUnitario}
                  onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, costoUnitario: e.target.value } : x)))}
                />
                <span className="money" style={{ width: 90, textAlign: 'right' }}>
                  {mxn((Number(r.cantidad) || 0) * (Number(r.costoUnitario) || 0))}
                </span>
                <button className="qty-btn" onClick={() => setItems(items.filter((_, i) => i !== idx))}>✕</button>
              </div>
            )
          })}
          <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={addLinea}>+ Partida</button>
        </>
      )}

      <div className="row">
        <div>
          <label>IVA (explícito — muchos insumos son tasa 0%)</label>
          <input type="number" step="0.01" min="0" placeholder="0.00" value={iva} onChange={(e) => setIva(e.target.value)} />
        </div>
        <div>
          <label>Notas</label>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>

      <div className="orden-total" style={{ marginTop: 10 }}>
        <span>Total</span>
        <span className="money">{mxn(subtotal + (Number(iva) || 0))}</span>
      </div>

      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? 'Guardando…' : 'Ordenar compra'}
        </button>
      </div>
    </Modal>
  )
}

function PagarModal({ companyId, compra, onClose, onDone }) {
  const total = compra.subtotal + compra.iva
  const [formaPago, setFormaPago] = useState('TRANSFERENCIA')
  const [bankAccountId, setBankAccountId] = useState('')
  const [cuentas, setCuentas] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const needsBank = formaPago !== 'EFECTIVO'

  useEffect(() => {
    apiFetch(`/api/restaurante/bank-accounts?companyId=${companyId}`)
      .then((d) => setCuentas(Array.isArray(d) ? d : []))
      .catch(() => setCuentas([]))
  }, [companyId])

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/restaurante/compras/${compra.id}/pagar`, {
        method: 'POST',
        body: { formaPago, ...(needsBank ? { bankAccountId } : {}) },
      })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Pagar ${compra.folio} — ${mxn(total)}`} onClose={onClose}>
      <label>Forma de pago</label>
      <div className="filters">
        {['TRANSFERENCIA', 'TARJETA', 'EFECTIVO'].map((f) => (
          <button key={f} type="button" className={`chip${formaPago === f ? ' active' : ''}`} onClick={() => setFormaPago(f)}>
            {f}
          </button>
        ))}
      </div>
      {needsBank && (
        <>
          <label>Cuenta origen</label>
          <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
            <option value="">— selecciona —</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.banco} · {c.nombre}</option>)}
          </select>
        </>
      )}
      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving || (needsBank && !bankAccountId)}>
          {saving ? 'Pagando…' : 'Registrar pago'}
        </button>
      </div>
    </Modal>
  )
}
