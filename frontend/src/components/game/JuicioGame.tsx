import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Scale, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useSocket } from '@/hooks/useSocket'
import toast from 'react-hot-toast'

interface Player { id: string; username: string }

interface JuicioGameProps {
  players: Player[]
  currentUserId: string
}

type Phase = 'select' | 'predict' | 'vote' | 'reveal'

interface JuicioSession {
  sessionId: string
  accusedId: string
  question: string
}

interface JuicioResult {
  distribution: Record<string, number>
  accusedPredictionCorrect: boolean
}

const OPTIONS = ['A', 'B', 'C']
const OPTION_LABELS: Record<string, string> = {
  A: 'Totalmente de acuerdo',
  B: 'Más o menos',
  C: 'Para nada',
}

export function JuicioGame({ players, currentUserId }: JuicioGameProps) {
  const { emit } = useSocket()
  const [phase, setPhase] = useState<Phase>('select')
  const [accused, setAccused] = useState<Player | null>(null)
  const [session, setSession] = useState<JuicioSession | null>(null)
  const [prediction, setPrediction] = useState<string | null>(null)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [result, setResult] = useState<JuicioResult | null>(null)
  const [loading, setLoading] = useState(false)
  const isHost = true

  const startJuicio = async (player: Player) => {
    setLoading(true)
    setAccused(player)
    try {
      const res = await emit<{ success: boolean; data: JuicioSession }>('juicio:start', { accusedId: player.id })
      if (res.success) { setSession(res.data); setPhase('predict') }
    } catch { toast.error('Error iniciando El Juicio') }
    finally { setLoading(false) }
  }

  const submitPrediction = async () => {
    if (!session || !prediction) return
    await emit('juicio:predict', { sessionId: session.sessionId, prediction })
    setPhase('vote')
  }

  const vote = async (option: string) => {
    if (!session || myVote) return
    setMyVote(option)
    await emit('juicio:vote', { sessionId: session.sessionId, option })
  }

  const reveal = async () => {
    if (!session) return
    const res = await emit<{ success: boolean; data: JuicioResult }>('juicio:reveal', { sessionId: session.sessionId })
    if (res.success) { setResult(res.data); setPhase('reveal') }
  }

  const isAccused = accused?.id === currentUserId
  const maxVotes = result ? Math.max(...Object.values(result.distribution)) : 0
  const winnerOption = result ? Object.entries(result.distribution).sort((a,b) => b[1]-a[1])[0]?.[0] : null

  return (
    <Card glow="battle">
      <CardContent className="pt-5 pb-6 space-y-5">
        <h2 className="text-lg font-bold text-text flex items-center gap-2">
          <Scale className="w-5 h-5 text-battle" /> El Juicio
        </h2>

        <AnimatePresence mode="wait">
          {phase === 'select' && (
            <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <p className="text-text-muted text-sm">Selecciona al juzgado:</p>
              <div className="grid grid-cols-3 gap-2">
                {players.map(p => (
                  <motion.button key={p.id} whileTap={{ scale: 0.95 }}
                    onClick={() => isHost && startJuicio(p)} disabled={loading}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border bg-surface hover:border-battle/50 transition-all">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback>{p.username[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-text-muted">{p.username}</span>
                  </motion.button>
                ))}
              </div>
              {!isHost && <p className="text-center text-text-muted text-sm">El host seleccionará al juzgado</p>}
            </motion.div>
          )}

          {phase === 'predict' && session && (
            <motion.div key="predict" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="bg-surface-light border border-border rounded-xl p-4 text-center">
                <p className="text-xs text-text-muted mb-2">El juzgado: <span className="text-battle font-semibold">{accused?.username}</span></p>
                <p className="text-text font-semibold">{session.question}</p>
              </div>
              {isAccused ? (
                <div className="space-y-3">
                  <p className="text-xs text-text-muted text-center">¿Qué crees que va a responder el grupo?</p>
                  <div className="space-y-2">
                    {OPTIONS.map(o => (
                      <button key={o} onClick={() => setPrediction(o)}
                        className={`w-full p-3 rounded-xl border text-left text-sm transition-all ${prediction === o ? 'border-battle bg-battle/10 text-battle' : 'border-border bg-surface text-text-muted hover:border-battle/40'}`}>
                        <span className="font-bold mr-2">{o}.</span>{OPTION_LABELS[o]}
                      </button>
                    ))}
                  </div>
                  <Button variant="battle" size="lg" className="w-full" onClick={submitPrediction} disabled={!prediction}>
                    Enviar predicción →
                  </Button>
                </div>
              ) : (
                <p className="text-center text-text-muted text-sm py-4">
                  {accused?.username} está haciendo su predicción...
                </p>
              )}
            </motion.div>
          )}

          {phase === 'vote' && session && (
            <motion.div key="vote" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="bg-surface-light border border-border rounded-xl p-4 text-center">
                <p className="text-text font-semibold">{session.question}</p>
              </div>
              {!isAccused ? (
                <div className="space-y-2">
                  <p className="text-xs text-text-muted text-center">Vota tu respuesta:</p>
                  {OPTIONS.map(o => (
                    <button key={o} onClick={() => vote(o)} disabled={!!myVote}
                      className={`w-full p-3 rounded-xl border text-left text-sm transition-all ${myVote === o ? 'border-battle bg-battle/10 text-battle' : 'border-border bg-surface text-text-muted hover:border-battle/40'} ${myVote && myVote !== o ? 'opacity-50' : ''}`}>
                      <span className="font-bold mr-2">{o}.</span>{OPTION_LABELS[o]}
                    </button>
                  ))}
                  {myVote && <p className="text-xs text-text-muted text-center">Voto registrado ✓</p>}
                </div>
              ) : (
                <p className="text-center text-text-muted text-sm py-4">El grupo está votando...</p>
              )}
              {isHost && (
                <Button variant="outline" size="md" className="w-full" onClick={reveal}>
                  Revelar resultados ⚖️
                </Button>
              )}
            </motion.div>
          )}

          {phase === 'reveal' && result && session && (
            <motion.div key="reveal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
              <div className="text-center space-y-2">
                <p className="text-2xl">{result.accusedPredictionCorrect ? '🎯' : '❌'}</p>
                <p className={`font-bold text-lg ${result.accusedPredictionCorrect ? 'text-green-400' : 'text-red-400'}`}>
                  {result.accusedPredictionCorrect ? '¡Predicción correcta! +20 LLAMAS' : 'El grupo te sorprendió'}
                </p>
              </div>
              <div className="space-y-2">
                {OPTIONS.map(o => {
                  const count = result.distribution[o] ?? 0
                  const pct = maxVotes > 0 ? Math.round((count / maxVotes) * 100) : 0
                  return (
                    <div key={o} className={`space-y-1 ${winnerOption === o ? 'text-battle' : 'text-text-muted'}`}>
                      <div className="flex justify-between text-xs">
                        <span><span className="font-bold">{o}.</span> {OPTION_LABELS[o]}</span>
                        <span>{count} votos {winnerOption === o && <CheckCircle className="inline w-3 h-3" />}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <motion.div className={`h-full rounded-full ${winnerOption === o ? 'bg-battle' : 'bg-muted'}`}
                          initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.2 * OPTIONS.indexOf(o) }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <Button variant="battle" size="md" className="w-full"
                onClick={() => { setPhase('select'); setSession(null); setResult(null); setPrediction(null); setMyVote(null) }}>
                Siguiente ronda →
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
