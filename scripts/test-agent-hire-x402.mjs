/**
 * End-to-end test for hiring an agent via the x402 flow.
 *
 *   node --env-file=.env.local scripts/test-agent-hire-x402.mjs
 *
 * ⚠️  MOVES REAL USDC ON BASE MAINNET. Signs from REAP_TREASURY_PRIVATE_KEY
 *     and pays the target agent's price (default: competitor-research-brief,
 *     $0.10 per run). Makes ONE paid call.
 *
 * Optional env:
 *   AGENT_SLUG   (default: competitor-research-brief)
 *   AGENT_HOST   (default: https://openreap.vercel.app)
 *   AGENT_INPUT  (default: a 3-URL competitor brief request)
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  toHex,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const PK_RAW = process.env.REAP_TREASURY_PRIVATE_KEY;
if (!PK_RAW) {
  console.error("REAP_TREASURY_PRIVATE_KEY missing. Set it in .env.local.");
  process.exit(1);
}
const pk = PK_RAW.startsWith("0x") ? PK_RAW : `0x${PK_RAW}`;
const account = privateKeyToAccount(pk);

const AGENT_SLUG = process.env.AGENT_SLUG || "competitor-research-brief";
const AGENT_HOST = process.env.AGENT_HOST || "https://openreap.vercel.app";
const AGENT_URL = `${AGENT_HOST}/api/agents/${AGENT_SLUG}/run`;
const AGENT_INPUT =
  process.env.AGENT_INPUT ||
  "Competitor brief request. Compare these three AI coding agents for a seed-stage founder audience (positioning, pricing, differentiation, weaknesses). URLs: https://cursor.com, https://www.cognition.ai/devin, https://claude.com/claude-code. Keep it to one page, skimmable bullets.";

const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SAFETY_MIN_USDC_MICRO = BigInt(150_000); // $0.15 minimum to even try a $0.10 call

const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const publicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http("https://mainnet.base.org"),
});

// ---- 1. Balance check ------------------------------------------------------
console.log(`\n▶ Wallet: ${account.address}`);
console.log(`  Target : ${AGENT_URL}`);

const usdcRaw = await publicClient.readContract({
  address: USDC_BASE_MAINNET,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});
const ethRaw = await publicClient.getBalance({ address: account.address });
console.log(`  USDC (mainnet): $${formatUnits(usdcRaw, 6)}`);
console.log(`  ETH  (mainnet): ${formatUnits(ethRaw, 18)}`);

if (usdcRaw < SAFETY_MIN_USDC_MICRO) {
  console.error(
    `\n✗ USDC balance is below safety threshold ($${formatUnits(SAFETY_MIN_USDC_MICRO, 6)}).`
  );
  process.exit(1);
}

// ---- 2. Probe agent endpoint ----------------------------------------------
console.log(`\n▶ Probing agent (unpaid) ...`);
const probe = await fetch(AGENT_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input: AGENT_INPUT }),
});

if (probe.status !== 402) {
  console.error(`  unexpected status ${probe.status}`);
  console.error(await probe.text());
  process.exit(1);
}

const envelope = await probe.json();
const mainnet = envelope.accepts?.find((a) => a.network === "base");
if (!mainnet) {
  console.error("  402 envelope has no base-mainnet requirement");
  console.error(JSON.stringify(envelope, null, 2));
  process.exit(1);
}
console.log(
  `  ${probe.status} · asset=${mainnet.asset} · amount=${mainnet.maxAmountRequired} micro-USDC · payTo=${mainnet.payTo}`
);
console.log(
  `  network=${mainnet.network} · scheme=${mainnet.scheme} · extra=${JSON.stringify(mainnet.extra)}`
);

if (mainnet.payTo.toLowerCase() === account.address.toLowerCase()) {
  console.log(
    `  ⚠  payTo == signer (treasury paying itself) — on-chain transfer is a no-op but facilitator will settle.`
  );
}

// ---- 3. Sign EIP-3009 ------------------------------------------------------
console.log(`\n▶ Signing EIP-3009 transferWithAuthorization ...`);
function randomNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}
const now = Math.floor(Date.now() / 1000);
const validAfter = "0";
const validBefore = String(now + 300);
const nonce = randomNonce();
const valueMicro = BigInt(mainnet.maxAmountRequired);

const signature = await walletClient.signTypedData({
  account,
  domain: {
    name: mainnet.extra.name,
    version: mainnet.extra.version,
    chainId: 8453,
    verifyingContract: mainnet.asset,
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
    to: mainnet.payTo,
    value: valueMicro,
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce,
  },
});

const payload = {
  x402Version: 1,
  scheme: "exact",
  network: mainnet.network,
  payload: {
    authorization: {
      from: account.address,
      to: mainnet.payTo,
      value: String(valueMicro),
      validAfter,
      validBefore,
      nonce,
    },
    signature,
  },
};

const xPaymentHeader = Buffer.from(JSON.stringify(payload)).toString("base64");
console.log(`  signed (sig ${signature.slice(0, 18)}…${signature.slice(-6)})`);
console.log(`  payload size: ${xPaymentHeader.length} bytes`);

// ---- 4. Pay agent ----------------------------------------------------------
console.log(`\n▶ Hiring agent (paid) ...`);
const started = Date.now();
const res = await fetch(AGENT_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-payment": xPaymentHeader,
  },
  body: JSON.stringify({ input: AGENT_INPUT }),
});
const ms = Date.now() - started;
console.log(`  ${res.status} · ${ms}ms`);

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  /* leave as raw text */
}

if (!res.ok) {
  console.error(`\n✗ Agent endpoint rejected the call.`);
  console.error(json ?? text);
  process.exit(1);
}

console.log(`\n▶ Response:`);
if (json) {
  const preview = {
    job_id: json.job_id,
    tx_hash: json.tx_hash,
    model: json.model,
    tokens: json.tokens,
    output_preview:
      typeof json.output === "string"
        ? json.output.slice(0, 600) + (json.output.length > 600 ? "…" : "")
        : json.output,
  };
  console.log(JSON.stringify(preview, null, 2));
  if (json.tx_hash) {
    console.log(`\n  basescan: https://basescan.org/tx/${json.tx_hash}`);
  }
} else {
  console.log(text.slice(0, 1200));
}

// ---- 5. Post-flight balance ----------------------------------------------
console.log(`\n▶ Post-flight balance ...`);
const usdcAfter = await publicClient.readContract({
  address: USDC_BASE_MAINNET,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});
console.log(`  USDC (mainnet): $${formatUnits(usdcAfter, 6)}`);
const spent = usdcRaw - usdcAfter;
console.log(`  Delta this run: $${formatUnits(spent, 6)}`);

console.log(`\n✓ Agent hire x402 end-to-end test completed.`);
