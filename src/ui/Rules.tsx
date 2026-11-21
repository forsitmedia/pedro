import type { ReactNode } from 'react';
import type { Card } from '../engine/types';
import { Avatar } from './art/Avatar';
import { Icon } from './art/Icon';
import { CardView } from './CardView';

/**
 * "How to play": each rule explained step by step, with real cards and little looping
 * demos where a hand pointer taps and moves cards like a player would.
 */

const c = (rank: number, suit: Card['suit'] = 'S', id = `r${rank}${suit}`): Card => ({ id, rank, suit });

/** The pointer that "plays" in the demos. */
function Pointer({ className }: { className: string }) {
  return (
    <span className={`demo-pointer ${className}`} aria-hidden>
      <svg viewBox="0 0 26 30" width="26" height="30">
        <path
          d="M9 2.5c1.4 0 2.4 1 2.4 2.4v8.3l1.2-.3c1.2-.3 2.4.4 2.7 1.5l.1.4 1.1-.2c1.2-.2 2.3.5 2.6 1.6l1-.1c1.3-.1 2.4.9 2.4 2.2v4.4c0 3.6-2.9 6.5-6.5 6.5h-3.1c-2.1 0-4-1-5.2-2.7L3 19.6c-.7-1-.5-2.4.5-3.1 1-.7 2.3-.5 3 .4l.1.1V4.9C6.6 3.5 7.6 2.5 9 2.5Z"
          fill="#fff"
          stroke="#1a1206"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <span className="demo-tap" />
    </span>
  );
}

const Back = () => <CardView card={null} faceUp={false} />;
const Face = ({ card }: { card: Card }) => <CardView card={card} faceUp />;

/** A card that turns face up and back down, timed by the animation class it gets. */
function Flip({ card, anim, className = '' }: { card: Card; anim: string; className?: string }) {
  return (
    <span className={`demo-flip ${className}`}>
      <span className={`demo-flip-inner ${anim}`}>
        <span className="demo-flip-back">
          <Back />
        </span>
        <span className="demo-flip-front">
          <Face card={card} />
        </span>
      </span>
    </span>
  );
}

/** Captions that change in step with a demo (each one shows during its slice of the loop). */
function Captions({ items, anim }: { items: string[]; anim: string }) {
  return (
    <div className={`demo-captions ${anim}`}>
      {items.map((t, i) => (
        <span key={i} className={`demo-caption demo-caption--${i + 1}`}>
          <b>{i + 1}</b> {t}
        </span>
      ))}
    </div>
  );
}

function Section({ n, title, children, demo }: { n: number; title: string; children: ReactNode; demo?: ReactNode }) {
  return (
    <section className="rule">
      <div className="rule-head">
        <span className="rule-n">{n}</span>
        <h3>{title}</h3>
      </div>
      {demo && <div className="rule-demo">{demo}</div>}
      <div className="rule-text">{children}</div>
    </section>
  );
}

const VALUES: [Card, string][] = [
  [c(13, 'H'), '−1'],
  [c(0, 'S'), '0'],
  [c(1, 'S'), '1'],
  [c(7, 'D'), '7'],
  [c(11, 'C'), '11'],
  [c(12, 'H'), '12'],
  [c(13, 'S'), '13'],
];

/** Draw from the deck (or take from the pile), look, pick one of your 4 cards, swap. */
function SwapDemo({ from }: { from: 'deck' | 'pile' }) {
  const drawn = from === 'deck' ? c(2, 'C', 'dd') : c(3, 'H', 'dp');
  const old = from === 'deck' ? c(9, 'S', 'od') : c(12, 'S', 'op');
  return (
    <div className={`demo-swapturn demo-swapturn--${from}`}>
      <div className="demo-stage demo-turn">
        <span className="demo-slot demo-slot--deck">
          <Back />
          <small>Deck</small>
        </span>
        <span className="demo-slot demo-slot--pile">
          {from === 'pile' ? (
            <span className="demo-pile-top">
              <Face card={drawn} />
            </span>
          ) : (
            <span className="demo-ghost" />
          )}
          <small>Pile</small>
        </span>
        <span className="demo-slot demo-slot--hand">
          <span className="demo-hand demo-hand--small">
            <span className="demo-cell demo-cell--1">
              <Back />
            </span>
            <span className="demo-cell demo-cell--2">
              <Back />
            </span>
            <span className="demo-cell demo-cell--3">
              <Back />
            </span>
            <span className="demo-cell demo-cell--4">
              <Back />
            </span>
          </span>
          <small>Your 4 cards</small>
        </span>
        <span className="demo-move demo-move--in">
          <Face card={drawn} />
        </span>
        <span className="demo-move demo-move--out">
          <Face card={old} />
        </span>
        <Pointer className="demo-pointer--turn" />
      </div>
      <Captions
        anim="caps-turn"
        items={
          from === 'deck'
            ? ['Tap the deck', 'Only you see the card: a 2!', 'Tap the card to replace', 'The 2 goes in, your old 9 goes to the pile']
            : ['Tap the pile (everyone sees it)', 'You want that 3 — but you must swap it', 'Tap the card to replace', 'The 3 goes in, your old Q goes to the pile']
        }
      />
    </div>
  );
}

