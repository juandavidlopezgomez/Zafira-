import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useSocket } from '@/hooks/useSocket'
import toast from 'react-hot-toast'

interface Player { id: string; username: string }
interface CartasGameProps { players: Player[]; currentUserId: string }

type Phase = 'deal' | 'play' | 'vote' | 'result'

interface GameCard { cardId: string; text: string; playedBy?: string }

export function CartasGame({ players, currentUserId }: CartasGameProps) {
  const { emit } = useSocket()
  const [phase, setPhase] = useState<Phase>('deal')
  const [myCards, setMyCards] = useState<GameCard[]>([])
  const [playedCards, setPlayedCards] = useState<GameCard[]>([])
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [winnerCard, setWinnerCard] = useState<GameCard | null>(null)
  const [loading, setLoading] = useState(false)
  const isHost = true

  const dealCards = async () => {
    setLoading(true)
    try {
      const res = await emit<{ success: boolean; data: { cards: GameCard[] } }>('cartas:deal')
      if (res.success) { setMyCards(res.data.cards); setPhase('play') }
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const playCard = async () => {
    if (!selectedCard) return
    const res = await emit<{ success: boolean; data: { played: GameCard[] } }>('cartas:play', { cardId: selectedCard })
    if (res.success) {
      setPlayedCards(res.data.played)
      setMyCards(prev => prev.filter(c => c.cardId !== selectedCard))
      setPhase('vote')
      toast('Carta jugada 🃏', { icon: '✓' })
    }
  }

  const voteCard = async (cardId: string) => {
    if (myVote) return
    setMyVote(cardId)
    await emit('cartas:vote', { cardId })
    toast('Votaste 🃏', { icon: '✓' })
  }

  const resolveVoting = async () => {
    const res = await emit<{ success: boolean; data: { winnerCard: GameCard } }>('cartas:resolve')
    if (res.success) { setWinnerCard(res.data.winnerCard); setPhase('result') }
  }

  return (
    <Card glow="battle">
      <CardContent className="pt-5 pb-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text flex items-center gap-2">
            <Layers className="w-5 h-5 text-battle" /> Cartas sobre la Mesa
          </h2>
          <span className="text-xs text-text-muted">{myCards.length} cartas</span>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'deal' && (
            <motion.div key="deal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4 py-4">
              <motion.div animate={{ y: [-3, 3, -3] }} transition={{ repeat: Infinity, duration: 2 }} className="text-5xl">🃏</motion.div>
              <p className="text-text-muted text-sm">Cada jugador recibe cartas con respuestas. Juega la más divertida.</p>
              {isHost
                ? <Button variant="battle" size="lg" className="w-full" onClick={dealCards} disabled={loading}>
                    Repartir cartas 🃏
                  </Button>
                : <p className="text-text-muted text-sm">Esperando al host...</p>}
            </motion.div>
          )}

          {phase === 'play' && (
            <motion.div key="play" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <p className="text-xs text-text-muted text-center">Elige tu mejor carta para jugar</p>
              <div className="space-y-2">
                {myCards.map((card, i) => (
                  <motion.button key={card.cardId} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={() => setSelectedCard(card.cardId)}
                    className={`w-full p-3 rounded-xl border text-left text-sm transition-all ${selectedCard === card.cardId ? 'border-battle bg-battle/10 text-battle' : 'border-border bg-surface-light text-text hover:border-battle/40'}`}>
                    {card.text}
                  </motion.button>
                ))}
              </div>
              <Button variant="battle" size="lg" className="w-full" onClick={playCard} disabled={!selectedCard}>
                Jugar carta ✓
              </Button>
            </motion.div>
          )}

          {phase === 'vote' && (
            <motion.div key="vote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <p className="text-xs text-text-muted text-center">Vota por la carta más épica</p>
              <div className="space-y-2">
                {playedCards.map((card, i) => (
                  <motion.button key={card.cardId} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => voteCard(card.cardId)} disabled={!!myVote}
                    className={`w-full p-3 rounded-xl border text-left text-sm transition-all ${myVote === card.cardId ? 'border-battle bg-battle/10 text-battle' : 'border-border bg-surface-light text-text hover:border-battle/30'} ${card.playedBy === currentUserId ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {card.text}
                    {card.playedBy === currentUserId && <span className="ml-2 text-xs text-text-muted">(tú)</span>}
                  </motion.button>
                ))}
              </div>
              {myVote && <p className="text-xs text-text-muted text-center">Votaste ✓</p>}
              {isHost && (
                <Button variant="outline" size="md" className="w-full" onClick={resolveVoting}>Ver ganador ⚡</Button>
              )}
            </motion.div>
          )}

          {phase === 'result' && winnerCard && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="text-5xl">🏆</motion.div>
              <div className="bg-battle/5 border border-battle/30 rounded-xl p-4">
                <p className="text-xs text-battle font-semibold mb-2">Carta ganadora</p>
                <p className="text-text font-semibold">{winnerCard.text}</p>
              </div>
              {isHost && (
                <Button variant="battle" size="md" className="w-full"
                  onClick={() => { setPhase('deal'); setPlayedCards([]); setMyVote(null); setWinnerCard(null) }}>
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
