import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { ErrorBox, Modal, mxn } from '../components/ui'

export default function Menu() {
  const { activeCompany } = useAuth()
  const companyId = activeCompany?.id
  const [items, setItems] = useState([])
  const [categorias, setCategorias] = useState([])
  const [insumos, setInsumos] = useState([])
  const [error, setError] = useState(null)
  const [editar, setEditar] = useState(null) // null | 'nuevo' | item
  const [nuevaCat, setNuevaCat] = useState(false)

  const cargar = useCallback(async () => {
    if (!companyId) return
    setError(null)
    try {
      const [i, c, ins] = await Promise.all([
        apiFetch(`/api/restaurante/menu/items?companyId=${companyId}`),
        apiFetch(`/api/restaurante/menu/categorias?companyId=${companyId}`),
        apiFetch(`/api/restaurante/insumos?companyId=${companyId}`),
      ])
      setItems(Array.isArray(i) ? i : [])
      setCategorias(Array.isArray(c) ? c : [])
      setInsumos(Array.isArray(ins) ? ins : [])
    } catch (err) {
      setError(err.message)
    }
  }, [companyId])

  useEffect(() => { cargar() }, [cargar])

  const toggle86 = async (item) => {
    try {
      await apiFetch(`/api/restaurante/menu/items/${item.id}`, {
        method: 'PATCH',
        body: { disponible: !item.disponible },
      })
      cargar()
    } catch (err) { setError(err.message) }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Menú</h1>
          <p className="page-sub">Platillos, recetas y márgenes contra el costo promedio vigente</p>
        </div>
        <div className="filters">
          <button className="btn" onClick={() => setNuevaCat(true)}>+ Categoría</button>
          <button className="btn btn-primary" onClick={() => setEditar('nuevo')}>+ Platillo</button>
        </div>
      </div>

      <ErrorBox error={error} />

      {items.length === 0 ? (
        <div className="empty-state">Sin platillos — crea el primero.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Platillo</th><th>Categoría</th><th className="num">Precio</th>
                <th className="num">Costo receta</th><th className="num">Food cost</th>
                <th className="num">Margen</th><th>Disponible</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} style={!m.activo ? { opacity: .45 } : undefined}>
                  <td>
                    {m.nombre}
                    {m.receta.length === 0 && <span className="muted"> · sin receta</span>}
                  </td>
                  <td className="muted">{m.categoria?.nombre ?? '—'}</td>
                  <td className="num money">{mxn(m.precio)}</td>
                  <td className="num">{m.receta.length ? mxn(m.costoTeorico) : '—'}</td>
                  <td className={`num${m.foodCostPct > 0.4 ? ' low-stock' : ''}`}>
                    {m.receta.length ? `${(m.foodCostPct * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="num">{m.receta.length ? `${(m.margen * 100).toFixed(1)}%` : '—'}</td>
                  <td>
                    <button
                      className={`btn btn-sm ${m.disponible ? 'btn-ok' : 'btn-danger'}`}
                      onClick={() => toggle86(m)}
                      title="Disponibilidad del día (86)"
                    >
                      {m.disponible ? 'Sí' : 'No (86)'}
                    </button>
                  </td>
                  <td><button className="btn btn-sm" onClick={() => setEditar(m)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editar && (
        <PlatilloModal
          companyId={companyId}
          item={editar === 'nuevo' ? null : editar}
          categorias={categorias}
          insumos={insumos}
          onClose={() => setEditar(null)}
          onDone={() => { setEditar(null); cargar() }}
        />
      )}
      {nuevaCat && (
        <CategoriaModal
          companyId={companyId}
          onClose={() => setNuevaCat(false)}
          onDone={() => { setNuevaCat(false); cargar() }}
        />
      )}
    </div>
  )
}

function CategoriaModal({ companyId, onClose, onDone }) {
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiFetch('/api/restaurante/menu/categorias', {
        method: 'POST',
        body: { companyId, nombre },
      })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Nueva categoría" onClose={onClose}>
      <label>Nombre</label>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Entradas, Tacos, Bebidas…" />
      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving || !nombre}>Guardar</button>
      </div>
    </Modal>
  )
}

function PlatilloModal({ companyId, item, categorias, insumos, onClose, onDone }) {
  const [form, setForm] = useState({
    nombre: item?.nombre ?? '',
    descripcion: item?.descripcion ?? '',
    precio: item ? String(item.precio) : '',
    categoriaId: item?.categoriaId ?? '',
    estacion: item?.estacion ?? 'COCINA',
  })
  const [activo, setActivo] = useState(item?.activo ?? true)
  const [receta, setReceta] = useState(
    item?.receta?.map((r) => ({ insumoId: r.insumo.id, cantidad: String(r.cantidad) })) ?? []
  )
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const insumoById = (id) => insumos.find((i) => i.id === id)
  const costoReceta = receta.reduce((s, r) => {
    const ins = insumoById(r.insumoId)
    return s + (ins && r.cantidad ? Number(r.cantidad) * ins.costoPromedio : 0)
  }, 0)
  const precioSinIva = form.precio ? Number(form.precio) / 1.16 : 0
  const foodCost = precioSinIva > 0 ? costoReceta / precioSinIva : 0

  const addLinea = () => {
    const usado = new Set(receta.map((r) => r.insumoId))
    const libre = insumos.find((i) => !usado.has(i.id))
    if (libre) setReceta([...receta, { insumoId: libre.id, cantidad: '' }])
  }

  const submit = async () => {
    setSaving(true)
    setError(null)
    const recetaBody = receta
      .filter((r) => r.insumoId && Number(r.cantidad) > 0)
      .map((r) => ({ insumoId: r.insumoId, cantidad: Number(r.cantidad) }))
    const body = {
      nombre: form.nombre,
      descripcion: form.descripcion || null,
      precio: Number(form.precio),
      categoriaId: form.categoriaId || null,
      estacion: form.estacion,
      receta: recetaBody,
    }
    try {
      if (item) {
        await apiFetch(`/api/restaurante/menu/items/${item.id}`, {
          method: 'PATCH',
          body: { ...body, activo },
        })
      } else {
        await apiFetch('/api/restaurante/menu/items', {
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
    <Modal title={item ? `Editar ${item.nombre}` : 'Nuevo platillo'} onClose={onClose} wide>
      <div className="row">
        <div style={{ flex: 2 }}>
          <label>Nombre</label>
          <input value={form.nombre} onChange={set('nombre')} placeholder="Tacos al pastor (orden de 3)" />
        </div>
        <div>
          <label>Precio (IVA incluido)</label>
          <input type="number" step="0.01" min="0" value={form.precio} onChange={set('precio')} />
        </div>
      </div>
      <div className="row">
        <div>
          <label>Categoría</label>
          <select value={form.categoriaId} onChange={set('categoriaId')}>
            <option value="">— sin categoría —</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label>Estación (cocina)</label>
          <select value={form.estacion} onChange={set('estacion')}>
            <option value="COCINA">Cocina</option>
            <option value="BARRA">Barra</option>
            <option value="POSTRES">Postres</option>
          </select>
        </div>
      </div>
      <label>Descripción</label>
      <input value={form.descripcion} onChange={set('descripcion')} />

      <label>Receta (consumo de inventario por unidad vendida)</label>
      {insumos.length === 0 ? (
        <p className="muted">Crea insumos primero para poder costear la receta.</p>
      ) : (
        <>
          {receta.map((r, idx) => {
            const ins = insumoById(r.insumoId)
            return (
              <div className="ticket-line" key={idx}>
                <select
                  style={{ flex: 2 }}
                  value={r.insumoId}
                  onChange={(e) => setReceta(receta.map((x, i) => (i === idx ? { ...x, insumoId: e.target.value } : x)))}
                >
                  {insumos.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
                <input
                  style={{ flex: 1 }}
                  type="number" step="0.001" min="0" placeholder="cant."
                  value={r.cantidad}
                  onChange={(e) => setReceta(receta.map((x, i) => (i === idx ? { ...x, cantidad: e.target.value } : x)))}
                />
                <span className="muted" style={{ width: 34 }}>{ins?.unidad}</span>
                <span className="money" style={{ width: 80, textAlign: 'right' }}>
                  {ins && r.cantidad ? mxn(Number(r.cantidad) * ins.costoPromedio) : '—'}
                </span>
                <button className="qty-btn" onClick={() => setReceta(receta.filter((_, i) => i !== idx))}>✕</button>
              </div>
            )
          })}
          <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={addLinea}>+ Insumo</button>
          {receta.length > 0 && form.precio && (
            <p className="muted" style={{ marginTop: 8 }}>
              Costo receta {mxn(costoReceta)} · food cost{' '}
              <strong className={foodCost > 0.4 ? 'low-stock' : ''}>{(foodCost * 100).toFixed(1)}%</strong>{' '}
              sobre {mxn(precioSinIva)} sin IVA
            </p>
          )}
        </>
      )}

      {item && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Activo en catálogo
        </label>
      )}

      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving || !form.nombre || !Number(form.precio)}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}