export function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rules rules--visual" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="How to play">
        <button className="icon-btn icon-btn--small sheet-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size="55%" />
        </button>
        <h2 className="rules-title">How to play Pedro</h2>
        <p className="rules-intro">
          Pedro is an Argentinian card game. Each round, the goal is to finish with the <b>fewest points</b> in your hand. Your cards lie
          face down, so you need a good memory — and some cheek: swap cards, peek, throw, and call <b>Pedro!</b> when you think you're the
          lowest.
        </p>

        <Section
          n={1}
          title="Every card is worth points"
          demo={
            <div className="demo-values">
              {VALUES.map(([card, v]) => (
                <span key={card.id} className="demo-value">
                  <Face card={card} />
                  <b className={v.startsWith('−') ? 'is-best' : ''}>{v}</b>
                </span>
              ))}
            </div>
          }
        >
          <p>At the end of a round you add up the cards in your hand. Low is good, high is bad.</p>
          <ul className="rule-list">
            <li>
              <b>
                Red King (<span className="suit-red">♥ ♦</span>) = −1
              </b>{' '}
              — the best card in the game
            </li>
            <li>
              <b>Joker = 0</b>
            </li>
            <li>
              <b>Ace = 1</b>, number cards = their number (2 to 10)
            </li>
            <li>
              <b>J = 11, Q = 12, Black King (♠ ♣) = 13</b> — the worst card
            </li>
          </ul>
        </Section>

        <Section
          n={2}
          title="The start: look at 2 of your cards"
          demo={
            <div className="demo-peek">
              <div className="demo-stage demo-peek-stage">
                <span className="demo-hand">
                  <Back />
                  <Back />
                  <Flip card={c(2, 'H', 'p1')} anim="peek-a" />
                  <Flip card={c(13, 'D', 'p2')} anim="peek-b" />
                </span>
                <Pointer className="demo-pointer--peek" />
              </div>
              <Captions anim="caps-peek" items={['Tap 2 of your cards', 'Memorize them: a 2 and a Red King (−1)!', 'They turn face down again']} />
            </div>
          }
        >
          <p>
            Everyone gets <b>4 cards face down</b>, in a square. At the very start you tap <b>2 of them</b> to look — you see them for a
            few seconds, then they're hidden for good.
          </p>
          <p className="muted">The other 2 you don't know yet. Remembering what's where is half the game.</p>
        </Section>

        <Section n={3} title="Your turn: draw and swap" demo={<SwapDemo from="deck" />}>
          <p>
            Tap the <b>deck</b> to draw. Only you see the card. Then choose:
          </p>
          <ul className="rule-list">
            <li>
              <b>Swap it:</b> tap one of your 4 cards. The new card takes its place face down — <b>nobody else sees it</b>. The old
              card goes face up onto the pile, so everyone sees only the card you get rid of.
            </li>
            <li>
              <b>Or throw it away:</b> tap the pile, and your cards stay as they are.
            </li>
          </ul>
          <p className="muted">Tip: swap away your high cards — or the ones you don't know.</p>
        </Section>

        <Section n={4} title="…or take the card on the pile" demo={<SwapDemo from="pile" />}>
          <p>
            Instead of drawing, you can take the <b>top card of the pile</b> — everyone can see it, so you know exactly what you get. But
            then you <b>must swap it</b> with one of your cards.
          </p>
          <p className="muted">
            A card that was thrown (burned <Icon name="fire" size={14} />) can't be taken.
          </p>
        </Section>

        <Section n={5} title="Power cards: 7, 8, 9, 10">
          <p>
            If you <b>draw</b> a 7, 8, 9 or 10 from the deck you can use its <b>power</b> instead of keeping it — it then goes on the
            pile. It's optional: you can also keep it like a normal card. A power card taken from the pile, or already in your hand, has
            no power.
          </p>
          <div className="powers">
            <div className="power">
              <div className="power-demo">
                <Face card={c(7, 'H')} />
                <span className="power-arrow">→</span>
                <Flip card={c(4, 'S')} anim="power-peek" className="is-mine" />
              </div>
              <b>7 · Look at one of yours</b>
              <span>Tap one of your cards: you see it for a moment. Useful for the 2 cards you didn't look at when the game started.</span>
            </div>
            <div className="power">
              <div className="power-demo">
                <Face card={c(8, 'D')} />
                <span className="power-arrow">→</span>
                <span className="power-rival">
                  <Avatar code="fox.4.cap" size={22} />
                  <Flip card={c(12, 'C')} anim="power-peek" />
                </span>
              </div>
              <b>8 · Spy on a rival</b>
              <span>Tap someone else's card: only you see it. Remember it — knowing a rival's card will be very useful later (see section 6).</span>
            </div>
            <div className="power">
              <div className="power-demo">
                <Face card={c(9, 'S')} />
                <span className="power-arrow">→</span>
                <span className="demo-swap">
                  <span className="demo-swap-a">
                    <Back />
                  </span>
                  <span className="demo-swap-b">
                    <Back />
                  </span>
                </span>
              </div>
              <b>9 · Blind swap</b>
              <span>Tap two cards of two different players (one can be yours). They swap places — nobody sees them. Give away a bad card!</span>
            </div>
            <div className="power">
              <div className="power-demo">
                <Face card={c(10, 'C')} />
                <span className="power-arrow">→</span>
                <span className="demo-shuffle">
                  <Back />
                  <Back />
                  <Back />
                  <Back />
                </span>
              </div>
              <b>10 · Shuffle a hand</b>
              <span>Tap a player (you too): their cards get mixed up, so they don't know which is which anymore.</span>
            </div>
          </div>
        </Section>

        <Section
          n={6}
          title="Throw a matching card — anytime"
          demo={
            <div className="demo-stage demo-throw">
              <span className="demo-slot">
                <Face card={c(6, 'C')} />
                <small>Pile</small>
              </span>
              <span className="demo-throw-card">
                <Face card={c(6, 'H')} />
              </span>
              <Pointer className="demo-pointer--throw" />
              <span className="demo-throw-fire">
                <Icon name="fire" size={34} />
              </span>
            </div>
          }
        >
          <p>
            Whenever a card lands on the pile, <b>anyone</b> can throw a card of the same value on top of it — even when it's not your
            turn. Example: someone discards a 6 and you know you have a 6 → drag it onto the pile, fast!
          </p>
          <ul className="outcomes">
            <li>
              <span className="chip chip--good">Your own card</span> one card less for you
            </li>
            <li>
              <span className="chip chip--good">Double</span> first with your own 6? Throw your other 6 too
            </li>
            <li>
              <span className="chip chip--mean">A rival's card</span> you remembered their 6? Throw it: they get +2 cards
            </li>
            <li>
              <span className="chip chip--bad">Wrong card</span> it goes back (now everyone saw it) and you get +2 cards
            </li>
            <li>
              <span className="chip chip--bad">Too slow</span> someone was faster: your card goes back, +1 card
            </li>
            <li>
              <span className="chip">
                <Icon name="fire" size={12} /> Burned
              </span>
              a thrown card can't be taken from the pile
            </li>
          </ul>
        </Section>

        <Section
          n={7}
          title="Call PEDRO! to end the round"
          demo={
            <div className="demo-pedro">
              <span className="demo-pedro-btn">PEDRO!</span>
            </div>
          }
        >
          <ol className="steps">
            <li>
              When you think <b>your total is the lowest</b>, press <b>PEDRO!</b> at the start of your turn (before drawing).
            </li>
            <li>You still play that turn, then everyone else plays one last turn.</li>
            <li>
              All cards are turned over and counted. If you're <b>not strictly the lowest</b> (a tie counts against you), you get{' '}
              <b>+10 points</b>.
            </li>
          </ol>
          <p className="muted">If someone throws away all their cards, it's an automatic Pedro — with no risk for them.</p>
        </Section>

        <Section
          n={8}
          title="Win the Pedro Championship"
          demo={
            <div className="demo-cup">
              <Icon name="trophy" size={56} />
            </div>
          }
        >
          <p>
            Your points add up round after round. When someone reaches the limit you chose (<b>30, 50 or 80</b>), the game ends — and the
            player with the <b>lowest total</b> is the Pedro champion.
          </p>
        </Section>

        <button className="btn btn--primary btn--big rules-done" onClick={onClose}>
          Got it — let's play
        </button>
      </div>
    </div>
  );
}
