# Scrabble Online

Real-time multiplayer Scrabble — Node.js, Express, Socket.IO, MySQL, installable PWA.

## Quick start

```bash
npm install
cp .env.example .env        # then set JWT_SECRET and your MySQL credentials
npm run db:init             # creates the database and tables
npm run dict                # downloads the full ENABLE word list (~173k words)
npm run vapid               # optional: prints VAPID keys for push notifications -> paste into .env
npm start                   # http://localhost:3000
npm test                    # engine, AI and full-game simulation tests (no database needed)
```

`data/words.txt` ships with only ~1,100 common words so the project runs out of the box.
**Run `npm run dict` before real play** — otherwise many valid words will be rejected.
(Or drop any word list, one word per line, into `data/words.txt`.)

## What is built (MVP v1)

| # | Feature | Where |
|---|---------|-------|
| 1 | Register / login (bcrypt + JWT), **guest play** | `server.js` REST, `public/app.js` |
| 2 | Real-time multiplayer (Socket.IO), 2–4 players | `server.js` sockets, `src/game.js` |
| 3 | Private rooms with 5-character invite codes, spectators | `room:*` events |
| 4 | Dictionary validation, scoring, premium squares, bingo, exchange/pass/resign | `src/engine.js`, `src/dictionary.js` |
| 5 | Chat (lobby + in-game, persisted) | `chat:send` |
| 6 | Player profiles (avatar, bio, stats, recent games) | `/api/me`, `/api/profile/:name` |
| 7 | Leaderboard + **ranked matchmaking with ELO** | `/api/leaderboard`, `matchmake()` |
| 8 | PWA: installable, standalone/fullscreen, offline app shell | `manifest.json`, `sw.js` |
| 9 | Push notifications when it is your turn and you are offline | `web-push`, `sw.js` |
| 10 | AI opponent (easy / medium / hard) + hints | `src/ai.js` |
| + | Turn timer (auto-pass; 3 timeouts = forfeit), game history + move log stored as JSON (replay-ready) | `src/game.js`, `games.moves` |

### Not built yet (roadmap)
Friends/DMs/clubs, tournaments & seasons, badges, daily challenges/quests/login rewards, vocabulary & definitions, 2v2, power-ups,
battle royale, puzzle campaign, cosmetics/season pass, a replay viewer UI (the data is already saved), background sync, install rewards.
Coins are earned per game but there is nothing to spend them on yet.

## How it fits together

```
server.js         Express REST + Socket.IO; rooms, matchmaking, persistence, push
src/engine.js     Board, bag, premium squares, move validation + scoring
src/game.js       Game state machine (turns, timer, end conditions, per-player views)
src/ai.js         Trie-based move generator (all legal moves) + difficulty selection
src/dictionary.js Word set + trie           src/elo.js  Rating maths
src/db.js         MySQL access (parameterised queries only)     schema.sql  Tables
public/           Vanilla JS client, service worker, manifest
tests/run.js      Unit tests, AI-vs-brute-force check, full AI-vs-AI games
```

## Rules implemented
Standard 15×15 board and 100-tile distribution, 2 blanks (0 points), premium squares only count for newly placed tiles,
50-point bonus for using all 7 tiles, first word must cover the center, exchange needs ≥7 tiles in the bag,
game ends when a player empties their rack with an empty bag (leftover tiles are subtracted/added) or after every active player passes twice in a row.

## Known limitations / deployment notes
- **Live games are held in server memory.** A restart ends games in progress (finished games are in MySQL). Run a single Node process, or add sticky sessions + a shared store before scaling out.
- Ratings only change in ranked games between two signed-in humans. Hints are disabled in ranked games.
- Serve over **HTTPS** in production (required for install prompts, service workers and push). Set `TRUST_PROXY=1` behind a proxy.
- Auth/register endpoints are rate-limited in memory per IP; use a proper limiter if you scale out.
