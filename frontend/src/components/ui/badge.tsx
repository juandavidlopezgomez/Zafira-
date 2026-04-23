import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Flame } from 'lucide-react'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:  'border-border bg-surface text-text',
        battle:   'border-battle/50 bg-battle/10 text-battle',
        llamas:   'border-llamas/50 bg-llamas/10 text-llamas',
        premium:  'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
        success:  'border-green-500/50 bg-green-500/10 text-green-400',
        danger:   'border-red-500/50 bg-red-500/10 text-red-400',
        tension1: 'border-tension-1/50 bg-tension-1/10 text-text-muted',
        tension2: 'border-tension-2/50 bg-tension-2/10 text-[#F59E0B]',
        tension3: 'border-tension-3/50 bg-tension-3/10 text-[#F97316]',
        tension4: 'border-tension-4/50 bg-tension-4/10 text-[#EF4444]',
        tension5: 'border-battle/50 bg-battle/10 text-battle',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  llamas?: boolean
}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, llamas, children, ...props }, ref) => (
    <div ref={ref} className={cn(badgeVariants({ variant, className }))} {...props}>
      {llamas && <Flame className="w-3 h-3" />}
      {children}
    </div>
  )
)
Badge.displayName = 'Badge'

export { Badge, badgeVariants }

// Componente especializado para mostrar balance de LLAMAS
export function LlamasBadge({ amount, className }: { amount: number; className?: string }) {
  return (
    <Badge variant="llamas" llamas className={cn('font-bold text-sm px-3 py-1', className)}>
      {amount.toLocaleString()}
    </Badge>
  )
}
