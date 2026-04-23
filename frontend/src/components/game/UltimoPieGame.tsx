import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Skull } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useSocket } from '@/hooks/useSocket'
import toast from 'react-hot-toast'

interface Player { id: string; username: string }
interface UltimoPieGameProps { players: Player[]; currentUserId: string }

type Phase = 'lobby' | 'voting' | 'salvation' | 'eliminated' | 'winner'

interface EliminationRound {
  roundId: string
  players: Player[]
  eliminationTarget?: Player
  salvationChallenge?: string
}

export function UltimoPieGame({ players: initialPlayers, currentUserId }: UltimoPieGameProps) {
  const { emit } = useSocket()
  const [phase, setPhase] = useState<Phase>('lobby')
  const [round, setRound] = useState<EliminationRound | null>(null)
  const [activePlayers, setActivePlayers] = useState<Player[]>(initialPlayers)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [isSurviving, setIsSurviving] = useState(true)
  const [loading, setLoading] = useState(false)
  const isHost = true

  const startElimination = async () => {
    setLoading(true)
    try {
      const res = await emit<{ success: boolean; data: EliminationRound }>('ultimo_pie:start')
      if (res.success) { setRound(res.data); setMyVote(null); setPhase('voting') }
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const voteEliminate = async (targetId: string) => {
    if (!round || myVote || targetId === currentUserId) return
    setMyVote(targetId)
    await emit('ultimo_pie:vote', { roundId: round.roundId, targetId })
    toast('Voto enviado 💀', { icon: '✓' })
  }

  const resolveElimination = async () => {
    if (!round) return
    const res = await emit<{
      success: boolean;
      data: { eliminatedId: string; salvationChallenge: string; roundId: string }
    }>('ultimo_pie:resolve', { roundId: round.roundId })

    if (res.success) {
      const eliminated = activePlayers.find(p => p.id === res.data.eliminatedId)
      if (eliminated) {
        setRound(prev => prev ? { ...prev, eliminationTarget: eliminated, salvationChallenge: res.data.salvationChallenge } : null)
      }
      if (res.data.eliminatedId === currentUserId) {
        setIsSurviving(false)
        setPhase('salvation')
      } else {
        setPhase('salvation')
      }
    }
  }

  const completeSalvation = async (survived: boolean) => {
    if (!round?.eliminationTarget) return
    await emit('ultimo_pie:salvation', { roundId: round.roundId, survived })

    if (!survived) {
      setActivePlayers(prev => prev.filter(p => p.id !== round.eliminationTarget!.id))
      toast.error(`${round.eliminationTarget.username} eliminado/a`)
    } else {
      toast.success('¡Salvación completada! Sigue en pie.')
    }

    if (activePlayers.length <= 2) {
      setPhase('winner')
    } else {
      setPhase('lobby')
      setRound(null)
      setIsSurviving(true)
    }
  }

  const isEliminated = round?.eliminationTarget?.id === currentUserId

  return (
    <Card glow="battle">
      <CardContent className="pt-5 pb-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text flex items-center gap-2">
            <Shield className="w-5 h-5 text-battle" /> El Último en Pie
          </h2>
          <span className="text-xs text-battle font-bold">{activePlayers.length} en pie</span>
        </div>

        <div className="flex flex-wrap gap-1">
          {activePlayers.map(p => (
            <span key={p.id} className={`text-xs px-2 py-1 rounded-full border ${p.id === currentUserId ? 'border-battle text-battle bg-battle/10' : 'border-border text-text-muted'}`}>
              {p.username}
            </span>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {phase === 'lobby' && (
            <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4 py-4">
              <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="text-5xl">⚔️</motion.div>
              <p className="text-text-muted text-sm">El grupo vota quién se va. El eliminado puede salvarse con un reto.</p>
              {isHost
                ? <Button variant="battle" size="lg" className="w-full" onClick={startElimination} disabled={loading || activePlayers.length < 3}>
                    <Skull className="w-4 h-4" /> Iniciar votación
                  </Button>
                : <p className="text-text-muted text-sm">Esperando al host...</p>}
            </motion.div>
          )}

          {phase === 'voting' && (
            <motion.div key="voting" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <p className="text-xs text-text-muted text-center">¿Quién sale de la ronda?</p>
              <div className="space-y-2">
                {activePlayers.filter(p => p.id !== currentUserId).map((p, i) => (
                  <motion.button key={p.id} initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => voteEliminate(p.id)} disabled={!!myVote}
                    className={`w-full p-3 rounded-xl border text-sm font-semibold transition-all text-left ${myVote === p.id ? 'border-battle bg-battle/10 text-battle' : 'border-border bg-surface-light text-text hover:border-battle/40'}`}>
                    💀 {p.username}
                  </motion.button>
                ))}
              </div>
              {myVote && <p className="text-xs text-text-muted text-center">Votaste ✓</p>}
              {isHost && (
                <Button variant="outline" size="md" className="w-full" onClick={resolveElimination}>Resolver ⚡</Button>
              )}
            </motion.div>
          )}

          {phase === 'salvation' && round?.eliminationTarget && (
            <motion.div key="salvation" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
              {isEliminated ? (
                <>
                  <div className="text-center">
                    <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="text-5xl mb-2">😰</motion.div>
                    <p className="text-battle font-bold">¡Fuiste nominado/a!</p>
                    <p className="text-text-muted text-xs mt-1">Completa el reto para sobrevivir</p>
                  </div>
                  <div className="bg-battle/5 border border-battle/30 rounded-xl p-4 text-center">
                    <p className="text-xs text-battle font-semibold mb-1">Tu reto de salvación</p>
                    <p className="text-text font-semibold">{round.salvationChallenge}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="battle" size="md" className="flex-1" onClick={() => completeSalvation(true)}>
                      ✅ Lo completé
                    </Button>
                    <Button variant="surface" size="md" className="flex-1" onClick={() => completeSalvation(false)}>
                      ❌ Me rindo
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center space-y-2">
                    <p className="text-text font-semibold">{round.eliminationTarget.username}</p>
                    <p className="text-text-muted text-sm">está intentando salvarse...</p>
                    <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} className="text-4xl">⏳</motion.div>
                  </div>
                  {isHost && (
                    <div className="space-y-2">
                      <p className="text-xs text-text-muted text-center">¿Lo completó?</p>
                      <div className="flex gap-2">
                        <Button variant="surface" size="md" className="flex-1" onClick={() => completeSalvation(true)}>✅ Sí</Button>
                        <Button variant="surface" size="md" className="flex-1" onClick={() => completeSalvation(false)}>❌ No</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {phase === 'winner' && (
            <motion.div key="winner" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4 py-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="text-6xl">🏆</motion.div>
              <div>
                <p className="text-text-muted text-xs mb-1">¡El último en pie!</p>
                {activePlayers.length === 1 && (
                  <p className="text-battle font-black text-2xl">{activePlayers[0].username}</p>
                )}
              </div>
              {isHost && (
                <Button variant="battle" size="md" className="w-full"
                  onClick={() => { setPhase('lobby'); setActivePlayers(initialPlayers); setRound(null) }}>
                  Nueva partida →
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
