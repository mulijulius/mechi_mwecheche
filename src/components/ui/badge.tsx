import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold font-display tracking-wide w-fit',
  {
    variants: {
      variant: {
        default: 'border-arena-border bg-arena-surface-2 text-arena-text-dim',
        gold: 'border-arena-gold/30 bg-arena-gold/10 text-arena-gold',
        emerald: 'border-arena-emerald/30 bg-arena-emerald/10 text-arena-emerald',
        red: 'border-arena-red/30 bg-arena-red/10 text-arena-red',
        outline: 'border-arena-border bg-transparent text-arena-text',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
