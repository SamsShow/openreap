/**
 * End-to-end test for the Elsa x402 mainnet flow.
 *
 *   node --env-file=.env.local scripts/test-elsa-x402.mjs
 *
 * ⚠️  MOVES REAL USDC ON BASE MAINNET. Do not run against a production
 *     treasury key by accident. This script signs from
 *     REAP_TREASURY_PRIVATE_KEY and pays Elsa ~$0.01 per run.
 *
 * What this does, carefully:
 *   1. Derives the wallet address from REAP_TREASURY_PRIVATE_KEY.
 *   2. Reads USDC + ETH balances on Base mainnet. If USDC is below a
 *      safety threshold ($0.05), refuses to spend anything.
 *   3. Calls https://x402-api.heyelsa.ai/api/get_swap_quote without a
 *      payment header, reads the 402 envelope.
 *   4. Signs an EIP-3009 transferWithAuthorization matching the
 *      requirements. Uses a tight validBefore window (5 minutes).
 *   5. Retries the request with the signed x-payment header. Expects
 *      a 200 with a quote body + x-payment-response settlement header.
 *
 * Makes ONE paid call. Does not loop, does not retry on success.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
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

const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ELSA_URL = "https://x402-api.heyelsa.ai/api/get_swap_quote";
const SAFETY_MIN_USDC_MICRO = BigInt(50_000); // $0.05 minimum to even try

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
  console.error(`  Not making a paid call. Fund the wallet and retry.`);
  process.exit(1);
}

// ---- 2. Probe Elsa --------------------------------------------------------
console.log(`\n▶ Probing Elsa (unpaid) ...`);
const body = {
  from_chain: "base",
  from_token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  from_amount: "1",
  to_chain: "base",
  to_token: "0x4200000000000000000000000000000000000006", // WETH
  wallet_address: account.address,
  slippage: 0.5,
};

const probe = await fetch(ELSA_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

if (probe.status !== 402) {
  console.error(`  unexpected status ${probe.status}`);
  console.error(await probe.text());
  process.exit(1);
}

const envelope = await probe.json();
const requirements = envelope.accepts?.[0];
if (!requirements) {
  console.error("  402 body missing accepts[0]");
  console.error(JSON.stringify(envelope));
  process.exit(1);
}
console.log(
  `  ${probe.status} · asset=${requirements.asset} · amount=${requirements.maxAmountRequired} micro-USDC · payTo=${requirements.payTo}`
);
console.log(
  `  network=${requirements.network} · scheme=${requirements.scheme} · extra=${JSON.stringify(requirements.extra)}`
);

// ---- 3. Sign EIP-3009 ------------------------------------------------------
console.log(`\n▶ Signing EIP-3009 transferWithAuthorization ...`);

function randomNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

const now = Math.floor(Date.now() / 1000);
const validAfter = "0";
const validBefore = String(now + 300); // 5 minutes
const nonce = randomNonce();
const valueMicro = BigInt(requirements.maxAmountRequired);
const to = requirements.payTo;

const signature = await walletClient.signTypedData({
  account,
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
    to,
    value: valueMicro,
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce,
  },
});

const payload = {
  x402Version: 1,
  scheme: "exact",
  network: requirements.network,
  payload: {
    authorization: {
      from: account.address,
      to,
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

// ---- 4. Pay Elsa ----------------------------------------------------------
console.log(`\n▶ Calling Elsa (paid) ...`);

// Encode the same body as in the probe. We also skip silence the unused
// `encodeFunctionData` warning.
void encodeFunctionData;

const started = Date.now();
const res = await fetch(ELSA_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-payment": xPaymentHeader,
  },
  body: JSON.stringify(body),
});
const ms = Date.now() - started;

console.log(`  ${res.status} · ${ms}ms`);

const paymentResponseHeader = res.headers.get("x-payment-response");
if (paymentResponseHeader) {
  try {
    const decoded = JSON.parse(
      Buffer.from(paymentResponseHeader, "base64").toString("utf-8")
    );
    console.log(`  x-payment-response:`);
    console.log(`    success: ${decoded.success}`);
    console.log(`    transaction: ${decoded.transaction}`);
    console.log(`    network: ${decoded.network}`);
    if (decoded.payer) console.log(`    payer: ${decoded.payer}`);
    if (decoded.transaction) {
      console.log(
        `    basescan: https://basescan.org/tx/${decoded.transaction}`
      );
    }
  } catch {
    console.log(`  x-payment-response (raw): ${paymentResponseHeader}`);
  }
} else {
  console.log(`  (no x-payment-response header)`);
}

if (!res.ok) {
  console.error(`\n✗ Elsa rejected the payment.`);
  console.error(await res.text());
  process.exit(1);
}

const quote = await res.json();
console.log(`\n▶ Quote:`);
console.log(JSON.stringify(quote, null, 2).slice(0, 1200));

// ---- 5. Post-flight balance check -----------------------------------------
console.log(`\n▶ Post-flight balance ...`);
const usdcAfter = await publicClient.readContract({
  address: USDC_BASE_MAINNET,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account.address],
});
console.log(`  USDC (mainnet): $${formatUnits(usdcAfter, 6)}`);
const spent = usdcRaw - usdcAfter;
console.log(`  Spent this run: $${formatUnits(spent, 6)}`);

console.log(`\n✓ Elsa x402 end-to-end test passed.`);
