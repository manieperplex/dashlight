/**
 * Write a new version string into every package.json in the monorepo.
 *
 * All packages are versioned in lockstep — one call updates root,
 * packages/server, and packages/web simultaneously.
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";

const DEFAULT_FILES = [
  "package.json",
  "packages/server/package.json",
  "packages/web/package.json",
];

/**
 * Update the `version` field in each of the given package.json files.
 * Preserves all other fields and appends a trailing newline.
 */
export function bumpVersions(version, files = DEFAULT_FILES) {
  for (const file of files) {
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    pkg.version = version;
    writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  }
}

// CLI entry point.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: node scripts/bump-versions.mjs <version>");
    process.exit(1);
  }
  bumpVersions(version);
}
