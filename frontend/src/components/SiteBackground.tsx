"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * One background for the whole app, lifted out of the hero.
 *
 * Layer order matters for readability: the warm gradient and grid sit at the
 * bottom, the ember glow is blurred and low-alpha, and a scrim + vignette sit on
 * top of everything so cards (`bg-panel/80`) and body text stay legible even
 * where the glow is brightest. Nothing here is interactive: `pointer-events-none`
 * and `-z-10` keep it behind content and out of the tab order.
 */
export function SiteBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #0B0A0F 0%, #241A14 46%, #0B0A0F 100%)",
        }}
      />

      {/* Grid is masked: it fades out where content sits, so it never fights type. */}
      <div
        className="bg-grid absolute inset-0 opacity-45"
        style={{
          maskImage:
            "radial-gradient(ellipse 85% 65% at 50% 28%, black 20%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 85% 65% at 50% 28%, black 20%, transparent 78%)",
        }}
      />

      <motion.div
        className="absolute rounded-full"
        style={{
          top: "-22%",
          left: "6%",
          width: 900,
          height: 900,
          background:
            "radial-gradient(circle, rgba(255,138,61,0.22) 0%, rgba(255,138,61,0.05) 45%, transparent 72%)",
          filter: "blur(80px)",
        }}
        animate={
          reduceMotion ? undefined : { scale: [1, 1.1, 1], opacity: [0.5, 0.78, 0.5] }
        }
        transition={
          reduceMotion
            ? undefined
            : { duration: 14, repeat: Infinity, ease: "easeInOut" }
        }
      />

      {/* Cool counter-glow keeps the page from reading as a flat orange wash. */}
      <div
        className="absolute -bottom-48 -right-24 size-[720px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(110,90,160,0.18) 0%, rgba(110,90,160,0.04) 45%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      {/* Readability scrim + vignette: the layers that protect cards and text. */}
      <div className="absolute inset-0 bg-ink/50" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 32%, rgba(11,10,15,0) 28%, rgba(11,10,15,0.75) 100%)",
        }}
      />
    </div>
  );
}
