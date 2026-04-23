import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const TENSION_CONFIG = [
  { level: 1, label: 'Frío',      color: '#6B7280', bg: 'bg-[#6B7280]' },
  { level: 2, label: 'Cálido',    color: '#F59E0B', bg: 'bg-[#F59E0B]' },
  { level: 3, label: 'Ardiente',  color: '#F97316', bg: 'bg-[#F97316]' },
  { level: 4, label: 'Explosivo', color: '#EF4444', bg: 'bg-[#EF4444]' },
  { level: 5, label: 'Peligroso', color: '#FF2D55', bg: 'bg-battle' },
] as const

type TensionLevel = 1 | 2 | 3 | 4 | 5

interface TensionIndicatorProps {
  level: TensionLevel
  showLabel?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function TensionIndicator({ level, showLabel = true, className, size = 'md' }: TensionIndicatorProps) {
  const config = TENSION_CONFIG[level - 1]
  const barH = { sm: 'h-1', md: 'h-2', lg: 'h-3' }[size]
  const dotSize = { sm: 'w-2 h-2', md: 'w-3 h-3', lg: 'w-4 h-4' }[size]

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Tensión del Hilo</span>
          <motion.span
            key={level}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ color: config.color }}
            className="font-bold"
          >
            {config.label}
          </motion.span>
        </div>
      )}
      <div className="flex items-center gap-1">
        {TENSION_CONFIG.map((t) => (
          <motion.div
            key={t.level}
            className={cn(
              'flex-1 rounded-full transition-all duration-300',
              barH,
              t.level <= level ? t.bg : 'bg-muted'
            )}
            animate={t.level === level ? { scale: [1, 1.1, 1] } : { scale: 1 }}
            transition={{ duration: 0.4, repeat: t.level === 5 && level === 5 ? Infinity : 0, repeatDelay: 1 }}
          />
        ))}
        <motion.div
          key={`dot-${level}`}
          className={cn('rounded-full ml-1', dotSize, config.bg)}
          animate={level >= 4 ? { scale: [1, 1.3, 1] } : { scale: 1 }}
          transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 0.8 }}
        />
      </div>
    </div>
  )
}
