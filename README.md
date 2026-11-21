# Pedro 🇦🇷

**Pedro** is an Argentinian memory card game: keep the **lowest total** in your face-down cards — if you can remember them.
This is an open-source browser version. Right now you play against the computer; online play with friends (invite link) is next.

## Run it on your computer

```bash
npm install
npm run dev          # the website → http://localhost:5173
npm run dev:server   # the online rooms (Cloudflare, locally) → needed for "Play online"
npm test             # rules engine, bots and anti-cheat tests
```

## Online play

- **Play online with friends** creates a table and gives you a link (`/r/ABCDE`) to send.
- The **host** picks the settings, can fill empty seats with computer players, and starts the game.
- The game runs on the server (a Cloudflare Durable Object per table): each player only receives
  what they're allowed to see, so nobody can peek at cards through the browser's developer tools.
- Refreshing / locking your phone puts you back in your seat. Disconnected players' turns are played
  automatically after 8 seconds; an optional turn timer (30/60/90s) keeps the game moving.

## Deploy (free)

One Cloudflare Worker serves both the website and the game rooms (`wrangler.jsonc`).

```bash
npx wrangler login   # once
npm run deploy       # builds and publishes to https://pedro.<your-subdomain>.workers.dev
```

Or connect the GitHub repository in the Cloudflare dashboard (Workers & Pages → Create → Import a
repository) with build command `npm run build` and deploy command `npx wrangler deploy`: every push
to `main` is published automatically.

**Staying free:** on the Workers **Free** plan Cloudflare never charges — if a daily limit is reached,
requests are refused until the next day. The rooms add their own limits too: max 6 players, rate-limited
messages, and tables close after 30 minutes without activity.

## Rules (short)

- Standard 52-card deck + 2 Jokers. **Joker = 0, red King = −1**, Ace = 1 … Black King = 13.
- Everyone gets 4 face-down cards and looks at 2 of them **once**.
- On your turn: draw from the deck and swap it with one of your cards (or discard it), **or** take the top discard and swap it in.
- Powers, only when you discard a card you just drew from the deck (optional):
  **7** look at one of your cards · **8** look at an opponent's card · **9** blindly swap two cards of two different players · **10** shuffle a player's cards.
- **Throwing:** anyone, at any time, can throw a card of the same rank onto the discard pile.
  Own card → one card less. Opponent's card → they get +2 cards. Wrong → card back (everyone saw it) + 2 cards. Too slow → card back + 1 card.
  A thrown card is **burned**: nobody can pick it up.
- **PEDRO!** At the start of your turn (before drawing) call Pedro: you finish your turn, everyone else plays once more.
  If you're not strictly the lowest: **+10**. Emptying your hand is an automatic Pedro with no penalty.
- Scores add up over rounds; first to reach 30 (or 50 / 80) loses. Or play a single round.

## Code layout

| Path | What |
|---|---|
| `src/engine/` | Pure rules engine (`apply(state, action)`), no UI. Will also run on the multiplayer server. |
| `src/bots/` | Computer players, with imperfect memory and human-like reaction times. |
| `src/game/localGame.ts` | A game against the computer, in the browser. |
| `src/game/runner.ts` | Runs a game (engine + bots + turn timer), in the browser or on the server. |
| `src/online/` | Online protocol and the browser side of a room connection. |
| `worker/` | Cloudflare Worker + the `PedroRoom` Durable Object (one per table). |
| `src/ui/` | React interface. |

## Roadmap

- [x] Play vs computer (desktop)
- [ ] Phone-optimised layout
- [x] Online rooms with invite links
- [ ] Sounds & animations

## License

MIT
