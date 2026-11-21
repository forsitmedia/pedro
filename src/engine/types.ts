export type Suit = 'S' | 'H' | 'D' | 'C' | 'JK';

export interface Card {
  /** Unique physical-card id. Re-issued when a hand is shuffled by a 10, so memory of positions is lost. */
  id: string;
  /** 0 = Joker, 1 = Ace … 13 = King */
  rank: number;
  suit: Suit;
}

export interface SlotRef {
  playerId: string;
  slot: number;
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  /** Face-down cards. `null` = an empty spot left after throwing a card away. */
  hand: (Card | null)[];
  /** Cumulative score across rounds. */
  total: number;
}

export type Phase =
  | 'peek' // everyone looks at 2 of their 4 cards
  | 'turnStart' // current player may call Pedro, draw from deck, or take the discard
  | 'drawn' // current player holds a card drawn from the deck
  | 'power' // drawn power card was discarded; current player may use its power
  | 'roundEnd'
  | 'gameOver';

export type PowerRank = 7 | 8 | 9 | 10;

export interface GameSettings {
  /** Points at which a player loses (30/50/80). `null` = one-shot single round. */
  limit: number | null;
}

export interface PedroState {
  callerId: string;
  /** true when triggered by a player emptying their hand (no +10 risk). */
  auto: boolean;
  /** Players who still have to play their final turn. */
  remaining: string[];
}

export interface RoundResult {
  playerId: string;
  cards: Card[];
  sum: number;
  penalty: number;
  total: number;
}

export type EventKind =
  | 'deal'
  | 'peek'
  | 'ready'
  | 'start'
  | 'pedro'
  | 'draw'
  | 'takeDiscard'
  | 'swap'
  | 'discard'
  | 'power'
  | 'skipPower'
  | 'snap'
  | 'snapWrong'
  | 'snapSlow'
  | 'penalty'
  | 'reshuffle'
  | 'turn'
  | 'roundEnd'
  | 'gameOver';

export interface GameEvent {
  id: number;
  kind: EventKind;
  actorId?: string;
  text: string;
  /** Slots affected (UI flashes them so players can follow the action). */
  slots?: SlotRef[];
  /** Cards shown face-up to some players. */
  reveal?: { to: string[] | 'all'; cards: { ref: SlotRef; card: Card }[] };
  card?: Card;
  /** For penalties: why the cards were given (and who caused it). */
  penalty?: { reason: PenaltyReason; byId?: string };
  at: number;
}

/** wrong = threw a non-matching card · slow = someone else threw first · caught = another player threw your card */
export type PenaltyReason = 'wrong' | 'slow' | 'caught';

export interface GameState {
  settings: GameSettings;
  players: Player[];
  deck: Card[];
  discard: Card[];
  /** Top discard was thrown by matching — it cannot be picked up. */
  topBurned: boolean;
  /** Each discard opens a "throw window"; the first correct matching throw closes it. */
  snap: { eventId: number; open: boolean; closedAt: number; by?: string };
  phase: Phase;
  current: number;
  starter: number;
  round: number;
  drawn: Card | null;
  pendingPower: PowerRank | null;
  peeked: Record<string, boolean>;
  ready: Record<string, boolean>;
  /** Card ids each player has seen and can (in theory) remember. */
  known: Record<string, string[]>;
  pedro: PedroState | null;
  results: RoundResult[] | null;
  events: GameEvent[];
  seq: number;
  idSeq: number;
  turnCount: number;
}

export type Action =
  | { type: 'PEEK'; playerId: string; slots: [number, number] }
  | { type: 'READY'; playerId: string }
  | { type: 'CALL_PEDRO'; playerId: string }
  | { type: 'DRAW'; playerId: string }
  | { type: 'TAKE_DISCARD'; playerId: string; slot: number }
  | { type: 'SWAP'; playerId: string; slot: number }
  | { type: 'DISCARD'; playerId: string }
  | { type: 'POWER'; playerId: string; target?: SlotRef; target2?: SlotRef; targetPlayerId?: string }
  | { type: 'SKIP_POWER'; playerId: string }
  | { type: 'SNAP'; playerId: string; target: SlotRef }
  | { type: 'NEXT_ROUND' };

export interface Ctx {
  rng: () => number;
  now: number;
}
