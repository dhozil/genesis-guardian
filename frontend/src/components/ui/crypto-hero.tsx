"use client";
import { motion, useReducedMotion } from "framer-motion";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface CryptoHeroProps {
  logo: React.ReactNode;
  /** First line of the headline, rendered in white. */
  title: string;
  /** Second line of the headline, rendered in the signal accent. */
  subtitle: string;
  description: string;
  /** Small monospace line above the headline. */
  eyebrow?: string;
  /** Replaces the whole built-in navigation bar with a host-provided header. */
  headerSlot?: React.ReactNode;
  ctaButton?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
    disabled?: boolean;
  };
  /** Replaces the email field: this product connects a wallet, it does not collect email. */
  ctaSlot?: React.ReactNode;
  navItems?: Array<{ label: string; onClick: () => void }>;
  authButtons?: {
    login: { label: string; onClick: () => void };
    signup: { label: string; onClick: () => void };
  };
  cryptoCoins?: Array<{
    icon: React.ReactNode;
    size: number;
    position: { x: string; y: string };
    delay: number;
    label?: string;
  }>;
  brands?: Array<{ name: string; logo: React.ReactNode }>;
  walletImage?: React.ReactNode;
  stats?: Array<{ label: string; value: string }>;
  className?: string;
}

export default function CryptoHero({
  logo,
  title,
  subtitle,
  description,
  eyebrow,
  headerSlot,
  ctaButton,
  ctaSlot,
  navItems = [],
  authButtons,
  cryptoCoins = [],
  brands = [],
  walletImage,
  stats = [],
  className = "",
}: CryptoHeroProps) {
  const reduceMotion = useReducedMotion();
  const float = !reduceMotion;

  return (
    <section
      className={cn(
        "relative isolate w-full overflow-hidden",
        "min-h-[100svh]",
        className,
      )}
    >
      {/* Background lives in <SiteBackground /> so every route shares one layer. */}
      <div
        aria-hidden="true"
        className="animate-scan pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-signal/50 to-transparent"
      />

      {/* Navigation — replaced by the shared site header when one is supplied */}
      {headerSlot ?? (
        <nav className="absolute inset-x-0 top-0 z-40 px-5 py-5 sm:px-8 sm:py-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-3"
          >
            {logo}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="hidden items-center gap-7 md:flex"
          >
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/60 transition-colors hover:text-signal"
              >
                {item.label}
              </button>
            ))}
          </motion.div>

          {authButtons && (
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="flex items-center gap-3"
            >
              <button
                type="button"
                onClick={authButtons.login.onClick}
                className="hidden text-sm font-medium text-white/70 transition-colors hover:text-white sm:block"
              >
                {authButtons.login.label}
              </button>
              <button
                type="button"
                onClick={authButtons.signup.onClick}
                className="rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-ink transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                {authButtons.signup.label}
              </button>
            </motion.div>
          )}
        </div>
      </nav>
      )}

      {/* Content */}
      <div className="relative z-10 flex min-h-[100svh] items-center px-5 pb-16 pt-28 sm:px-8 sm:pt-32">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Left column */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-7"
          >
            {eyebrow && (
              <div className="inline-flex items-center gap-2 rounded-full border border-signal/25 bg-signal/[0.07] px-3 py-1.5">
                <span className="size-1.5 animate-pulse-ring rounded-full bg-signal" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal/90">
                  {eyebrow}
                </span>
              </div>
            )}

            <h1 className="text-balance text-[2.6rem] font-bold leading-[1.02] tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">
              {title}
              <br />
              <span className="text-signal">{subtitle}</span>
            </h1>

            <p className="max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
              {description}
            </p>

            {(ctaSlot || ctaButton) && (
              <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-center">
                {ctaSlot}
                {ctaButton && (
                  <motion.button
                    type="button"
                    whileHover={float ? { scale: 1.03 } : undefined}
                    whileTap={float ? { scale: 0.97 } : undefined}
                    onClick={ctaButton.onClick}
                    disabled={ctaButton.disabled || ctaButton.loading}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-signal px-7 text-sm font-semibold text-ink transition-colors hover:bg-[#FFA45F] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ctaButton.loading ? "Working…" : ctaButton.label}
                  </motion.button>
                )}
              </div>
            )}

            {stats.length > 0 && (
              <dl className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-4 border-t border-white/10 pt-6 sm:grid-cols-4">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                      {stat.label}
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-white/90">
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </motion.div>

          {/* Right column: wallet / live panel + floating glyphs */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.35 }}
            className="relative h-[420px] w-full sm:h-[480px]"
          >
            <div className="absolute inset-0 flex items-center justify-center">
              {walletImage}
            </div>

            {cryptoCoins.map((coin, index) => (
              <motion.div
                key={index}
                className="absolute flex flex-col items-center gap-2"
                style={{
                  left: coin.position.x,
                  top: coin.position.y,
                }}
                initial={{ opacity: 0, y: 30 }}
                animate={
                  float
                    ? { opacity: 1, y: [0, -14, 0], rotate: [0, 4, 0, -4, 0] }
                    : { opacity: 1 }
                }
                transition={
                  float
                    ? {
                        opacity: { duration: 0.6, delay: 0.6 + coin.delay },
                        y: {
                          duration: 3.4 + index * 0.5,
                          repeat: Infinity,
                          ease: "easeInOut",
                        },
                        rotate: {
                          duration: 4.6 + index * 0.3,
                          repeat: Infinity,
                          ease: "easeInOut",
                        },
                      }
                    : { duration: 0.6, delay: 0.6 + coin.delay }
                }
              >
                <div
                  className="flex items-center justify-center rounded-2xl border border-signal/25 bg-signal/[0.08] text-signal shadow-[0_10px_40px_-12px_rgba(255,138,61,0.55)] backdrop-blur-sm"
                  style={{ width: coin.size, height: coin.size }}
                >
                  {coin.icon}
                </div>
                {coin.label && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">
                    {coin.label}
                  </span>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Brand / partner strip */}
      {brands.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="absolute inset-x-0 bottom-6 z-20 hidden sm:block"
        >
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-wrap items-center justify-center gap-10 opacity-45">
              {brands.map((brand) => (
                <motion.div
                  key={brand.name}
                  whileHover={float ? { opacity: 1, scale: 1.05 } : undefined}
                  className="flex items-center gap-2 text-white/80"
                  title={brand.name}
                >
                  {brand.logo}
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </section>
  );
}
