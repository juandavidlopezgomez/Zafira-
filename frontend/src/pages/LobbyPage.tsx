import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Flame, Plus, QrCode, LogOut, Shield, Zap,
  RotateCcw, Users, Crown, MessageCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, LlamasBadge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore } from '@/stores/auth.store'
import { apiFetch } from '@/lib/api'

type GameMode = 'bottle' | 'truth-dare' | 'battle-1v1' | 'liga' | 'juicio' | 'oscuro' | 'cartas' | 'termometro' | 'actores' | 'ultimo-pie' | 'todo-nada'

const MODES: { id: GameMode; label: string; emoji: string; premium?: boolean }[] = [
  { id: 'bottle',      label: 'Pico Botella',       emoji: '🍾' },
  { id: 'truth-dare',  label: 'Verdad o Reto',       emoji: '🎯' },
  { id: 'battle-1v1',  label: 'Batalla 1v1',         emoji: '⚔️' },
  { id: 'liga',        label: 'Modo Liga',            emoji: '🏆' },
  { id: 'juicio',      label: 'El Juicio',            emoji: '⚖️' },
  { id: 'oscuro',      label: 'Modo Oscuro',          emoji: '🔞', premium: true },
  { id: 'cartas',      label: 'Cartas sobre la Mesa', emoji: '🃏' },
  { id: 'termometro',  label: 'Termómetro Humano',   emoji: '🌡️' },
  { id: 'actores',     label: 'Actores sin Guion',    emoji: '🎭' },
  { id: 'ultimo-pie',  label: 'El Último en Pie',     emoji: '🏅' },
  { id: 'todo-nada',   label: 'Todo o Nada',          emoji: '🎲' },
]

interface CreateRoomResponse { roomId: string; code: string; qrUrl: string }

export function LobbyPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [selectedMode, setSelectedMode] = useState<GameMode>('bottle')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreateRoom = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<CreateRoomResponse>('/rooms', {
        method: 'POST',
        body: JSON.stringify({ mode: selectedMode }),
      })
      toast.success(`Sala creada: ${res.code}`)
      navigate(`/sala/${res.code}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error creando sala')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) return
    setLoading(true)
    try {
      await apiFetch(`/rooms/${joinCode.toUpperCase()}/join`, { method: 'POST' })
      navigate(`/sala/${joinCode.toUpperCase()}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Código inválido o sala llena')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-surface/80 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-6 h-6 text-battle" />
            <span className="font-bold text-text">BattleFlirt</span>
          </div>
          <div className="flex items-center gap-3">
            {user?.isPremium && (
              <Badge variant="premium"><Shield className="w-3 h-3" /> Premium</Badge>
            )}
            <LlamasBadge amount={user?.llamasBalance ?? 0} />
            <Avatar className="w-8 h-8">
              <AvatarFallback>{user?.username?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
            </Avatar>
            <button onClick={logout} className="text-text-muted hover:text-text">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-5 pb-20">
        {/* Bienvenida */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="pt-2">
          <h1 className="text-2xl font-bold text-text">
            ¡Hola, <span className="text-battle">{user?.username}</span>! 🔥
          </h1>
          <p className="text-text-muted text-sm">¿Listo para la batalla?</p>
        </motion.div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Users className="w-5 h-5" />, label: 'Arena', onClick: () => toast('Próximamente: Arena 🏟️') },
            { icon: <MessageCircle className="w-5 h-5" />, label: 'El Hilo', onClick: () => toast('Próximamente: El Hilo 🧵') },
            { icon: <Crown className="w-5 h-5" />, label: 'Ranking', onClick: () => toast('Próximamente: Rankings 👑') },
          ].map(({ icon, label, onClick }) => (
            <Card key={label} hover className="cursor-pointer" onClick={onClick}>
              <CardContent className="flex flex-col items-center gap-1 py-3 px-2">
                <div className="text-battle">{icon}</div>
                <span className="text-xs text-text-muted">{label}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs crear / unirse */}
        <Card>
          <CardContent className="pt-4 pb-4">
            {/* Tab switcher */}
            <div className="flex rounded-lg overflow-hidden border border-border mb-4">
              {(['create', 'join'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                    tab === t ? 'bg-battle text-white' : 'bg-surface text-text-muted hover:text-text'
                  }`}
                >
                  {t === 'create' ? <span className="flex items-center justify-center gap-1"><Plus className="w-4 h-4" /> Crear sala</span>
                                  : <span className="flex items-center justify-center gap-1"><QrCode className="w-4 h-4" /> Unirse</span>}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {tab === 'create' ? (
                <motion.div key="create" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                  <p className="text-xs text-text-muted">Selecciona el modo de juego:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {MODES.map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => {
                          if (mode.premium && !user?.isPremium) {
                            toast.error('Este modo requiere Premium 🛡️')
                            return
                          }
                          setSelectedMode(mode.id)
                        }}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-all ${
                          selectedMode === mode.id
                            ? 'border-battle bg-battle/10 text-battle'
                            : 'border-border bg-surface text-text-muted hover:border-battle/40'
                        }`}
                      >
                        <span>{mode.emoji}</span>
                        <span className="flex-1 text-left leading-tight">{mode.label}</span>
                        {mode.premium && <Shield className="w-3 h-3 text-yellow-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                  <Button variant="battle" size="lg" className="w-full" onClick={handleCreateRoom} disabled={loading}>
                    {loading ? 'Creando...' : `Crear sala — ${MODES.find(m => m.id === selectedMode)?.emoji} ${MODES.find(m => m.id === selectedMode)?.label}`}
                  </Button>
                </motion.div>
              ) : (
                <motion.div key="join" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                  <p className="text-xs text-text-muted">Introduce el código de sala (6 caracteres):</p>
                  <Input
                    placeholder="AB12CD"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="text-center text-xl font-bold tracking-widest uppercase"
                  />
                  <Button variant="battle" size="lg" className="w-full" onClick={handleJoinRoom} disabled={loading || joinCode.length < 6}>
                    {loading ? 'Uniéndome...' : 'Unirme a la sala ⚡'}
                  </Button>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-text-muted">o</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <Button variant="outline" size="md" className="w-full" onClick={() => toast('Escáner QR próximamente 📷')}>
                    <QrCode className="w-4 h-4" /> Escanear QR
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Stats rápidas */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Carisma', value: user?.charismaPts ?? 0, icon: <Zap className="w-4 h-4 text-battle mx-auto" /> },
            { label: 'LLAMAS', value: user?.llamasBalance ?? 0, icon: <Flame className="w-4 h-4 text-llamas mx-auto" /> },
            { label: 'Partidas', value: '—', icon: <RotateCcw className="w-4 h-4 text-text-muted mx-auto" /> },
          ].map(({ label, value, icon }) => (
            <Card key={label}>
              <CardContent className="py-3">
                {icon}
                <div className="text-lg font-bold text-text mt-1">{value}</div>
                <div className="text-xs text-text-muted">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
