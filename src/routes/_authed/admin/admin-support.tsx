import * as React from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Loader2, Send } from 'lucide-react'
import { Card } from '#/components/ui/card'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { cn } from '#/lib/utils'
import { supabase } from '#/utils/supabase'
import { formatRelativeTime } from '#/utils/format'
import { useAuth } from '#/lib/auth-context'
import type { Database } from '#/types/database.types'

export const Route = createFileRoute('/_authed/admin/support')({
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) throw redirect({ to: '/signin' })

    const { data: profile } = await supabase
      .from('profiles')
      .select('admin_role, admin_status')
      .eq('id', userId)
      .single()

    const allowed =
      profile?.admin_status === 'approved' &&
      (profile.admin_role === 'super_admin' || profile.admin_role === 'support')

    if (!allowed) throw redirect({ to: '/admin' })
  },
  component: AdminSupportPage,
})

type Profile = Database['public']['Tables']['profiles']['Row']
type SupportMessage = Database['public']['Tables']['support_messages']['Row']

interface Thread {
  player: Profile
  lastMessage: SupportMessage | null
}

function AdminSupportPage() {
  const { user } = useAuth()
  const [threads, setThreads] = React.useState<Array<Thread>>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [selectedPlayerId, setSelectedPlayerId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<Array<SupportMessage>>([])
  const [draft, setDraft] = React.useState('')
  const [isSending, setIsSending] = React.useState(false)

  const loadThreads = React.useCallback(async () => {
    const [{ data: allMessages }, { data: players }] = await Promise.all([
      supabase
        .from('support_messages')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'player'),
    ])

    const lastByPlayer = new Map<string, SupportMessage>()
    for (const m of allMessages ?? []) {
      if (!lastByPlayer.has(m.player_id)) lastByPlayer.set(m.player_id, m)
    }

    const withMessages = (players ?? [])
      .filter((p) => lastByPlayer.has(p.id))
      .map((p) => ({ player: p, lastMessage: lastByPlayer.get(p.id) ?? null }))
      .sort(
        (a, b) =>
          new Date(b.lastMessage?.created_at ?? 0).getTime() -
          new Date(a.lastMessage?.created_at ?? 0).getTime(),
      )

    setThreads(withMessages)
    setIsLoading(false)
  }, [])

  React.useEffect(() => {
    loadThreads()
  }, [loadThreads])

  React.useEffect(() => {
    if (!selectedPlayerId) return
    let isMounted = true

    supabase
      .from('support_messages')
      .select('*')
      .eq('player_id', selectedPlayerId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (isMounted) setMessages(data ?? [])
      })

    const channel = supabase
      .channel(`support-${selectedPlayerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `player_id=eq.${selectedPlayerId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as SupportMessage])
        },
      )
      .subscribe()

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [selectedPlayerId])

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPlayerId || !draft.trim() || !user) return
    setIsSending(true)

    const { error } = await supabase.from('support_messages').insert({
      player_id: selectedPlayerId,
      sender: 'admin',
      sender_id: user.id,
      body: draft.trim(),
    })

    if (!error) {
      setDraft('')
      loadThreads()
    }
    setIsSending(false)
  }

  const selectedThread = threads.find((t) => t.player.id === selectedPlayerId)

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-arena-gold">
          Admin console · Support
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-arena-text">
          Player chats
        </h1>
        <p className="mt-1 text-sm text-arena-text-dim">
          Respond to players who&rsquo;ve reached out. Threads appear here once a player sends a
          first message.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-arena-text-dim">
          <Loader2 className="size-4 animate-spin" />
          Loading conversations…
        </div>
      ) : (
        <div className="flex gap-4" style={{ height: 'calc(100vh - 220px)' }}>
          <Card className="w-72 shrink-0 overflow-y-auto p-0">
            {threads.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-arena-text-dim">
                No conversations yet.
              </div>
            ) : (
              <ul className="divide-y divide-arena-border">
                {threads.map(({ player, lastMessage }) => (
                  <li key={player.id}>
                    <button
                      onClick={() => setSelectedPlayerId(player.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                        selectedPlayerId === player.id
                          ? 'bg-arena-gold/10'
                          : 'hover:bg-arena-surface-2',
                      )}
                    >
                      <Avatar>
                        <AvatarFallback>{player.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-arena-text">
                          {player.full_name || player.username}
                        </p>
                        <p className="truncate text-xs text-arena-text-dim">
                          {lastMessage?.body ?? 'No messages yet'}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-1 flex-col p-0">
            {!selectedThread ? (
              <div className="flex flex-1 items-center justify-center text-sm text-arena-text-dim">
                Select a conversation to view and reply.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-arena-border px-5 py-3">
                  <Avatar>
                    <AvatarFallback>
                      {selectedThread.player.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-sm font-medium text-arena-text">
                    {selectedThread.player.full_name || selectedThread.player.username}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <ul className="flex flex-col gap-3">
                    {messages.map((m) => (
                      <li
                        key={m.id}
                        className={cn(
                          'max-w-[70%] rounded-lg px-3 py-2 text-sm',
                          m.sender === 'admin'
                            ? 'ml-auto bg-arena-gold text-[#15130a]'
                            : 'bg-arena-surface-2 text-arena-text',
                        )}
                      >
                        <p>{m.body}</p>
                        <p
                          className={cn(
                            'mt-1 text-[10px]',
                            m.sender === 'admin' ? 'text-[#15130a]/60' : 'text-arena-text-dim',
                          )}
                        >
                          {formatRelativeTime(m.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>

                <form onSubmit={sendReply} className="flex items-center gap-2 border-t border-arena-border p-3">
                  <Input
                    placeholder="Type a reply…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <Button type="submit" size="icon" disabled={isSending || !draft.trim()}>
                    <Send className="size-4" />
                  </Button>
                </form>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
