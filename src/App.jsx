import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Comandas from './pages/Comandas'
import Cocina from './pages/Cocina'
import Menu from './pages/Menu'
import Insumos from './pages/Insumos'
import Compras from './pages/Compras'

function RequireAuth({ children }) {
  const { isAuthenticated, booting } = useAuth()
  if (booting) return <div className="boot">Cargando…</div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="comandas" element={<Comandas />} />
            <Route path="cocina" element={<Cocina />} />
            <Route path="menu" element={<Menu />} />
            <Route path="insumos" element={<Insumos />} />
            <Route path="compras" element={<Compras />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
