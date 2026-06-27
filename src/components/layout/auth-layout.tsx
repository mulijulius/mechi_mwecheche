import * as React from 'react'

export function AuthLayout({
  children,
  eyebrow,
  title,
  description,
}: {
  children: React.ReactNode
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-screen bg-arena-bg">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-arena-surface p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, var(--color-arena-gold) 0, transparent 35%), radial-gradient(circle at 80% 70%, var(--color-arena-emerald) 0, transparent 35%)',
          }}
        />
        <div className="relative flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-arena-gold font-display text-base font-bold text-[#15130a]">
            SA
          </div>
          <span className="font-display text-lg font-semibold text-arena-text">
            SkillForge Arena
          </span>
        </div>

        <div className="relative">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
            {eyebrow}
          </p>
          <h1 className="mb-4 max-w-md font-display text-4xl font-semibold leading-[1.1] text-arena-text">
            {title}
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-arena-text-dim">
            {description}
          </p>

          <div className="mt-10 flex gap-6 font-mono text-sm tabular">
            <div>
              <p className="text-2xl font-semibold text-arena-gold">5</p>
              <p className="text-xs text-arena-text-dim">games on the floor</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-arena-emerald">M-Pesa</p>
              <p className="text-xs text-arena-text-dim">deposit & withdraw</p>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-arena-text-dim">
          Stakes are real. Play responsibly.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex size-8 items-center justify-center rounded-md bg-arena-gold font-display text-sm font-bold text-[#15130a]">
              SA
            </div>
            <span className="font-display text-base font-semibold text-arena-text">
              SkillForge Arena
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
