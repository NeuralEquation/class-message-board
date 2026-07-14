import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.FIREBASE_HOSTING === "1" ? { output: "export" as const } : {}),
};

export default nextConfig;
