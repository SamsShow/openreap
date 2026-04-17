import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia, mainnet } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "OpenReap",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "openreap-wallet-connect",
  chains: [baseSepolia, base, mainnet],
  ssr: true,
});
