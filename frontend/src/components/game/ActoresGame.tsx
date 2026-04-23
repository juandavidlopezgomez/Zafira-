import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Theater } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useSocket } from '@/hooks/useSocket'
import toast from 'react-hot-toast'

interface Player { id: string; username: string }
interface ActoresGameProps { players: Player[]; currentUserId: string }

type Phase = 'lobby' | 'acting' | 'guess' | 'vote' | 'result'

interface MyRole { role: string; description: string }
interface ActorResult {
  roles: Record<string, string>
  bestActor: { playerId: string; username: string }
  guessAccuracy: Record<string, number>
}

export function ActoresGame({ players, currentUserId }: ActoresGameProps) {
  const { emit } = useSocket()
  const [phase, setPhase] = useState<Phase>('lobby')
  const [myRole, setMyRole] = useState<MyRole | null>(null)
  const [myVoteBest, setMyVoteBest] = useState<string | null>(null)
  const [myGuesses, setMyGuesses] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ActorResult | null>(null)
  const [loading, setLoading] = useState(false)
  const isHost = true

  const startGame = async () => {
    setLoading(true)
    try {
      await emit('actores:assign_roles')
      const res = await emit<{ success: boolean; data: MyRole }>('actores:my_role')
      if (res.success) { setMyRole(res.data); setPhase('acting') }
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const voteBestActor = async (playerId: string) => {
    if (myVoteBest) return
    setMyVoteBest(playerId)
    await emit('actores:vote_best', { playerId })
    toast('Voto enviado 🎭', { icon: '✓' })
  }

  const submitGuesses = async () => {
    await emit('actores:guess_roles', { guesses: myGuesses })
    toast('¡Conjeturas enviadas!', { icon: '🎭' })
  }

  const reveal = async () => {
    const res = await emit<{ success: boolean; data: ActorResult }>('actores:reveal')
    if (res.success) { setResult(res.data); setPhase('result') }
  }

  const otherPlayers = players.filter(p => p.id !== currentUserId)

  return (
    <Card glow="battle">
      <CardContent className="pt-5 pb-6 space-y-5">
        <h2 className="text-lg font-bold text-text flex items-center gap-2">
          <Theater className="w-5 h-5 text-battle" /> Actores sin Guion
        </h2>

        <AnimatePresence mode="wait">
          {phase === 'lobby' && (
            <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4 py-4">
              <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="text-5xl">🎭</motion.div>
              <p className="text-text-muted text-sm">A cada jugador se le asigna un rol secreto.<br />Actúa sin decir quién eres.</p>
              {isHost
                ? <Button variant="battle" size="lg" className="w-full" onClick={startGame} disabled={loading}>
                    Asignar roles 🎭
                  </Button>
                : <p className="text-text-muted text-sm">Esperando al host...</p>}
            </motion.div>
          )}

          {phase === 'acting' && myRole && (
            <motion.div key="acting" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
              <div className="bg-battle/5 border border-battle/30 rounded-xl p-4 space-y-2">
                <p className="text-xs text-battle font-semibold text-center">Tu rol secreto</p>
                <p className="text-2xl font-black text-text text-center">{myRole.role}</p>
                <p className="text-text-muted text-xs text-center leading-relaxed">{myRole.description}</p>
              </div>
              <p className="text-xs text-text-muted text-center">¡Actúa! El grupo intentará adivinar quién eres.</p>
              {isHost && (
                <Button variant="outline" size="md" className="w-full" onClick={() => setPhase('guess')}>
                  Pasar a votación →
                </Button>
              )}
            </motion.div>
          )}

          {phase === 'guess' && (
            <motion.div key="guess" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <p className="text-xs text-text-muted text-center">¿Qué rol tiene cada jugador?</p>
              <div className="space-y-3">
                {otherPlayers.map(p => (
                  <div key={p.id} className="space-y-1">
                    <p className="text-xs text-text-muted font-semibold">{p.username}</p>
                    <input type="text" placeholder="¿Cuál es su rol?" value={myGuesses[p.id] ?? ''}
                      onChange={e => setMyGuesses(prev => ({ ...prev, [p.id]: e.target.value }))}
                      className="w-full h-9 rounded-lg border border-border bg-surface-light px-3 text-text text-sm" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="battle" size="md" className="flex-1" onClick={submitGuesses}>
                  Enviar 🎭
                </Button>
                {isHost && (
                  <Button variant="outline" size="md" className="flex-1" onClick={() => setPhase('vote')}>
                    Votar mejor actor →
                  </Button>
                )}
              </div>
            </motion.div>
          )}

          {phase === 'vote' && (
            <motion.div key="vote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <p className="text-xs text-text-muted text-center">¿Quién actuó mejor?</p>
              <div className="space-y-2">
                {otherPlayers.map((p, i) => (
                  <motion.button key={p.id} initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => voteBestActor(p.id)} disabled={!!myVoteBest}
                    className={`w-full p-3 rounded-xl border text-sm font-semibold transition-all text-left ${myVoteBest === p.id ? 'border-battle bg-battle/10 text-battle' : 'border-border bg-surface-light text-text hover:border-battle/40'}`}>
                    🎭 {p.username}
                  </motion.button>
                ))}
              </div>
              {myVoteBest && <p className="text-xs text-text-muted text-center">Votaste ✓</p>}
              {isHost && (
                <Button variant="outline" size="md" className="w-full" onClick={reveal}>Revelar todo ⚡</Button>
              )}
            </motion.div>
          )}

          {phase === 'result' && result && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
              <div className="text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="text-5xl mb-2">🏆</motion.div>
                <p className="text-xs text-text-muted">Mejor actor</p>
                <p className="text-battle font-black text-xl">{result.bestActor.username}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-text-muted font-semibold">Roles revelados</p>
                {players.map(p => (
                  <div key={p.id} className="flex items-center gap-2 p-2 bg-surface-light rounded-lg">
                    <span className="text-xs text-text-muted flex-1 truncate">{p.username}</span>
                    <span className="text-xs text-battle font-semibold">{result.roles[p.id] ?? '?'}</span>
                  </div>
                ))}
              </div>
              {isHost && (
                <Button variant="battle" size="md" className="w-full"
                  onClick={() => { setPhase('lobby'); setMyRole(null); setMyVoteBest(null); setMyGuesses({}); setResult(null) }}>
                  Nueva ronda →
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
