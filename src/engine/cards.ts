import type { Card, PowerRank, Suit } from './types';

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

/** 52 cards + 2 Jokers. */
export function makeDeck(nextId: () => string): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) cards.push({ id: nextId(), rank, suit });
  }
  cards.push({ id: nextId(), rank: 0, suit: 'JK' });
  cards.push({ id: nextId(), rank: 0, suit: 'JK' });
  return cards;
}

export const isRed = (c: Card) => c.suit === 'H' || c.suit === 'D';

/** Joker = 0, red King = −1, otherwise Ace=1 … King=13. */
export function cardValue(c: Card): number {
  if (c.rank === 0) return 0;
  if (c.rank === 13 && isRed(c)) return -1;
  return c.rank;
}

export function powerOf(c: Card): PowerRank | null {
  return c.rank >= 7 && c.rank <= 10 ? (c.rank as PowerRank) : null;
}

export function rankLabel(rank: number): string {
  switch (rank) {
    case 0:
      return 'JOKER';
    case 1:
      return 'A';
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    default:
      return String(rank);
  }
}

export function suitSymbol(s: Suit): string {
  // \uFE0E forces text (not emoji) rendering of the suit symbols.
  return { S: '♠\uFE0E', H: '♥\uFE0E', D: '♦\uFE0E', C: '♣\uFE0E', JK: '★' }[s];
}

export function cardName(c: Card): string {
  return c.rank === 0 ? 'Joker' : `${rankLabel(c.rank)}${suitSymbol(c.suit)}`;
}

export const POWER_TEXT: Record<PowerRank, string> = {
  7: 'Peek at one of your own cards',
  8: "Peek at one opponent's card",
  9: 'Blindly swap two cards between two players',
  10: "Shuffle one player's cards",
};

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
