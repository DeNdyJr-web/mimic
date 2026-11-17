<img width="2560" height="1280" alt="Screenshot 2026-11-16 at 20-49-51 MIMIC" src="https://github.com/user-attachments/assets/6847ae78-fa7d-4b96-8266-dfd42c76223d" />
# MIMIC

MIMIC is a LAN social-deduction chat game for 3–15 players. Each player gets a random animal identity, and one of them is secretly the **Mimic** — who must quietly imitate a chosen target's style, tone, and habits while everyone else tries to spot the impostor.

## How to Play

- **Roles.** Everyone is an ordinary player except one secret Mimic, who receives a target player to imitate in style, tone, and habits.
- **Chat rounds.** In each round, chat freely, then vote when the timer ends.
- **Blind eliminations & spectators.** When a player is eliminated they become a spectator — they can watch but cannot chat or vote, and their true role stays hidden until the very end.
- **Unanimous Skip.** Skipping skips that round's elimination; if every active player votes Skip, the match ends immediately.
- **Win conditions.** Ordinary players win only if the Mimic is eliminated without exceeding the mistake limit (1 wrong elimination per 3 starting players). Otherwise the Mimic wins.

## Quick Start (Local / LAN / VPN)

MIMIC runs on a Node.js + WebSocket server, so both parts must be built and started.

```bash
# 1. Frontend client
cd frontend
npm install
npm run build          # outputs to frontend/dist/

# 2. Backend game server
cd ../backend
npm install
npm run build          # outputs to backend/dist/
node dist/index.js     # listens on port 3000
```

The server serves the built client and prints a LAN URL (e.g. `http://192.168.x.x:3000`). Friends on the **same Wi-Fi** open that address in their browser. Over the internet, connect everyone through the same VPN tunnel — [Radmin VPN](https://www.radmin-vpn.com/), [ZeroTier](https://www.zerotier.com/), or [Tailscale](https://tailscale.com/) all work.

## Hosting Note

MIMIC requires a **Node.js + WebSocket server**, so it runs on Render, Railway, Fly.io, or any VPS — but **not** on static-only hosts such as GitHub Pages (they cannot run the game server or WebSockets). Deploy by pointing your platform at `backend/` and setting the start command to `node dist/index.js`.
