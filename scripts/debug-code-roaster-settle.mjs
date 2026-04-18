/**
 * Debug the code-roaster /settle path directly.
 *
 *   node --env-file=.env.local scripts/debug-code-roaster-settle.mjs
 *
 * Uses REAP_TREASURY_PRIVATE_KEY to sign a transferWithAuthorization
 * against the SAME PaymentRequirements our hire route advertises, then
 * POSTs to Elsa's facilitator /settle. Tells us exactly what Elsa
 * objects to, no browser involved.
 *
 * Transfers $0.01 USDC — use a treasury key with a small USDC balance.
 * The tx can be blocked by setting THRESHOLD_USDC higher than balance.
 */
import { toHex, formatUnits, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const PK_RAW = process.env.REAP_TREASURY_PRIVATE_KEY;
if (!PK_RAW) {
  console.error("REAP_TREASURY_PRIVATE_KEY missing.");
  process.exit(1);
}
const pk = PK_RAW.startsWith("0x") ? PK_RAW : `0x${PK_RAW}`;
const account = privateKeyToAccount(pk);

const FACILITATOR =
  process.env.NEXT_PUBLIC_X402_FACILITATOR ||
  "https://facilitator.heyelsa.build";
const REAP_TREASURY =
  process.env.NEXT_PUBLIC_REAP_TREASURY ||
  "0x5f7711d3Fb58115DAD79DB7b7e0728b5F009a036";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const THRESHOLD_USDC = BigInt(50_000); // refuse below $0.05

// Match our server-side buildMainnetRequirements EXACTLY.
const requirements = {
  scheme: "exact",
  network: "base",
  maxAmountRequired: "10000", // $0.01 in micro-USDC
  resource: "http://localhost:3000/api/agents/code-roaster/run",
  description: "Code Roaster — 0.01 USDC per request",
  mimeType: "application/json",
  payTo: REAP_TREASURY,
  maxTimeoutSeconds: 300,
  asset: USDC,
  extra: { name: "USD Coin", version: "2" },
};

console.log(`▶ Wallet: ${account.address}`);
console.log(`  Treasury payTo: ${REAP_TREASURY}`);
console.log(`  Domain name: ${requirements.extra.name}`);

// Sanity: read USDC balance.
const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
const balance = await client.readContract({
  address: USDC,
  abi: [
    { name: "balanceOf", type: "function", stateMutability: "view",
      inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  ],
  functionName: "balanceOf",
  args: [account.address],
});
console.log(`  USDC balance: $${formatUnits(balance, 6)}`);
if (balance < THRESHOLD_USDC) {
  console.error(`✗ Treasury below $0.05. Fund it first.`);
  process.exit(1);
}

// Build + sign authorization.
const bytes = new Uint8Array(32);
crypto.getRandomValues(bytes);
const nonce = toHex(bytes);
const now = Math.floor(Date.now() / 1000);
const validAfter = "0";
const validBefore = String(now + 300);
const valueMicro = BigInt(requirements.maxAmountRequired);

console.log(`\n▶ Signing EIP-3009 TransferWithAuthorization...`);
console.log(`  from=${account.address}`);
console.log(`  to=${requirements.payTo}`);
console.log(`  value=${valueMicro} micro-USDC`);
console.log(`  validBefore=${validBefore} (${new Date(Number(validBefore) * 1000).toISOString()})`);

const signature = await account.signTypedData({
  domain: {
    name: requirements.extra.name,
    version: requirements.extra.version,
    chainId: 8453,
    verifyingContract: requirements.asset,
  },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: {
    from: account.address,
    to: requirements.payTo,
    value: valueMicro,
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce,
  },
});

const paymentPayload = {
  x402Version: 1,
  scheme: "exact",
  network: "base",
  payload: {
    authorization: {
      from: account.address,
      to: requirements.payTo,
      value: String(valueMicro),
      validAfter,
      validBefore,
      nonce,
    },
    signature,
  },
};

console.log(`\n▶ POST ${FACILITATOR}/settle`);
const res = await fetch(`${FACILITATOR}/settle`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    x402Version: 1,
    paymentPayload,
    paymentRequirements: requirements,
  }),
});

console.log(`  HTTP ${res.status}`);
const body = await res.json();
console.log(`  body: ${JSON.stringify(body, null, 2)}`);

if (body.success === true) {
  console.log(`\n✓ Facilitator accepted. tx=${body.transaction}`);
  console.log(`  basescan: https://basescan.org/tx/${body.transaction}`);
} else {
  console.log(`\n✗ Facilitator rejected: errorReason=${body.errorReason}, error=${body.error}`);
}
