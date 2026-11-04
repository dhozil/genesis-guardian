import type { Metadata } from "next";
import { ConsolePage } from "@/views/ConsolePage";

export const metadata: Metadata = {
  title: "Operations console",
  description:
    "Read the Genesis Guardian protocol state, the AI consensus assessment and its evidence, then sign the gated writes from your own wallet.",
};

export default function Page() {
  return <ConsolePage />;
}
