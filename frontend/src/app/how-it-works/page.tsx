import type { Metadata } from "next";
import { HowItWorks } from "@/views/HowItWorks";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Genesis Guardian turns a report into a paused target: evidence corroboration, AI consensus, deterministic policy gates and the two-phase emergency state machine.",
};

export default function Page() {
  return <HowItWorks />;
}
