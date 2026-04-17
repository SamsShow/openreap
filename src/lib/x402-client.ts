/**
 * Browser-side x402 payment signer.
 *
 * Given a PaymentRequirements object (from an HTTP 402 response), asks the
 * user's connected wallet to sign an EIP-3009 `TransferWithAuthorization` and
 * returns a base64-encoded `x-payment` header payload that the server (or a
 * paid third-party API like Elsa) can settle via an x402 facilitator.
 */

import { signTypedData, switchChain } from "wagmi/actions";
import type { Config } from "wagmi";
import { toHex } from "viem";
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  USDC_BASE_MAINNET,
  USDC_BASE_SEPOLIA,
} from "./chains";

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
