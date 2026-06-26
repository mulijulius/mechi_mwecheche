import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold font-display tracking-wide transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 shrink-0",
  {
    variants: {
      variant: {
        default:
          'bg-arena-gold text-[#15130a] hover:bg-[#f0d36b] active:bg-[#d4b13b]',
        emerald:
          'bg-arena-emerald text-white hover:bg-[#26c97a] active:bg-[#188f57]',
        destructive:
          'bg-arena-red text-white hover:bg-[#ef5d61] active:bg-[#c93b40]',
        outline:
          'border border-arena-border bg-transparent text-arena-text hover:bg-arena-surface-2',
        ghost: 'bg-transparent text-arena-text hover:bg-arena-surface-2',
        link: 'text-arena-gold underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
