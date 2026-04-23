import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useSocket } from '@/hooks/useSocket'
import { useAuthStore } from '@/stores/auth.store'
import toast from 'react-hot-toast'

interface Player { id: string; username: string }
interface LigaGameProps { players: Player[]; currentUserId: string }

type Phase = 'standings' | 'matchup' | 'result'

interface Standing { playerId: string; username: string; wins: number; losses: number; streak: number }
interface Matchup { matchId: string; p1: Player; p2: Player; challenge: string }

export function LigaGame({ players, currentUserId }: LigaGameProps) {
  const { emit } = useSocket()
  const user = useAuthStore(s => s.user)
  const isHost = true
  const [phase, setPhase] = useState<Phase>('standings')
  const [standings, setStandings] = useState<Standing[]>(
    players.map(p => ({ playerId: p.id, username: p.username, wins: 0, losses: 0, streak: 0 }))
  )
  const [matchup, setMatchup] = useState<Matchup | null>(null)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const nextRound = async () => {
    setLoading(true)
    try {
      const res = await emit<{ success: boolean; data: Matchup }>('liga:next_round')
      if (res.success) { setMatchup(res.data); setMyVote(null); setPhase('matchup') }
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const vote = async (winnerId: string) => {
    if (!matchup || myVote) return
    setMyVote(winnerId)
    await emit('liga:vote', { matchId: matchup.matchId, winnerId })
    toast('Voto enviado ⚔️', { icon: '✓' })
  }

  const resolveMatch = async () => {
    if (!matchup) return
    const res = await emit<{
      success: boolean;
      data: { winnerId: string; standings: Standing[] }
    }>('liga:submit_result', { matchId: matchup.matchId })
    if (res.success) {
      setStandings(res.data.standings)
      setPhase('result')
    }
  }

  const rankColor = (i: number) => i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-text-muted'
  const rankIcon = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`

  const sorted = [...standings].sort((a, b) => b.wins - a.wins || a.losses - b.losses)
  const isInMatchup = matchup && (matchup.p1.id === currentUserId || matchup.p2.id === currentUserId)

  return (
    <Card glow="battle">
      <CardContent className="pt-5 pb-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text flex items-center gap-2">
            <Trophy className="w-5 h-5 text-battle" /> Modo Liga
          </h2>
          <span className="text-xs text-text-muted">{players.length} jugadores</span>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'standings' && (
            <motion.div key="standings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <div className="space-y-2">
                {sorted.map((s, i) => (
                  <motion.div key={s.playerId} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${s.playerId === currentUserId ? 'border-battle/40 bg-battle/5' : 'border-border bg-surface-light'}`}>
                    <span className={`text-lg font-black w-8 text-center ${rankColor(i)}`}>{rankIcon(i)}</span>
                    <span className="flex-1 text-sm font-semibold text-text truncate">{s.username}</span>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span className="text-green-400 font-bold">{s.wins}V</span>
                      <span className="text-red-400">{s.losses}D</span>
                      {s.streak >= 2 && <span className="text-battle">🔥×{s.streak}</span>}
                    </div>
                  </motion.div>
                ))}
              </div>
              {isHost
                ? <Button variant="battle" size="lg" className="w-full" onClick={nextRound} disabled={loading}>
                    <Swords className="w-4 h-4" /> Siguiente enfrentamiento
                  </Button>
                : <p className="text-center text-text-muted text-sm">Esperando al host...</p>}
            </motion.div>
          )}

          {phase === 'matchup' && matchup && (
            <motion.div key="matchup" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
              <div className="bg-surface-light border border-border rounded-xl p-4 text-center space-y-1">
                <p className="text-xs text-text-muted">Reto</p>
                <p className="text-text font-semibold leading-relaxed">{matchup.challenge}</p>
              </div>
              <div className="grid grid-cols-3 items-center gap-2">
                <div className="text-center">
                  <div className={`text-sm font-bold truncate ${matchup.p1.id === currentUserId ? 'text-battle' : 'text-text'}`}>{matchup.p1.username}</div>
                  {!isInMatchup && (
                    <button onClick={() => vote(matchup.p1.id)} disabled={!!myVote}
                      className={`mt-2 w-full py-2 rounded-lg border text-xs font-bold transition-all ${myVote === matchup.p1.id ? 'border-battle bg-battle/10 text-battle' : 'border-border text-text-muted hover:border-battle/40'}`}>
                      Votar ✓
                    </button>
                  )}
                </div>
                <div className="text-center text-battle font-black text-xl">VS</div>
                <div className="text-center">
                  <div className={`text-sm font-bold truncate ${matchup.p2.id === currentUserId ? 'text-battle' : 'text-text'}`}>{matchup.p2.username}</div>
                  {!isInMatchup && (
                    <button onClick={() => vote(matchup.p2.id)} disabled={!!myVote}
                      className={`mt-2 w-full py-2 rounded-lg border text-xs font-bold transition-all ${myVote === matchup.p2.id ? 'border-battle bg-battle/10 text-battle' : 'border-border text-text-muted hover:border-battle/40'}`}>
                      Votar ✓
                    </button>
                  )}
                </div>
              </div>
              {isInMatchup && <p className="text-xs text-text-muted text-center py-2">¡Eres parte de este enfrentamiento! El grupo vota.</p>}
              {myVote && !isInMatchup && <p className="text-xs text-text-muted text-center">Votado ✓</p>}
              {isHost && (
                <Button variant="outline" size="md" className="w-full" onClick={resolveMatch}>Resolver ⚡</Button>
              )}
            </motion.div>
          )}

          {phase === 'result' && matchup && (
            <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="text-center py-2">
                <p className="text-text-muted text-xs mb-1">Ranking actualizado</p>
              </div>
              <div className="space-y-2">
                {sorted.map((s, i) => (
                  <div key={s.playerId} className="flex items-center gap-3 p-2 rounded-lg bg-surface-light">
                    <span className={`text-sm font-black w-6 text-center ${rankColor(i)}`}>{rankIcon(i)}</span>
                    <span className="flex-1 text-sm text-text truncate">{s.username}</span>
                    <span className="text-xs text-green-400 font-bold">{s.wins}V</span>
                    <span className="text-xs text-red-400">{s.losses}D</span>
                  </div>
                ))}
              </div>
              {isHost && (
                <Button variant="battle" size="lg" className="w-full" onClick={() => { setPhase('standings'); setMatchup(null) }}>
                  Continuar Liga →
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
