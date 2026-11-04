"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BrainCircuit,
  Cpu,
  FileWarning,
  Globe,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import CryptoHero from "@/components/ui/crypto-hero";
import { SiteHeader, WalletChip } from "@/components/SiteHeader";
import { ProtocolTelemetry } from "@/components/ProtocolTelemetry";
import { useProtocolState } from "@/hooks/useProtocolState";
import { GUARDIAN_ADDRESS, GUARDIAN_CHAIN } from "@/lib/chain";
import { shortHex } from "@/lib/utils";

const CAPABILITIES = [
  {
    icon: Globe,
    title: "Corroborated evidence",
    body: "Every source is fetched inside the validators during assessment. A page that cannot be reached ends up UNAVAILABLE — never counted as corroboration.",
  },
  {
    icon: BrainCircuit,
    title: "AI consensus verdict",
    body: "An LLM in the leader proposes threat level, category, confidence and action. Validators re-run it and compare the decision fields; disagreement writes nothing.",
  },
  {
    icon: ShieldCheck,
    title: "Two-phase emergency authority",
    body: "initiate → confirm, request → confirm, reset. A pause is never a single click, and recovery needs its own second transaction.",
  },
];

const STEPS = [
  {
    n: "01",
    icon: FileWarning,
    title: "Report",
    body: "submit_report stores the incident, target and up to eight inline sources.",
  },
  {
    n: "02",
    icon: Globe,
    title: "Corroborate",
    body: "Each reference is fetched on-chain and marked VERIFIED, FAILED or UNAVAILABLE.",
  },
  {
    n: "03",
    icon: BrainCircuit,
    title: "Assess",
    body: "Validators must agree on five decision fields and each source's verification before a verdict is stored.",
  },
  {
    n: "04",
    icon: Cpu,
    title: "Decide",
    body: "Deterministic policy gates turn a verdict into CONFIRMED, REJECTED or INCONCLUSIVE.",
  },
  {
    n: "05",
    icon: ShieldCheck,
    title: "Authorise",
    body: "PAUSE_TARGET unlocks the emergency machine; resolve closes the incident for good.",
  },
];

export function Landing() {
  const router = useRouter();
  const protocol = useProtocolState();

  return (
    <>
      <CryptoHero
        headerSlot={<SiteHeader overlay />}
        logo={null}
        eyebrow="AI consensus · on-chain emergency authority"
        title="A protocol that"
        subtitle="defends itself."
        description="Autonomous security lifeform on GenLayer. Reports become corroborated evidence, validators reach AI consensus on the threat, and a two-phase emergency authority can pause a target — every step finalized on-chain."
        ctaSlot={<WalletChip className="h-12 w-full px-6 sm:w-auto" />}
        ctaButton={{
          label: "Open the console",
          onClick: () => router.push("/console"),
        }}
        stats={[
          { label: "Contract methods", value: "28 (14 read / 14 write)" },
          { label: "Network", value: `${GUARDIAN_CHAIN.shortName} · ${GUARDIAN_CHAIN.id}` },
          { label: "AI step", value: "LLM + live web fetch" },
          { label: "Guardian", value: shortHex(GUARDIAN_ADDRESS, 6, 4) },
        ]}
        cryptoCoins={[
          {
            icon: <BrainCircuit className="size-7" aria-hidden="true" />,
            size: 60,
            position: { x: "2%", y: "6%" },
            delay: 0,
            label: "consensus",
          },
          {
            icon: <Globe className="size-6" aria-hidden="true" />,
            size: 52,
            position: { x: "76%", y: "2%" },
            delay: 0.2,
            label: "web fetch",
          },
          {
            icon: <ShieldCheck className="size-6" aria-hidden="true" />,
            size: 54,
            position: { x: "70%", y: "78%" },
            delay: 0.4,
            label: "emergency",
          },
        ]}
        walletImage={<ProtocolTelemetry protocol={protocol} />}
        brands={[
          {
            name: "GenLayer",
            logo: <span className="font-mono text-xs tracking-[0.16em]">GENLAYER</span>,
          },
          {
            name: "Studionet",
            logo: <span className="font-mono text-xs tracking-[0.16em]">61999</span>,
          },
          {
            name: "AI consensus",
            logo: (
              <span className="flex items-center gap-1.5 font-mono text-xs tracking-[0.16em]">
                <BrainCircuit className="size-3.5" /> NONDET
              </span>
            ),
          },
          {
            name: "Wallets",
            logo: (
              <span className="flex items-center gap-1.5 font-mono text-xs tracking-[0.16em]">
                <Wallet className="size-3.5" /> EIP-6963
              </span>
            ),
          },
        ]}
      />

      <section id="capabilities" className="border-t border-line bg-ink-2/25">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <p className="mono-label">Capabilities</p>
            <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Three guarantees the contract can actually enforce.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Not a dashboard bolted onto a database: each guarantee below is a
              gate in the contract, and the console only surfaces what the chain
              already decided.
            </p>
          </div>

          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {CAPABILITIES.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-line bg-panel/80 p-5 transition-colors hover:border-signal/35"
              >
                <span className="flex size-10 items-center justify-center rounded-xl border border-signal/25 bg-signal/10">
                  <item.icon className="size-5 text-signal" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-ink/40">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="mono-label">Pipeline</p>
              <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
                From one report to a paused target.
              </h2>
            </div>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-signal transition-opacity hover:opacity-80"
            >
              Read the full mechanism
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          <ol className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step) => (
              <li
                key={step.n}
                className="relative rounded-2xl border border-line bg-panel/70 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.18em] text-signal">
                    {step.n}
                  </span>
                  <step.icon className="size-4 text-muted" aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-white">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-line bg-ink-2/25">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-12 sm:flex-row sm:items-center sm:px-8">
          <div>
            <p className="mono-label">Try it against the deployed contract</p>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
              Reads work without a wallet. Writes need your signature.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/console"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-signal px-5 text-sm font-semibold text-ink transition-colors hover:bg-[#FFA45F]"
            >
              Open the console
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-panel/70 px-5 text-sm font-semibold text-text transition-colors hover:border-signal/50"
            >
              How it works
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
