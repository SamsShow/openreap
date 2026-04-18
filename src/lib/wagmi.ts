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
