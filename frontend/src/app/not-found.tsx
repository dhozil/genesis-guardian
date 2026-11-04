import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start px-5 py-24 sm:px-8">
      <p className="mono-label">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
        This route is not part of the protocol.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        The guardian only exposes a landing page, the operations console and the
        mechanism write-up.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-lg bg-signal px-4 text-sm font-semibold text-ink transition-colors hover:bg-[#FFA45F]"
        >
          Back to landing
        </Link>
        <Link
          href="/console"
          className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-semibold text-text transition-colors hover:border-signal/50"
        >
          Open the console
        </Link>
      </div>
    </div>
  );
}
