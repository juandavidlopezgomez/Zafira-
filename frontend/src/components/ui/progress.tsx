import { forwardRef } from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@/lib/utils'

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  variant?: 'battle' | 'llamas' | 'tension'
}

const Progress = forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, variant = 'battle', ...props }, ref) => {
  const indicatorColor = {
    battle:  'bg-battle shadow-[0_0_8px_2px_#FF2D5550]',
    llamas:  'bg-llamas shadow-[0_0_8px_2px_#FF6B0050]',
    tension: 'bg-gradient-to-r from-[#F59E0B] to-battle shadow-[0_0_8px_2px_#FF2D5550]',
  }[variant]

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full w-full flex-1 transition-all duration-500', indicatorColor)}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
