import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Flame, User, Mail, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth.store'
import { apiFetch } from '@/lib/api'

interface RegisterResponse {
  access_token: string
  user: { id: string; username: string; email: string; isPremium: boolean; llamasBalance: number; charismaPts: number }
}

export function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setLoading(true)
    try {
      const res = await apiFetch<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setAuth(res.user, res.access_token)
      toast.success(`¡Bienvenido a BattleFlirt, ${res.user.username}! +100 🔥 LLAMAS de regalo`)
      navigate('/lobby')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2">
            <Flame className="w-10 h-10 text-battle" />
            <span className="text-3xl font-bold text-text">BattleFlirt</span>
            <Flame className="w-10 h-10 text-llamas" />
          </div>
          <p className="text-text-muted mt-2 text-sm">+100 LLAMAS de bienvenida</p>
        </div>

        <Card glow="llamas">
          <CardHeader>
            <CardTitle className="text-center">Crear cuenta</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Nombre de batalla</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <Input
                    placeholder="MiNombreEpico"
                    value={form.username}
                    onChange={update('username')}
                    className="pl-9"
                    minLength={3}
                    maxLength={32}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-muted">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <Input
                    type="email"
                    placeholder="tu@email.com"
                    value={form.email}
                    onChange={update('email')}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-text-muted">Contraseña (mín. 8 caracteres)</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={update('password')}
                    className="pl-9"
                    minLength={8}
                    required
                  />
                </div>
              </div>

              <Button type="submit" variant="llamas" size="lg" className="w-full" disabled={loading}>
                {loading ? 'Creando cuenta...' : '¡Unirme a la batalla! 🔥'}
              </Button>
            </form>

            <p className="text-center text-sm text-text-muted mt-4">
              ¿Ya tienes cuenta?{' '}
              <Link to="/login" className="text-battle hover:text-battle-dark font-semibold">
                Iniciar sesión
              </Link>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
