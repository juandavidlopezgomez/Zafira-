import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold ring-offset-bg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-battle focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 active:scale-95',
  {
    variants: {
      variant: {
        battle:
          'bg-battle text-white hover:bg-battle-dark shadow-[0_0_16px_2px_#FF2D5540] hover:shadow-[0_0_28px_4px_#FF2D5560]',
        llamas:
          'bg-llamas text-white hover:bg-llamas-dark shadow-[0_0_16px_2px_#FF6B0040] hover:shadow-[0_0_28px_4px_#FF6B0060]',
        outline:
          'border border-border bg-transparent text-text hover:bg-surface-light hover:border-battle',
        ghost:
          'bg-transparent text-text hover:bg-surface-light',
        surface:
          'bg-surface text-text hover:bg-surface-light border border-border',
        destructive:
          'bg-tension-4 text-white hover:bg-red-700',
      },
      size: {
        sm:   'h-8  px-3 text-xs rounded-md',
        md:   'h-10 px-4 text-sm rounded-md',
        lg:   'h-12 px-6 text-base rounded-lg',
        xl:   'h-14 px-8 text-lg rounded-xl',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'battle',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
