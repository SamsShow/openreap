"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function AuthPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = isSignUp ? "/api/auth/signup" : "/api/auth/login";
    const body = isSignUp
      ? { email, password, displayName }
      : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center">
      <motion.div
        className="flex flex-col items-center w-[420px] rounded-3xl p-12 gap-8 bg-surface border border-border shadow-[0_16px_64px_#00000066,0_0_120px_#C8553D0F]"
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" as const }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-4">
          <motion.h1
            className="font-heading font-bold text-2xl tracking-[-0.02em] text-cream"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {isSignUp ? "Create your account" : "Sign in to OpenReap"}
          </motion.h1>
          <p className="text-sm text-center leading-[22px] text-muted">
            {isSignUp
              ? "Start earning from your expertise in minutes."
              : "Enter your credentials to access your dashboard."}
          </p>
          <Image
            src="/images/logo.png"
            alt="OpenReap"
            width={56}
            height={56}
            className="w-14 h-14 rounded-[14px] object-cover"
          />
        </div>

        {/* Form */}
        <form className="flex flex-col gap-5 w-full" onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-cream">
                Display name
              </label>
              <input
                type="text"
                placeholder="Sarah Mitchell"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-bg border-[1.5px] border-border text-[15px] text-cream placeholder:text-muted/60 outline-none focus:border-terracotta/50 transition-colors"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-cream">
              Email address
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3.5 rounded-xl bg-bg border-[1.5px] border-border text-[15px] text-cream placeholder:text-muted/60 outline-none focus:border-terracotta/50 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-cream">Password</label>
            <input
              type="password"
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3.5 rounded-xl bg-bg border-[1.5px] border-border text-[15px] text-cream placeholder:text-muted/60 outline-none focus:border-terracotta/50 transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-full bg-terracotta text-[15px] font-medium text-off-white shadow-[0_4px_20px_#C8553D4D] hover:shadow-[0_4px_28px_#C8553D66] hover:brightness-110 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? "Please wait..."
              : isSignUp
                ? "Create Account"
                : "Sign In"}
          </button>
        </form>

        {/* Toggle */}
        <p className="text-sm text-muted">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
            }}
            className="text-terracotta hover:underline cursor-pointer"
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>

        {/* Footer */}
        <p className="text-xs text-center leading-[18px] text-subtle">
          By signing in, you agree to our{" "}
          <Link
            href="#"
            className="underline hover:text-muted transition-colors"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="#"
            className="underline hover:text-muted transition-colors"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </motion.div>
    </main>
  );
}
