import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The preview panel reaches the dev server as 127.0.0.1, while Next treats
  // `localhost` as the default dev origin and blocks the rest (HMR + dev chunks).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
