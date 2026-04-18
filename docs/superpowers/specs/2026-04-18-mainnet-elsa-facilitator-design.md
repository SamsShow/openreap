# Base Mainnet USDC + Elsa x402 Facilitator Migration

**Date:** 2026-04-18
**Status:** Design — pending review before planning
**Supersedes for chain targeting:** `docs/superpowers/specs/2026-04-17-track3-base-auto-trader-design.md` (the auto-trader flow itself is unchanged; only its chain metadata moves)

## 1. Goal

Move OpenReap's payment layer from Base Sepolia testnet to **Base mainnet** end-to-end with real USDC, and replace the x402 facilitator from `x402.org/facilitator` with Elsa's drop-in `facilitator.heyelsa.build`. Creator withdrawals switch from Sepolia-ETH-valued-at-USD to direct mainnet USDC ERC-20 transfers.

## 2. Non-goals

- No protocol/database schema changes.
- No new agent features.
- No "agents-pay-agents" wallet concept (considered and rejected as a separate future project).
- The auto-trader's Elsa merchant-API call (`x402-api.heyelsa.ai/api/get_swap_quote`) is already on Base mainnet and is **not** part of this migration. It stays as-is.

## 3. Invariants

- x402 v1 `exact` scheme; EIP-3009 `TransferWithAuthorization` signed by the user's wallet.
- 75/25 creator/treasury split on hire payments.
- Facilitator URL remains env-configurable via `NEXT_PUBLIC_X402_FACILITATOR`. Elsa is the new default; operators can point back at `x402.org` if Elsa has an outage.

## 4. Confirmed external facts

Pulled from Elsa's docs (`x402.heyelsa.ai`) and `docs.x402.org`:

- Elsa facilitator base URL: `https://facilitator.heyelsa.build`
- Endpoints: `POST /verify`, `POST /settle`, `GET /supported` — same request/response shape as `x402.org/facilitator`. Response on `/settle` is `{ success: bool, transaction: string, payer: string, network?: string, errorReason?: string, error?: string }`. No parsing changes needed in `verifyPayment`.
- Supported network label: `"base"` (x402 v1 `exact` scheme). Canonical USDC on Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.

## 5. Architecture — files touched

### 5.1 `src/lib/chains.ts`

Remove all Sepolia exports. Final shape:

```ts
export const BASE_MAINNET_CHAIN_ID = 8453;
export const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export const REAP_TREASURY =
  (process.env.NEXT_PUBLIC_REAP_TREASURY as `0x${string}` | undefined) ||
  "0x0000000000000000000000000000000000000000"; // placeholder — must be set before launch

export const X402_FACILITATOR_URL =
  process.env.NEXT_PUBLIC_X402_FACILITATOR ||
  "https://facilitator.heyelsa.build";

export const ELSA_X402_BASE_URL =
  process.env.NEXT_PUBLIC_ELSA_X402_BASE_URL || "https://x402-api.heyelsa.ai";

export const BASE_MAINNET_RPC = "https://mainnet.base.org";
```

The prior hardcoded `REAP_TREASURY` fallback (`0x5f7711d3Fb58115DAD79DB7b7e0728b5F009a036`) is dropped — it was a Sepolia convenience. Mainnet requires an explicit `NEXT_PUBLIC_REAP_TREASURY` env var; the zero-address default is intentionally obvious so missing config fails loudly.

### 5.2 `src/lib/x402-client.ts` (browser signer)

- `PaymentRequirements.network` narrows from `"base-sepolia" | "base"` to `"base"`.
- `chainIdForNetwork` collapses to a constant returning `BASE_MAINNET_CHAIN_ID`.
- `defaultAssetForNetwork` collapses to a constant returning `USDC_BASE_MAINNET`.
- Pre-flight balance-check error copy drops the Sepolia faucet hint. The `networkLabel` and `faucetHint` branch is removed; message reads: "Fund your wallet with USDC on Base mainnet. The token contract is `${verifyingContract}` — any other 'USDC' won't work."
- No change to the EIP-3009 signing logic.

### 5.3 `src/lib/elsa.ts` (facilitator client — despite the name)

- `PaymentRequirements.network` narrows to `"base"`.
- `buildRequirements` emits `network: "base"` and `asset: USDC_BASE_MAINNET`.
- `verifyPayment` continues to POST `{ x402Version: 1, paymentPayload, paymentRequirements }` to `${X402_FACILITATOR_URL}/settle`. With the new default URL this now hits Elsa's facilitator. Response parsing is unchanged.
- File keeps its name. "Elsa" is finally accurate — Elsa is both the default facilitator (hire flow) and the merchant (auto-trader flow).

