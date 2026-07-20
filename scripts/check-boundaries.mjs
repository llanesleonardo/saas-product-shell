#!/usr/bin/env node
/** Reject FormBuilder / PeopleForms leakage in this package. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const forbidden = [
  /PeopleForms|formBuilder|FormRecord|FormSchema|form_id/,
  /forms:read|forms:write|submissions:read|submissions:write/,
  /from\s+["']@\//,
  /apps\/people-forms/,
];

let failed = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || entry.name === "smoke.ts") continue;
    const text = fs.readFileSync(full, "utf8");
    for (const re of forbidden) {
      if (re.test(text)) {
        console.error(`[boundary] ${path.relative(root, full)} matches ${re}`);
        failed++;
      }
    }
  }
}
walk(root);
if (failed) process.exit(1);
console.log("boundary OK");
