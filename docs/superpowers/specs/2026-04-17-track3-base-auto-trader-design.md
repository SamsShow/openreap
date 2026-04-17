# Track 3 — Base Auto-Trader (Elsa x402) Alignment

**Date:** 2026-04-17
**Status:** Approved for implementation

## Goal

Align the existing Reap agent ("Base Auto-Trader") and the broader hire-agent flow
with **Track 3** requirements:

> Build an agent on Base that swaps tokens autonomously using the Elsa x402
> integration. One trigger, one trade, zero manual clicks. Must include at least
> one x402-paid call in the execution trace.

## Non-negotiable constraints

1. **User-facing payments run on Base Sepolia** (no real funds at risk).
2. **Treasury wallet:** `0x5f7711d3Fb58115DAD79DB7b7e0728b5F009a036`.
3. **Elsa x402 is mainnet-only** (confirmed via docs at `x402.heyelsa.ai/docs`).
4. **User's connected wallet signs every on-chain interaction** — no server-side
   private keys anywhere.

## Architecture — hybrid split

### User-facing leg (Base Sepolia, chain `eip155:84532`)

- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Every hire (Reap agent or marketplace agent) is priced in Sepolia USDC.
- Client flow:
  1. User connects wallet (RainbowKit `ConnectButton` in navbar).
  2. Page POSTs to the agent endpoint **without** `x-payment` → server returns 402
     with payment details including `payTo = 0x5f7711…`.
  3. Client asks wallet to sign an **EIP-3009 `transferWithAuthorization`** for
     the required USDC amount.
  4. Client base64-encodes the signed authorization and retries the endpoint
     with the `x-payment` header.
  5. Server verifies on-chain using viem + x402.org facilitator (Base Sepolia
     facilitator is free), records the tx hash, then proceeds.

### Agent execution-trace leg (Base mainnet, chain `eip155:8453`)

The Base Auto-Trader, in the course of executing a swap, performs at least one
real x402-paid call:

- Client calls `https://x402-api.heyelsa.ai/api/get_swap_quote` (Elsa mainnet,
  $0.01) using the **same user wallet** for x402 authorization.
- Returned quote (real mainnet prices, real route) becomes part of the agent's
  trace.
- The Elsa payment tx hash is forwarded to our server so we can record it with
  the job.

The Sepolia side then returns a simulated execution tx hash (no mainnet/Sepolia
swap is actually broadcast — for v1, keeping execution simulated is deliberate:
the point of the track is the x402 trace, not on-chain swap depth).

## File changes

### New
- `src/lib/x402-client.ts` — EIP-3009 signer; returns base64 `x-payment` header
- `src/lib/elsa-client.ts` — browser Elsa x402 call helper
- `src/lib/chains.ts` — network constants (USDC addresses, chain IDs, facilitator URL)

### Updated
- `src/lib/wagmi.ts` — chains: `base, baseSepolia, mainnet` (ssr, connectors)
- `src/lib/elsa.ts` — Sepolia payment details + real on-chain `verifyPayment`
- `src/components/PublicNav.tsx`, `DashNav.tsx` — ConnectButton slot
- `src/app/api/agents/auto-trader/run/route.ts` — accepts `elsa_tx_hash` in body, records it
- `src/app/api/agents/[slug]/run/route.ts` — same Sepolia verification rails
- `src/app/reap-agents/page.tsx` — orchestrates Elsa mainnet → Sepolia payment → agent call
- `src/app/agents/[id]/page.tsx` — live hire CTA that signs Sepolia payment

### Env
- `REAP_SAFE_ADDRESS=0x5f7711d3Fb58115DAD79DB7b7e0728b5F009a036`
- `NEXT_PUBLIC_REAP_TREASURY=0x5f7711d3Fb58115DAD79DB7b7e0728b5F009a036`

## What does "functional" mean for this PR

Happy-path demo with a wallet connected to Base Sepolia AND Base mainnet
(testnet funds via faucet, small amount of real mainnet USDC for Elsa calls):
1. Visit `/reap-agents`, click Execute Swap.
2. Wallet pops up twice (mainnet for Elsa $0.01, Sepolia for Reap $0.10).
3. UI shows: Elsa mainnet tx hash + Reap Sepolia tx hash + simulated swap result.

A user with only Sepolia funding sees a clear error pointing at the mainnet
requirement; no crash, no silent success.

## Out of scope for this PR

- Real Uniswap v3 swap on Sepolia (stays simulated).
- Facilitator failover (we trust x402.org facilitator for Sepolia).
- Wallet-less / email-only demo mode (user must connect a wallet).
