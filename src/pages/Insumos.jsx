import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { ErrorBox, Modal, UNIDADES, mxn } from '../components/ui'

const VACIO = { nombre: '', categoria: '', unidad: 'PZA', costoPromedio: '', stock: '', stockMinimo: '' }

export default function Insumos() {
  const { activeCompany } = useAuth()
  const companyId = activeCompany?.id
  const [insumos, setInsumos] = useState([])
  const [error, setError] = useState(null)
  const [editar, setEditar] = useState(null) // null | 'nuevo' | insumo

  const cargar = useCallback(async () => {
    if (!companyId) return
    setError(null)
    try {
      const data = await apiFetch(`/api/restaurante/insumos?companyId=${companyId}`)
      setInsumos(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    }
  }, [companyId])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Insumos</h1>
          <p className="page-sub">Inventario con costo promedio — el stock se mueve con compras y ventas</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditar('nuevo')}>+ Nuevo insumo</button>
      </div>

      <ErrorBox error={error} />

      {insumos.length === 0 ? (
        <div className="empty-state">Sin insumos todavía — crea el primero.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Insumo</th><th>Categoría</th><th className="num">Stock</th>
                <th className="num">Mínimo</th><th className="num">Costo prom.</th>
                <th className="num">Valor</th><th></th>
              </tr>
            </thead>
            <tbody>
              {insumos.map((i) => {
                const low = i.stockMinimo > 0 && i.stock <= i.stockMinimo
                return (
                  <tr key={i.id} style={!i.activo ? { opacity: .45 } : undefined}>
                    <td>{i.nombre}{!i.activo && ' (inactivo)'}</td>
                    <td className="muted">{i.categoria ?? '—'}</td>
                    <td className={`num${low ? ' low-stock' : ''}`}>{i.stock} {i.unidad}</td>
                    <td className="num muted">{i.stockMinimo > 0 ? `${i.stockMinimo} ${i.unidad}` : '—'}</td>
                    <td className="num">{mxn(i.costoPromedio)}</td>
                    <td className="num money">{mxn(i.stock > 0 ? i.stock * i.costoPromedio : 0)}</td>
                    <td><button className="btn btn-sm" onClick={() => setEditar(i)}>Editar</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editar && (
        <InsumoModal
          companyId={companyId}
          insumo={editar === 'nuevo' ? null : editar}
          onClose={() => setEditar(null)}
          onDone={() => { setEditar(null); cargar() }}
        />
      )}
    </div>
  )
}

function InsumoModal({ companyId, insumo, onClose, onDone }) {
  const [form, setForm] = useState(
    insumo
      ? {
          nombre: insumo.nombre,
          categoria: insumo.categoria ?? '',
          unidad: insumo.unidad,
          costoPromedio: String(insumo.costoPromedio),
          stock: String(insumo.stock),
          stockMinimo: String(insumo.stockMinimo),
        }
      : VACIO
  )
  const [activo, setActivo] = useState(insumo?.activo ?? true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async () => {
    setSaving(true)
    setError(null)
    const body = {
      nombre: form.nombre,
      categoria: form.categoria || null,
      unidad: form.unidad,
      costoPromedio: form.costoPromedio ? Number(form.costoPromedio) : 0,
      stock: form.stock ? Number(form.stock) : 0,
      stockMinimo: form.stockMinimo ? Number(form.stockMinimo) : 0,
    }
    try {
      if (insumo) {
        await apiFetch(`/api/restaurante/insumos/${insumo.id}`, {
          method: 'PATCH',
          body: { ...body, activo },
        })
      } else {
        await apiFetch('/api/restaurante/insumos', {
          method: 'POST',
          body: { companyId, ...body },
        })
      }
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={insumo ? `Editar ${insumo.nombre}` : 'Nuevo insumo'} onClose={onClose}>
      <label>Nombre</label>
      <input value={form.nombre} onChange={set('nombre')} placeholder="Tomate saladet" />
      <div className="row">
        <div>
          <label>Categoría</label>
          <input value={form.categoria} onChange={set('categoria')} placeholder="Verduras" />
        </div>
        <div>
          <label>Unidad</label>
          <select value={form.unidad} onChange={set('unidad')}>
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <div>
          <label>Stock actual</label>
          <input type="number" step="0.001" value={form.stock} onChange={set('stock')} />
        </div>
        <div>
          <label>Stock mínimo</label>
          <input type="number" step="0.001" min="0" value={form.stockMinimo} onChange={set('stockMinimo')} />
        </div>
        <div>
          <label>Costo prom. / unidad</label>
          <input type="number" step="0.0001" min="0" value={form.costoPromedio} onChange={set('costoPromedio')} />
        </div>
      </div>
      {insumo && (
        <>
          <p className="muted" style={{ marginTop: 8 }}>
            Stock y costo se actualizan aquí sólo como corrección manual — el flujo
            normal es recibir compras y cobrar órdenes.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activo
          </label>
        </>
      )}
      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving || !form.nombre}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}
