"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { DashNav } from "@/components/DashNav";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  professional_title: string | null;
  bio: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  plan: string;
}

export default function ProfileSettingsPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [professionalTitle, setProfessionalTitle] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  // After RainbowKit connects a wallet, sign and link it to the account
  const linkWallet = useCallback(async (walletAddress: string) => {
    setWalletLoading(true);
    setWalletError(null);
    try {
      const message = "Connect wallet to OpenReap";
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/auth/connect-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, signature, message }),
      });
      if (res.ok) {
        const data = await res.json();
        setUser((prev) => prev ? { ...prev, wallet_address: data.wallet_address } : prev);
      } else {
        const data = await res.json();
        setWalletError(data.error || "Failed to connect wallet");
        wagmiDisconnect();
      }
    } catch {
      setWalletError("Wallet signature rejected or failed");
      wagmiDisconnect();
    } finally {
      setWalletLoading(false);
    }
  }, [signMessageAsync, wagmiDisconnect]);

  // Watch for wallet connection from RainbowKit
  useEffect(() => {
    if (isConnected && address && user && !user.wallet_address) {
      linkWallet(address);
    }
  }, [isConnected, address, user, linkWallet]);

  const handleDisconnectWallet = async () => {
    setWalletLoading(true);
    setWalletError(null);
    try {
      const res = await fetch("/api/auth/disconnect-wallet", {
        method: "POST",
      });
      if (res.ok) {
        setUser((prev) => prev ? { ...prev, wallet_address: null } : prev);
        wagmiDisconnect();
      } else {
        setWalletError("Failed to disconnect wallet");
      }
    } catch {
      setWalletError("Failed to disconnect wallet");
    } finally {
      setWalletLoading(false);
    }
  };

  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  useEffect(() => {
    fetch("/api/user/profile")
      .then((res) => res.json())
      .then((data) => {
        const u = data.user;
        setUser(u);
        setDisplayName(u.display_name || "");
        setProfessionalTitle(u.professional_title || "");
        setBio(u.bio || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const initials = user?.display_name
    ? user.display_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email
      ? user.email[0].toUpperCase()
      : "?";

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, professionalTitle, bio }),
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSaveMessage("Saved!");
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage("Failed to save.");
      }
    } catch {
      setSaveMessage("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <DashNav />
        <div className="px-16 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-32 bg-surface rounded-lg" />
            <div className="h-64 w-full max-w-[800px] bg-surface rounded-[20px]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <DashNav user={user ? { display_name: user.display_name, email: user.email } : undefined} />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="flex flex-col"
      >
        {/* Page Title */}
        <motion.div variants={fadeUp} className="px-16 py-8 max-w-[800px]">
          <h1 className="font-heading font-bold text-[28px] text-cream">
            Profile
          </h1>
        </motion.div>

        {/* Profile Form Section */}
        <motion.div
          variants={fadeUp}
          className="px-16 max-w-[800px]"
        >
          <div className="flex gap-8">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-full bg-terracotta flex items-center justify-center">
                <span className="font-heading font-bold text-[28px] text-off-white">
                  {initials}
                </span>
              </div>
              <button className="text-sm text-terracotta">Change avatar</button>
            </div>

            {/* Form Fields */}
            <div className="flex-1 flex flex-col gap-6">
              {/* Display Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-cream">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-bg border-[1.5px] border-border text-[15px] text-cream outline-none focus:border-terracotta transition-colors"
                />
                <span className="text-sm text-muted">
                  Shown on your agent profile and marketplace listing.
                </span>
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-cream">Email</label>
                <input
                  type="email"
                  value={user?.email || ""}
                  disabled
                  className="w-full px-4 py-3 rounded-xl bg-bg/50 border-[1.5px] border-border text-[15px] text-cream outline-none cursor-not-allowed"
                />
                <span className="text-sm text-muted">
                  Used for login. Cannot be changed.
                </span>
              </div>

              {/* Professional Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-cream">Professional Title</label>
                <input
                  type="text"
                  value={professionalTitle}
                  onChange={(e) => setProfessionalTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-bg border-[1.5px] border-border text-[15px] text-cream outline-none focus:border-terracotta transition-colors"
                />
              </div>

              {/* Bio */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-cream">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-bg border-[1.5px] border-border text-[15px] text-cream outline-none focus:border-terracotta transition-colors h-20 resize-none"
                />
              </div>

              {/* Save Button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2.5 bg-terracotta rounded-full text-[15px] font-medium text-off-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                {saveMessage && (
                  <span className={`text-sm ${saveMessage === "Saved!" ? "text-success" : "text-red-400"}`}>
                    {saveMessage}
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Your Public Profile Section */}
        <motion.div
          variants={fadeUp}
          className="px-16 max-w-[800px] mt-8"
        >
          <div className="rounded-[20px] border border-border p-8">
            <h2 className="font-medium text-[15px] text-cream">
              Your Public Profile
            </h2>
            <p className="text-sm text-muted mt-1">
              Share this link as proof of your expertise. Visible to anyone.
            </p>
            <div className="flex gap-3 mt-4">
              <input
                type="text"
                readOnly
                value="openreap.ai/agents/contract-reviewer"
                className="bg-bg rounded-xl px-4 py-3 text-sm text-cream flex-1 border-[1.5px] border-border outline-none"
              />
              <button className="px-5 py-3 rounded-xl border border-border text-sm text-cream hover:bg-surface transition-colors">
                Copy Link
              </button>
            </div>
          </div>
        </motion.div>

        {/* Wallet Section */}
        <motion.div
          variants={fadeUp}
          className="px-16 max-w-[800px] mt-8"
        >
          <div className="rounded-[20px] border border-border p-8">
            <h2 className="font-medium text-[15px] text-cream">Wallet</h2>
            <p className="text-sm text-muted mt-1">
              Connect your wallet to receive USDC payouts on Base.
            </p>

            {walletError && (
              <p className="text-sm text-red-400 mt-2">{walletError}</p>
            )}

            <div className="mt-4">
              {user?.wallet_address ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-bg border-[1.5px] border-border">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-sm text-cream font-mono">
                      {truncateAddress(user.wallet_address)}
                    </span>
                  </div>
                  <button
                    onClick={handleDisconnectWallet}
                    disabled={walletLoading}
                    className="px-5 py-2.5 rounded-full border border-border text-sm text-cream hover:bg-surface transition-colors disabled:opacity-50"
                  >
                    {walletLoading ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => openConnectModal?.()}
                  disabled={walletLoading}
                  className="px-6 py-2.5 bg-terracotta rounded-full text-[15px] font-medium text-off-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {walletLoading ? "Connecting..." : "Connect Wallet"}
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Payout Settings Section */}
        <motion.div
          variants={fadeUp}
          className="px-16 max-w-[800px] mt-8"
        >
          <div className="rounded-[20px] border border-border p-8">
            <h2 className="font-medium text-[15px] text-cream">
              Payout Settings
            </h2>
            <div className="flex gap-12 mt-4">
              <div>
                <span className="text-sm text-muted">
                  Total Received (USDC)
                </span>
                <p className="font-heading font-bold text-[28px] text-terracotta">
                  $1,240
                </p>
              </div>
              <div>
                <span className="text-sm text-muted">Settlement</span>
                <p className="text-sm text-cream mt-1">
                  USDC on Base via Elsa
                  {user?.wallet_address && (
                    <span className="text-muted font-mono ml-2">
                      ({truncateAddress(user.wallet_address)})
                    </span>
                  )}
                </p>
                {!user?.wallet_address && (
                  <p className="text-sm text-muted/70 mt-0.5 italic">
                    No wallet connected
                  </p>
                )}
                <button className="text-terracotta text-sm mt-0.5">
                  View history
                </button>
              </div>
            </div>
            <button className="px-6 py-2.5 bg-terracotta rounded-full text-[15px] font-medium text-off-white hover:opacity-90 transition-opacity mt-4">
              View payout history
            </button>
          </div>
        </motion.div>

        {/* Danger Zone Section */}
        <motion.div
          variants={fadeUp}
          className="px-16 max-w-[800px] mt-8 mb-16"
        >
          <div className="rounded-[20px] border border-red-500/30 p-8">
            <h2 className="text-[15px] font-medium text-red-400">
              Danger Zone
            </h2>

            {/* Pause All Agents */}
            <div className="flex items-center justify-between mt-4">
              <div>
                <p className="text-sm text-cream">Pause all agents</p>
                <p className="text-sm text-muted mt-0.5">
                  Temporarily stop accepting jobs. You can resume anytime.
                </p>
              </div>
              <button className="px-5 py-2 rounded-full border border-red-500/30 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                Pause
              </button>
            </div>

            <div className="h-px bg-border my-4" />

            {/* Delete Account */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-cream">Delete account</p>
                <p className="text-sm text-muted mt-0.5">
                  Permanently delete your account and all agents. This cannot be
                  undone.
                </p>
              </div>
              <button className="px-5 py-2 rounded-full bg-red-500/20 text-sm text-red-400 hover:bg-red-500/30 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
