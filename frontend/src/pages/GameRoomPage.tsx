import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, Users, ArrowLeft, Heart, HeartOff, Wifi, WifiOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, LlamasBadge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore } from '@/stores/auth.store'
import { useRoomStore } from '@/stores/room.store'
import { useSocket } from '@/hooks/useSocket'
import { BottleGame } from '@/components/game/BottleGame'
import { TruthDareGame } from '@/components/game/TruthDareGame'
import { Battle1v1Game } from '@/components/game/Battle1v1Game'
import { LigaGame } from '@/components/game/LigaGame'
import { JuicioGame } from '@/components/game/JuicioGame'
import { OscuroGame } from '@/components/game/OscuroGame'
import { CartasGame } from '@/components/game/CartasGame'
import { TermometroGame } from '@/components/game/TermometroGame'
import { ActoresGame } from '@/components/game/ActoresGame'
import { UltimoPieGame } from '@/components/game/UltimoPieGame'
import { TodoNadaGame } from '@/components/game/TodoNadaGame'

interface Player {
  id: string
  username: string
  avatarUrl?: string
  llamasBalance: number
  isPremium: boolean
}

interface RoomJoinedPayload {
  roomId: string
  players: Player[]
  mode: string
  status: string
}

export function GameRoomPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { players, mode, status, setRoom, setPlayers, addPlayer, removePlayer, setStatus, reset } = useRoomStore()
  const { emit, on, isConnected } = useSocket()
  const [markedInterest, setMarkedInterest] = useState<Set<string>>(new Set())
  const [matchReveals, setMatchReveals] = useState<string[]>([])

  useEffect(() => {
    if (!code) return

    // Unirse a la sala via Socket
    emit<{ success: boolean; data?: RoomJoinedPayload; error?: string }>('room:join', { code })
      .then((res) => {
        if (!res.success || !res.data) {
          toast.error(res.error ?? 'No se pudo unir a la sala')
          navigate('/lobby')
          return
        }
        setRoom(res.data.roomId, code, res.data.mode as never)
        setPlayers(res.data.players)
      })
      .catch(() => {
        toast.error('Error de conexión')
        navigate('/lobby')
      })

    // Listeners
    const offJoined  = on<{ userId: string; username: string }>('room:player_joined', ({ userId, username }) => {
      addPlayer({ id: userId, username, llamasBalance: 0, isPremium: false })
      toast(`${username} entró a la sala 🎉`, { icon: '👋' })
    })
    const offLeft    = on<{ userId: string }>('room:player_left', ({ userId }) => {
      removePlayer(userId)
    })
    const offStarted = on<{ sessionId: string; mode: string }>('game:started', ({ mode: m }) => {
      setStatus('active')
      toast.success(`¡Comienza ${m}!`)
    })
    const offMatch   = on<{ matchedWith: string }>('room:match_reveal', ({ matchedWith }) => {
      const name = players.find(p => p.id === matchedWith)?.username ?? 'alguien'
      setMatchReveals(prev => [...prev, name])
      toast.success(`¡Match con ${name}! 💘`, { duration: 6000 })
    })
    const offLlamas  = on<{ userId: string; amount: number; newBalance: number }>('llamas:earned', ({ userId, amount, newBalance }) => {
      if (userId === user?.id) {
        useAuthStore.getState().updateBalance(newBalance)
        toast(`+${amount} 🔥 LLAMAS`, { icon: '🔥' })
      }
    })

    return () => {
      offJoined(); offLeft(); offStarted(); offMatch(); offLlamas()
      emit('room:leave').catch(() => null)
      reset()
    }
  }, [code])

  const handleMarkInterest = (targetId: string) => {
    if (markedInterest.has(targetId)) return
    emit('game:mark_interest', { targetId })
    setMarkedInterest(prev => new Set([...prev, targetId]))
    toast('Interés marcado 🤫 (secreto hasta el final)', { icon: '💫' })
  }

  const modeLabels: Record<string, string> = {
    bottle: '🍾 Pico Botella', 'truth-dare': '🎯 Verdad o Reto', 'battle-1v1': '⚔️ Batalla 1v1',
    liga: '🏆 Liga', juicio: '⚖️ El Juicio', oscuro: '🔞 Modo Oscuro',
    cartas: '🃏 Cartas', termometro: '🌡️ Termómetro', actores: '🎭 Actores',
    'ultimo-pie': '🏅 Último en Pie', 'todo-nada': '🎲 Todo o Nada',
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => navigate('/lobby')} className="text-text-muted hover:text-text">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col items-center">
            <span className="font-bold text-text text-sm">{modeLabels[mode ?? ''] ?? mode}</span>
            <span className="text-xs text-text-muted">Sala: {code}</span>
          </div>
          <div className="flex items-center gap-2">
            {isConnected
              ? <Wifi className="w-4 h-4 text-green-400" />
              : <WifiOff className="w-4 h-4 text-red-400 animate-pulse" />
            }
            <Badge variant={status === 'active' ? 'battle' : 'default'}>
              {status === 'waiting' ? 'Esperando' : status === 'active' ? 'En juego' : 'Finalizado'}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Jugadores */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-battle" /> Jugadores ({players.length})
              </CardTitle>
              <LlamasBadge amount={user?.llamasBalance ?? 0} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {players.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="relative">
                    <Avatar className="w-10 h-10 ring-2 ring-border">
                      <AvatarFallback>{p.username[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    {p.id !== user?.id && (
                      <button
                        onClick={() => handleMarkInterest(p.id)}
                        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center bg-surface border border-border hover:border-battle transition-colors"
                      >
                        {markedInterest.has(p.id)
                          ? <Heart className="w-3 h-3 text-battle fill-battle" />
                          : <HeartOff className="w-3 h-3 text-text-muted" />
                        }
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-text-muted max-w-[48px] truncate">{p.username}</span>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Área del juego */}
        <AnimatePresence mode="wait">
          {status === 'waiting' && (
            <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card glow="battle">
                <CardContent className="text-center py-8 space-y-3">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  >
                    <Flame className="w-12 h-12 text-battle mx-auto" />
                  </motion.div>
                  <p className="text-text font-semibold">Esperando jugadores...</p>
                  <p className="text-text-muted text-sm">El host iniciará la partida cuando estén listos</p>
                  <Button variant="outline" size="sm" onClick={() => emit('game:ready')}>
                    Estoy listo ✓
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {status === 'active' && (() => {
            const p = players
            const uid = user?.id ?? ''
            const isPremium = user?.isPremium ?? false
            const key = `game-${mode}`
            const wrap = (child: React.ReactNode) => (
              <motion.div key={key} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                {child}
              </motion.div>
            )
            switch (mode) {
              case 'bottle':       return wrap(<BottleGame players={p} currentUserId={uid} />)
              case 'truth-dare':   return wrap(<TruthDareGame players={p} currentUserId={uid} />)
              case 'battle-1v1':   return wrap(<Battle1v1Game players={p} currentUserId={uid} />)
              case 'liga':         return wrap(<LigaGame players={p} currentUserId={uid} />)
              case 'juicio':       return wrap(<JuicioGame players={p} currentUserId={uid} />)
              case 'oscuro':       return wrap(<OscuroGame players={p} currentUserId={uid} isPremium={isPremium} />)
              case 'cartas':       return wrap(<CartasGame players={p} currentUserId={uid} />)
              case 'termometro':   return wrap(<TermometroGame players={p} currentUserId={uid} />)
              case 'actores':      return wrap(<ActoresGame players={p} currentUserId={uid} />)
              case 'ultimo-pie':   return wrap(<UltimoPieGame players={p} currentUserId={uid} />)
              case 'todo-nada':    return wrap(<TodoNadaGame players={p} currentUserId={uid} />)
              default:             return wrap(
                <Card glow="battle">
                  <CardContent className="text-center py-8">
                    <p className="text-2xl mb-2">{modeLabels[mode ?? '']?.split(' ')[0]}</p>
                    <p className="text-text font-semibold">{modeLabels[mode ?? '']}</p>
                  </CardContent>
                </Card>
              )
            }
          })()}
        </AnimatePresence>

        {/* Match reveals */}
        <AnimatePresence>
          {matchReveals.map((name, i) => (
            <motion.div
              key={`${name}-${i}`}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Card glow="battle" className="border-battle animate-pulse-battle">
                <CardContent className="text-center py-6">
                  <p className="text-4xl mb-2">💘</p>
                  <p className="text-battle font-bold text-lg">¡Match con {name}!</p>
                  <p className="text-text-muted text-sm">El interés fue mutuo 🔥</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </main>
    </div>
  )
}
