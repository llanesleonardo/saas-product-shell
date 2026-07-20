#!/usr/bin/env node
/**
 * Epic 13 / GAP-1508 — bump + publish saas-product-shell to GitHub Packages.
 *
 *   NODE_AUTH_TOKEN=... npm run release -- --version 0.2.3 --changelog "note"
 *
 * Does NOT commit tokens. Requires publish rights on @llanesleonardo scope.
 * Consumer apps: npx @llanesleonardo/create-saas update-pins --shell <ver>
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");

function die(msg) {
  console.error(`release: ${msg}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
let version = null;
let changelog = null;
let dryRun = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--version") version = argv[++i];
  else if (argv[i] === "--changelog") changelog = argv[++i];
  else if (argv[i] === "--dry-run") dryRun = true;
  else if (argv[i] === "--help") {
    console.log("Usage: npm run release -- --version 0.2.3 [--changelog \"...\"] [--dry-run]");
    process.exit(0);
  }
}

if (!version) die("pass --version x.y.z");
if (!process.env.NODE_AUTH_TOKEN && !dryRun) {
  die("set NODE_AUTH_TOKEN (GitHub PAT with write:packages) — never commit it");
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const prev = pkg.version;
pkg.version = version;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`version ${prev} → ${version}`);

if (changelog) {
  const cl = path.join(root, "CHANGELOG.md");
  const stamp = new Date().toISOString().slice(0, 10);
  const entry = `## ${version} — ${stamp}\n\n- ${changelog}\n\n`;
  const prevCl = fs.existsSync(cl) ? fs.readFileSync(cl, "utf8") : "# Changelog\n\n";
  fs.writeFileSync(
    cl,
    prevCl.startsWith("#")
      ? prevCl.replace("# Changelog\n\n", `# Changelog\n\n${entry}`)
      : entry + prevCl,
  );
}

if (dryRun) {
  console.log("dry-run: skipped npm publish");
  process.exit(0);
}

const pub = spawnSync("npm", ["publish"], { cwd: root, stdio: "inherit", shell: true });
if (pub.status !== 0) die("npm publish failed");

console.log(`
Published @llanesleonardo/saas-product-shell@${version}
Update consumers:
  npx @llanesleonardo/create-saas update-pins --dir <app> --shell ${version}
`);
