"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-lg border border-line bg-ink-2/80 px-3 py-2.5 text-sm text-text placeholder:text-muted/60 outline-none transition-colors focus:border-signal/50 focus:ring-1 focus:ring-signal/25 disabled:cursor-not-allowed disabled:opacity-60";

export function Label({
  htmlFor,
  children,
  hint,
  required,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label
        htmlFor={htmlFor}
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted"
      >
        {children}
        {required && <span className="ml-1 text-signal">*</span>}
      </label>
      {hint && <span className="text-[10px] text-muted/70">{hint}</span>}
    </div>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(base, className)} {...props} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(base, "min-h-24 resize-y font-sans leading-relaxed", className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(base, "cursor-pointer", className)} {...props}>
      {children}
    </select>
  );
});

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-xs text-bad" role="alert">
      {children}
    </p>
  );
}
