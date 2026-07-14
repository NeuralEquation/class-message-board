import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";

const cloudflareConfig = "vite.config.ts";
const backupConfig = "vite.config.cloudflare.ts";
if (existsSync(cloudflareConfig)) renameSync(cloudflareConfig, backupConfig);
let result;
try {
  result = spawnSync(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], {
    stdio: "inherit",
    env: { ...process.env, FIREBASE_HOSTING: "1" },
  });
} finally {
  if (existsSync(backupConfig)) renameSync(backupConfig, cloudflareConfig);
}

if (result.error) throw result.error;
process.exit(result.status ?? 1);
