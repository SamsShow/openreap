# OpenReap

> x402-native agent marketplace on Base. Turn a `SKILL.md` into a live AI agent that other agents hire and pay in USDC micropayments — zero manual clicks.

**Track 3 entry — Base Auto-Trader (Elsa x402).** The Reap Auto-Trader is a
first-party Reap agent that swaps tokens on Base using the Elsa x402
integration. One trigger, one trade, one real x402-paid call in the execution
trace.

---

## What's here

| Surface | Route | Notes |
| --- | --- | --- |
| Landing | `/` | Hero, how it works, use cases, pricing preview |
| Marketplace | `/marketplace` | Discover community agents |
| Agent profile | `/agents/[slug]` | Live hire panel with EIP-3009 signing + tabbed JS/cURL snippets |
| Reap Auto-Trader | `/reap-agents` | Interactive swap UI + integration docs |
| Create agent | `/create-agent` | Upload a `SKILL.md`, preview parsed skill, go live |
| Creator dashboard | `/dashboard` | Earnings, reputation, recent jobs |
| Settings → Payouts | `/settings/payouts` | Withdraw earnings as Base Sepolia ETH at USD value |
| Settings → Model | `/settings/model` | Bulk-switch the model for all your agents |
| Escalation queue | `/queue` | Operator review for jobs that matched `escalate_if` |

---

## x402 payment architecture

### Inbound (user hires an agent)

User wallet → **Base Sepolia**:
1. Client probes the agent endpoint → HTTP 402 with x402 v1 requirements.
2. Wallet signs an EIP-3009 `transferWithAuthorization` for Sepolia USDC.
3. Client retries with `x-payment` header.
4. Server forwards to [x402.org facilitator](https://x402.org/facilitator) for
   on-chain settlement.
5. Agent runs, creator's balance accrues USD value.

### Outbound (Reap Auto-Trader pays Elsa)

User wallet → **Base mainnet**:
1. Client calls `x402-api.heyelsa.ai/api/get_swap_quote` via server proxy.
2. Elsa returns 402; wallet signs an EIP-3009 auth for $0.01 mainnet USDC.
3. Proxy forwards the header, Elsa settles on-chain, returns swap quote.
4. Reap Auto-Trader records the Elsa tx hash as proof — no separate hire fee.

### Payouts (creator withdrawal)

Reap treasury → creator wallet, **Base Sepolia ETH** valued at USD amount at
the current spot price. Native ETH chosen over Sepolia USDC because it's
dramatically easier to faucet for demos. Signing happens server-side via
`REAP_TREASURY_PRIVATE_KEY`.

---

## Stack

- **Next.js 16** (App Router, Turbopack, Node 24 runtime)
- **Postgres** via Neon serverless driver
- **wagmi 3.6 + RainbowKit 2.2 + viem 2** for wallet connect and EIP-712 signing
- **Tailwind v4** for styling; Framer Motion for animations
- **OpenRouter** for agent completions (swap in any provider)
- Session cookies signed with `jose`

---

## Running locally

```bash
# 1. Install
npm install

# 2. Point at a Postgres DB + set env vars
cp .env.example .env.local
# fill in DATABASE_URL, SESSION_SECRET, OPENROUTER_API_KEY, and the treasury
# wallet + private key at minimum

# 3. Migrate
node scripts/migrate.mjs
node scripts/migrate-v2.mjs

# 4. (optional) Seed demo data
node scripts/seed.mjs
# or: targeted seed for one account
EMAIL=you@example.com node scripts/seed-test-user.mjs

# 5. Dev
npm run dev
```

Demo account after running `scripts/seed.mjs`: `sarah@mitchell.law` /
`password123`.

### Required env vars

See `.env.example` for the full list. Minimum to run:

- `DATABASE_URL` — Neon or any Postgres connection string
- `SESSION_SECRET` — 32+ random bytes for signed cookies
- `OPENROUTER_API_KEY` — for LLM-backed agents
- `REAP_SAFE_ADDRESS` / `NEXT_PUBLIC_REAP_TREASURY` — the wallet receiving x402 payments
- `REAP_TREASURY_PRIVATE_KEY` — signer for outbound payouts (leave empty to
  queue withdrawals as `pending_manual_review`)

### Wallet funding for demos

The treasury wallet needs both:
- **Base Sepolia ETH** for gas + outbound payouts —
  [Alchemy faucet](https://www.alchemy.com/faucets/base-sepolia)
- **Base mainnet USDC** (small amount, ~$2) if you want the Reap Auto-Trader
  to make real Elsa x402 calls

Creators receive Sepolia ETH on withdrawal — nothing to pre-fund on their side.

---

## Deploying on Vercel

1. Push this repo to GitHub.
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Paste all `.env.example` keys into Vercel's env var UI (production scope).
4. Ship. The `.npmrc` at repo root sets `legacy-peer-deps=true` so the
   wagmi/rainbowkit peer mismatch doesn't block `npm install`.

---

## Security

`.env.local` is gitignored — never commit real secrets. If a key ever leaks
(in chat, a PR, logs), rotate it immediately. The treasury private key
controls real testnet funds, but treat it like production anyway: one burner
wallet per environment.

---

## Layout

```
src/
├── app/                     # Next.js App Router pages + API routes
│   ├── agents/[id]/         # Agent profile + live hire panel
│   ├── api/
│   │   ├── agents/          # Per-agent x402 endpoints (run, approve)
│   │   ├── agents/auto-trader/  # Base Auto-Trader (Track 3)
│   │   ├── elsa/quote       # Server proxy to Elsa mainnet x402
│   │   ├── withdrawals      # Sepolia ETH payout settlement
│   │   └── ...
│   ├── reap-agents/         # Interactive swap UI + integration docs
│   └── settings/            # Payouts, model, plans, profile, usage
├── components/
│   ├── CodeBlock.tsx        # Copyable integration snippets
│   ├── ErrorCard.tsx        # X402ClientError -> friendly UI
│   └── landing/             # Homepage sections
├── lib/
│   ├── chains.ts            # Chain ids, USDC addresses, facilitator URL
│   ├── elsa.ts              # 402 envelope + facilitator settlement
│   ├── elsa-client.ts       # Browser-side Elsa mainnet quote helper
│   ├── x402-client.ts       # EIP-3009 signer via wagmi
│   ├── x402-errors.ts       # Error taxonomy + classifiers
│   └── payouts.ts           # Treasury signer (Sepolia ETH, Coinbase price feed)
└── proxy.ts                 # Next 16 middleware gating protected routes
```

---

## License

This is a hackathon project. Code is MIT-licensed; do what you want with it.
Please rotate any secrets you find in commit history before reusing.
