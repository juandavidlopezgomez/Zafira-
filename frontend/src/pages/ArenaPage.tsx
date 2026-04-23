import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Crown, Zap, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, LlamasBadge } from '@/components/ui/badge'
import { useSocket } from '@/hooks/useSocket'
import { useAuthStore } from '@/stores/auth.store'
import { useRoomStore } from '@/stores/room.store'
import toast from 'react-hot-toast'

// ──────────────────────────────────────────────────────────────────
// Feature sub-components (inline, since they are arena-specific)
// ──────────────────────────────────────────────────────────────────

interface Player { id: string; username: string }

// El Estadio — votación general (el mejor, el más carismático...)
function EstadioFeature({ players, stadiumId }: { players: Player[]; stadiumId: string }) {
  const { emit } = useSocket()
  const user = useAuthStore(s => s.user)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, number> | null>(null)
  const [winner, setWinner] = useState<Player | null>(null)
  const QUESTIONS = ['¿Quién es el más carismático?', '¿Quién ligaría más?', '¿Quién sería el líder del grupo?']
  const [qIdx] = useState(() => Math.floor(Math.random() * QUESTIONS.length))

  const vote = async (targetId: string) => {
    if (myVote) return
    setMyVote(targetId)
    await emit('arena:vote', { stadiumId, targetId, voteType: 'estadio' })
    toast('Voto enviado 🏟️', { icon: '✓' })
  }

  const endFeature = async () => {
    const res = await emit<{ success: boolean; payload: { distribution: Record<string, number>; winner?: string } }>('arena:end_feature', { stadiumId })
    if (res.success) {
      setResults(res.payload.distribution)
      const w = players.find(p => p.id === res.payload.winner)
      if (w) setWinner(w)
    }
  }

  if (results) {
    const maxVotes = Math.max(...Object.values(results), 1)
    return (
      <div className="space-y-4">
        <div className="text-center">
          <span className="text-3xl">🏆</span>
          {winner && <p className="text-battle font-black text-xl mt-1">{winner.username}</p>}
          <p className="text-xs text-text-muted mt-1">Ganador del Estadio</p>
        </div>
        <div className="space-y-2">
          {players.map(p => {
            const v = results[p.id] ?? 0
            return (
              <div key={p.id} className="flex items-center gap-2">
                <span className="text-xs text-text-muted w-20 truncate">{p.username}</span>
                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                  <motion.div className="h-full rounded-full bg-battle"
                    initial={{ width: 0 }} animate={{ width: `${(v / maxVotes) * 100}%` }} transition={{ delay: 0.1 }} />
                </div>
                <span className="text-xs text-text-muted w-4">{v}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-text font-semibold text-center">{QUESTIONS[qIdx]}</p>
      <div className="space-y-2">
        {players.filter(p => p.id !== user?.id).map((p, i) => (
          <motion.button key={p.id} initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            onClick={() => vote(p.id)} disabled={!!myVote}
            className={`w-full p-3 rounded-xl border text-sm font-semibold transition-all text-left ${myVote === p.id ? 'border-battle bg-battle/10 text-battle' : 'border-border bg-surface-light text-text hover:border-battle/40'}`}>
            🏟️ {p.username}
          </motion.button>
        ))}
      </div>
      {myVote && <p className="text-xs text-text-muted text-center">Votaste ✓</p>}
      <Button variant="outline" size="md" className="w-full" onClick={endFeature}>Ver resultados ⚡</Button>
    </div>
  )
}

// La Silla Caliente — un jugador contesta preguntas del grupo
function SillaCalienteFeature({ players }: { players: Player[] }) {
  const { emit } = useSocket()
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [question, setQuestion] = useState('')
  const [sent, setSent] = useState(false)

  const sendQuestion = async () => {
    if (!selectedPlayer || !question.trim()) return
    await emit('arena:vote', { stadiumId: 'silla', targetId: selectedPlayer.id, voteType: 'question', question })
    setSent(true)
    toast('Pregunta enviada 🔥', { icon: '✓' })
  }

  return (
    <div className="space-y-4">
      {!selectedPlayer ? (
        <>
          <p className="text-text-muted text-xs text-center">¿Quién va a la silla caliente?</p>
          <div className="space-y-2">
            {players.map(p => (
              <button key={p.id} onClick={() => setSelectedPlayer(p)}
                className="w-full p-3 rounded-xl border border-border bg-surface-light text-text text-sm text-left hover:border-battle/40 transition-all">
                🔥 {p.username}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="bg-battle/5 border border-battle/30 rounded-xl p-3 text-center">
            <p className="text-xs text-battle font-semibold">En la silla</p>
            <p className="text-text font-bold text-lg">{selectedPlayer.username}</p>
          </div>
          {!sent ? (
            <>
              <input type="text" placeholder="Escribe tu pregunta..." value={question}
                onChange={e => setQuestion(e.target.value)}
                className="w-full h-10 rounded-lg border border-border bg-surface-light px-3 text-text text-sm" />
              <Button variant="battle" size="md" className="w-full" onClick={sendQuestion} disabled={!question.trim()}>
                Preguntar 🔥
              </Button>
            </>
          ) : (
            <p className="text-center text-text-muted text-sm">Pregunta enviada ✓</p>
          )}
          <button onClick={() => { setSelectedPlayer(null); setSent(false); setQuestion('') }}
            className="text-xs text-text-muted underline w-full text-center">Cambiar jugador</button>
        </>
      )}
    </div>
  )
}

// El Sobre Rojo — preguntas comprometedoras (Premium)
function SobreRojoFeature({ isPremium }: { isPremium: boolean }) {
  const { emit } = useSocket()
  const [question, setQuestion] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const getQuestion = async () => {
    setLoading(true)
    try {
      const res = await emit<{ success: boolean; data: { text: string } }>('arena:sobre_rojo_question')
      if (res.success) setQuestion(res.data.text)
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  if (!isPremium) {
    return (
      <div className="text-center space-y-3 py-4">
        <Lock className="w-8 h-8 text-red-400 mx-auto" />
        <p className="text-text-muted text-sm">Solo Premium</p>
        <Button variant="battle" size="sm" className="bg-red-600 hover:bg-red-700 border-red-500"
          onClick={() => window.open('/premium', '_blank')}>Desbloquear ✨</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 text-center">
      {!question ? (
        <>
          <motion.div animate={{ rotate: [0, -3, 3, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="text-5xl">💌</motion.div>
          <p className="text-text-muted text-sm">Preguntas que nadie se atreve a hacer</p>
          <Button variant="battle" size="lg" className="w-full bg-red-600 hover:bg-red-700 border-red-500"
            onClick={getQuestion} disabled={loading}>
            Abrir sobre 💌
          </Button>
        </>
      ) : (
        <>
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-white font-semibold leading-relaxed">{question}</p>
          </div>
          <Button variant="outline" size="md" className="w-full" onClick={() => setQuestion(null)}>
            Siguiente 💌
          </Button>
        </>
      )}
    </div>
  )
}

// Quién en tu Curso — votaciones tipo "¿Quién es más...?"
function QuienCursoFeature({ players }: { players: Player[] }) {
  const { emit } = useSocket()
  const user = useAuthStore(s => s.user)
  const PROMPTS = [
    '¿Quién es más probablemente famoso/a a los 30?',
    '¿Quién sería el mejor compañero de viaje?',
    '¿Quién tiene más carisma?',
    '¿Quién es el más misterioso/a?',
  ]
  const [pIdx, setPIdx] = useState(0)
  const [myVote, setMyVote] = useState<string | null>(null)

  const vote = async (targetId: string) => {
    if (myVote) return
    setMyVote(targetId)
    await emit('arena:vote', { stadiumId: 'quien_curso', targetId, voteType: `quien_${pIdx}` })
    toast('Votaste ✓', { icon: '👀' })
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-light border border-border rounded-xl p-3 text-center">
        <p className="text-text font-semibold">{PROMPTS[pIdx]}</p>
      </div>
      <div className="space-y-2">
        {players.filter(p => p.id !== user?.id).map(p => (
          <button key={p.id} onClick={() => vote(p.id)} disabled={!!myVote}
            className={`w-full p-3 rounded-xl border text-sm font-semibold transition-all text-left ${myVote === p.id ? 'border-battle bg-battle/10 text-battle' : 'border-border bg-surface-light text-text hover:border-battle/30'}`}>
            👀 {p.username}
          </button>
        ))}
      </div>
      {myVote && (
        <Button variant="outline" size="sm" className="w-full"
          onClick={() => { setPIdx(i => (i + 1) % PROMPTS.length); setMyVote(null) }}>
          Siguiente pregunta →
        </Button>
      )}
    </div>
  )
}

// Termómetro del Colegio — igual que Termómetro Humano pero arena
function TermometroColegio({ players }: { players: Player[] }) {
  const { emit } = useSocket()
  const [value, setValue] = useState(5)
  const [sent, setSent] = useState(false)
  const QUESTIONS_T = ['¿Qué tan atrevido/a eres?', '¿Cuánto te gusta el grupo?', '¿Qué tan sociable eres?']
  const [qIdx] = useState(() => Math.floor(Math.random() * QUESTIONS_T.length))

  const submit = async () => {
    setSent(true)
    await emit('arena:vote', { stadiumId: 'term_colegio', targetId: String(value), voteType: 'termometro' })
    toast('Posición enviada 🌡️', { icon: '✓' })
  }

  return (
    <div className="space-y-4">
      <p className="text-text font-semibold text-center">{QUESTIONS_T[qIdx]}</p>
      <div className="space-y-3">
        <div className="flex justify-between text-xs text-text-muted">
          <span>Para nada (1)</span><span>Totalmente (10)</span>
        </div>
        <input type="range" min={1} max={10} value={value}
          onChange={e => setValue(Number(e.target.value))} disabled={sent}
          className="w-full accent-battle h-2" />
        <div className="text-center">
          <motion.span key={value} initial={{ scale: 0.8 }} animate={{ scale: 1 }}
            className="text-4xl font-black text-battle">{value}</motion.span>
          <span className="text-text-muted text-sm">/10</span>
        </div>
      </div>
      {!sent
        ? <Button variant="battle" size="lg" className="w-full" onClick={submit}>Enviar 🌡️</Button>
        : <p className="text-xs text-text-muted text-center">Esperando al grupo...</p>}
      <div className="space-y-1 pt-2">
        {players.slice(0, 3).map(p => (
          <div key={p.id} className="flex items-center gap-2 text-xs text-text-muted">
            <span className="w-20 truncate">{p.username}</span>
            <div className="flex-1 h-2 bg-muted rounded-full"><div className="h-full rounded-full bg-battle" style={{ width: '50%' }} /></div>
            <span>?</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Momento Épico — nomina el mejor momento de la sesión
function MomentoEpico({ stadiumId }: { stadiumId: string }) {
  const { emit } = useSocket()
  const [description, setDescription] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async () => {
    if (!description.trim()) return
    setSent(true)
    await emit('arena:vote', { stadiumId, targetId: description, voteType: 'momento_epico' })
    toast('¡Momento épico registrado! 🎬', { icon: '⚡' })
  }

  return (
    <div className="space-y-4">
      {!sent ? (
        <>
          <p className="text-text-muted text-sm text-center">¿Cuál fue el momento más épico de la sesión?</p>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Describe el momento..." rows={3}
            className="w-full rounded-lg border border-border bg-surface-light px-3 py-2 text-text text-sm resize-none" />
          <Button variant="battle" size="lg" className="w-full" onClick={submit} disabled={!description.trim()}>
            ⚡ Nominar momento
          </Button>
        </>
      ) : (
        <div className="text-center space-y-3 py-4">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="text-5xl">🎬</motion.div>
          <p className="text-text font-semibold">¡Momento épico registrado!</p>
          <p className="text-text-muted text-sm">{description}</p>
        </div>
      )}
    </div>
  )
}

// La Ruleta Maldita
function RuletaMaldita({ players, stadiumId }: { players: Player[]; stadiumId: string }) {
  const { emit } = useSocket()
  const [target, setTarget] = useState<Player | null>(null)
  const [result, setResult] = useState<{ label: string; effect: string; llamasDelta: number } | null>(null)
  const [spinning, setSpinning] = useState(false)

  const spin = async () => {
    if (!target) return
    setSpinning(true)
    const res = await emit<{ success: boolean; payload: { label: string; effect: string; llamasDelta: number } }>('arena:ruleta_spin', { stadiumId, targetUserId: target.id })
    if (res.success) { setResult(res.payload) }
    setSpinning(false)
  }

  return (
    <div className="space-y-4">
      {!target ? (
        <>
          <p className="text-text-muted text-xs text-center">Elige a quién le toca la ruleta</p>
          <div className="space-y-2">
            {players.map(p => (
              <button key={p.id} onClick={() => setTarget(p)}
                className="w-full p-3 rounded-xl border border-border bg-surface-light text-text text-sm text-left hover:border-battle/40 transition-all">
                🎡 {p.username}
              </button>
            ))}
          </div>
        </>
      ) : result ? (
        <div className="text-center space-y-3 py-4">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="text-5xl">🎡</motion.div>
          <p className="text-battle font-black text-lg">{result.label}</p>
          {result.llamasDelta !== 0 && (
            <p className={`text-sm font-bold ${result.llamasDelta > 0 ? 'text-llamas' : 'text-red-400'}`}>
              {result.llamasDelta > 0 ? '+' : ''}{result.llamasDelta} 🔥 LLAMAS
            </p>
          )}
          <Button variant="outline" size="md" className="w-full" onClick={() => { setTarget(null); setResult(null) }}>
            Siguiente →
          </Button>
        </div>
      ) : (
        <>
          <div className="bg-battle/5 border border-battle/30 rounded-xl p-3 text-center">
            <p className="text-xs text-text-muted">Objetivo</p>
            <p className="text-battle font-bold text-lg">{target.username}</p>
          </div>
          <motion.div animate={spinning ? { rotate: 360 } : {}} transition={{ duration: 0.5, repeat: spinning ? Infinity : 0 }}
            className="text-5xl text-center">🎡</motion.div>
          <Button variant="battle" size="lg" className="w-full" onClick={spin} disabled={spinning}>
            {spinning ? 'Girando...' : 'Girar ruleta 🎡'}
          </Button>
          <button onClick={() => setTarget(null)} className="text-xs text-text-muted underline w-full text-center">
            Cambiar objetivo
          </button>
        </>
      )}
    </div>
  )
}

// El Shipper
function ShipperFeature({ players, stadiumId }: { players: Player[]; stadiumId: string }) {
  const { emit } = useSocket()
  const [p1, setP1] = useState<Player | null>(null)
  const [p2, setP2] = useState<Player | null>(null)
  const [sent, setSent] = useState(false)
  const [topShip, setTopShip] = useState<{ person1: string; person2: string; votes: number } | null>(null)

  const ship = async () => {
    if (!p1 || !p2) return
    await emit('arena:ship', { stadiumId, person1: p1.id, person2: p2.id })
    setSent(true)
    toast(`¡Shippeaste ${p1.username} + ${p2.username}! 💕`, { icon: '💞' })
  }

  const getTopShip = async () => {
    const res = await emit<{ success: boolean; data: typeof topShip }>('arena:top_ship', { stadiumId })
    if (res.success && res.data) setTopShip(res.data)
  }

  const nameOf = (id: string) => players.find(p => p.id === id)?.username ?? id

  if (topShip) {
    return (
      <div className="text-center space-y-4 py-4">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="text-5xl">💞</motion.div>
        <p className="text-text-muted text-xs">El ship más popular</p>
        <p className="text-battle font-black text-xl">{nameOf(topShip.person1)} + {nameOf(topShip.person2)}</p>
        <p className="text-text-muted text-sm">{topShip.votes} votos</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!sent ? (
        <>
          <p className="text-text-muted text-xs text-center">Shippea a dos personas del grupo</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-text-muted text-center">Persona 1</p>
              <div className="space-y-1">
                {players.map(p => (
                  <button key={p.id} onClick={() => setP1(p)} disabled={p.id === p2?.id}
                    className={`w-full py-2 px-2 rounded-lg border text-xs truncate transition-all ${p1?.id === p.id ? 'border-battle bg-battle/10 text-battle' : 'border-border text-text-muted hover:border-battle/30'}`}>
                    {p.username}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-text-muted text-center">Persona 2</p>
              <div className="space-y-1">
                {players.map(p => (
                  <button key={p.id} onClick={() => setP2(p)} disabled={p.id === p1?.id}
                    className={`w-full py-2 px-2 rounded-lg border text-xs truncate transition-all ${p2?.id === p.id ? 'border-battle bg-battle/10 text-battle' : 'border-border text-text-muted hover:border-battle/30'}`}>
                    {p.username}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {p1 && p2 && (
            <div className="text-center text-sm text-text font-semibold">{p1.username} 💞 {p2.username}</div>
          )}
          <Button variant="battle" size="md" className="w-full" onClick={ship} disabled={!p1 || !p2}>
            💞 Shippear
          </Button>
        </>
      ) : (
        <div className="text-center space-y-3 py-2">
          <p className="text-text font-semibold">¡Shippeaste! 💞</p>
          <Button variant="outline" size="md" className="w-full" onClick={getTopShip}>Ver top ship 💞</Button>
        </div>
      )}
    </div>
  )
}

// Corona Semanal — solo visualización del ranking
function CoronaSemanal({ players }: { players: Player[] }) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <Crown className="w-10 h-10 text-yellow-400 mx-auto mb-1" />
        <p className="text-text font-bold">Corona Semanal</p>
        <p className="text-text-muted text-xs mt-1">Se asigna automáticamente cada lunes al jugador más carismático</p>
      </div>
      <div className="space-y-2">
        {players.slice(0, 3).map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface-light">
            <span className="text-lg">{i === 0 ? '👑' : i === 1 ? '🥈' : '🥉'}</span>
            <span className="flex-1 text-sm text-text font-semibold truncate">{p.username}</span>
            <span className="text-xs text-yellow-400 font-bold">{1000 - i * 250} pts</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Feature config
// ──────────────────────────────────────────────────────────────────

type ArenaFeatureKey =
  | 'el_estadio' | 'silla_caliente' | 'sobre_rojo' | 'corona_semanal'
  | 'quien_en_tu_curso' | 'termometro_colegio' | 'momento_epico'
  | 'ruleta_maldita' | 'el_shipper'

interface FeatureMeta {
  key: ArenaFeatureKey
  label: string
  icon: string
  description: string
  premium?: boolean
  glow: 'battle' | 'llamas' | 'none'
}

const FEATURES: FeatureMeta[] = [
  { key: 'el_estadio',        label: 'El Estadio',            icon: '🏟️', description: 'Votaciones épicas del grupo', glow: 'battle' },
  { key: 'silla_caliente',    label: 'La Silla Caliente',     icon: '🔥', description: 'Responde preguntas del grupo', glow: 'battle' },
  { key: 'sobre_rojo',        label: 'El Sobre Rojo',         icon: '💌', description: 'Preguntas que nadie se atreve', glow: 'battle', premium: true },
  { key: 'corona_semanal',    label: 'La Corona Semanal',     icon: '👑', description: 'El más carismático gana', glow: 'llamas' },
  { key: 'quien_en_tu_curso', label: 'Quién en tu Curso',     icon: '👀', description: '¿Quién es más...?', glow: 'battle' },
  { key: 'termometro_colegio',label: 'Termómetro del Colegio',icon: '🌡️', description: 'La temperatura del grupo', glow: 'battle' },
  { key: 'momento_epico',     label: 'Momento Épico',         icon: '⚡', description: 'Nomina el mejor momento', glow: 'llamas' },
  { key: 'ruleta_maldita',    label: 'La Ruleta Maldita',     icon: '🎡', description: 'Gira y acepta tu destino', glow: 'battle' },
  { key: 'el_shipper',        label: 'El Shipper',            icon: '💞', description: 'Shippea a dos personas', glow: 'battle' },
]

// ──────────────────────────────────────────────────────────────────
// Main ArenaPage
// ──────────────────────────────────────────────────────────────────

export function ArenaPage() {
  const navigate = useNavigate()
  const { emit } = useSocket()
  const user = useAuthStore(s => s.user)
  const { players } = useRoomStore()
  const [activeFeature, setActiveFeature] = useState<ArenaFeatureKey | null>(null)
  const [stadiumId, setStadiumId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isPremium = user?.isPremium ?? false
  const isHost = true

  const startFeature = async (feature: ArenaFeatureKey) => {
    if (players.length < 5) {
      toast.error('Arena requiere mínimo 5 jugadores')
      return
    }
    setLoading(true)
    try {
      const res = await emit<{ success: boolean; stadiumId?: string; error?: string }>(
        'arena:start_feature',
        { feature, playerIds: players.map(p => p.id) }
      )
      if (!res.success) { toast.error(res.error ?? 'Error iniciando feature'); return }
      setStadiumId(res.stadiumId ?? null)
      setActiveFeature(feature)
    } catch { toast.error('Error') } finally { setLoading(false) }
  }

  const meta = FEATURES.find(f => f.key === activeFeature)

  const renderFeature = () => {
    if (!activeFeature || !stadiumId) return null
    switch (activeFeature) {
      case 'el_estadio':         return <EstadioFeature players={players} stadiumId={stadiumId} />
      case 'silla_caliente':     return <SillaCalienteFeature players={players} />
      case 'sobre_rojo':         return <SobreRojoFeature isPremium={isPremium} />
      case 'corona_semanal':     return <CoronaSemanal players={players} />
      case 'quien_en_tu_curso':  return <QuienCursoFeature players={players} />
      case 'termometro_colegio': return <TermometroColegio players={players} />
      case 'momento_epico':      return <MomentoEpico stadiumId={stadiumId} />
      case 'ruleta_maldita':     return <RuletaMaldita players={players} stadiumId={stadiumId} />
      case 'el_shipper':         return <ShipperFeature players={players} stadiumId={stadiumId} />
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => activeFeature ? setActiveFeature(null) : navigate(-1)} className="text-text-muted hover:text-text">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-text text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-battle" />
            {activeFeature ? meta?.label : 'Arena'}
          </h1>
          <LlamasBadge amount={user?.llamasBalance ?? 0} />
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        <AnimatePresence mode="wait">
          {!activeFeature ? (
            <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-text-muted text-sm">{players.length} jugadores en la arena</p>
                {players.length < 5 && (
                  <Badge variant="default" className="text-xs text-yellow-400 border-yellow-400/30">
                    Mín. 5 para jugar
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3">
                {FEATURES.map((f, i) => (
                  <motion.div key={f.key} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <button
                      onClick={() => (!f.premium || isPremium) ? startFeature(f.key) : toast.error('Esta feature requiere Premium')}
                      disabled={loading || players.length < 5}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        f.glow === 'battle' ? 'border-border hover:border-battle/50 hover:bg-battle/5' : 'border-border hover:border-llamas/50 hover:bg-llamas/5'
                      } bg-surface-light disabled:opacity-50 disabled:cursor-not-allowed`}>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{f.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-text font-semibold text-sm">{f.label}</span>
                            {f.premium && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-battle/20 text-battle font-bold border border-battle/30">
                                Premium
                              </span>
                            )}
                          </div>
                          <p className="text-text-muted text-xs mt-0.5">{f.description}</p>
                        </div>
                        <span className="text-text-muted text-xs">→</span>
                      </div>
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key={activeFeature} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Card glow={meta?.glow ?? 'battle'}>
                <CardContent className="pt-5 pb-6 space-y-5">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{meta?.icon}</span>
                    <div>
                      <h2 className="text-text font-bold">{meta?.label}</h2>
                      <p className="text-text-muted text-xs">{meta?.description}</p>
                    </div>
                  </div>
                  {renderFeature()}
                  {isHost && activeFeature !== 'corona_semanal' && (
                    <Button variant="outline" size="sm" className="w-full"
                      onClick={() => { setActiveFeature(null); setStadiumId(null) }}>
                      ← Volver a la Arena
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
