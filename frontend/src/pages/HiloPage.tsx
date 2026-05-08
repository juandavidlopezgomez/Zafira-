import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Send, Eye, EyeOff, Flame } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { TensionIndicator } from '@/components/ui/tension-indicator'
import { useAuthStore } from '@/stores/auth.store'

interface HiloMessage {
  id: string
  content: string
  userId?: string
  aliasId?: string
  username?: string
  tension: number
  seq: number
  createdAt: string
}

const REACTIONS = ['🔥', '😳', '💀', '😍', '🤫', '⚡']

export function HiloPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate   = useNavigate()
  const user       = useAuthStore((s) => s.user)

  const [messages, setMessages]         = useState<HiloMessage[]>([])
  const [input, setInput]               = useState('')
  const [isAnonymous, setIsAnonymous]   = useState(false)
  const [tensionLevel, setTensionLevel] = useState<1|2|3|4|5>(1)
  const [sending, setSending]           = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastSeqRef     = useRef(0)
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null)

  // Polling de mensajes cada 2 s
  useEffect(() => {
    if (!roomId) return

    const poll = async () => {
      try {
        const res = await apiFetch<{ messages: HiloMessage[] }>(
          `/hilo/${roomId}/messages?since=${lastSeqRef.current}`
        )
        if (res.messages.length) {
          setMessages((prev) => {
            const newMsgs = res.messages.filter(
              (m) => m.seq > lastSeqRef.current
            )
            if (!newMsgs.length) return prev
            lastSeqRef.current = Math.max(...newMsgs.map((m) => m.seq))
            const maxTension = Math.max(...newMsgs.map((m) => m.tension), 0)
            if (maxTension > 0) setTensionLevel(Math.min(5, Math.ceil(maxTension / 2)) as 1|2|3|4|5)
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
            return [...prev, ...newMsgs]
          })
        }
      } catch { /* red momentáneamente caída */ }
    }

    poll()
    pollRef.current = setInterval(poll, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [roomId])

  const sendMessage = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await apiFetch(`/hilo/${roomId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: input.trim(), isAnonymous }),
      })
      setInput('')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al enviar')
    } finally {
      setSending(false)
    }
  }

  const reactToMessage = async (messageId: string, reaction: string) => {
    await apiFetch(`/hilo/${roomId}/react`, {
      method: 'POST',
      body: JSON.stringify({ messageId, reaction }),
    }).catch(() => null)
  }

  const tensionColors: Record<number, string> = {
    1: 'text-[#6B7280]', 2: 'text-[#F59E0B]',
    3: 'text-[#F97316]', 4: 'text-[#EF4444]', 5: 'text-battle',
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => navigate(-1)} className="text-text-muted hover:text-text">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Flame className={`w-5 h-5 ${tensionColors[tensionLevel]}`} />
              <span className="font-bold text-text text-sm">El Hilo</span>
            </div>
            <button
              onClick={() => setIsAnonymous(!isAnonymous)}
              className={`p-1.5 rounded-lg border transition-colors ${isAnonymous ? 'border-battle bg-battle/10 text-battle' : 'border-border text-text-muted'}`}
            >
              {isAnonymous ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <TensionIndicator level={tensionLevel} size="sm" />
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto max-w-lg mx-auto w-full px-4 py-4 space-y-3">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isOwn      = msg.userId === user?.id
            const displayName = msg.aliasId ? `👤 ${msg.aliasId}` : (msg.username ?? 'Usuario')
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarFallback className="text-xs">
                    {msg.aliasId ? '👤' : displayName[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className={`max-w-[75%] space-y-1 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                  <span className="text-[10px] text-text-muted px-1">{displayName}</span>
                  <div className={`px-3 py-2 rounded-2xl text-sm ${
                    isOwn
                      ? 'bg-battle/20 text-text border border-battle/30 rounded-tr-sm'
                      : 'bg-surface-light text-text border border-border rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  <div className="flex gap-1 px-1">
                    {REACTIONS.map((r) => (
                      <button key={r} onClick={() => reactToMessage(msg.id, r)}
                        className="text-xs opacity-40 hover:opacity-100 transition-opacity hover:scale-125 transform">
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
        {messages.length === 0 && (
          <div className="text-center py-12 text-text-muted">
            <Flame className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">El Hilo está en silencio...</p>
            <p className="text-xs mt-1">¡Sé el primero en romper el hielo!</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="sticky bottom-0 bg-surface/90 backdrop-blur border-t border-border px-4 py-3">
        <div className="max-w-lg mx-auto">
          {isAnonymous && (
            <div className="text-xs text-battle mb-2 flex items-center gap-1">
              <EyeOff className="w-3 h-3" /> Modo anónimo activado
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder={isAnonymous ? 'Escribe anónimamente...' : 'Escribe algo ardiente...'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              className="flex-1"
              maxLength={500}
            />
            <Button variant="battle" size="icon" onClick={sendMessage} disabled={!input.trim() || sending}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
