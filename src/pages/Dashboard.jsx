import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../config/api'
import { ErrorBox, localMidnightISO, mxn } from '../components/ui'

export default function Dashboard() {
  const { activeCompany } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    if (!activeCompany?.id) return
    setError(null)
    try {
      const d = await apiFetch(
        `/api/restaurante/dashboard?companyId=${activeCompany.id}&from=${encodeURIComponent(localMidnightISO())}`
      )
      setData(d)
    } catch (err) {
      setError(err.message)
    }
  }, [activeCompany?.id])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => {
    const t = setInterval(cargar, 60_000)
    return () => clearInterval(t)
  }, [cargar])

  if (error) return <ErrorBox error={error} />
  if (!data) return <div className="boot">Cargando…</div>

  const v = data.ventas

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Hoy</h1>
          <p className="page-sub">{activeCompany?.razonSocial}</p>
        </div>
      </div>

      <div className="grid grid-4">
        <div className="card stat"><span className="v">{mxn(v.total)}</span><span className="l">Ventas cobradas</span></div>
        <div className="card stat"><span className="v">{v.ordenes}</span><span className="l">Órdenes cobradas</span></div>
        <div className="card stat"><span className="v">{data.ordenesAbiertas}</span><span className="l">Órdenes abiertas</span></div>
        <div className="card stat"><span className="v">{mxn(v.propinas)}</span><span className="l">Propinas</span></div>
        <div className="card stat">
          <span className="v">{v.subtotal > 0 ? `${(v.foodCostPct * 100).toFixed(1)}%` : '—'}</span>
          <span className="l">Food cost (real)</span>
        </div>
        <div className="card stat"><span className="v">{mxn(v.costo)}</span><span className="l">Costo de venta</span></div>
        <div className="card stat"><span className="v">{data.comprasPorPagar}</span><span className="l">Compras por pagar</span></div>
        <div className="card stat">
          <span className={`v${data.insumosBajoMinimo.length ? ' low-stock' : ''}`}>{data.insumosBajoMinimo.length}</span>
          <span className="l">Insumos bajo mínimo</span>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginTop: 14 }}>
        <div className="card">
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Top platillos de hoy</h2>
          {data.topPlatillos.length === 0 ? (
            <p className="muted">Sin ventas todavía.</p>
          ) : (
            <table>
              <thead><tr><th>Platillo</th><th className="num">Cant.</th><th className="num">Venta</th></tr></thead>
              <tbody>
                {data.topPlatillos.map((p) => (
                  <tr key={p.menuItemId}>
                    <td>{p.nombre}</td>
                    <td className="num">{p.cantidad}</td>
                    <td className="num money">{mxn(p.venta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Cobros por forma de pago</h2>
          {Object.keys(v.porFormaPago).length === 0 ? (
            <p className="muted">Sin cobros todavía.</p>
          ) : (
            <table>
              <tbody>
                {Object.entries(v.porFormaPago).map(([k, monto]) => (
                  <tr key={k}><td>{k}</td><td className="num money">{mxn(monto)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Insumos bajo mínimo</h2>
          {data.insumosBajoMinimo.length === 0 ? (
            <p className="muted">Todo el inventario arriba del mínimo. 🎉</p>
          ) : (
            <table>
              <thead><tr><th>Insumo</th><th className="num">Stock</th><th className="num">Mínimo</th></tr></thead>
              <tbody>
                {data.insumosBajoMinimo.map((i) => (
                  <tr key={i.id}>
                    <td>{i.nombre}</td>
                    <td className="num low-stock">{i.stock} {i.unidad}</td>
                    <td className="num">{i.stockMinimo} {i.unidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
