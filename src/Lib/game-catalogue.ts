import type { GameSlug } from '#/types/database.types'

export interface GameMeta {
  slug: GameSlug
  name: string
  tagline: string
  minPlayers: number
  maxPlayers: number
  minStakeKes: number
  accentVar: '--color-arena-gold' | '--color-arena-emerald' | '--color-arena-red'
  glyph: string
}

export const GAME_CATALOGUE: Array<GameMeta> = [
  {
    slug: 'ludo',
    name: 'Ludo',
    tagline: 'Race four home. Highest roll takes the table.',
    minPlayers: 2,
    maxPlayers: 4,
    minStakeKes: 50,
    accentVar: '--color-arena-gold',
    glyph: '⚃',
  },
  {
    slug: 'checkers',
    name: 'Checkers',
    tagline: 'Clear the board. No draws, no mercy.',
    minPlayers: 2,
    maxPlayers: 2,
    minStakeKes: 100,
    accentVar: '--color-arena-emerald',
    glyph: '⛀',
  },
  {
    slug: 'chess',
    name: 'Chess',
    tagline: 'Sixty-four squares. One winner.',
    minPlayers: 2,
    maxPlayers: 2,
    minStakeKes: 200,
    accentVar: '--color-arena-gold',
    glyph: '♞',
  },
  {
    slug: 'billiards',
    name: 'Billiards',
    tagline: '8-ball, called pockets, table stakes.',
    minPlayers: 2,
    maxPlayers: 2,
    minStakeKes: 150,
    accentVar: '--color-arena-red',
    glyph: '●',
  },
  {
    slug: 'solitaire',
    name: 'Solitaire (Poker)',
    tagline: 'Beat the house score, solo stakes.',
    minPlayers: 1,
    maxPlayers: 1,
    minStakeKes: 50,
    accentVar: '--color-arena-emerald',
    glyph: '♠',
  },
]
