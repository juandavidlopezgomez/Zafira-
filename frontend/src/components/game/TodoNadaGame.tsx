import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dices, Flame, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LlamasBadge } from '@/components/ui/badge'
import { useSocket } from '@/hooks/useSocket'
import { useAuthStore } from '@/stores/auth.store'
import toast from 'react-hot-toast'

interface Player { id: string; username: string }
interface TodoNadaGameProps { players: Player[]; currentUserId: string }

type Phase = 'bet' | 'challenge' | 'voting' | 'result'

export function TodoNadaGame({ currentUserId }: TodoNadaGameProps) {
  const { emit } = useSocket()
  const user = useAuthStore(s => s.user)
  const updateBalance = useAuthStore(s => s.updateBalance)
  const [phase, setPhase] = useState<Phase>('bet')
  const [bet, setBet] = useState(10)
  const [roundId, setRoundId] = useState<string | null>(null)
  const [challenge, setChallenge] = useState('')
  const [myVote, setMyVote] = useState<boolean | null>(null)
  const [result, setResult] = useState<{ won: boolean; payout: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const isMyTurn = true

  const placeBet = async () => {
    if (bet < 1 || bet > 50) { toast.error('Apuesta entre 1 y 50 LLAMAS'); return }
    setLoading(true)
    try {
      const res = await emit<{ success: boolean; data: { roundId: string; challengeText: string }; error?: string }>(
        'todo_nada:bet', { amount: bet }
      )
      if (!res.success) { toast.error(res.error ?? 'Balance insuficiente'); return }
      setRoundId(res.data.roundId)
      setChallenge(res.data.challengeText)
      setPhase('challenge')
      updateBalance((user?.llamasBalance ?? 0) - bet)
    } catch { toast.error('Error al apostar') }
    finally { setLoading(false) }
  }

  const vote = async (completed: boolean) => {
    if (!roundId || myVote !== null) return
    setMyVote(completed)
    await emit('todo_nada:vote', { roundId, completed })
  }

  const resolveRound = async () => {
    if (!roundId) return
    const res = await emit<{ success: boolean; data: { won: boolean; payout: number } }>('todo_nada:resolve', { roundId })
    if (res.success) {
      setResult(res.data)
      setPhase('result')
      if (res.data.won) {
        updateBalance((user?.llamasBalance ?? 0) + res.data.payout)
        toast.success(`¡Ganaste ${res.data.payout} 🔥 LLAMAS!`)
      } else {
        toast.error(`Perdiste ${bet} LLAMAS`)
      }
    }
  }

  const BET_PRESETS = [5, 10, 25, 50]

  return (
    <Card glow="llamas">
      <CardContent className="pt-5 pb-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text flex items-center gap-2">
            <Dices className="w-5 h-5 text-llamas" /> Todo o Nada
          </h2>
          <LlamasBadge amount={user?.llamasBalance ?? 0} />
        </div>

        <AnimatePresence mode="wait">
          {phase === 'bet' && (
            <motion.div key="bet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <p className="text-text-muted text-sm text-center">Apuesta antes de ver el reto. Si lo completas, <span className="text-llamas font-bold">ganas el doble</span>.</p>
              <div className="grid grid-cols-4 gap-2">
                {BET_PRESETS.map(v => (
                  <button key={v} onClick={() => setBet(v)}
                    className={`py-2 rounded-xl border text-sm font-bold transition-all ${bet === v ? 'border-llamas bg-llamas/10 text-llamas' : 'border-border text-text-muted hover:border-llamas/40'}`}>
                    {v}🔥
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-text-muted text-sm">Personalizar:</span>
                <input type="number" min={1} max={50} value={bet} onChange={e => setBet(Number(e.target.value))}
                  className="flex-1 h-9 rounded-lg border border-border bg-surface-light px-3 text-text text-sm" />
              </div>
              {isMyTurn
                ? <Button variant="llamas" size="lg" className="w-full" onClick={placeBet} disabled={loading}>
                    <Flame className="w-4 h-4" /> Apostar {bet} LLAMAS
                  </Button>
                : <p className="text-center text-text-muted text-sm py-2">Esperando tu turno...</p>}
            </motion.div>
          )}

          {phase === 'challenge' && (
            <motion.div key="chal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
              <div className="bg-llamas/5 border border-llamas/30 rounded-xl p-4 text-center space-y-2">
                <p className="text-xs text-llamas font-semibold">Tu reto — Apostaste {bet} 🔥</p>
                <p className="text-text font-semibold leading-relaxed">{challenge}</p>
              </div>
              {isMyTurn ? (
                <Button variant="llamas" size="lg" className="w-full" onClick={() => setPhase('voting')}>
                  ¡Listo! El grupo decide
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-text-muted text-center">¿Lo completó?</p>
                  <div className="flex gap-2">
                    <Button variant="surface" size="md" className="flex-1" onClick={() => vote(true)} disabled={myVote !== null}>
                      ✅ Sí
                    </Button>
                    <Button variant="surface" size="md" className="flex-1" onClick={() => vote(false)} disabled={myVote !== null}>
                      ❌ No
                    </Button>
                  </div>
                  {myVote !== null && <p className="text-xs text-text-muted text-center">Votado ✓</p>}
                </div>
              )}
            </motion.div>
          )}

          {phase === 'voting' && (
            <motion.div key="vote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="text-center py-4">
                <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} className="text-4xl mb-2">⏳</motion.div>
                <p className="text-text-muted text-sm">El grupo está votando...</p>
              </div>
              {isMyTurn && (
                <Button variant="outline" size="md" className="w-full" onClick={resolveRound}>Ver resultado</Button>
              )}
            </motion.div>
          )}

          {phase === 'result' && result && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}
                className={`text-6xl ${result.won ? '' : 'grayscale'}`}>
                {result.won ? '🎰' : '💸'}
              </motion.div>
              <div>
                <p className={`text-2xl font-black ${result.won ? 'text-llamas' : 'text-red-400'}`}>
                  {result.won ? `+${result.payout} 🔥` : `-${bet} 🔥`}
                </p>
                <p className="text-text-muted text-sm mt-1">
                  {result.won ? '¡Lo lograste! Ganas el doble.' : 'El grupo decidió que no lo completaste.'}
                </p>
              </div>
              {result.won
                ? <TrendingUp className="w-8 h-8 text-llamas mx-auto" />
                : <TrendingDown className="w-8 h-8 text-red-400 mx-auto" />}
              <Button variant="llamas" size="md" className="w-full"
                onClick={() => { setPhase('bet'); setResult(null); setMyVote(null); setRoundId(null) }}>
                Volver a apostar
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
