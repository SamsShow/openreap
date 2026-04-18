# Base Mainnet USDC + Elsa x402 Facilitator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate OpenReap's payment layer from Base Sepolia to Base mainnet USDC end-to-end, switch the x402 facilitator from `x402.org` to Elsa's drop-in `facilitator.heyelsa.build`, and change creator withdrawals from Sepolia-ETH-valued-at-USD to mainnet USDC ERC-20 transfers. Preserve an opt-in `NEXT_PUBLIC_ENABLE_SEPOLIA_FALLBACK=1` dev flag.

**Architecture:** Surgical edits to the existing `src/lib/{chains,elsa,x402-client,wagmi,payouts}.ts` stack plus two API routes. No new abstractions, no schema changes. Each task leaves the codebase compiling so commits are safe to deploy individually. Verification per task is `npx tsc --noEmit` + `npm run lint`; end-to-end verification is a new Node smoke test hitting Elsa's facilitator plus a manual checklist from the spec.

**Tech Stack:** Next.js 16 App Router · wagmi v3 / RainbowKit · viem v2 · Neon Postgres. Spec reference: `docs/superpowers/specs/2026-04-18-mainnet-elsa-facilitator-design.md`.

---

## File Structure

Files modified:

| Path | Responsibility |
|---|---|
| `src/lib/chains.ts` | Chain IDs, USDC addresses, facilitator URL, Sepolia-fallback env flag |
| `src/lib/elsa.ts` | Facilitator client (verifyPayment) + 402 envelope builder |
| `src/lib/x402-client.ts` | Browser EIP-3009 signer, pre-flight balance check, error copy |
| `src/lib/wagmi.ts` | RainbowKit chain allowlist |
| `src/lib/payouts.ts` | Treasury signer — rewritten for USDC ERC-20 transfer on mainnet |
| `src/app/api/agents/[slug]/run/route.ts` | Hire 402 flow — pick requirements by signed-payload network |
| `src/app/api/agents/auto-trader/run/route.ts` | Chain label fix |
| `src/app/api/withdrawals/route.ts` | Response body cleanup, new failure-reason surface |
| `src/app/agents/[id]/page.tsx` | Display-only comment update |
| `.env.example` | Updated comments + new fallback-flag line |
| `README.md` | Remove Sepolia-by-default language |
| `scripts/seed-test-user.mjs` | Drop "Circle Sepolia faucet" comment |

Files created:

| Path | Responsibility |
|---|---|
| `scripts/test-elsa-facilitator.mjs` | Smoke test — POST a bogus payload to Elsa's `/verify` and assert a structured error response |

Files untouched (confirmed during planning):

- `src/lib/elsa-client.ts` — already runs mainnet; the auto-trader merchant flow is out of scope.
- `scripts/test-elsa-x402.mjs` — already mainnet; no change needed.
- `scripts/test-agent-pipeline.mjs` — no Sepolia references (checked with grep).

---

## Task 1: Update `src/lib/chains.ts` foundation