### 5.4 `src/lib/wagmi.ts`

```ts
chains: [base, mainnet]
```

Drop `baseSepolia`. Users on Sepolia will see the normal `switchChain` prompt to move to Base mainnet.

### 5.5 `src/lib/payouts.ts` — rewritten for mainnet USDC

Meaningful behavior change: creators now receive **USDC ERC-20 transfers** on Base mainnet, not ETH.

- Import `base` (not `baseSepolia`) from `viem/chains`; RPC `BASE_MAINNET_RPC`.
- Replace `sendTransaction({ to, value: weiAmount })` with `writeContract` against `USDC_BASE_MAINNET`:
  - ABI: minimal ERC-20 with `transfer(address,uint256) returns (bool)` and `balanceOf(address) returns (uint256)`.
  - Amount: `BigInt(Math.round(amountUsdc * 1_000_000))` (USDC is 6 decimals).
- Delete `getEthPriceUsd` and `usdToWei`. No more ETH conversion.
- Pre-flight reads two balances on the treasury:
  - `USDC.balanceOf(treasury)` — must cover `amountMicro`.
  - `getBalance(treasury)` — must cover gas reserve (~150k gwei → keep the existing `1.5e14` wei constant, it's still correct on mainnet).
- New failure reasons in `PayoutFailure.reason`:
  - `treasury_usdc_underfunded` (replaces the old generic `treasury_underfunded` when USDC is the blocker).
  - `treasury_gas_underfunded` (distinct — treasury has USDC but not enough ETH to pay gas).
- `PayoutSuccess` drops `amountEth` and `ethPriceUsd`. The existing `amountUsd` field stays (same value semantics — USD-denominated number, which for a USDC transfer equals the on-chain amount). No rename.
- `waitForTransactionReceipt` logic stays: still catches reverts.

### 5.6 `src/app/api/withdrawals/route.ts`

- `GET` response: `network: "base-sepolia"` → `"base"`.
- Success message: "Withdrawal settled on Base mainnet in USDC". Drop `amount_eth` and `eth_price_usd` from the response body.
- Error responses map the two new reason codes (`treasury_usdc_underfunded`, `treasury_gas_underfunded`) to the existing 409 path and surface both balances in the body so the dashboard can show which shortfall blocked the withdrawal.

### 5.7 `src/app/api/agents/auto-trader/run/route.ts`

Line 148: `chain: "base-sepolia"` → `"base"`. That's the only touch; the Elsa merchant-API proof-of-work logic is independent of this migration.

### 5.8 `src/app/agents/[id]/page.tsx`

Line 106: the documentation comment block showing `"network":"base-sepolia"` updates to `"network":"base"`. Display-only.

### 5.9 Ancillary

- `.env.example`: update the `REAP_SAFE_ADDRESS` / `NEXT_PUBLIC_REAP_TREASURY` comment to state these control **mainnet** USDC. `REAP_TREASURY_PRIVATE_KEY` comment updates to "Mainnet Base. Must hold both USDC (for payouts) and a small ETH float (for gas). Leave empty to queue withdrawals as `pending_manual_review`." `NEXT_PUBLIC_X402_FACILITATOR` default comment notes Elsa as the new default.
- `README.md:110`: remove the Alchemy Sepolia-faucet link. Replace with a one-line note that hires require real USDC on Base mainnet and that a small onramp (Coinbase / bridge) is the user's responsibility.
- `scripts/seed-test-user.mjs`, `scripts/test-elsa-x402.mjs`, `scripts/test-agent-pipeline.mjs`: swap any `base-sepolia` / `84532` / `USDC_BASE_SEPOLIA` references to their mainnet equivalents. Each script gets a loud top-of-file comment: "This now moves real USDC on Base mainnet. Do not run against a production treasury by accident."

## 6. Data flow (after migration)

Hire path (user → agent):

1. Client calls `POST /api/agents/[slug]/run` without an `x-payment` header.
2. Server returns HTTP 402 with `PaymentRequirements` where `network: "base"` and `asset: USDC_BASE_MAINNET`.
3. Client's wagmi wallet signs EIP-3009 `TransferWithAuthorization` on Base mainnet, targeting the canonical USDC contract, paying `REAP_TREASURY`.
4. Client retries with base64 `x-payment` header.
5. Server `verifyPayment` POSTs `{ x402Version:1, paymentPayload, paymentRequirements }` to `https://facilitator.heyelsa.build/settle`.
6. Elsa's facilitator broadcasts the authorization on Base mainnet and returns `{ success, transaction, payer }`.
7. Server runs the LLM, records the job, splits the payout 75/25, and responds.

Withdrawal path (creator → wallet):

1. Creator POSTs `/api/withdrawals` with `amount_usdc` and `destination`.
2. Server reserves the balance (available → pending).
3. `sendPayout` executes `USDC.transfer(destination, amountMicro)` from the treasury wallet on Base mainnet.
4. On success, `tx_hash` is stored and pending cleared.
5. On `treasury_usdc_underfunded` / `treasury_gas_underfunded`, balance is rolled back and the withdrawal marked `failed` with a reason the dashboard can render.

## 7. Error handling

- **User on Sepolia:** wagmi `switchChain` prompts to Base mainnet. With only two chains in `wagmi.ts` (`base`, `mainnet`), the prompt is unambiguous.
- **Facilitator outage:** operator sets `NEXT_PUBLIC_X402_FACILITATOR=https://x402.org/facilitator` and redeploys. No code change required. README gets a one-liner mentioning this.
- **Insufficient USDC at hire time:** client-side pre-flight already surfaces `insufficient_funds`; copy updates to drop the Sepolia faucet hint.
- **Facilitator-vs-x402.org shape drift:** mitigated by a smoke test (see §8) asserting the `/settle` response shape on Elsa matches the `{ success, transaction, payer }` fields we parse.

## 8. Testing

- **Smoke test (new):** a small Node script that POSTs a deliberately invalid `paymentPayload` to `https://facilitator.heyelsa.build/verify` and asserts we get a structured error response with a recognizable shape. Runs in CI without a funded wallet. Catches Elsa schema drift.
- **Local dev:** developers need a wallet with a few dollars of USDC on Base mainnet. There is no Sepolia fallback in this spec — see Open Question 1 if you want to reinstate one as an opt-in.
- **End-to-end manual checklist (before shipping):**
  1. Hire an agent with a wallet holding $0.50 USDC. Expect 200 + `tx_hash` on Base mainnet.
  2. Verify the `jobs.elsa_tx_hash` row matches the on-chain tx.
  3. As a creator, withdraw $1 USDC to a fresh wallet. Expect a real `USDC.transfer` tx on Base, visible on Basescan.
  4. Re-run (3) against an empty treasury; expect `treasury_usdc_underfunded`.
  5. Re-run (3) against a treasury with USDC but no ETH; expect `treasury_gas_underfunded`.

## 9. Operational / safety gates

These are **not** code but must be checked before this ships:

- **Treasury address ownership:** the old hardcoded `0x5f7711d3Fb58115DAD79DB7b7e0728b5F009a036` default is removed in §5.1. Production deploy **must** set `NEXT_PUBLIC_REAP_TREASURY` to a wallet the team controls on Base mainnet, or every hire payment goes to the zero address and is unrecoverable.
- **Treasury private key:** `REAP_TREASURY_PRIVATE_KEY` now controls real USDC. Treat it with production-secret discipline (vault, not `.env.local`).
- **Canary withdrawal:** first withdrawal should be a `$1` canary from the team's own creator account to a team wallet before any external creator is allowed to withdraw.
- **Treasury float:** treasury must be pre-funded with enough USDC to cover expected payout velocity plus a small ETH float (start: $2 in ETH is enough for hundreds of transfers).

## 10. Open questions (reviewer: please resolve)

1. **Dev affordance.** This spec removes Sepolia entirely. If developers should be able to run locally without real USDC, we can reinstate Sepolia as an **opt-in fallback** via `NEXT_PUBLIC_ENABLE_SEPOLIA_FALLBACK=1`. Default off. Say yes and I'll add it to the implementation plan; otherwise it stays deleted.
2. **Treasury address.** Is `NEXT_PUBLIC_REAP_TREASURY` already set to a mainnet-controlled wallet in your deploy env? If not, this spec treats it as a launch blocker.

---

**Sources:**
- Elsa facilitator: [https://x402.heyelsa.ai/](https://x402.heyelsa.ai/), [https://facilitator.heyelsa.build/](https://facilitator.heyelsa.build/)
- x402 spec: [https://docs.x402.org/core-concepts/facilitator](https://docs.x402.org/core-concepts/facilitator)
