export function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rules" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>How to play Pedro</h2>
        <p>
          <b>Goal:</b> have the <b>lowest total</b> in your cards. Points add up over the rounds — whoever reaches the
          limit (30, 50 or 80) first loses.
        </p>

        <h3>Card values</h3>
        <ul>
          <li>Joker = 0 · Red King (♥ ♦) = −1</li>
          <li>Ace = 1, 2–10 face value, J = 11, Q = 12, Black King = 13</li>
        </ul>

        <h3>Start</h3>
        <p>Everyone gets 4 face-down cards. Look at 2 of them — only once. Then remember!</p>

        <h3>Your turn</h3>
        <ul>
          <li>
            <b>Draw from the deck</b>, then either swap it with one of your cards (the old one is discarded) or discard
            it.
          </li>
          <li>
            Or <b>take the top discard</b> — you must swap it with one of your cards. (Not allowed if that card is 🔥
            burned.)
          </li>
        </ul>

        <h3>Powers — only when you discard a card you just drew from the deck</h3>
        <ul>
          <li>
            <b>7</b> — look at one of your cards
          </li>
          <li>
            <b>8</b> — look at one opponent's card
          </li>
          <li>
            <b>9</b> — blindly swap two cards of two different players (yours included)
          </li>
          <li>
            <b>10</b> — shuffle all the cards of one player
          </li>
        </ul>
        <p>Using a power is optional. A power card you swapped into your hand, or took from the discard, has no power.</p>

        <h3>Throwing matching cards ⚡</h3>
        <p>
          Whenever a card is discarded, <b>anyone</b> can throw a card of the same rank on top of it (7 on 7, K on K) —
          even out of turn. Drag the card onto the discard pile, or press ⚡ Throw and click it.
        </p>
        <ul>
          <li>Your own card: you have one card less. 🎉</li>
          <li>An opponent's card: they get 2 penalty cards.</li>
          <li>Wrong card: it goes back (now everyone has seen it) and you get 2 penalty cards.</li>
          <li>Too slow (someone threw first): your card goes back and you get 1 penalty card.</li>
          <li>A thrown card is 🔥 burned — nobody can pick it up.</li>
        </ul>

        <h3>PEDRO!</h3>
        <p>
          At the start of your turn (before drawing) you can call <b>Pedro</b>: you play your turn and everyone else plays
          one last turn. If you're not <b>strictly</b> the lowest, you get <b>+10</b>. If someone throws away all their
          cards it's an automatic Pedro — with no +10 risk.
        </p>
      </div>
    </div>
  );
}
