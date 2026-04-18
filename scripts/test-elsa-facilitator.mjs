/**
 * Schema-drift smoke test for the Elsa x402 facilitator.
 *
 *   node scripts/test-elsa-facilitator.mjs
 *
 * Asserts that Elsa's facilitator at facilitator.heyelsa.build still exposes
 * the POST /settle endpoint with the response shape src/lib/elsa.ts's
 * verifyPayment() parses ({ success, transaction?, errorReason? / error? }).
 * /settle is the endpoint production hits — /verify has a different schema
 * that we intentionally don't consume.
 *
 * Uses a deliberately-invalid paymentPayload so no real USDC moves. The test
 * passes when the facilitator responds with a structured JSON failure
 * containing a boolean `success` and a machine-readable reason string — the
 * exact fields verifyPayment() reads.
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

console.log(`▶ POST ${FACILITATOR}/settle`);
const res = await fetch(`${FACILITATOR}/settle`, {
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
