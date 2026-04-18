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
