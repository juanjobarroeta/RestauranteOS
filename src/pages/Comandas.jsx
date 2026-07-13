import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { ErrorBox, Modal, localMidnightISO, mxn } from '../components/ui'

const ESTADO_ITEM = {
  PENDIENTE: '⏳', EN_PREPARACION: '🔥', LISTO: '✅', ENTREGADO: '🍽️', CANCELADO: '✖️',
}

const ordenTotal = (o) =>
  o.items
    .filter((i) => i.estadoCocina !== 'CANCELADO')
    .reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)

export default function Comandas() {
  const { activeCompany } = useAuth()
  const companyId = activeCompany?.id
  const [tab, setTab] = useState('ABIERTA')
  const [ordenes, setOrdenes] = useState([])
  const [menu, setMenu] = useState([])
  const [error, setError] = useState(null)
  const [nueva, setNueva] = useState(false)
  const [agregarA, setAgregarA] = useState(null) // orden a la que se agregan items
  const [cobrar, setCobrar] = useState(null)
  const [facturar, setFacturar] = useState(null)

  const cargar = useCallback(async () => {
    if (!companyId) return
    setError(null)
    try {
      const qs =
        tab === 'ABIERTA'
          ? `estado=ABIERTA`
          : `estado=COBRADA&from=${encodeURIComponent(localMidnightISO())}`
      const data = await apiFetch(`/api/restaurante/ordenes?companyId=${companyId}&${qs}`)
      setOrdenes(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    }
  }, [companyId, tab])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    const t = setInterval(cargar, 15_000)
    return () => clearInterval(t)
  }, [cargar])

  useEffect(() => {
    if (!companyId) return
    apiFetch(`/api/restaurante/menu/items?companyId=${companyId}&activos=true`)
      .then((d) => setMenu(Array.isArray(d) ? d : []))
      .catch((err) => setError(err.message))
  }, [companyId])

  const cancelarOrden = async (orden) => {
    if (!window.confirm(`¿Cancelar la orden #${orden.folio}?`)) return
    try {
      await apiFetch(`/api/restaurante/ordenes/${orden.id}`, { method: 'PATCH', body: { estado: 'CANCELADA' } })
      cargar()
    } catch (err) { setError(err.message) }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Comandas</h1>
          <p className="page-sub">Toma de órdenes y cobro</p>
        </div>
        <div className="filters">
          <button className={`chip${tab === 'ABIERTA' ? ' active' : ''}`} onClick={() => setTab('ABIERTA')}>Abiertas</button>
          <button className={`chip${tab === 'COBRADA' ? ' active' : ''}`} onClick={() => setTab('COBRADA')}>Cobradas hoy</button>
          <button className="btn btn-primary" onClick={() => setNueva(true)}>+ Nueva orden</button>
        </div>
      </div>

      <ErrorBox error={error} />

      {ordenes.length === 0 ? (
        <div className="empty-state">
          {tab === 'ABIERTA' ? 'No hay órdenes abiertas.' : 'No hay órdenes cobradas hoy.'}
        </div>
      ) : (
        <div className="grid grid-3">
          {ordenes.map((o) => (
            <div key={o.id} className="card orden-card">
              <div className="orden-head">
                <span className="orden-folio">
                  #{o.folio} {o.tipo === 'MESA' ? (o.mesa ? `· Mesa ${o.mesa}` : '') : `· ${o.tipo}`}
                </span>
                <span className={`badge ${o.estado}`}>{o.estado}</span>
              </div>
              {o.clienteNombre && <div className="muted">{o.clienteNombre}</div>}
              <div className="orden-items">
                {o.items.map((i) => (
                  <div key={i.id} className="orden-item-line">
                    <span style={i.estadoCocina === 'CANCELADO' ? { textDecoration: 'line-through', color: '#999' } : undefined}>
                      {i.cantidad}× {i.menuItem.nombre}
                      {i.notas ? <em className="muted"> — {i.notas}</em> : null}
                    </span>
                    <span className="st" title={i.estadoCocina}>{ESTADO_ITEM[i.estadoCocina]}</span>
                  </div>
                ))}
              </div>
              <div className="orden-total">
                <span>Total</span>
                <span className="money">{mxn(o.estado === 'COBRADA' ? o.total : ordenTotal(o))}</span>
              </div>
              {o.estado === 'COBRADA' && (
                <div className="muted">
                  {o.formaPago}{o.propina > 0 ? ` · propina ${mxn(o.propina)}` : ''}
                  {o.invoice ? ` · CFDI ${o.invoice.serie ?? ''}${o.invoice.folio ?? ''}` : ''}
                </div>
              )}
              <div className="orden-actions">
                {o.estado === 'ABIERTA' && (
                  <>
                    <button className="btn btn-sm" onClick={() => setAgregarA(o)}>+ Platillos</button>
                    <button className="btn btn-ok btn-sm" onClick={() => setCobrar(o)}>Cobrar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => cancelarOrden(o)}>Cancelar</button>
                  </>
                )}
                {o.estado === 'COBRADA' && !o.invoice && o.formaPago !== 'CORTESIA' && (
                  <button className="btn btn-sm" onClick={() => setFacturar(o)}>Facturar CFDI</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {nueva && (
        <NuevaOrdenModal
          companyId={companyId}
          menu={menu}
          onClose={() => setNueva(false)}
          onDone={() => { setNueva(false); setTab('ABIERTA'); cargar() }}
        />
      )}
      {agregarA && (
        <NuevaOrdenModal
          companyId={companyId}
          menu={menu}
          orden={agregarA}
          onClose={() => setAgregarA(null)}
          onDone={() => { setAgregarA(null); cargar() }}
        />
      )}
      {cobrar && (
        <CobrarModal
          companyId={companyId}
          orden={cobrar}
          onClose={() => setCobrar(null)}
          onDone={() => { setCobrar(null); cargar() }}
        />
      )}
      {facturar && (
        <FacturarModal
          companyId={companyId}
          orden={facturar}
          onClose={() => setFacturar(null)}
          onDone={() => { setFacturar(null); cargar() }}
        />
      )}
    </div>
  )
}

/** Shared by "nueva orden" and "agregar platillos a orden existente". */
function NuevaOrdenModal({ companyId, menu, orden, onClose, onDone }) {
  const [tipo, setTipo] = useState('MESA')
  const [mesa, setMesa] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [ticket, setTicket] = useState([]) // { menuItemId, nombre, precio, cantidad, notas }
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const disponibles = useMemo(() => menu.filter((m) => m.activo && m.disponible), [menu])
  const categorias = useMemo(() => {
    const map = new Map()
    for (const m of disponibles) {
      const cat = m.categoria?.nombre ?? 'Sin categoría'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(m)
    }
    return [...map.entries()]
  }, [disponibles])

  const add = (m) => {
    setTicket((t) => {
      const idx = t.findIndex((x) => x.menuItemId === m.id && !x.notas)
      if (idx >= 0) {
        const copy = [...t]
        copy[idx] = { ...copy[idx], cantidad: copy[idx].cantidad + 1 }
        return copy
      }
      return [...t, { menuItemId: m.id, nombre: m.nombre, precio: m.precio, cantidad: 1, notas: '' }]
    })
  }
  const setQty = (idx, delta) => {
    setTicket((t) => {
      const copy = [...t]
      const q = copy[idx].cantidad + delta
      if (q <= 0) copy.splice(idx, 1)
      else copy[idx] = { ...copy[idx], cantidad: q }
      return copy
    })
  }
  const setNota = (idx, notas) => {
    setTicket((t) => t.map((x, i) => (i === idx ? { ...x, notas } : x)))
  }

  const total = ticket.reduce((s, i) => s + i.cantidad * i.precio, 0)

  const submit = async () => {
    if (ticket.length === 0) { setError('Agrega al menos un platillo'); return }
    setSaving(true)
    setError(null)
    const items = ticket.map((i) => ({
      menuItemId: i.menuItemId,
      cantidad: i.cantidad,
      notas: i.notas || null,
    }))
    try {
      if (orden) {
        await apiFetch(`/api/restaurante/ordenes/${orden.id}`, {
          method: 'PATCH',
          body: { addItems: items },
        })
      } else {
        await apiFetch('/api/restaurante/ordenes', {
          method: 'POST',
          body: {
            companyId,
            tipo,
            mesa: tipo === 'MESA' ? mesa || null : null,
            clienteNombre: clienteNombre || null,
            items,
          },
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
    <Modal title={orden ? `Agregar a orden #${orden.folio}` : 'Nueva orden'} onClose={onClose} wide>
      {!orden && (
        <div className="row">
          <div>
            <label>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="MESA">Mesa</option>
              <option value="LLEVAR">Para llevar</option>
              <option value="DOMICILIO">Domicilio</option>
            </select>
          </div>
          {tipo === 'MESA' ? (
            <div>
              <label>Mesa</label>
              <input value={mesa} onChange={(e) => setMesa(e.target.value)} placeholder="p. ej. 4" />
            </div>
          ) : (
            <div>
              <label>Cliente</label>
              <input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre" />
            </div>
          )}
        </div>
      )}

      <label>Menú</label>
      {disponibles.length === 0 ? (
        <p className="muted">No hay platillos disponibles — crea el menú primero.</p>
      ) : (
        categorias.map(([cat, items]) => (
          <div key={cat}>
            <div className="muted" style={{ margin: '8px 0 4px' }}>{cat}</div>
            <div className="menu-pick">
              {items.map((m) => (
                <button key={m.id} type="button" onClick={() => add(m)}>
                  {m.nombre}
                  <span className="price">{mxn(m.precio)}</span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {ticket.length > 0 && (
        <div className="ticket">
          {ticket.map((i, idx) => (
            <div key={idx} className="ticket-line">
              <button className="qty-btn" onClick={() => setQty(idx, -1)}>−</button>
              <span>{i.cantidad}</span>
              <button className="qty-btn" onClick={() => setQty(idx, +1)}>+</button>
              <span className="grow">{i.nombre}</span>
              <input
                style={{ width: 140 }}
                placeholder="nota (sin cebolla…)"
                value={i.notas}
                onChange={(e) => setNota(idx, e.target.value)}
              />
              <span className="money">{mxn(i.cantidad * i.precio)}</span>
            </div>
          ))}
          <div className="orden-total"><span>Total</span><span className="money">{mxn(total)}</span></div>
        </div>
      )}

      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving || ticket.length === 0}>
          {saving ? 'Guardando…' : orden ? 'Agregar' : 'Abrir orden'}
        </button>
      </div>
    </Modal>
  )
}

function CobrarModal({ companyId, orden, onClose, onDone }) {
  const total = ordenTotal(orden)
  const [formaPago, setFormaPago] = useState('EFECTIVO')
  const [propina, setPropina] = useState('')
  const [bankAccountId, setBankAccountId] = useState('')
  const [cuentas, setCuentas] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const needsBank = formaPago === 'TRANSFERENCIA' || formaPago === 'TARJETA'

  useEffect(() => {
    apiFetch(`/api/restaurante/bank-accounts?companyId=${companyId}`)
      .then((d) => setCuentas(Array.isArray(d) ? d : []))
      .catch(() => setCuentas([]))
  }, [companyId])

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/restaurante/ordenes/${orden.id}/cobrar`, {
        method: 'POST',
        body: {
          formaPago,
          propina: propina ? Number(propina) : 0,
          ...(needsBank ? { bankAccountId } : {}),
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
    <Modal title={`Cobrar orden #${orden.folio}`} onClose={onClose}>
      <div className="orden-total" style={{ borderTop: 'none', paddingTop: 0 }}>
        <span>Total (IVA incluido)</span><span className="money">{mxn(total)}</span>
      </div>

      <label>Forma de pago</label>
      <div className="filters">
        {['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CORTESIA'].map((f) => (
          <button
            key={f}
            type="button"
            className={`chip${formaPago === f ? ' active' : ''}`}
            onClick={() => setFormaPago(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {needsBank && (
        <>
          <label>Cuenta destino</label>
          <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
            <option value="">— selecciona —</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>{c.banco} · {c.nombre}</option>
            ))}
          </select>
        </>
      )}

      {formaPago !== 'CORTESIA' && (
        <>
          <label>Propina</label>
          <input
            type="number" min="0" step="0.01" placeholder="0.00"
            value={propina} onChange={(e) => setPropina(e.target.value)}
          />
          <p className="muted">
            La propina se registra como pasivo (por pagar al equipo), no como ingreso.
          </p>
        </>
      )}

      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cerrar</button>
        <button
          className="btn btn-ok"
          onClick={submit}
          disabled={saving || (needsBank && !bankAccountId)}
        >
          {saving ? 'Cobrando…' : `Cobrar ${mxn(total + (propina ? Number(propina) : 0))}`}
        </button>
      </div>
    </Modal>
  )
}

/**
 * Stamps a CFDI for a charged order via the hub's POST /api/facturas
 * (Facturapi, idempotent via idempotencyKey) and links it to the order.
 */
function FacturarModal({ companyId, orden, onClose, onDone }) {
  const [clientes, setClientes] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [usoCfdi, setUsoCfdi] = useState('G03')
  const [nuevoCliente, setNuevoCliente] = useState(false)
  const [nc, setNc] = useState({ rfc: '', razonSocial: '', regimenFiscal: '601', codigoPostal: '', email: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch(`/api/restaurante/customers?companyId=${companyId}`)
      .then((d) => setClientes(Array.isArray(d) ? d : []))
      .catch((err) => setError(err.message))
  }, [companyId])

  const FORMA_SAT = { EFECTIVO: '01', TRANSFERENCIA: '03', TARJETA: '04' }

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      let cid = customerId
      if (nuevoCliente) {
        const creado = await apiFetch('/api/restaurante/customers', {
          method: 'POST',
          body: {
            companyId,
            rfc: nc.rfc,
            razonSocial: nc.razonSocial,
            regimenFiscal: nc.regimenFiscal,
            codigoPostal: nc.codigoPostal,
            email: nc.email || null,
          },
        })
        cid = creado.id
      }
      if (!cid) { setError('Selecciona o crea un cliente'); setSaving(false); return }

      const vivos = orden.items.filter((i) => i.estadoCocina !== 'CANCELADO')
      const invoice = await apiFetch('/api/facturas', {
        method: 'POST',
        body: {
          companyId,
          customerId: cid,
          formaPago: FORMA_SAT[orden.formaPago] ?? '01',
          metodoPago: 'PUE',
          usoCfdi,
          idempotencyKey: `rest-orden-${orden.id}`,
          items: vivos.map((i) => ({
            quantity: i.cantidad,
            product: {
              description: i.menuItem.nombre,
              product_key: '90101500',
              unit_key: 'E48',
              price: i.precioUnitario,
              tax_included: true,
              taxes: [{ type: 'IVA', rate: 0.16, factor: 'Tasa', withholding: false }],
            },
          })),
          notes: `Orden #${orden.folio}${orden.mesa ? ` — Mesa ${orden.mesa}` : ''}`,
        },
      })

      const invoiceId = invoice?.id ?? invoice?.invoice?.id
      if (invoiceId) {
        await apiFetch(`/api/restaurante/ordenes/${orden.id}`, {
          method: 'PATCH',
          body: { invoiceId },
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
    <Modal title={`Facturar orden #${orden.folio} — ${mxn(orden.total)}`} onClose={onClose}>
      {!nuevoCliente ? (
        <>
          <label>Cliente fiscal</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— selecciona —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.razonSocial} ({c.rfc})</option>
            ))}
          </select>
          <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setNuevoCliente(true)}>
            + Nuevo cliente
          </button>
        </>
      ) : (
        <>
          <div className="row">
            <div><label>RFC</label><input value={nc.rfc} onChange={(e) => setNc({ ...nc, rfc: e.target.value.toUpperCase() })} /></div>
            <div><label>C.P.</label><input value={nc.codigoPostal} onChange={(e) => setNc({ ...nc, codigoPostal: e.target.value })} maxLength={5} /></div>
          </div>
          <label>Razón social</label>
          <input value={nc.razonSocial} onChange={(e) => setNc({ ...nc, razonSocial: e.target.value })} />
          <div className="row">
            <div>
              <label>Régimen fiscal</label>
              <input value={nc.regimenFiscal} onChange={(e) => setNc({ ...nc, regimenFiscal: e.target.value })} placeholder="601" />
            </div>
            <div><label>Email</label><input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} /></div>
          </div>
          <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setNuevoCliente(false)}>
            ← Elegir existente
          </button>
        </>
      )}

      <label>Uso CFDI</label>
      <select value={usoCfdi} onChange={(e) => setUsoCfdi(e.target.value)}>
        <option value="G03">G03 — Gastos en general</option>
        <option value="G01">G01 — Adquisición de mercancías</option>
        <option value="S01">S01 — Sin efectos fiscales</option>
      </select>

      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cerrar</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? 'Timbrando…' : 'Timbrar CFDI'}
        </button>
      </div>
    </Modal>
  )
}
