import * as React from 'react'

interface SidebarContextValue {
  isOpen: boolean
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
  toggle: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | undefined>(undefined)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  // Closed by default so it never eats the screen on a phone; open by
  // default on desktop widths, where there's room for it. Re-checked on
  // resize so rotating a device or resizing a window updates the
  // default sensibly.
  const [isOpen, setIsOpen] = React.useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024,
  )

  React.useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    const handleChange = (e: MediaQueryListEvent) => setIsOpen(e.matches)
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  const toggle = React.useCallback(() => setIsOpen((v) => !v), [])

  const value = React.useMemo(
    () => ({ isOpen, setIsOpen, toggle }),
    [isOpen],
  )

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function useSidebar() {
  const ctx = React.useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider')
  return ctx
}
