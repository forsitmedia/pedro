import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { cardName, cardValue } from '../engine/cards';
import { getPlayer } from '../engine/engine';
import type { GameState, RoundResult } from '../engine/types';
import { CardView } from './CardView';
import { usePrefs } from './prefs';
import { play } from './sound';
import { gridPos } from './layout';
import { Icon } from './art/Icon';
import { Avatar, avatarFor } from './art/Avatar';
import { recordRound } from './profile';

/**
 * End of a round, like at a real table: everyone turns their cards over one by one
 * (the Pedro caller first), the verdict on the Pedro call, the round winner full screen,
 * and at the end of the game the Pedro Championship with its cup.
 */

type Step = { kind: 'flip'; player: number; card: number; wait: number } | { kind: 'verdict' | 'winner' | 'champion' | 'table'; wait: number };

const FLIP_MS = 650;
const BETWEEN_PLAYERS_MS = 900;

const systemReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function RoundReveal({
  s,
  meId,
  restartLabel,
  onNext,
  onRestart,
  onExit,
  deadline,
}: {
  /** Seconds before the next round starts on its own. */
  deadline: number | null;
  s: GameState;
  meId: string;
  restartLabel: string;
  onNext: () => void;
  onRestart: () => void;
  onExit: () => void;
}) {
  const prefs = usePrefs();
  const over = s.phase === 'gameOver';
  const results = s.results ?? [];
  const nameOf = (id: string) => (id === meId && getPlayer(s, id)?.name === 'You' ? 'You' : (getPlayer(s, id)?.name ?? '?'));

  // The Pedro caller shows first, then the others in seat order.
  const order: RoundResult[] = useMemo(() => {
    const callerIdx = s.pedro ? results.findIndex((r) => r.playerId === s.pedro!.callerId) : -1;
    const start = callerIdx >= 0 ? callerIdx : 0;
    return results.map((_, i) => results[(start + i) % results.length]);
  }, [s.round, s.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps: Step[] = useMemo(() => {
    const out: Step[] = [];
    order.forEach((r, i) => {
      if (!r.cards.length) out.push({ kind: 'flip', player: i, card: -1, wait: i === 0 ? 900 : BETWEEN_PLAYERS_MS });
      r.cards.forEach((_, j) => out.push({ kind: 'flip', player: i, card: j, wait: j === 0 ? (i === 0 ? 900 : BETWEEN_PLAYERS_MS) : FLIP_MS }));
    });
    out.push({ kind: 'verdict', wait: 1000 });
    out.push({ kind: 'winner', wait: s.pedro && !s.pedro.auto ? 2200 : 1400 });
    if (over) out.push({ kind: 'champion', wait: 3200 });
    out.push({ kind: 'table', wait: over ? 999_999 : 3200 }); // the champion screen waits for a tap
    return out;
  }, [order, over]); // eslint-disable-line react-hooks/exhaustive-deps

  const skipAll = !prefs.animations || systemReducedMotion();
  /** How many steps have happened. */
  // Without animations: straight to the scores (or to the cup at the end of the game).
  const [done, setDone] = useState(skipAll ? (over ? steps.findIndex((x) => x.kind === 'champion') + 1 : steps.length) : 0);
  const caller = s.pedro && !s.pedro.auto ? results.find((r) => r.playerId === s.pedro!.callerId) : undefined;
  const pedroFailed = !!caller?.penalty;

  useEffect(() => {
    if (done >= steps.length) return;
    const st = steps[done];
    const t = setTimeout(() => {
      if (st.kind === 'flip') play('flip');
      if (st.kind === 'verdict' && s.pedro && !s.pedro.auto) play(pedroFailed ? 'wrong' : 'snap');
      if (st.kind === 'winner' || st.kind === 'champion') play('pedro');
      setDone((d) => d + 1);
    }, st.wait);
    return () => clearTimeout(t);
  }, [done, steps]); // eslint-disable-line react-hooks/exhaustive-deps

  const reached = (kind: Step['kind']) => steps.slice(0, done).some((x) => x.kind === kind);
  const flipped = (player: number, card: number) =>
    steps.slice(0, done).some((x) => x.kind === 'flip' && ((x.player === player && x.card >= card) || x.player > player));

  const waitingFor = s.players.filter((p) => !p.isBot && !s.nextReady?.[p.id] && p.id !== meId).map((p) => p.name);
  const roundScore = (r: RoundResult) => r.sum + r.penalty;
  const bestRound = Math.min(...results.map(roundScore));
  const roundWinners = results.filter((r) => roundScore(r) === bestRound);
  const ranking = [...s.players].sort((a, b) => a.total - b.total);
  const champions = ranking.filter((p) => p.total === ranking[0].total);

  const stage = reached('table') ? 'table' : reached('champion') ? 'champion' : reached('winner') ? 'winner' : 'reveal';
  // Skip the suspense: straight to the cup (game over) or to the scores.
  const toTable = () => setDone(steps.length);

  // Your lifetime stats (kept on this device).
  useEffect(() => {
    const mine = results.find((r) => r.playerId === meId);
    if (!mine) return;
    recordRound(`${meId}:${s.round}:${s.players.map((p) => p.total).join(',')}`, {
      score: roundScore(mine),
      wonRound: roundScore(mine) === bestRound,
      calledPedro: !!caller && caller.playerId === meId,
      pedroOk: !!caller && caller.playerId === meId && !pedroFailed,
      gameOver: over,
      wonGame: over && champions.some((p) => p.id === meId),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** A player's hand exactly as it lay on the table (same spots, gaps included), flipped one card at a time. */
  const seat = (playerId: string) => {
    const i = order.findIndex((r) => r.playerId === playerId);
    const r = order[i];
    const p = getPlayer(s, playerId);
    if (!r || !p) return null;
    const shownCards = r.cards.filter((_, j) => flipped(i, j));
    const running = shownCards.reduce((n, c) => n + cardValue(c), 0);
    const started = r.cards.length === 0 ? flipped(i, -1) : flipped(i, 0);
    const verdict = reached('verdict');
    const isCaller = caller?.playerId === playerId;
    const isWinner = verdict && roundScore(r) === bestRound;
    const cols = 2 + Math.max(0, Math.ceil((p.hand.length - 4) / 2));
    let j = -1;
    return (
      <div
        key={playerId}
        className={`reveal-seat ${isWinner ? 'is-winner' : ''} ${playerId === meId ? 'is-me' : ''} ${started ? 'is-started' : ''}`}
        style={{ '--cols': cols, ...(cols > 3 ? { '--cw': `calc(var(--base-cw) * ${3 / cols})` } : {}) } as CSSProperties}
      >
        <div className="reveal-name">
          {isWinner && <Icon name="crown" size="1.1em" />}
          <Avatar code={avatarFor(p)} size="1.6em" bot={p.isBot} />
          {nameOf(playerId)}
          {isCaller && <span className="badge badge--pedro">called Pedro</span>}
        </div>
        <div className="reveal-body">
          <div className="hand">
            {p.hand.map((c, slot) => {
              if (!c) return <CardView key={`e${slot}`} card={null} faceUp={false} empty style={gridPos(slot)} />;
              j++;
              const card = r.cards[j] ?? c;
              return <CardView key={card.id} card={card} faceUp={flipped(i, j)} title={cardName(card)} style={gridPos(slot)} />;
            })}
          </div>
          <div className="reveal-score">
            <span key={running} className="reveal-sum">
              {started ? running : '?'}
            </span>
            {r.cards.length === 0 && <span className="reveal-empty">no cards!</span>}
            {verdict && isCaller && (
              <span className={`reveal-stamp ${pedroFailed ? 'is-bad' : 'is-good'}`}>{pedroFailed ? `+${r.penalty} PEDRO FAILED` : '✓ PEDRO!'}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="reveal-screen" role="dialog" aria-label={`Round ${s.round} results`}>
      {(stage === 'reveal' || stage === 'winner') && (
        <div className="reveal">
          <header className="reveal-head">
            <h2>Round {s.round} — show your cards!</h2>
            {s.pedro && (
              <p className="reveal-caller">
                {s.pedro.auto ? `${nameOf(s.pedro.callerId)} ran out of cards` : `${nameOf(s.pedro.callerId)} called Pedro`}
              </p>
            )}
            <button className="btn reveal-skip" onClick={() => setDone(over ? steps.findIndex((x) => x.kind === 'champion') + 1 : steps.length)}>
              Skip ▸
            </button>
          </header>
          <div className="reveal-table">
            <div className="reveal-opps">{s.players.filter((p) => p.id !== meId).map((p) => seat(p.id))}</div>
            <div className="reveal-mine">{seat(meId)}</div>
          </div>
        </div>
      )}

      {stage === 'winner' && (
        <button className="reveal-splash" onClick={() => setDone(steps.findIndex((x) => x.kind === 'winner') + 1)}>
          <span className="reveal-splash-kicker">Round {s.round} winner</span>
          <span className="splash-avatars">
            {roundWinners.map((r) => (
              <Avatar key={r.playerId} code={avatarFor(getPlayer(s, r.playerId) ?? { name: '' })} size="100%" bot={getPlayer(s, r.playerId)?.isBot} />
            ))}
          </span>
          <span className="reveal-splash-name">{roundWinners.map((r) => nameOf(r.playerId)).join(' & ')}</span>
          <span className="reveal-splash-sub">
            with {bestRound} point{Math.abs(bestRound) === 1 ? '' : 's'}
            {caller && pedroFailed && ` · ${nameOf(caller.playerId) === 'You' ? 'Your' : `${nameOf(caller.playerId)}'s`} Pedro failed: +${caller.penalty}`}
          </span>
          <span className="reveal-tap">tap to continue</span>
        </button>
      )}

      {stage === 'champion' && (
        <button className="reveal-splash reveal-splash--champion" onClick={toTable}>
          <span className="reveal-confetti" aria-hidden>
            {Array.from({ length: 28 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    '--i': i,
                    '--x': `${(i * 37) % 100}%`,
                    '--dur': `${2.6 + ((i * 7) % 10) * 0.18}s`,
                    '--delay': `${-((i * 13) % 28) * 0.13}s`,
                  } as CSSProperties
                }
              />
            ))}
          </span>
          <span className="reveal-splash-kicker">The Pedro Championship</span>
          <span className="reveal-cup" aria-hidden>
            <Icon name="trophy" size="100%" />
            {champions[0] && <Avatar code={avatarFor(champions[0])} size="42%" className="cup-avatar" bot={champions[0].isBot} />}
          </span>
          <span className="reveal-splash-name">{champions.map((p) => nameOf(p.id)).join(' & ')}</span>
          <span className="reveal-splash-sub">
            {champions.length > 1 ? 'share the title' : 'is the champion'} with {champions[0].total} point{champions[0].total === 1 ? '' : 's'}
          </span>
          <span className="reveal-tap">tap to see the final scores</span>
        </button>
      )}

      {stage === 'table' && (
        <div className="standings">
          <h2>{over ? <><Icon name="trophy" size="1.2em" /> {champions.map((p) => nameOf(p.id)).join(' & ')} — Pedro champion{champions.length > 1 ? 's' : ''}!</> : `After round ${s.round}`}</h2>
          <div className="standings-list">
            {[...results]
              .sort((a, b) => a.total - b.total)
              .map((r, place) => (
                <div key={r.playerId} className={`standings-row ${r.playerId === meId ? 'is-me' : ''} ${roundScore(r) === bestRound ? 'is-best' : ''}`}>
                  <span className="standings-place">{over && place === 0 ? <Icon name="trophy" size="1.3em" /> : place + 1}</span>
                  <Avatar code={avatarFor(getPlayer(s, r.playerId) ?? { name: '' })} size="1.8em" bot={getPlayer(s, r.playerId)?.isBot} />
                  <span className="standings-name">
                    {nameOf(r.playerId)} {roundScore(r) === bestRound && <Icon name="crown" size="1em" />}
                  </span>
                  <span className="standings-cards">
                    {r.cards.length
                      ? r.cards.map((c) => (
                          <span key={c.id} className={`mini ${c.suit === 'H' || c.suit === 'D' ? 'is-red' : ''}`}>
                            {cardName(c)}
                          </span>
                        ))
                      : '—'}
                  </span>
                  <span className="standings-round">
                    +{r.sum}
                    {r.penalty ? <span className="penalty"> +{r.penalty}</span> : null}
                  </span>
                  <span className="standings-total">{r.total}</span>
                  {s.settings.limit && <Progress before={r.total - r.sum - r.penalty} after={r.total} limit={s.settings.limit} />}
                </div>
              ))}
          </div>
          <div className="buttons standings-buttons">
            {over ? (
              <>
                <button className="btn btn--primary" onClick={onRestart}>
                  {restartLabel}
                </button>
                <button className="btn" onClick={onExit}>
                  Menu
                </button>
              </>
            ) : s.nextReady?.[meId] ? (
              <p className="standings-wait">
                ✓ You're ready — waiting for {waitingFor.join(', ')}
                {deadline !== null && ` · next round in ${deadline}s`}
              </p>
            ) : (
              <>
                <button className="btn btn--primary" onClick={onNext}>
                  Ready for the next round
                </button>
                {deadline !== null && <p className="standings-wait">Starts on its own in {deadline}s</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Progress({ before, after, limit }: { before: number; after: number; limit: number }) {
  const pct = (x: number) => `${Math.min(100, Math.max(0, (x / limit) * 100))}%`;
  const lost = after >= limit;
  const danger = !lost && after >= limit * 0.7;
  const b = Math.max(0, Math.min(before, after));
  return (
    <span className="standings-progress">
      <span className={`progress ${lost ? 'is-lost' : danger ? 'is-danger' : ''}`}>
        <span className="progress-before" style={{ width: pct(b) }} />
        <span className="progress-add" style={{ left: pct(b), width: pct(Math.max(0, after - b)) }} />
      </span>
      <span className="progress-text">
        {after} / {limit}
      </span>
    </span>
  );
}
