import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useSocket } from '@/hooks/useSocket'
import toast from 'react-hot-toast'

interface Player {
  id: string
  username: string
}

interface BottleGameProps {
  players: Player[]
  currentUserId: string
}

interface SpinResponse {
  success: boolean
  data?: { from: string; to: string; toName: string }
  error?: string
}

export function BottleGame({ players }: BottleGameProps) {
  const { emit } = useSocket()
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null)
  const [isMyTurn] = useState(true) // TODO: derivar del game state

  const handleSpin = async () => {
    if (spinning) return
    setSpinning(true)
    setTarget(null)

    // Animación: girar entre 720 y 1440 grados
    const extraDeg = 720 + Math.floor(Math.random() * 720)
    setRotation((prev) => prev + extraDeg)

    try {
      const res = await emit<SpinResponse>('bottle:spin')
      setTimeout(() => {
        setSpinning(false)
        if (res.success && res.data) {
          setTarget({ id: res.data.to, name: res.data.toName })
          toast(`🍾 ¡La botella apunta a ${res.data.toName}!`, { duration: 4000 })
        } else {
          toast.error(res.error ?? 'Error al girar')
        }
      }, 2000)
    } catch {
      setSpinning(false)
      toast.error('Error de conexión')
    }
  }

  return (
    <Card glow="battle">
      <CardContent className="pt-5 pb-6 text-center space-y-6">
        <h2 className="text-xl font-bold text-text">🍾 Pico Botella</h2>

        {/* Botella animada */}
        <div className="relative flex items-center justify-center h-40">
          {/* Jugadores en círculo */}
          {players.map((p, i) => {
            const angle = (i / players.length) * 360
            const rad = (angle * Math.PI) / 180
            const r = 64
            const x = r * Math.sin(rad)
            const y = -r * Math.cos(rad)
            return (
              <motion.div
                key={p.id}
                className="absolute"
                style={{ transform: `translate(${x}px, ${y}px)` }}
                animate={target?.id === p.id ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <Avatar className={`w-8 h-8 ring-2 transition-all ${target?.id === p.id ? 'ring-battle shadow-[0_0_12px_3px_#FF2D5560]' : 'ring-border'}`}>
                  <AvatarFallback className="text-xs">{p.username[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
              </motion.div>
            )
          })}

          {/* Botella giratoria */}
          <motion.div
            className="text-4xl select-none z-10"
            animate={{ rotate: rotation }}
            transition={{ duration: 2, ease: 'easeOut' }}
          >
            🍾
          </motion.div>
        </div>

        {/* Resultado */}
        <AnimatePresence>
          {target && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-battle/10 border border-battle/40 rounded-xl p-3"
            >
              <p className="text-battle font-bold text-lg">¡{target.name}! 🎯</p>
              <p className="text-text-muted text-sm">La botella te eligió</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Botón girar */}
        {isMyTurn && (
          <Button
            variant="battle"
            size="lg"
            className="w-full"
            onClick={handleSpin}
            disabled={spinning}
          >
            {spinning ? (
              <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}>
                🍾
              </motion.span>
            ) : '¡Girar la botella!'}
          </Button>
        )}

        {!isMyTurn && (
          <p className="text-text-muted text-sm">Espera tu turno...</p>
        )}
      </CardContent>
    </Card>
  )
}
