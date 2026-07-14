import { readFileSync, readdirSync, statSync, existsSync, rmSync } from "node:fs";
import { join, relative, dirname, posix } from "node:path";
import { spawnSync } from "node:child_process";

rmSync("out", { recursive: true, force: true });

const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], {
  stdio: "inherit",
  env: {
    ...process.env,
    GITHUB_PAGES: "1",
    NEXT_PUBLIC_BASE_PATH: "/class-message-board",
  },
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const outputDirectory = "out";
const indexPath = join(outputDirectory, "index.html");
if (!existsSync(indexPath) || statSync(indexPath).size === 0) {
  console.error(`GitHub Pages output is invalid: ${indexPath} was not generated.`);
  process.exit(1);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function outputPathFromUrl(url, htmlPath) {
  const clean = url.split("#")[0].split("?")[0];
  if (!clean || clean.startsWith("data:") || clean.startsWith("http:") || clean.startsWith("https:") || clean.startsWith("mailto:") || clean === "javascript:void(0)") return null;
  const basePath = "/class-message-board";
  const withoutBase = clean.startsWith(basePath + "/") ? clean.slice(basePath.length) : clean;
  const normalized = withoutBase.startsWith("/") ? withoutBase.slice(1) : posix.normalize(posix.join(posix.dirname(relative(outputDirectory, htmlPath)), withoutBase));
  if (!normalized || normalized === ".") return null;
  if (normalized.endsWith("/")) return join(outputDirectory, normalized, "index.html");
  return join(outputDirectory, normalized);
}

const missing = new Set();
for (const htmlPath of walk(outputDirectory).filter((path) => path.endsWith(".html"))) {
  const html = readFileSync(htmlPath, "utf8");
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = outputPathFromUrl(match[1], htmlPath);
    if (target && !existsSync(target) && !existsSync(target + ".html")) missing.add(match[1]);
  }
}

for (const required of ["index.html", "manifest.webmanifest", "og.png"]) {
  if (!existsSync(join(outputDirectory, required))) missing.add(required);
}

if (missing.size) {
  console.error("GitHub Pages output contains missing local assets:");
  for (const path of missing) console.error(`- ${path}`);
  process.exit(1);
}

console.log(`GitHub Pages output ready: ${indexPath}`);
