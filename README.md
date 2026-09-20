# NXT CLOUD V2

Swap, launch and ask on any chain. One app for NXT DEX, NXT Launchpad and NXT AI.

No build step: the repository root is the site.

## Run it

```bash
npx wrangler dev        # site + /api routes at http://localhost:8787
```

Any static file server also works (`python3 -m http.server`). Without the Worker, prices and charts load straight from CoinGecko and NXT AI shows as unavailable.

## Deploy

**Cloudflare Workers (recommended)**

```bash
npx wrangler deploy
```

`.assetsignore` keeps `src/`, `functions/`, `wrangler.toml` and this README from being served publicly.

**Cloudflare Pages from GitHub**

Publish directory: the repository root. No build command. `functions/api/[[path]].js` serves `/api/*` using the same handler as the Worker.

## Turn on NXT AI

NXT AI uses Cloudflare Workers AI through a binding named `AI`.

- Workers: already declared in `wrangler.toml` (`[ai]`).
- Pages: Settings → Functions → Bindings → add a Workers AI binding named `AI`.

The model defaults to `@cf/meta/llama-3.1-8b-instruct`. Set an `AI_MODEL` variable to change it. When the binding is missing the chat page shows "Offline" instead of failing silently.

`/api/chat` has no rate limiting yet. Add a Cloudflare rate-limiting rule before sending real traffic to it.

## What works today

| Area | Status |
| --- | --- |
| Wallets | Phantom (Solana) and any injected EVM wallet. Silent reconnect, account/network change events, real network switching (adds the chain if the wallet doesn't know it), native balances. |
| DEX | Live prices (CoinGecko, cached at the edge), indicative quotes, token picker per network, slippage, price chart with 1D/7D/30D, Max button that leaves a fee reserve. |
| Launchpad | Four-step wizard with validation (including the 64-bit supply limit on Solana and Sui), review, wallet and network preflight, config export. |
| NXT AI | Real chat through Workers AI with history, retry, and safe rendering. |

## Not connected yet

These are deliberately shown as unavailable in the UI rather than faked:

- **Swap execution.** Quotes come from market prices and exclude fees and price impact. Connect an aggregator (for example Jupiter on Solana, 0x or 1inch on EVM) behind a Worker route.
- **Token deployment.** Preflight passes and the config exports, but there is no token program or contract to send to the wallet yet.
- **Sui wallets.** Sui appears in the network list; wallet support is not implemented.

Never put private keys or provider secrets in client code. Keep them in Cloudflare secrets and call providers from Worker routes.

## Layout

```
index.html        markup, icon sprite, dialogs
styles.css        design tokens (day/night), components, responsive rules
js/
  app.js          router, theme, wiring
  dex.js          quotes, picker, slippage, chart
  launch.js       launch wizard and preflight
  ai.js           chat
  home.js         price tape, network chips, AI status
  wallet.js       Solana + EVM connection logic
  wallet-ui.js    header button and wallet dialogs
  api.js          /api client with CoinGecko fallback
  data.js         networks and tokens
  store.js, ui.js shared state and helpers
src/api.js        /api/* handler shared by Worker and Pages
src/index.js      Worker entry
functions/api/    Pages Functions entry
```

## API

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Service check |
| `GET /api/config` | Networks and feature flags (`ai` reflects the binding) |
| `GET /api/prices?ids=solana,usd-coin` | USD prices and 24h change |
| `GET /api/chart?id=solana&days=7` | Price series (`days` is 1, 7, 30 or 90) |
| `POST /api/chat` | `{ "messages": [{ "role": "user", "content": "..." }] }` |
