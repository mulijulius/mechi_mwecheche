import * as React from 'react'
import { cn } from '#/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full rounded-md border border-arena-border bg-arena-surface-2 px-3 py-2 text-sm text-arena-text placeholder:text-arena-text-dim transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arena-gold focus-visible:border-arena-gold',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
