import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Target, SkipForward, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSocket } from '@/hooks/useSocket'

interface TruthDareGameProps {
  players: { id: string; username: string }[]
  currentUserId: string
}

type Choice = 'truth' | 'dare'
type Phase = 'choose' | 'challenge' | 'voting' | 'result'

interface ChallengeData {
  roundId: string
  challengeText: string
  canSkip: boolean
}

interface VoteResult {
  totalVotes: number
  completedVotes: number
}

export function TruthDareGame({ players, currentUserId }: TruthDareGameProps) {
  const { emit, on } = useSocket()
  const [phase, setPhase] = useState<Phase>('choose')
  const [choice, setChoice] = useState<Choice | null>(null)
  const [challenge, setChallenge] = useState<ChallengeData | null>(null)
  const [voteResult, setVoteResult] = useState<VoteResult | null>(null)
  const [myVote, setMyVote] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)

  const isMyTurn = true // TODO: derivar del estado global

  const handleChoose = async (c: Choice) => {
    setLoading(true)
    setChoice(c)
    try {
      const res = await emit<{ success: boolean; data: ChallengeData }>('truth_dare:choose', { choice: c })
      if (res.success) {
        setChallenge(res.data)
        setPhase('challenge')
      }
    } catch { toast.error('Error al obtener el reto') }
    finally { setLoading(false) }
  }

  const handleSkip = async () => {
    if (!challenge) return
    await emit('truth_dare:skip', { roundId: challenge.roundId })
    setPhase('choose')
    setChallenge(null)
    setChoice(null)
    toast('Reto saltado 🏃', { icon: '⏭' })
  }

  const handleVote = async (completed: boolean) => {
    if (!challenge || myVote !== null) return
    setMyVote(completed)
    const res = await emit<{ success: boolean; data: VoteResult }>('truth_dare:vote', {
      roundId: challenge.roundId,
      completed,
    })
    if (res.success) setVoteResult(res.data)
  }

  const choiceConfig = {
    truth: { label: 'Verdad', emoji: '💬', color: 'border-blue-400 bg-blue-400/10 text-blue-400' },
    dare:  { label: 'Reto',   emoji: '🎯', color: 'border-battle bg-battle/10 text-battle' },
  }

  return (
    <Card glow="battle">
      <CardContent className="pt-5 pb-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text flex items-center gap-2">
            <Target className="w-5 h-5 text-battle" /> Verdad o Reto
          </h2>
          {choice && (
            <Badge variant={choice === 'truth' ? 'default' : 'battle'}>
              {choiceConfig[choice].emoji} {choiceConfig[choice].label}
            </Badge>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* FASE: elegir */}
          {phase === 'choose' && isMyTurn && (
            <motion.div key="choose" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="space-y-3">
              <p className="text-text-muted text-sm text-center">¿Qué eliges?</p>
              <div className="grid grid-cols-2 gap-3">
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={() => handleChoose('truth')} disabled={loading}
                  className="p-4 rounded-xl border-2 border-blue-400/40 bg-blue-400/5 hover:border-blue-400 hover:bg-blue-400/10 transition-all text-center space-y-1">
                  <div className="text-3xl">💬</div>
                  <div className="text-blue-400 font-bold">Verdad</div>
                  <div className="text-xs text-text-muted">Di la verdad</div>
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }}
                  onClick={() => handleChoose('dare')} disabled={loading}
                  className="p-4 rounded-xl border-2 border-battle/40 bg-battle/5 hover:border-battle hover:bg-battle/10 transition-all text-center space-y-1">
                  <div className="text-3xl">🎯</div>
                  <div className="text-battle font-bold">Reto</div>
                  <div className="text-xs text-text-muted">Acepta el reto</div>
                </motion.button>
              </div>
            </motion.div>
          )}

          {phase === 'choose' && !isMyTurn && (
            <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-6 text-text-muted">
              <p>Esperando que alguien elija...</p>
            </motion.div>
          )}

          {/* FASE: reto activo */}
          {phase === 'challenge' && challenge && (
            <motion.div key="challenge" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="space-y-4">
              <div className={`p-4 rounded-xl border-2 ${choice ? choiceConfig[choice].color : ''}`}>
                <p className="text-center text-text font-semibold leading-relaxed">
                  {challenge.challengeText}
                </p>
              </div>

              {isMyTurn ? (
                <div className="flex gap-2">
                  {challenge.canSkip && (
                    <Button variant="outline" size="md" className="flex-1" onClick={handleSkip}>
                      <SkipForward className="w-4 h-4" /> Saltar
                    </Button>
                  )}
                  <Button variant="battle" size="md" className="flex-1"
                    onClick={() => setPhase('voting')}>
                    ¡Listo! El grupo vota
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-text-muted text-center">¿Completó el reto?</p>
                  <div className="flex gap-2">
                    <Button variant="surface" size="md" className="flex-1" onClick={() => handleVote(true)} disabled={myVote !== null}>
                      <CheckCircle className="w-4 h-4 text-green-400" /> Sí
                    </Button>
                    <Button variant="surface" size="md" className="flex-1" onClick={() => handleVote(false)} disabled={myVote !== null}>
                      <XCircle className="w-4 h-4 text-red-400" /> No
                    </Button>
                  </div>
                  {myVote !== null && <p className="text-xs text-text-muted text-center">Voto registrado ✓</p>}
                </div>
              )}
            </motion.div>
          )}

          {/* FASE: resultado */}
          {phase === 'voting' && voteResult && (
            <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-3">
              <div className="text-4xl">
                {voteResult.completedVotes > voteResult.totalVotes / 2 ? '✅' : '❌'}
              </div>
              <p className="text-text font-bold text-lg">
                {voteResult.completedVotes}/{voteResult.totalVotes} dijeron que sí
              </p>
              <Button variant="battle" size="md" className="w-full"
                onClick={() => { setPhase('choose'); setChallenge(null); setChoice(null); setVoteResult(null); setMyVote(null) }}>
                Siguiente turno →
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
