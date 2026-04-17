"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Ring } from "./Shapes";

export function Footer() {
  return (
    <footer className="px-16 pt-16 pb-10 relative overflow-hidden">
      {/* Decorative */}
      <Ring size={100} color="#F0E6D30A" className="-top-[30px] right-[200px]" />

      <div className="max-w-[1312px] mx-auto flex flex-col gap-12">
        {/* Footer character */}
        <motion.div
          className="relative w-full h-[512px] rounded-2xl overflow-hidden"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <Image
            src="/images/footer-character.png"
            alt="OpenReap mascot close-up"
            fill
            className="object-cover"
          />
        </motion.div>

        {/* Large brand text */}
        <motion.div
          className="flex justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1 }}
          viewport={{ once: true }}
        >
          <h2
            className="font-heading font-bold text-[220px] leading-[190px] tracking-[-0.04em] select-none"
            style={{
              color: "rgba(240,230,211,0.08)",
              textShadow: "0 0 80px rgba(200,85,61,0.08)",
            }}
          >
            OPENREAP
          </h2>
        </motion.div>

        {/* Footer links */}
        <div className="flex items-center justify-between pt-8 border-t border-surface">
          <span className="text-sm text-muted">
            &copy; 2026 OpenReap. All rights reserved.
          </span>
          <div className="flex gap-6">
            <Link
              href="#"
              className="text-sm text-muted hover:text-cream transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="#"
              className="text-sm text-muted hover:text-cream transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="#"
              className="text-sm text-muted hover:text-cream transition-colors"
            >
              Cookie Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
