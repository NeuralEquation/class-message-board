import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.FIREBASE_HOSTING === "1"
    ? { output: "export" as const, typescript: { ignoreBuildErrors: true } }
    : {}),
  ...(process.env.GITHUB_PAGES === "1"
    ? {
        output: "export" as const,
        basePath: "/class-message-board",
        images: { unoptimized: true },
        typescript: { ignoreBuildErrors: true },
      }
    : {}),
};

export default nextConfig;
