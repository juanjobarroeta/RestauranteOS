import { NavLink, Outlet } from 'react-router-dom'
import { PREFERRED_MODULE, useAuth } from '../auth/AuthContext'

const NAV = [
  { to: '/', label: 'Inicio', icon: '🏠', end: true },
  { to: '/comandas', label: 'Comandas', icon: '🧾' },
  { to: '/cocina', label: 'Cocina', icon: '👨‍🍳' },
  { to: '/menu', label: 'Menú', icon: '🍽️' },
  { to: '/insumos', label: 'Insumos', icon: '📦' },
  { to: '/compras', label: 'Compras', icon: '🛒' },
]

export default function Layout() {
  const { user, companies, activeCompany, selectCompany, logout } = useAuth()
  const enabled = companies.filter((c) => c.modulos?.includes(PREFERRED_MODULE))

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">🍴</span>
          <span className="brand-name">RestauranteOS</span>
        </div>

        <label className="empresa-label">Empresa</label>
        <select
          className="empresa-select"
          value={activeCompany?.id ?? ''}
          onChange={(e) => selectCompany(e.target.value)}
        >
          {enabled.map((c) => (
            <option key={c.id} value={c.id}>{c.razonSocial}</option>
          ))}
        </select>

        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-name">{user?.name || user?.email}</div>
          <button className="btn btn-ghost" onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>

      <main className="content">
        {activeCompany && !activeCompany.modulos?.includes(PREFERRED_MODULE) ? (
          <div className="empty-state">
            <h2>Módulo no habilitado</h2>
            <p>
              La empresa «{activeCompany.razonSocial}» no tiene el módulo
              RESTAURANTE contratado. Pide a tu administrador habilitarlo en
              contabilidad-os.
            </p>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  )
}
