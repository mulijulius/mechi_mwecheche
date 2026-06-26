import type { LucideIcon } from 'lucide-react'
import { Card } from '#/components/ui/card'
import { cn } from '#/lib/utils'

interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  accent?: 'gold' | 'emerald' | 'red' | 'default'
  trend?: string
}

const ACCENT_CLASSES: Record<NonNullable<StatCardProps['accent']>, string> = {
  gold: 'text-arena-gold bg-arena-gold/10 border-arena-gold/30',
  emerald: 'text-arena-emerald bg-arena-emerald/10 border-arena-emerald/30',
  red: 'text-arena-red bg-arena-red/10 border-arena-red/30',
  default: 'text-arena-text-dim bg-arena-surface-2 border-arena-border',
}

export function StatCard({ label, value, icon: Icon, accent = 'default', trend }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-arena-text-dim">{label}</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-arena-text tabular">
            {value}
          </p>
          {trend && <p className="mt-1 text-xs text-arena-text-dim">{trend}</p>}
        </div>
        <div className={cn('flex size-9 items-center justify-center rounded-lg border', ACCENT_CLASSES[accent])}>
          <Icon className="size-4" />
        </div>
      </div>
    </Card>
  )
}