Change facilitator default to Elsa; add `ENABLE_SEPOLIA_FALLBACK`; keep existing Sepolia exports (they're used by `x402-client.ts` and `elsa.ts` until later tasks narrow usage).

**Files:**
- Modify: `src/lib/chains.ts`

- [ ] **Step 1: Replace the file contents**

Overwrite `src/lib/chains.ts` with:

```ts
export const BASE_MAINNET_CHAIN_ID = 8453;
export const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const BASE_MAINNET_RPC = "https://mainnet.base.org";

export const REAP_TREASURY =
  (process.env.NEXT_PUBLIC_REAP_TREASURY as `0x${string}` | undefined) ||
  "0x5f7711d3Fb58115DAD79DB7b7e0728b5F009a036";

export const X402_FACILITATOR_URL =
  process.env.NEXT_PUBLIC_X402_FACILITATOR ||
  "https://facilitator.heyelsa.build";

export const ELSA_X402_BASE_URL =
  process.env.NEXT_PUBLIC_ELSA_X402_BASE_URL || "https://x402-api.heyelsa.ai";

// Dev-only opt-in: when "1", the hire flow advertises Sepolia alongside mainnet
// in its 402 envelope and wagmi adds baseSepolia to the chain list. Production
// default is off. The treasury/withdrawal path is always mainnet regardless.
export const ENABLE_SEPOLIA_FALLBACK =
  process.env.NEXT_PUBLIC_ENABLE_SEPOLIA_FALLBACK === "1";

// Sepolia constants — only referenced when ENABLE_SEPOLIA_FALLBACK is true.
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const BASE_SEPOLIA_RPC = "https://sepolia.base.org";
```

- [ ] **Step 2: Verify the type-check still passes**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Verify lint**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/chains.ts
git commit -m "feat(chains): default facilitator to Elsa, add Sepolia fallback flag"
```

---

## Task 2: Update `src/lib/elsa.ts` — mainnet default + network-aware builders

Replace `buildRequirements` with two network-specific helpers (`buildMainnetRequirements`, `buildSepoliaRequirements`). Make `getPaymentDetails` emit one or two `accepts` entries based on the fallback flag. Add `requirementsForNetwork` for the hire route to pick the matching one after the client signs. Delete the old `requirementsFor` — its only caller (the hire route) is switched to `requirementsForNetwork` in Task 3. The AGENTS.md style deletes dead code rather than keeping deprecated wrappers.

**Files:**
- Modify: `src/lib/elsa.ts`

- [ ] **Step 1: Replace the file contents**

Overwrite `src/lib/elsa.ts` with:

```ts
/**
 * x402 facilitator client for OpenReap agent hires.
 *
 * Inbound payment flow (user hires an agent):
 *   1. Agent endpoint returns HTTP 402 with the envelope from
 *      getPaymentDetails(). Production advertises only Base mainnet; when
 *      NEXT_PUBLIC_ENABLE_SEPOLIA_FALLBACK=1, both mainnet and Sepolia are
 *      offered so local dev wallets can pay without real USDC.
 *   2. Client signs an EIP-3009 transferWithAuthorization for the USDC on
 *      whichever network its wallet is on and retries with `x-payment`
 *      (base64-encoded JSON payload, x402 v1 spec).
 *   3. Server calls verifyPayment() which forwards the header + the requirement
 *      matching the payload's network to the configured facilitator's /settle
 *      endpoint. Default facilitator is Elsa (facilitator.heyelsa.build).
 *
 * Outbound payment flow (our agent pays Elsa as a merchant) lives in
 * src/lib/elsa-client.ts.
 */

import {
  ENABLE_SEPOLIA_FALLBACK,
  REAP_TREASURY,
  USDC_BASE_MAINNET,
  USDC_BASE_SEPOLIA,
  X402_FACILITATOR_URL,
} from "./chains";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://openreap.vercel.app";

// ---------------------------------------------------------------------------
// Types — x402 v1 spec
// ---------------------------------------------------------------------------

export type X402Network = "base" | "base-sepolia";

export interface PaymentRequirements {
  scheme: "exact";
  network: X402Network;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { name: string; version: string };
}

export interface PaymentDetailsEnvelope {
  x402Version: 1;
  accepts: PaymentRequirements[];
  error?: string;
}

export interface VerifyPaymentResult {
  ok: boolean;
  tx_hash?: string;
  payer?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toMicroUsdc(priceUsdc: number): string {
  return String(Math.round(priceUsdc * 1e6));
}

function buildMainnetRequirements(
  agentName: string,
  agentSlug: string,
  priceUsdc: number
): PaymentRequirements {
  return {
    scheme: "exact",
    network: "base",
    maxAmountRequired: toMicroUsdc(priceUsdc),
    resource: `${API_URL}/api/agents/${agentSlug}/run`,
    description: `${agentName} — ${priceUsdc} USDC per request`,
    mimeType: "application/json",
    payTo: REAP_TREASURY,
    maxTimeoutSeconds: 300,
    asset: USDC_BASE_MAINNET,
    extra: { name: "USDC", version: "2" },
  };
}

function buildSepoliaRequirements(
  agentName: string,
  agentSlug: string,
  priceUsdc: number
): PaymentRequirements {
  return {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: toMicroUsdc(priceUsdc),
    resource: `${API_URL}/api/agents/${agentSlug}/run`,
    description: `${agentName} — ${priceUsdc} USDC per request (Sepolia dev)`,
    mimeType: "application/json",
    payTo: REAP_TREASURY,
    maxTimeoutSeconds: 300,
    asset: USDC_BASE_SEPOLIA,
    extra: { name: "USDC", version: "2" },
  };
}

// ---------------------------------------------------------------------------
// Exported — 402 envelope + requirement selection
// ---------------------------------------------------------------------------

/**
 * Build the full HTTP 402 body per x402 v1. Mainnet is always advertised;
 * Sepolia is appended only when the dev fallback flag is on.
 */
export function getPaymentDetails(
  agentName: string,
  agentSlug: string,
  priceUsdc: number
): PaymentDetailsEnvelope {
  const accepts: PaymentRequirements[] = [
    buildMainnetRequirements(agentName, agentSlug, priceUsdc),
  ];
  if (ENABLE_SEPOLIA_FALLBACK) {
    accepts.push(buildSepoliaRequirements(agentName, agentSlug, priceUsdc));
  }
  return { x402Version: 1, accepts };
}

/** Pre-built payment details for the in-house Base Auto-Trader ($0.10). */
export function getAutoTraderPaymentDetails(): PaymentDetailsEnvelope {
  return getPaymentDetails("Base Auto-Trader", "auto-trader", 0.1);
}

/**
 * Pick the requirement matching the network the client actually signed.
 * Returns null when the network is unsupported in the current env (e.g. a
 * dev-fallback-off server receiving a Sepolia payload).
 */
export function requirementsForNetwork(
  agentName: string,
  agentSlug: string,
  priceUsdc: number,
  network: string
): PaymentRequirements | null {
  if (network === "base") {
    return buildMainnetRequirements(agentName, agentSlug, priceUsdc);
  }
  if (network === "base-sepolia" && ENABLE_SEPOLIA_FALLBACK) {
    return buildSepoliaRequirements(agentName, agentSlug, priceUsdc);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Exported — payment verification via x402 facilitator
// ---------------------------------------------------------------------------

interface FacilitatorSettleResponse {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
  error?: string;
}

/**
 * Verify and settle an x-payment header.
 *
 * Parses the base64-encoded x402 payload, forwards it to the configured
 * facilitator's /settle endpoint (Elsa by default), and returns the on-chain
 * tx hash.
 *
 * @param paymentHeader     Raw value of the `x-payment` request header.
 * @param requirements      The PaymentRequirements advertised for this network.
 */
export async function verifyPayment(
  paymentHeader: string | null | undefined,
  requirements: PaymentRequirements
): Promise<VerifyPaymentResult> {
  if (!paymentHeader) {
    return { ok: false, reason: "Missing x-payment header" };
  }

  let decoded: Record<string, unknown>;
  try {
    const jsonStr = Buffer.from(paymentHeader, "base64").toString("utf-8");
    decoded = JSON.parse(jsonStr);
  } catch {
    return {
      ok: false,
      reason: "x-payment header is not valid base64 JSON",
    };
  }

  let res: Response;
  try {
    res = await fetch(`${X402_FACILITATOR_URL}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload: decoded,
        paymentRequirements: requirements,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      reason: `Facilitator unreachable: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  let body: FacilitatorSettleResponse;
  try {
    body = (await res.json()) as FacilitatorSettleResponse;
  } catch {
    return {
      ok: false,
      reason: `Facilitator returned non-JSON (HTTP ${res.status})`,
    };
  }

  if (!res.ok || !body.success || !body.transaction) {
    return {
      ok: false,
      reason:
        body.errorReason ||
        body.error ||
        `Facilitator rejected payment (HTTP ${res.status})`,
    };
  }

  return {
    ok: true,
    tx_hash: body.transaction,
    payer: body.payer,
  };
}
```

- [ ] **Step 2: DO NOT COMMIT YET**

Leave the working tree dirty. `requirementsFor` was the hire route's only import from `elsa.ts` beyond the other helpers — deleting it breaks compilation until Task 3 switches the caller. Run `npx tsc --noEmit` now and expect a single error pointing at `src/app/api/agents/[slug]/run/route.ts` complaining that `requirementsFor` isn't exported. That's the expected state; move directly to Task 3.

---

## Task 3: Update `src/app/api/agents/[slug]/run/route.ts` — pick requirements by signed-payload network

Paired commit with Task 2. The hire route currently calls `requirementsFor(...)` (mainnet) regardless of what the client signed. With dual-network envelopes, it reads the signed payload's `network` field and builds the matching requirements, rejecting unsupported networks with an explicit reason.

**Files:**
- Modify: `src/app/api/agents/[slug]/run/route.ts` (lines 49–64 — the 402 + verify block)

- [ ] **Step 1: Replace the imports**

In `src/app/api/agents/[slug]/run/route.ts`, replace the import line:

```ts
import {
  getPaymentDetails,
  requirementsFor,
  verifyPayment,
} from "@/lib/elsa";
```

with:

```ts
import {
  getPaymentDetails,
  requirementsForNetwork,
  verifyPayment,
} from "@/lib/elsa";
```

- [ ] **Step 2: Replace the "Step 2 — Verify payment" block**

Replace the block currently at lines 56–64:

```ts
  // Step 2 — Verify payment
  const requirements = requirementsFor(agent.name, agent.slug, priceUsdc);
  const verified = await verifyPayment(paymentHeader, requirements);
  if (!verified.ok) {
    return NextResponse.json(
      { error: "Payment verification failed", reason: verified.reason },
      { status: 402 }
    );
  }
```

with:

```ts
  // Step 2 — Decode the payload, pick the matching requirements, verify.
  let signedNetwork: string;
  try {
    const decoded = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString("utf-8")
    ) as { network?: unknown };
    if (typeof decoded.network !== "string") {
      throw new Error("payload missing network");
    }
    signedNetwork = decoded.network;
  } catch (err) {
    return NextResponse.json(
      {
        error: "Payment verification failed",
        reason: `x-payment header is not valid base64 JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 402 }
    );
  }

  const requirements = requirementsForNetwork(
    agent.name,
    agent.slug,
    priceUsdc,
    signedNetwork
  );
  if (!requirements) {
    return NextResponse.json(
      {
        error: "Payment verification failed",
        reason: "unsupported_network",
        network: signedNetwork,
      },
      { status: 402 }
    );
  }

  const verified = await verifyPayment(paymentHeader, requirements);
  if (!verified.ok) {
    return NextResponse.json(
      { error: "Payment verification failed", reason: verified.reason },
      { status: 402 }
    );
  }
```

- [ ] **Step 3: Verify type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exits 0. Both Task 2 and Task 3 changes are in the working tree now, so the compile is clean.

- [ ] **Step 4: Commit both files together**

```bash
git add src/lib/elsa.ts src/app/api/agents/[slug]/run/route.ts
git commit -m "feat(elsa): mainnet-first requirements + network-aware hire route"
```

---

## Task 4: Update `src/lib/x402-client.ts` — network-aware error copy

Only the pre-flight error message changes. The Sepolia faucet hint is preserved but gated by `requirements.network === "base-sepolia"`. The mainnet branch gets clean onramp-oriented copy.

**Files:**
- Modify: `src/lib/x402-client.ts` (lines 130–166 — the pre-flight block)

- [ ] **Step 1: Replace the faucet-hint branch**

Inside `signX402Payment`, replace the block that currently computes `networkLabel` / `faucetHint` / throws `X402ClientError`:

```ts
      const networkLabel =
        requirements.network === "base-sepolia"
          ? "Base Sepolia"
          : "Base mainnet";
      const short = `${from.slice(0, 6)}…${from.slice(-4)}`;
      const faucetHint =
        requirements.network === "base-sepolia"
          ? `Get Sepolia USDC at https://faucet.circle.com (pick Base Sepolia). The token contract is ${verifyingContract} — any other "USDC" on Base Sepolia won't work.`
          : `Fund your wallet with mainnet USDC on contract ${verifyingContract}.`;
```

with:

```ts
      const networkLabel =
        requirements.network === "base-sepolia"
          ? "Base Sepolia"
          : "Base mainnet";
      const short = `${from.slice(0, 6)}…${from.slice(-4)}`;
      const faucetHint =
        requirements.network === "base-sepolia"
          ? `Get Sepolia USDC at https://faucet.circle.com (pick Base Sepolia). The token contract is ${verifyingContract} — any other "USDC" on Base Sepolia won't work.`
          : `Fund the wallet with real USDC on Base mainnet. The token contract is ${verifyingContract} — any other "USDC" on Base won't work. A Coinbase withdraw or bridge from mainnet ETH is fastest.`;
```

- [ ] **Step 2: Verify type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/x402-client.ts
git commit -m "feat(x402-client): mainnet-friendly insufficient-funds copy"
```

---

## Task 5: Update `src/lib/wagmi.ts` — conditional chain list

**Files:**
- Modify: `src/lib/wagmi.ts`

- [ ] **Step 1: Replace the file contents**

Overwrite `src/lib/wagmi.ts` with:

```ts
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia, mainnet } from "wagmi/chains";
import { ENABLE_SEPOLIA_FALLBACK } from "./chains";

const chains = ENABLE_SEPOLIA_FALLBACK
  ? ([base, baseSepolia, mainnet] as const)
  : ([base, mainnet] as const);

export const config = getDefaultConfig({
  appName: "OpenReap",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "openreap-wallet-connect",
  chains,
  ssr: true,
});
```

- [ ] **Step 2: Verify type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exits 0. The `as const` on both branches produces a union of two readonly tuples that satisfies RainbowKit's `readonly [Chain, ...Chain[]]`. If tsc complains, import `Chain` from `wagmi/chains` and add `satisfies readonly [Chain, ...Chain[]]` to each branch.

- [ ] **Step 3: Commit**

```bash
git add src/lib/wagmi.ts
git commit -m "feat(wagmi): drop baseSepolia from prod chain list; keep as dev fallback"
```

---

## Task 6: Update `src/app/api/agents/auto-trader/run/route.ts` — chain label

**Files:**
- Modify: `src/app/api/agents/auto-trader/run/route.ts` (line 148)

- [ ] **Step 1: Change the single line**

Replace:

```ts
    chain: "base-sepolia",
```

with:

```ts
    chain: "base",
```

- [ ] **Step 2: Verify type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agents/auto-trader/run/route.ts
git commit -m "chore(auto-trader): report chain as 'base' in executed response"
```

---

## Task 7: Update `src/app/agents/[id]/page.tsx` — display-only comment

The agent detail page shows an example 402 envelope in a fenced code block. Update the network string.

**Files:**
- Modify: `src/app/agents/[id]/page.tsx` (line 106)

- [ ] **Step 1: Replace the line**

Replace:

```
# {"x402Version":1,"accepts":[{"scheme":"exact","network":"base-sepolia",...}]}
```

with:

```
# {"x402Version":1,"accepts":[{"scheme":"exact","network":"base",...}]}
```

- [ ] **Step 2: Verify type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/agents/[id]/page.tsx
git commit -m "docs(agent-detail): update 402 example to network=base"
```

---

## Task 8: Rewrite `src/lib/payouts.ts` — USDC ERC-20 transfer on mainnet

The biggest functional change in the plan. Replace the Sepolia-ETH sender with a mainnet USDC `transfer` call. Pre-flight reads both USDC balance and ETH balance (for gas) and surfaces distinct failure reasons.

**Files:**
- Modify: `src/lib/payouts.ts` (full rewrite)

- [ ] **Step 1: Replace the file contents**

Overwrite `src/lib/payouts.ts` with:

```ts
/**
 * Server-side treasury signer for outbound payouts on Base mainnet.
 *
 * Earnings accrue as USD value in the `balances` table. When a creator
 * withdraws, we send the equivalent amount in **Base mainnet USDC** via an
 * ERC-20 `transfer` from the treasury wallet.
 *
 * If REAP_TREASURY_PRIVATE_KEY is missing, sendPayout() returns a clear
 * `{ ok: false, reason: "treasury_not_configured" }` so the withdrawal row
 * can be marked "pending_manual_review" instead of crashing.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { BASE_MAINNET_RPC, USDC_BASE_MAINNET } from "./chains";

const GAS_RESERVE_WEI = BigInt(150_000_000_000_000); // ~0.00015 ETH — plenty for ERC-20 transfer gas on Base

const erc20Abi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface PayoutSuccess {
  ok: true;
  txHash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  amountUsd: number;
}

export interface PayoutFailure {
  ok: false;
  /** Stable machine-readable reason — safe to persist to the DB. */
  reason:
    | "treasury_not_configured"
    | "treasury_usdc_underfunded"
    | "treasury_gas_underfunded"
    | "invalid_destination"
    | "rpc_failure"
    | "tx_reverted"
    | "unknown";
  message: string;
  /** For treasury_usdc_underfunded: USDC balance (USD) vs requested amount. */
  treasuryUsdcBalanceUsd?: number;
  /** For treasury_gas_underfunded: ETH balance (wei) on the treasury. */
  treasuryEthBalanceWei?: string;
  requestedUsd?: number;
}

export type PayoutResult = PayoutSuccess | PayoutFailure;

function normalizePrivateKey(raw: string): Hex | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) return null;
  return withPrefix as Hex;
}

function isAddress(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function usdToMicroUsdc(amountUsd: number): bigint {
  return BigInt(Math.round(amountUsd * 1_000_000));
}

/**
 * Send mainnet USDC from the Reap treasury to a creator's wallet.
 */
export async function sendPayout(
  to: string,
  amountUsd: number
): Promise<PayoutResult> {
  const rawKey = process.env.REAP_TREASURY_PRIVATE_KEY;
  if (!rawKey) {
    return {
      ok: false,
      reason: "treasury_not_configured",
      message:
        "REAP_TREASURY_PRIVATE_KEY is not set. Withdrawal saved as pending; an operator must execute it manually.",
    };
  }

  const pk = normalizePrivateKey(rawKey);
  if (!pk) {
    return {
      ok: false,
      reason: "treasury_not_configured",
      message:
        "REAP_TREASURY_PRIVATE_KEY is set but malformed (expected 32 hex bytes).",
    };
  }

  if (!isAddress(to)) {
    return {
      ok: false,
      reason: "invalid_destination",
      message: `Destination wallet "${to}" is not a valid 0x-address.`,
    };
  }

  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    return {
      ok: false,
      reason: "invalid_destination",
      message: "Amount must be a positive number of USD.",
    };
  }

  const account = privateKeyToAccount(pk);

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(BASE_MAINNET_RPC),
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http(BASE_MAINNET_RPC),
  });

  const amountMicro = usdToMicroUsdc(amountUsd);
  if (amountMicro <= BigInt(0)) {
    return {
      ok: false,
      reason: "invalid_destination",
      message: "Computed USDC amount rounded to zero — USD value too small.",
    };
  }

  // Pre-flight: USDC balance must cover the payout; ETH balance must cover gas.
  try {
    const [usdcBalance, ethBalance] = await Promise.all([
      publicClient.readContract({
        address: USDC_BASE_MAINNET,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      }),
      publicClient.getBalance({ address: account.address }),
    ]);

    if (usdcBalance < amountMicro) {
      return {
        ok: false,
        reason: "treasury_usdc_underfunded",
        message:
          "The Reap treasury doesn't hold enough USDC on Base mainnet to cover this withdrawal.",
        treasuryUsdcBalanceUsd: Number(usdcBalance) / 1_000_000,
        requestedUsd: amountUsd,
      };
    }

    if (ethBalance < GAS_RESERVE_WEI) {
      return {
        ok: false,
        reason: "treasury_gas_underfunded",
        message:
          "The treasury has USDC but not enough ETH on Base mainnet to pay gas. Top up the treasury with a small ETH float.",
        treasuryEthBalanceWei: ethBalance.toString(),
        requestedUsd: amountUsd,
      };
    }
  } catch (err) {
    console.warn(
      "[payouts] pre-flight balance read failed:",
      err instanceof Error ? err.message : err
    );
  }

  let txHash: `0x${string}`;
  try {
    txHash = await walletClient.writeContract({
      address: USDC_BASE_MAINNET,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to as `0x${string}`, amountMicro],
    });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const reasonMatch = rawMsg.match(/reason:\s*([^\n.]+)/i);
    const reason = reasonMatch ? reasonMatch[1].trim() : null;
    if (reason && /insufficient funds|exceeds balance/i.test(reason)) {
      return {
        ok: false,
        reason: "treasury_gas_underfunded",
        message: `Treasury transfer reverted while paying gas: ${reason}.`,
        requestedUsd: amountUsd,
      };
    }
    return {
      ok: false,
      reason: "rpc_failure",
      message: reason
        ? `RPC rejected the transfer: ${reason}.`
        : "RPC rejected the transfer.",
    };
  }

  // Best-effort wait for a single confirmation so we can catch reverts.
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });
    if (receipt.status !== "success") {
      return {
        ok: false,
        reason: "tx_reverted",
        message: `USDC transfer reverted on-chain. Hash: ${txHash}`,
      };
    }
  } catch {
    return {
      ok: true,
      txHash,
      from: account.address,
      to: to as `0x${string}`,
      amountUsd,
    };
  }

  return {
    ok: true,
    txHash,
    from: account.address,
    to: to as `0x${string}`,
    amountUsd,
  };
}

/** Read-only: is the treasury signer ready to broadcast? */
export function treasuryConfigured(): boolean {
  const raw = process.env.REAP_TREASURY_PRIVATE_KEY;
  return !!(raw && normalizePrivateKey(raw));
}

/** Derive the treasury address from REAP_TREASURY_PRIVATE_KEY, if set. */
export function treasuryAddress(): `0x${string}` | null {
  const raw = process.env.REAP_TREASURY_PRIVATE_KEY;
  if (!raw) return null;
  const pk = normalizePrivateKey(raw);
  if (!pk) return null;
  return privateKeyToAccount(pk).address;
}
```

- [ ] **Step 2: Verify type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exits 0. The withdrawal route still references `amountEth` / `ethPriceUsd`; fix that in Task 9 — expect one `tsc` error line pointing at `src/app/api/withdrawals/route.ts`. That's fine; we'll fix it next. Actually, to keep each commit in a compiling state: revert the commit if tsc fails, go do Task 9 first, or bundle them. The safest path is to do Step 3 (commit) **only after** Task 9.

- [ ] **Step 3: DO NOT COMMIT YET**

Leave the working tree dirty and move directly to Task 9. The two files depend on each other and ship in one commit.

---

## Task 9: Update `src/app/api/withdrawals/route.ts` — surface new failure reasons

Pair commit with Task 8.

**Files:**
- Modify: `src/app/api/withdrawals/route.ts`

- [ ] **Step 1: Update the GET response**

Find and replace in `src/app/api/withdrawals/route.ts`:

```ts
    network: "base-sepolia",
```

with:

```ts
    network: "base",
```

- [ ] **Step 2: Replace the failure-handling block**

Replace the block that currently says:

```ts
    const httpStatus = result.reason === "treasury_underfunded" ? 409 : 502;
    return NextResponse.json(
      {
        withdrawal: failed[0],
        error: result.message,
        reason: result.reason,
        treasury_balance_usd: result.treasuryBalanceUsd,
        requested_usd: result.requestedUsd,
        treasury_address: treasuryAddress(),
      },
      { status: httpStatus }
    );
```

with:

```ts
    const httpStatus =
      result.reason === "treasury_usdc_underfunded" ||
      result.reason === "treasury_gas_underfunded"
        ? 409
        : 502;
    return NextResponse.json(
      {
        withdrawal: failed[0],
        error: result.message,
        reason: result.reason,
        treasury_usdc_balance_usd: result.treasuryUsdcBalanceUsd,
        treasury_eth_balance_wei: result.treasuryEthBalanceWei,
        requested_usd: result.requestedUsd,
        treasury_address: treasuryAddress(),
      },
      { status: httpStatus }
    );
```

- [ ] **Step 3: Replace the success response**

Replace the successful-return block:

```ts
  return NextResponse.json({
    withdrawal: completed[0],
    message: "Withdrawal settled on Base Sepolia",
    amount_eth: result.amountEth,
    eth_price_usd: result.ethPriceUsd,
  });
```

with:

```ts
  return NextResponse.json({
    withdrawal: completed[0],
    message: "Withdrawal settled on Base mainnet in USDC",
  });
```

- [ ] **Step 4: Verify type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: exits 0. Both Task 8 and Task 9 changes are in the working tree now, so the compile is clean.

- [ ] **Step 5: Commit both files together**

```bash
git add src/lib/payouts.ts src/app/api/withdrawals/route.ts
git commit -m "feat(payouts): send mainnet USDC ERC-20 instead of Sepolia ETH"
```

---

## Task 10: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace the file contents**

Overwrite `.env.example` with:

```bash
# Copy to .env.local and fill in real values before running.

# Neon or any Postgres. Required by scripts/migrate*.mjs, scripts/seed.mjs,
# and the Next.js API routes.
DATABASE_URL="postgresql://<user>:<password>@<host>/<db>?sslmode=require"

# HMAC secret for signed session cookies. Rotate in production.
SESSION_SECRET="change-me-to-32-random-bytes"

# OpenRouter key used by src/lib/llm.ts for agent completions.
OPENROUTER_API_KEY="sk-or-v1-..."

# The Reap treasury wallet on Base mainnet (USDC inbound + USDC outbound payouts).
REAP_SAFE_ADDRESS="0x0000000000000000000000000000000000000000"
NEXT_PUBLIC_REAP_TREASURY="0x0000000000000000000000000000000000000000"

# Private key for the treasury wallet on Base mainnet. Must hold USDC (for
# creator payouts) AND a small ETH float (for gas). Leave empty to queue
# withdrawals as pending_manual_review.
REAP_TREASURY_PRIVATE_KEY=""

# x402 facilitator + Elsa mainnet merchant API (defaults match production).
# Elsa is the default facilitator; point to https://x402.org/facilitator to
# fail over during an Elsa outage.
NEXT_PUBLIC_API_URL="http://localhost:3000"
NEXT_PUBLIC_X402_FACILITATOR="https://facilitator.heyelsa.build"
NEXT_PUBLIC_ELSA_X402_BASE_URL="https://x402-api.heyelsa.ai"

# DEV ONLY — set to "1" to let the hire flow accept Base Sepolia USDC as well
# as mainnet USDC. Never set in production. The treasury/withdrawal path is
# always mainnet regardless of this flag.
# NEXT_PUBLIC_ENABLE_SEPOLIA_FALLBACK=1

# Optional: WalletConnect Cloud project id for the Connect Wallet modal.
# Without this, non-injected wallets (MetaMask in browsers where Brave
# Wallet / Phantom own window.ethereum) fail to connect.
NEXT_PUBLIC_WC_PROJECT_ID=""
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document mainnet USDC treasury + Sepolia dev flag"
```

---

## Task 11: Update `README.md` — mainnet-first funding

**Files:**
- Modify: `README.md` (around line 110)

- [ ] **Step 1: Read the current block**

First inspect what's there:

```bash
sed -n '100,130p' README.md
```

You're looking for a section that references the Alchemy Base Sepolia faucet and instructs users to fund wallets with Sepolia USDC. The linked line from the spec is `README.md:110`.

- [ ] **Step 2: Replace that section**

Replace the Sepolia-faucet section (approx 5–15 lines around line 110) with:

```markdown
### Funding your wallet

Hires and the Base Auto-Trader settle in real **USDC on Base mainnet** (contract `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`). Fund your wallet via:

- Coinbase: withdraw USDC directly to your wallet on the Base network.
- Any bridge (e.g. Across, Base Bridge) from Ethereum mainnet USDC.

**Local dev shortcut.** Set `NEXT_PUBLIC_ENABLE_SEPOLIA_FALLBACK=1` in `.env.local` to let the hire flow accept Base Sepolia USDC as well. Grab Sepolia USDC from the [Circle faucet](https://faucet.circle.com) (pick Base Sepolia) or the [Alchemy Base Sepolia faucet](https://www.alchemy.com/faucets/base-sepolia). Withdrawals still require real USDC on mainnet even with the flag on.
```

Preserve any surrounding headings and structure. If the original block had a different heading, keep that heading and swap only the body.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): mainnet USDC funding + Sepolia dev flag"
```

---

## Task 12: Update `scripts/seed-test-user.mjs` — drop Circle-Sepolia comment

**Files:**
- Modify: `scripts/seed-test-user.mjs` (lines 226–230)

- [ ] **Step 1: Replace the stale comment**

Replace:

```js
  // 7. Seed the balance row. Available is capped at $5 so the demo withdraw
  // fits comfortably within a Circle Sepolia faucet drip; lifetime_earned
  // reflects the full $78 for realism in the dashboard cards.
```

with:

```js
  // 7. Seed the balance row. Available is capped at $5 so the demo withdraw
  // is a cheap canary on mainnet USDC (or Sepolia when the dev fallback flag
  // is on); lifetime_earned reflects the full $78 for realism in the cards.
```

- [ ] **Step 2: Commit**

```bash
git add scripts/seed-test-user.mjs
git commit -m "chore(seed): refresh stale Sepolia-faucet comment"
```

---

## Task 13: Create `scripts/test-elsa-facilitator.mjs` — schema-drift smoke test

Per spec §8, a CI-safe test that POSTs a deliberately-invalid payload to Elsa's `/verify` endpoint and asserts the response is structured, has the fields we parse, and rejects the bad input. Runs without a funded wallet because the payment is bogus — we only care that the facilitator's response shape still matches what `verifyPayment` expects.

**Files:**
- Create: `scripts/test-elsa-facilitator.mjs`

- [ ] **Step 1: Create the file**

Write to `scripts/test-elsa-facilitator.mjs`:

```js
/**
 * Schema-drift smoke test for the Elsa x402 facilitator.
 *
 *   node scripts/test-elsa-facilitator.mjs
 *
 * Asserts that Elsa's facilitator at facilitator.heyelsa.build still exposes
 * the POST /verify endpoint with the response shape src/lib/elsa.ts's
 * verifyPayment() parses ({ success, errorReason? / error?, transaction? }).
 *
 * Uses a deliberately-invalid paymentPayload so no real USDC moves. The test
 * passes when the facilitator responds with a structured JSON failure — what
 * we need to keep our verify/settle plumbing working.
 */

const FACILITATOR =
  process.env.NEXT_PUBLIC_X402_FACILITATOR ||
  "https://facilitator.heyelsa.build";

const bogusRequirements = {
  scheme: "exact",
  network: "base",
  maxAmountRequired: "100000",
  resource: "https://openreap.vercel.app/api/agents/smoke/run",
  description: "smoke test — should be rejected",
  mimeType: "application/json",
  payTo: "0x0000000000000000000000000000000000000001",
  maxTimeoutSeconds: 300,
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  extra: { name: "USDC", version: "2" },
};

const bogusPayload = {
  x402Version: 1,
  scheme: "exact",
  network: "base",
  payload: {
    authorization: {
      from: "0x0000000000000000000000000000000000000002",
      to: "0x0000000000000000000000000000000000000001",
      value: "100000",
      validAfter: "0",
      validBefore: "9999999999",
      nonce:
        "0x0000000000000000000000000000000000000000000000000000000000000001",
    },
    signature:
      "0x" + "00".repeat(65),
  },
};

console.log(`▶ POST ${FACILITATOR}/verify`);
const res = await fetch(`${FACILITATOR}/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    x402Version: 1,
    paymentPayload: bogusPayload,
    paymentRequirements: bogusRequirements,
  }),
});

if (!res.headers.get("content-type")?.includes("application/json")) {
  console.error(
    `✗ Facilitator returned non-JSON content-type "${res.headers.get(
      "content-type"
    )}" at status ${res.status}.`
  );
  console.error(await res.text());
  process.exit(1);
}

const body = await res.json();

// Elsa should reject a bogus payload; a structured failure is the happy path.
if (body.success === true) {
  console.error(
    "✗ Facilitator accepted a bogus payload — this shouldn't happen."
  );
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

if (typeof body.success !== "boolean") {
  console.error(
    "✗ Facilitator response missing boolean `success` — verifyPayment will misinterpret it."
  );
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

const hasReason =
  typeof body.errorReason === "string" || typeof body.error === "string";
if (!hasReason) {
  console.error(
    "✗ Facilitator response missing `errorReason` or `error` — verifyPayment has nothing to surface."
  );
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(`  ${res.status} · success=${body.success}`);
console.log(
  `  reason=${body.errorReason ?? body.error} (shape matches verifyPayment expectations)`
);
console.log(`\n✓ Elsa facilitator smoke test passed.`);
```

- [ ] **Step 2: Run the smoke test**

Run: `node scripts/test-elsa-facilitator.mjs`
Expected: exits 0 with `✓ Elsa facilitator smoke test passed.`
If it fails with a non-JSON response or a 5xx, the facilitator may be having a real outage — note the time and retry. If it fails with `success: true` on a bogus payload, that's a real facilitator bug — alert Elsa and do not deploy.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-elsa-facilitator.mjs
git commit -m "test(elsa): add facilitator /verify smoke test"
```

---

## Task 14: Final verification

No code change; a gate before merging.

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: exits 0 with no warnings about missing exports or unresolved imports.

- [ ] **Step 4: Facilitator smoke test**

Run: `node scripts/test-elsa-facilitator.mjs`
Expected: exits 0.

- [ ] **Step 5: Full grep for leftover Sepolia references**

Run: `grep -rn --include='*.ts' --include='*.tsx' --include='*.mjs' -E 'base-sepolia|BASE_SEPOLIA|USDC_BASE_SEPOLIA|baseSepolia' src/ scripts/ README.md .env.example`
Expected: only the gated Sepolia exports in `src/lib/chains.ts`, the wagmi conditional in `src/lib/wagmi.ts`, the `buildSepoliaRequirements` helper + `requirementsForNetwork` match in `src/lib/elsa.ts`, the network-union type + Sepolia branch in `src/lib/x402-client.ts`, the README dev-flag paragraph, the `.env.example` commented flag line, and the `scripts/seed-test-user.mjs` updated comment. Anything else means a straggler.

- [ ] **Step 6: Pre-launch manual checklist** (per spec §8)

Not code — the operator runs these before promoting to production:

1. Hire an agent with a wallet holding $0.50 USDC on Base mainnet. Expect 200 + `tx_hash`.
2. Verify the `jobs.elsa_tx_hash` row matches the on-chain tx on Basescan.
3. As a creator (use the seeded `test@gmail.com` balance), withdraw $1 USDC to a fresh wallet. Expect a real `USDC.transfer` tx on Base, visible on Basescan.
4. Re-run (3) against a treasury with no USDC. Expect `reason: "treasury_usdc_underfunded"` with 409.
5. Re-run (3) against a treasury with USDC but no ETH. Expect `reason: "treasury_gas_underfunded"` with 409.

---

## Spec coverage check

| Spec section | Task(s) |
|---|---|
| §5.1 chains.ts | 1 |
| §5.2 x402-client.ts | 4 |
| §5.3 elsa.ts | 2 |
| §5.4 wagmi.ts | 5 |
| §5.5 payouts.ts | 8 |
| §5.6 withdrawals route | 9 |
| §5.7 auto-trader route label | 6 |
| §5.7.1 hire route network selection | 3 |
| §5.8 agent detail page display | 7 |
| §5.9 ancillary (.env, README, scripts) | 10, 11, 12 |
| §6 data flow | Covered implicitly by tasks 3+9 |
| §7 error handling (unsupported_network) | 3 |
| §8 testing smoke test | 13 |
| §8 manual checklist | 14 step 6 |
| §9 safety gates | 14 step 6 (operator gate) |
