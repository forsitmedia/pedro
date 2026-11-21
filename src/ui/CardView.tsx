import type { CSSProperties, PointerEvent } from 'react';
import { cardValue, isRed, rankLabel, suitSymbol } from '../engine/cards';
import type { Card } from '../engine/types';
import { Figure, SkullMark } from './art/Figures';
import { usePrefs, type DeckStyle } from './prefs';

interface Props {
  card: Card | null;
  faceUp: boolean;
  /** Registers the element for animations and drop detection. */
  dataKey?: string;
  selectable?: boolean;
  selected?: boolean;
  flash?: boolean;
  dim?: boolean;
  empty?: boolean;
  /** Invisible but keeps its place (a card is flying towards this spot). */
  hidden?: boolean;
  dropTarget?: boolean;
  over?: boolean;
  draggable?: boolean;
  title?: string;
  className?: string;
  /** Force a deck style (previews); otherwise the player's chosen deck. */
  deck?: DeckStyle;
  style?: CSSProperties;
  onClick?: () => void;
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
}

export function CardView(props: Props) {
  const { card, faceUp, dataKey, selectable, selected, flash, dim, empty, hidden, dropTarget, over, draggable, title, style } = props;
  const showFace = faceUp && card && !empty;
  const prefDeck = usePrefs().deck;
  const deck = props.deck ?? prefDeck;
  const cls = [
    'card',
    `deck-${deck}`,
    empty ? 'card--empty' : showFace ? 'card--face' : 'card--back',
    showFace && isRed(card) ? 'is-red' : '',
    selectable ? 'is-selectable' : '',
    selected ? 'is-selected' : '',
    flash ? 'is-flash' : '',
    dim ? 'is-dim' : '',
    dropTarget ? 'is-droptarget' : '',
    over ? 'is-over' : '',
    draggable ? 'is-draggable' : '',
    props.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={cls}
      data-key={dataKey}
      style={{ ...style, visibility: hidden ? 'hidden' : undefined }}
      onClick={props.onClick}
      onPointerDown={props.onPointerDown}
      role={props.onClick ? 'button' : undefined}
      title={title}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={(e) => {
        if (selectable && props.onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          props.onClick();
        }
      }}
    >
      {empty ? null : showFace ? <Face card={card} deck={deck} /> : <CardBack deck={deck} />}
    </div>
  );
}

function CardBack({ deck }: { deck: DeckStyle }) {
  return <div className="card-back">{deck === 'deadly' ? <SkullMark /> : deck === 'clean' ? null : 'P'}</div>;
}

/** Court cards and the Joker get our own drawn figures (except the minimal "Clean" deck). */
const hasFigures = (deck: DeckStyle) => deck !== 'clean';

function Face({ card, deck }: { card: Card; deck: DeckStyle }) {
  if (card.rank === 0) {
    return (
      <div className="face face--joker">
        <span className="corner">★</span>
        {hasFigures(deck) ? (
          <span className="art">
            <Figure rank={0} suit="★" skull={deck === 'deadly'} />
          </span>
        ) : (
          <span className="joker-label">JOKER</span>
        )}
        <span className="value-pill">0</span>
      </div>
    );
  }
  const r = rankLabel(card.rank);
  const s = suitSymbol(card.suit);
  return (
    <div className="face">
      <span className="corner">
        {r}
        <br />
        <span className="corner-suit">{s}</span>
      </span>
      {card.rank >= 11 && hasFigures(deck) ? (
        <span className="art">
          <Figure rank={card.rank as 11 | 12 | 13} suit={s} skull={deck === 'deadly'} />
        </span>
      ) : (
        <span className="pip">{card.rank >= 11 && deck !== 'clean' ? r : s}</span>
      )}
      <span className="corner corner--br">
        {r}
        <br />
        {s}
      </span>
      {cardValue(card) < 0 && <span className="value-pill">−1</span>}
    </div>
  );
}
