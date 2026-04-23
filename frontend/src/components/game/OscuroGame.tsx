import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Moon, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useSocket } from '@/hooks/useSocket'
import toast from 'react-hot-toast'

interface Player { id: string; username: string }
interface OscuroGameProps { players: Player[]; currentUserId: string; isPremium?: boolean }

type Phase = 'lobby' | 'challenge' | 'reaction'

interface DarkChallenge { challengeId: string; text: string; intensity: number }

const REACTIONS = ['🔥', '😈', '💀', '🤭', '👀', '🙈']

export function OscuroGame({ isPremium = false }: OscuroGameProps) {
  const { emit } = useSocket()
  const [phase, setPhase] = useState<Phase>('lobby')
  const [challenge, setChallenge] = useState<DarkChallenge | null>(null)
  const [reaction, setReaction] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const getChallenge = async () => {
    setLoading(true)
    try {
      const res = await emit<{ success: boolean; data: DarkChallenge; error?: string }>('oscuro:get_challenge')
      if (!res.success) { toast.error(res.error ?? 'Solo para mayores de 18+ Premium'); return }
      setChallenge(res.data)
      setPhase('challenge')
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const sendReaction = async (emoji: string) => {
    if (!challenge || reaction) return
    setReaction(emoji)
    await emit('oscuro:react', { challengeId: challenge.challengeId, reaction: emoji })
    toast(`Reaccionaste ${emoji}`, { icon: '✓' })
    setTimeout(() => setPhase('reaction'), 300)
  }

  const intensityColor = (v: number) => v <= 2 ? 'text-yellow-400' : v <= 4 ? 'text-orange-400' : 'text-red-500'
  const intensityLabel = (v: number) => v <= 2 ? 'Atrevido' : v <= 4 ? 'Explosivo' : '💀 Sin límites'

  if (!isPremium) {
    return (
      <Card>
        <CardContent className="pt-5 pb-6 text-center space-y-4">
          <Moon className="w-10 h-10 text-purple-400 mx-auto" />
          <div>
            <h2 className="text-lg font-bold text-text">Modo Oscuro</h2>
            <p className="text-text-muted text-sm mt-1">Exclusivo para Premium 18+</p>
          </div>
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 space-y-1">
            <Lock className="w-5 h-5 text-purple-400 mx-auto" />
            <p className="text-xs text-purple-300">Activa Premium para desbloquear los retos más atrevidos</p>
          </div>
          <Button variant="battle" size="lg" className="w-full bg-purple-600 hover:bg-purple-700 border-purple-500"
            onClick={() => window.open('/premium', '_blank')}>
            Ir a Premium ✨
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="pt-5 pb-6 space-y-5" style={{ background: 'linear-gradient(135deg, #1a0a2e 0%, #12121A 100%)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Moon className="w-5 h-5 text-purple-400" /> Modo Oscuro
          </h2>
          <span className="text-xs text-purple-400 font-semibold">18+ • Premium</span>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'lobby' && (
            <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-5 py-4">
              <motion.div animate={{ rotate: [0, -5, 5, 0], scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 3 }}
                className="text-6xl">😈</motion.div>
              <p className="text-purple-200 text-sm">Retos solo para los más valientes.<br />¿Te atreves?</p>
              <Button size="lg" className="w-full bg-purple-700 hover:bg-purple-600 text-white border border-purple-500"
                onClick={getChallenge} disabled={loading}>
                🌑 Ver reto oscuro
              </Button>
            </motion.div>
          )}

          {phase === 'challenge' && challenge && (
            <motion.div key="challenge" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5">
              <motion.div className="rounded-2xl p-5 text-center space-y-3"
                style={{ background: 'rgba(88, 28, 135, 0.2)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                <div className="flex justify-center gap-1">
                  {Array.from({ length: challenge.intensity }).map((_, i) => (
                    <span key={i} className="text-xs">🔥</span>
                  ))}
                </div>
                <p className={`text-xs font-bold ${intensityColor(challenge.intensity)}`}>
                  {intensityLabel(challenge.intensity)}
                </p>
                <p className="text-white font-semibold leading-relaxed text-base">{challenge.text}</p>
              </motion.div>

              <div className="space-y-2">
                <p className="text-xs text-purple-300 text-center">¿Cómo reaccionas?</p>
                <div className="grid grid-cols-6 gap-2">
                  {REACTIONS.map(r => (
                    <motion.button key={r} whileTap={{ scale: 0.85 }} onClick={() => sendReaction(r)}
                      disabled={!!reaction}
                      className={`text-2xl py-2 rounded-xl border transition-all ${reaction === r ? 'border-purple-400 bg-purple-400/20' : 'border-purple-900 hover:border-purple-600 bg-purple-900/20'}`}>
                      {r}
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {phase === 'reaction' && challenge && (
            <motion.div key="reaction" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4 py-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}
                className="text-6xl">{reaction}</motion.div>
              <p className="text-purple-200 text-sm">El grupo ha reaccionado...</p>
              <Button size="md" className="w-full bg-purple-700 hover:bg-purple-600 text-white border border-purple-500"
                onClick={() => { setPhase('lobby'); setChallenge(null); setReaction(null) }}>
                Siguiente reto 🌑
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
