"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { DashNav } from "@/components/DashNav";
import { ErrorCard } from "@/components/ErrorCard";
import { X402ClientError } from "@/lib/x402-errors";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

interface Balance {
  available_usdc: number | string;
  pending_usdc: number | string;
  lifetime_earned: number | string;
}

interface Withdrawal {
  id: string;
  amount_usdc: string | number;
  destination: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
  completed_at: string | null;
}

interface UserMe {
  id: string;
  email: string;
  display_name: string | null;
  wallet_address: string | null;
}

function formatUsdc(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `$${n.toFixed(2)}`;
}

function short(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function statusClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-success/15 text-success";
    case "pending":
    case "pending_manual_review":
      return "bg-terracotta/15 text-terracotta";
    case "failed":
      return "bg-red-500/15 text-red-400";
    default:
      return "bg-surface text-muted";
  }
}

export default function PayoutsPage() {
  const [user, setUser] = useState<UserMe | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [treasuryConfigured, setTreasuryConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState("5");
  const [destination, setDestination] = useState("");
  const [destTouched, setDestTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, balRes, wdRes] = await Promise.all([
        fetch("/api/user/me"),
        fetch("/api/user/balance"),
        fetch("/api/withdrawals"),
      ]);
      const meData = meRes.ok ? await meRes.json() : null;
      const balData = balRes.ok ? await balRes.json() : null;
      const wdData = wdRes.ok ? await wdRes.json() : null;

      if (meData?.user) setUser(meData.user);
      if (balData?.balance) setBalance(balData.balance);
      if (wdData?.withdrawals) setWithdrawals(wdData.withdrawals);
      if (wdData) {
        setTreasuryConfigured(!!wdData.treasury_configured);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (destTouched) return;
    if (user?.wallet_address) setDestination(user.wallet_address);
    else if (address) setDestination(address);
  }, [user?.wallet_address, address, destTouched]);

  async function handleLinkWallet() {
    if (!isConnected || !address) {
      setError(
        new X402ClientError(
          "wallet_not_connected",
          "Connect your wallet",
          "Use the Connect Wallet button above first."
        )
      );
      return;
    }
    setError(null);
    setLinking(true);
    try {
      const message = `Link wallet ${address} to OpenReap at ${new Date().toISOString()}`;
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/auth/connect-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, signature, message }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new X402ClientError(
          "agent_error",
          "Couldn't link wallet",
          (data?.error as string) || `Server returned HTTP ${res.status}.`,
          { details: data }
        );
      }
      await refresh();
      setSuccessMessage(`Wallet ${short(address)} linked to your account.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err);
    } finally {
      setLinking(false);
    }
  }

  async function handleWithdraw() {
    setError(null);
    setSuccessMessage(null);
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(
        new X402ClientError(
          "invalid_input",
          "Invalid amount",
          "Enter a positive number of USD."
        )
      );
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(destination)) {
      setError(
        new X402ClientError(
          "invalid_input",
          "Destination address looks wrong",
          "Paste a valid 0x-prefixed Ethereum address or use the connected wallet."
        )
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_usdc: amt, destination }),
      });
      const data = await res.json();

      if (!res.ok && res.status !== 202) {
        if (data.reason === "treasury_underfunded") {
          const have =
            typeof data.treasury_balance_usd === "number"
              ? data.treasury_balance_usd
              : null;
          throw new X402ClientError(
            "agent_error",
            "Treasury is underfunded",
            have !== null
              ? `The Reap treasury only has the equivalent of $${have.toFixed(2)} in Sepolia ETH but you tried to withdraw $${amt.toFixed(2)}. Fund the treasury and try again.`
              : `The Reap treasury doesn't hold enough Sepolia ETH for this withdrawal.`,
            {
              hint: data.treasury_address
                ? `Fund this wallet with Sepolia ETH: ${data.treasury_address}`
                : undefined,
              details: data,
            }
          );
        }
        throw new X402ClientError(
          "agent_error",
          "Withdrawal failed",
          (data.error as string) ||
            (data.reason as string) ||
            `Server returned HTTP ${res.status}.`,
          { details: data }
        );
      }

      setSuccessMessage(
        res.status === 202
          ? data.message ||
              "Withdrawal queued for manual processing."
          : data.message || "Withdrawal settled on Base Sepolia."
      );
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const available = Number(balance?.available_usdc ?? 0);
  const pending = Number(balance?.pending_usdc ?? 0);
  const lifetime = Number(balance?.lifetime_earned ?? 0);

  return (
    <div className="min-h-screen bg-bg">
      <DashNav user={user ?? undefined} />

      <motion.div
        className="px-16 py-8 max-w-[960px]"
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        <motion.div variants={fadeUp} className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-heading font-bold text-[28px] text-cream">
              Payouts
            </h1>
            <p className="text-sm text-muted mt-1">
              Earnings from hired agents accrue as USD value. Withdrawals are
              paid out as Base Sepolia ETH at the current spot price.
            </p>
          </div>
          <ConnectButton
            accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
            chainStatus="icon"
            showBalance={false}
          />
        </motion.div>

        {!treasuryConfigured && (
          <motion.div
            variants={fadeUp}
            className="mt-6 px-4 py-3 rounded-xl bg-terracotta/10 border border-terracotta/30"
          >
            <p className="text-sm text-terracotta">
              Treasury signer not configured. Withdrawals will queue as
              <span className="font-mono"> pending_manual_review</span> until an
              operator sets <span className="font-mono">REAP_TREASURY_PRIVATE_KEY</span>.
            </p>
          </motion.div>
        )}

        {/* Auto-prompt to link a connected-but-unlinked wallet to the account
            so future withdrawals default to it without a round-trip. */}
        {isConnected &&
          address &&
          user &&
          !user.wallet_address &&
          user.wallet_address !== address && (
            <motion.div
              variants={fadeUp}
              className="mt-6 px-5 py-4 rounded-xl bg-terracotta/10 border border-terracotta/30 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="min-w-0">
                <p className="text-sm text-cream font-medium">
                  Link {short(address)} to your account?
                </p>
                <p className="text-xs text-muted mt-1">
                  One signature and future withdrawals auto-fill this wallet as
                  the destination.
                </p>
              </div>
              <button
                onClick={handleLinkWallet}
                disabled={linking}
                className="text-xs px-4 py-2 rounded-full bg-terracotta text-off-white hover:opacity-90 transition-opacity disabled:opacity-50 flex-shrink-0"
              >
                {linking ? "Signing..." : "Link wallet"}
              </button>
            </motion.div>
          )}

        <motion.div
          className="mt-6 grid grid-cols-3 gap-5"
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="rounded-[20px] border border-surface p-6">
            <p className="text-sm text-muted">Available</p>
            <p className="font-heading font-bold text-[32px] text-cream mt-1">
              {formatUsdc(available)}
            </p>
            <p className="text-xs text-muted mt-1">Ready to withdraw</p>
          </motion.div>
          <motion.div variants={fadeUp} className="rounded-[20px] border border-surface p-6">
            <p className="text-sm text-muted">Pending</p>
            <p className="font-heading font-bold text-[32px] text-cream mt-1">
              {formatUsdc(pending)}
            </p>
            <p className="text-xs text-muted mt-1">In flight to your wallet</p>
          </motion.div>
          <motion.div variants={fadeUp} className="rounded-[20px] border border-surface p-6">
            <p className="text-sm text-muted">Lifetime earned</p>
            <p className="font-heading font-bold text-[32px] text-cream mt-1">
              {formatUsdc(lifetime)}
            </p>
            <p className="text-xs text-muted mt-1">Via Elsa x402 on Base Sepolia</p>
          </motion.div>
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-8 rounded-[20px] border border-surface p-8"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-heading font-bold text-[20px] text-cream">
                Withdraw
              </h2>
              <p className="text-sm text-muted mt-1">
                Reap treasury sends Sepolia ETH equal to the USD amount at the
                current ETH/USD spot price. Only a connected wallet on Base
                Sepolia is needed.
              </p>
            </div>
            {user?.wallet_address ? (
              <span className="text-xs px-3 py-1.5 rounded-full bg-success/15 text-success">
                Wallet linked: {short(user.wallet_address)}
              </span>
            ) : (
              <button
                onClick={handleLinkWallet}
                disabled={!isConnected || linking}
                className="text-xs px-3 py-1.5 rounded-full border border-border text-muted hover:text-cream hover:border-terracotta/60 transition-colors disabled:opacity-50"
              >
                {linking
                  ? "Signing..."
                  : isConnected
                    ? "Link connected wallet to account"
                    : "Connect wallet to link"}
              </button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-[180px_1fr] gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Amount (USD)</label>
              <input
                type="number"
                min={1}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-cream outline-none focus:border-terracotta/50 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 flex justify-between">
                <span>Destination wallet</span>
                {address && destination.toLowerCase() !== address.toLowerCase() && (
                  <button
                    onClick={() => {
                      setDestination(address);
                      setDestTouched(true);
                    }}
                    className="text-terracotta hover:underline"
                  >
                    Use connected ({short(address)})
                  </button>
                )}
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setDestTouched(true);
                }}
                placeholder="0x..."
                className="w-full px-3 py-2.5 rounded-xl bg-bg border border-border text-sm text-cream outline-none focus:border-terracotta/50 font-mono"
              />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-4 flex-wrap">
            <button
              onClick={handleWithdraw}
              disabled={submitting || available <= 0 || !amount}
              className="px-6 py-3 rounded-full bg-terracotta text-[15px] font-medium text-off-white shadow-[0_0_24px_#C8553D4D] hover:shadow-[0_0_32px_#C8553D66] transition-shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting
                ? "Broadcasting..."
                : `Withdraw ${formatUsdc(parseFloat(amount) || 0)}`}
            </button>
            <button
              onClick={() => setAmount(String(available.toFixed(2)))}
              disabled={available <= 0}
              className="text-xs text-muted hover:text-cream disabled:opacity-40"
            >
              Max ({formatUsdc(available)})
            </button>
          </div>

          {successMessage && (
            <div className="mt-5 px-4 py-3 rounded-xl bg-success/10 border border-success/25">
              <p className="text-sm text-success">{successMessage}</p>
            </div>
          )}

          {error ? (
            <div className="mt-5">
              <ErrorCard error={error} />
            </div>
          ) : null}
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-8 rounded-[20px] border border-surface p-6"
        >
          <p className="font-medium text-[15px] text-cream mb-4">
            Recent withdrawals
          </p>
          {loading ? (
            <p className="text-sm text-muted">Loading...</p>
          ) : withdrawals.length === 0 ? (
            <p className="text-sm text-muted">No withdrawals yet.</p>
          ) : (
            <div className="flex flex-col">
              {withdrawals.map((w, i) => (
                <div
                  key={w.id}
                  className={`py-3 flex items-center gap-4 ${
                    i < withdrawals.length - 1 ? "border-b border-surface" : ""
                  }`}
                >
                  <span className="w-[80px] text-xs text-muted flex-shrink-0">
                    {new Date(w.created_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="w-[90px] text-sm text-cream font-mono flex-shrink-0">
                    {formatUsdc(w.amount_usdc)}
                  </span>
                  <span className="flex-1 text-xs text-muted font-mono truncate">
                    → {short(w.destination)}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${statusClass(
                      w.status
                    )}`}
                  >
                    {w.status.replace(/_/g, " ").toUpperCase()}
                  </span>
                  {w.tx_hash ? (
                    <a
                      href={`https://sepolia.basescan.org/tx/${w.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-terracotta hover:underline flex-shrink-0"
                    >
                      View tx
                    </a>
                  ) : (
                    <span className="text-xs text-muted flex-shrink-0 w-[56px] text-right">
                      —
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
