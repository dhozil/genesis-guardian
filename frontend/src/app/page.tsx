import type { Metadata } from "next";
import { Landing } from "@/views/Landing";

export const metadata: Metadata = {
  title: { absolute: "GENESIS GUARDIAN · Autonomous emergency lifeform" },
};

export default function Page() {
  return <Landing />;
}
