import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PREFERRED_MODULE, useAuth } from '../auth/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await login({ email, password })
      const hasModule = data.companies?.some((c) => c.modulos?.includes(PREFERRED_MODULE))
      if (!hasModule) {
        setError('Ninguna de tus empresas tiene el módulo Restaurante habilitado.')
        return
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.status === 401 ? 'Correo o contraseña incorrectos' : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand login-brand">
          <span className="brand-logo">🍴</span>
          <span className="brand-name">RestauranteOS</span>
        </div>
        <p className="login-sub">
          Inicia sesión con tu cuenta de contabilidad-os
        </p>
        <label>Correo</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <label>Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
