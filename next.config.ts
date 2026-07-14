import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.FIREBASE_HOSTING === "1"
    ? { output: "export" as const, typescript: { ignoreBuildErrors: true } }
    : {}),
};

export default nextConfig;
