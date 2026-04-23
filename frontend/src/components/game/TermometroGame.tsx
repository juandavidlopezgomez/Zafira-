import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Thermometer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useSocket } from '@/hooks/useSocket'
import toast from 'react-hot-toast'

interface Player { id: string; username: string }
interface TermometroGameProps { players: Player[]; currentUserId: string }

type Phase = 'question' | 'position' | 'reveal'

interface TermQuestion { questionId: string; text: string }
interface TermReveal { positions: Record<string, number>; average: number }

export function TermometroGame({ players, currentUserId }: TermometroGameProps) {
  const { emit } = useSocket()
  const [phase, setPhase] = useState<Phase>('question')
  const [question, setQuestion] = useState<TermQuestion | null>(null)
  const [myValue, setMyValue] = useState<number>(5)
  const [submitted, setSubmitted] = useState(false)
  const [reveal, setReveal] = useState<TermReveal | null>(null)
  const [loading, setLoading] = useState(false)
  const isHost = true

  const startQuestion = async () => {
    setLoading(true)
    try {
      const res = await emit<{ success: boolean; data: TermQuestion }>('termometro:start')
      if (res.success) { setQuestion(res.data); setPhase('position'); setSubmitted(false) }
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const submitPosition = async () => {
    if (!question || submitted) return
    setSubmitted(true)
    await emit('termometro:position', { questionId: question.questionId, value: myValue })
    toast('Posición enviada 🌡️', { icon: '✓' })
  }

  const doReveal = async () => {
    if (!question) return
    const res = await emit<{ success: boolean; data: TermReveal }>('termometro:reveal', { questionId: question.questionId })
    if (res.success) { setReveal(res.data); setPhase('reveal') }
  }

  const heatColor = (v: number) => {
    if (v <= 3) return 'bg-blue-400'
    if (v <= 6) return 'bg-yellow-400'
    if (v <= 8) return 'bg-orange-400'
    return 'bg-battle'
  }

  return (
    <Card glow="battle">
      <CardContent className="pt-5 pb-6 space-y-5">
        <h2 className="text-lg font-bold text-text flex items-center gap-2">
          <Thermometer className="w-5 h-5 text-battle" /> Termómetro Humano
        </h2>

        <AnimatePresence mode="wait">
          {phase === 'question' && (
            <motion.div key="q" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4 py-4">
              <p className="text-text-muted text-sm">Mide la temperatura del grupo</p>
              {isHost
                ? <Button variant="battle" size="lg" className="w-full" onClick={startQuestion} disabled={loading}>🌡️ Lanzar pregunta</Button>
                : <p className="text-text-muted text-sm">Esperando al host...</p>}
            </motion.div>
          )}

          {phase === 'position' && question && (
            <motion.div key="pos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="bg-surface-light border border-border rounded-xl p-4 text-center">
                <p className="text-text font-semibold">{question.text}</p>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-text-muted">
                  <span>Para nada (1)</span><span>Totalmente (10)</span>
                </div>
                <div className="relative">
                  <input type="range" min={1} max={10} value={myValue}
                    onChange={e => setMyValue(Number(e.target.value))} disabled={submitted}
                    className="w-full accent-battle h-2" />
                </div>
                <div className="text-center">
                  <motion.span key={myValue} initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                    className="text-4xl font-black text-battle">{myValue}</motion.span>
                  <span className="text-text-muted text-sm">/10</span>
                </div>
              </div>
              {!submitted
                ? <Button variant="battle" size="lg" className="w-full" onClick={submitPosition}>Enviar posición 🌡️</Button>
                : <p className="text-xs text-text-muted text-center">Esperando a los demás...</p>}
              {isHost && submitted && (
                <Button variant="outline" size="md" className="w-full" onClick={doReveal}>Revelar ⚡</Button>
              )}
            </motion.div>
          )}

          {phase === 'reveal' && reveal && (
            <motion.div key="rev" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
              <div className="text-center">
                <p className="text-text-muted text-xs mb-1">Temperatura promedio del grupo</p>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}
                  className="text-6xl font-black text-battle">{reveal.average.toFixed(1)}</motion.div>
              </div>
              <div className="space-y-2">
                {players.map(p => {
                  const val = reveal.positions[p.id]
                  if (val === undefined) return null
                  return (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="text-xs text-text-muted w-20 truncate">{p.username}</span>
                      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                        <motion.div className={`h-full rounded-full ${heatColor(val)}`}
                          initial={{ width: 0 }} animate={{ width: `${val * 10}%` }} transition={{ delay: 0.1 }} />
                      </div>
                      <span className="text-xs text-text-muted w-4">{val}</span>
                    </div>
                  )
                })}
              </div>
              <Button variant="battle" size="md" className="w-full"
                onClick={() => { setPhase('question'); setQuestion(null); setReveal(null); setMyValue(5) }}>
                Siguiente →
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
