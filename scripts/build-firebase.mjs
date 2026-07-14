import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";

// Use Next.js's official static export for Firebase Hosting. This is kept
// separate from the Cloudflare/Vinext build (`npm run build`).
rmSync("out", { recursive: true, force: true });
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], {
  stdio: "inherit",
  env: { ...process.env, FIREBASE_HOSTING: "1" },
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const source = "out";
const target = "dist/client";
const index = `${source}/index.html`;
if (!existsSync(index)) {
  console.error(`Firebase static export failed: ${index} was not generated.`);
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
const targetIndex = `${target}/index.html`;
if (!existsSync(targetIndex) || statSync(targetIndex).size === 0) {
  console.error(`Firebase Hosting output is invalid: ${targetIndex}`);
  process.exit(1);
}
console.log(`Firebase Hosting output ready: ${targetIndex}`);
