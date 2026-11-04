"use client";
import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-signal text-ink hover:bg-[#FFA45F] active:bg-signal-dim shadow-[0_0_24px_-6px_rgba(255,138,61,0.55)]",
  outline:
    "border border-line bg-panel/70 text-text hover:border-signal/50 hover:bg-panel-2/70",
  ghost: "text-muted hover:text-text hover:bg-panel-2/60",
  danger:
    "border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20 hover:border-bad/60",
  subtle:
    "border border-signal/25 bg-signal/10 text-signal hover:bg-signal/15 hover:border-signal/40",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-sm gap-2.5",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner, sets aria-busy and blocks clicks — the double-submit guard. */
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      loadingText,
      icon,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        className={cn(
          "inline-flex select-none items-center justify-center rounded-lg font-semibold transition-all duration-150",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          icon
        )}
        <span className="truncate">
          {loading && loadingText ? loadingText : children}
        </span>
      </button>
    );
  },
);
