import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Swords, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { useSocket } from '@/hooks/useSocket'
import toast from 'react-hot-toast'

interface Player { id: string; username: string }

interface Battle1v1GameProps {
  players: Player[]
  currentUserId: string
}

interface BattleRound {
  roundId: string
  player1: string
  player2: string
  questionText: string
  roundNumber: number
}

interface BattleResult {
  winnerId: string
  votes: Record<string, number>
  scores: Record<string, number>
}

export function Battle1v1Game({ players, currentUserId }: Battle1v1GameProps) {
  const { emit } = useSocket()
  const [round, setRound] = useState<BattleRound | null>(null)
  const [result, setResult] = useState<BattleResult | null>(null)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [roundNum, setRoundNum] = useState(1)
  const [loading, setLoading] = useState(false)
  const isHost = true // TODO

  const p1 = players[0]
  const p2 = players[1]

  const startBattle = async () => {
    if (!p1 || !p2) { toast.error('Necesitas al menos 2 jugadores'); return }
    setLoading(true)
    setResult(null)
    setMyVote(null)
    try {
      const res = await emit<{ success: boolean; data: BattleRound }>('battle_1v1:start', {
        player1: p1.id, player2: p2.id, roundNumber: roundNum,
      })
      if (res.success) setRound(res.data)
    } catch { toast.error('Error iniciando batalla') }
    finally { setLoading(false) }
  }

  const vote = async (targetId: string) => {
    if (!round || myVote) return
    setMyVote(targetId)
    const res = await emit<{ success: boolean; data: BattleResult }>('battle_1v1:vote', {
      roundId: round.roundId, votedFor: targetId,
    })
    if (res.success) {
      setResult(res.data)
      setRoundNum(n => n + 1)
    }
  }

  const p1Name = players.find(p => p.id === round?.player1)?.username ?? p1?.username ?? '?'
  const p2Name = players.find(p => p.id === round?.player2)?.username ?? p2?.username ?? '?'
  const totalVotes = result ? Object.values(result.votes).reduce((a, b) => a + b, 0) : 0
  const p1Pct = totalVotes > 0 ? Math.round(((result?.votes[round?.player1 ?? ''] ?? 0) / totalVotes) * 100) : 50
  const p2Pct = 100 - p1Pct

  return (
    <Card glow="battle">
      <CardContent className="pt-5 pb-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text flex items-center gap-2">
            <Swords className="w-5 h-5 text-battle" /> Batalla 1v1
          </h2>
          <span className="text-xs text-text-muted">Ronda {roundNum}/3</span>
        </div>

        {/* Combatientes */}
        <div className="flex items-center justify-between gap-3">
          {[p1, p2].map((p, i) => p && (
            <motion.div key={p.id}
              animate={result?.winnerId === p.id ? { scale: [1, 1.1, 1] } : {}}
              className="flex-1 flex flex-col items-center gap-2">
              <Avatar className={`w-14 h-14 ring-2 ${result?.winnerId === p.id ? 'ring-battle shadow-[0_0_16px_4px_#FF2D5550]' : 'ring-border'}`}>
                <AvatarFallback className="text-lg">{p.username[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-semibold text-text">{p.username}</span>
              {result && (
                <span className="text-xs text-text-muted">{result.scores[p.id] ?? 0} pts</span>
              )}
            </motion.div>
          ))}
          <div className="text-2xl font-black text-text-muted">VS</div>
        </div>

        <AnimatePresence mode="wait">
          {!round && (
            <motion.div key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {isHost ? (
                <Button variant="battle" size="lg" className="w-full" onClick={startBattle} disabled={loading}>
                  {loading ? 'Preparando...' : '⚔️ ¡Iniciar Batalla!'}
                </Button>
              ) : (
                <p className="text-center text-text-muted text-sm py-4">El host iniciará la batalla...</p>
              )}
            </motion.div>
          )}

          {round && !result && (
            <motion.div key="voting" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="bg-surface-light border border-border rounded-xl p-4 text-center">
                <p className="text-text-muted text-xs mb-2">Pregunta de batalla:</p>
                <p className="text-text font-semibold">{round.questionText}</p>
              </div>
              {currentUserId !== round.player1 && currentUserId !== round.player2 ? (
                <div className="space-y-2">
                  <p className="text-xs text-text-muted text-center">¿Quién gana esta ronda?</p>
                  <div className="flex gap-2">
                    {[{ id: round.player1, name: p1Name }, { id: round.player2, name: p2Name }].map(p => (
                      <Button key={p.id} variant={myVote === p.id ? 'battle' : 'outline'} size="md"
                        className="flex-1" onClick={() => vote(p.id)} disabled={!!myVote}>
                        {p.name}
                      </Button>
                    ))}
                  </div>
                  {myVote && <p className="text-xs text-text-muted text-center">Voto registrado, esperando a todos...</p>}
                </div>
              ) : (
                <p className="text-center text-text-muted text-sm">¡Es tu batalla! El grupo vota por ti...</p>
              )}
            </motion.div>
          )}

          {result && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
              <div className="text-center">
                <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-1" />
                <p className="text-battle font-bold">
                  ¡{players.find(p => p.id === result.winnerId)?.username} gana la ronda!
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-text-muted">
                  <span>{p1Name} {p1Pct}%</span><span>{p2Pct}% {p2Name}</span>
                </div>
                <Progress value={p1Pct} variant="battle" />
              </div>
              {roundNum <= 3 && isHost && (
                <Button variant="battle" size="md" className="w-full" onClick={startBattle}>
                  Siguiente ronda →
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
