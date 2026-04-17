/**
 * Browser-side x402 payment signer.
 *
 * Given a PaymentRequirements object (from an HTTP 402 response), asks the
 * user's connected wallet to sign an EIP-3009 `TransferWithAuthorization` and
 * returns a base64-encoded `x-payment` header payload that the server (or a
 * paid third-party API like Elsa) can settle via an x402 facilitator.
 */

import { signTypedData, switchChain, readContract } from "wagmi/actions";
import type { Config } from "wagmi";
import { toHex } from "viem";
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  USDC_BASE_MAINNET,
  USDC_BASE_SEPOLIA,
} from "./chains";
import { X402ClientError } from "./x402-errors";

const balanceOfAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * Read the payer's balance on the EXACT asset contract named in the x402
 * requirements. Not the wallet's total "USDC" across all deployments — the
 * one specific ERC-20 that the facilitator will try to transferWithAuthorization.
 */
export async function readPayerBalance(
  wagmiConfig: Config,
  payer: `0x${string}`,
  requirements: PaymentRequirements
): Promise<bigint> {
  const chainId = chainIdForNetwork(requirements.network);
  const asset = (requirements.asset ||
    defaultAssetForNetwork(requirements.network)) as `0x${string}`;
  const balance = await readContract(wagmiConfig, {
    chainId,
    address: asset,
    abi: balanceOfAbi,
    functionName: "balanceOf",
    args: [payer],
  });
  return balance as bigint;
}

export interface PaymentRequirements {
  scheme: "exact";
  network: "base-sepolia" | "base";
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { name: string; version: string };
}

export interface SignedPayment {
  /** Base64-encoded x-payment header value. */
  header: string;
  /** Raw payload (useful for logs / traces). */
  payload: {
    x402Version: 1;
    scheme: "exact";
    network: string;
    payload: {
      authorization: {
        from: `0x${string}`;
        to: `0x${string}`;
        value: string;
        validAfter: string;
        validBefore: string;
        nonce: `0x${string}`;
      };
      signature: `0x${string}`;
    };
  };
}

function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function chainIdForNetwork(network: PaymentRequirements["network"]): number {
  return network === "base-sepolia"
    ? BASE_SEPOLIA_CHAIN_ID
    : BASE_MAINNET_CHAIN_ID;
}

function defaultAssetForNetwork(
  network: PaymentRequirements["network"]
): `0x${string}` {
  return network === "base-sepolia" ? USDC_BASE_SEPOLIA : USDC_BASE_MAINNET;
}

/**
 * Sign an x402 payment authorization with the user's wallet.
 *
 * @param wagmiConfig - The wagmi `Config` from `src/lib/wagmi.ts`.
 * @param from        - The connected wallet address (payer).
 * @param requirements- The PaymentRequirements advertised by the 402 response.
 */
export async function signX402Payment(
  wagmiConfig: Config,
  from: `0x${string}`,
  requirements: PaymentRequirements
): Promise<SignedPayment> {
  const chainId = chainIdForNetwork(requirements.network);
  const verifyingContract = (requirements.asset ||
    defaultAssetForNetwork(requirements.network)) as `0x${string}`;

  // Pre-flight: read the balance on the exact asset contract the facilitator
  // will transferWithAuthorization against. If the payer is short we can
  // surface a clear error instead of burning a wallet signature prompt that
  // the chain will reject with a confusing revert trace.
  const required = BigInt(requirements.maxAmountRequired);
  try {
    const balance = await readPayerBalance(wagmiConfig, from, requirements);
    if (balance < required) {
      const haveUsd = Number(balance) / 1e6;
      const needUsd = Number(required) / 1e6;
      const networkLabel =
        requirements.network === "base-sepolia"
          ? "Base Sepolia"
          : "Base mainnet";
      const short = `${from.slice(0, 6)}…${from.slice(-4)}`;
      const faucetHint =
        requirements.network === "base-sepolia"
          ? `Get Sepolia USDC at https://faucet.circle.com (pick Base Sepolia). The token contract is ${verifyingContract} — any other "USDC" on Base Sepolia won't work.`
          : `Fund your wallet with mainnet USDC on contract ${verifyingContract}.`;
      throw new X402ClientError(
        "insufficient_funds",
        `Not enough USDC on ${networkLabel}`,
        `Your wallet ${short} holds $${haveUsd.toFixed(2)} USDC on ${networkLabel}. This call costs $${needUsd.toFixed(2)}. Fund the wallet and retry.`,
        {
          hint: faucetHint,
          details: {
            payer: from,
            asset: verifyingContract,
            network: requirements.network,
            balanceMicro: String(balance),
            requiredMicro: requirements.maxAmountRequired,
          },
        }
      );
    }
  } catch (err) {
    if (err instanceof X402ClientError) throw err;
    // If the balance read itself fails (RPC down, etc.), log and continue —
    // the facilitator will surface whatever the real problem is.
    console.warn(
      "[x402-client] pre-flight balance read failed:",
      err instanceof Error ? err.message : err
    );
  }

  // Ensure the wallet is on the right chain before signing.
  try {
    await switchChain(wagmiConfig, { chainId });
  } catch {
    // switchChain throws if we're already on the right chain on some wallets;
    // proceed and let signTypedData surface a real error.
  }

  const now = Math.floor(Date.now() / 1000);
  const validAfter = "0";
  const validBefore = String(now + requirements.maxTimeoutSeconds);
  const nonce = randomNonce();
  const value = requirements.maxAmountRequired;
  const to = requirements.payTo as `0x${string}`;

  const signature = await signTypedData(wagmiConfig, {
    account: from,
    domain: {
      name: requirements.extra.name,
      version: requirements.extra.version,
      chainId,
      verifyingContract,
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
      from,
      to,
      value: BigInt(value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce,
    },
  });

  const payload = {
    x402Version: 1 as const,
    scheme: "exact" as const,
    network: requirements.network,
    payload: {
      authorization: {
        from,
        to,
        value,
        validAfter,
        validBefore,
        nonce,
      },
      signature: signature as `0x${string}`,
    },
  };

  const header =
    typeof window === "undefined"
      ? Buffer.from(JSON.stringify(payload)).toString("base64")
      : btoa(JSON.stringify(payload));

  return { header, payload };
}
