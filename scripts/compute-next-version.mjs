/**
 * Computes the next semver version from conventional commits.
 *
 * First-release behaviour (no git tags exist):
 *   Returns the version currently declared in the root package.json unchanged.
 *   The release workflow will create that tag (e.g. v0.1.0) on its first run —
 *   no manual bootstrap step required.
 *
 * Subsequent releases:
 *   Reads all commits since the last tag and delegates bump-type detection to
 *   conventional-recommended-bump (v11 Bumper API) using the
 *   conventionalcommits preset:
 *     feat:              → minor
 *     fix: / perf: / …  → patch
 *     BREAKING CHANGE    → major
 */

import { Bumper } from "conventional-recommended-bump";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

/** Read the `version` field from a package.json file. */
export function readVersion(file = "package.json") {
  return JSON.parse(readFileSync(file, "utf8")).version;
}

/**
 * Return the most recent git tag, or `null` when no tags exist.
 * A `null` return value signals "first release".
 */
export function getLastTag() {
  try {
    return execSync("git describe --tags --abbrev=0", { stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Apply a semver bump type to a version string.
 * Any unrecognised type falls back to `patch`.
 *
 * Pre-release versions (e.g. 1.0.0-rc.1) always bump the pre-release counter
 * (→ 1.0.0-rc.2) regardless of the commit-derived release type. Promoting a
 * pre-release to a stable version must be done by manually updating
 * package.json before the release is triggered.
 */
export function applyBump(version, releaseType) {
  const preMatch = version.match(/^(\d+\.\d+\.\d+)-(.+?)\.(\d+)$/);
  if (preMatch) {
    const [, base, label, num] = preMatch;
    return `${base}-${label}.${Number(num) + 1}`;
  }
  const [major, minor, patch] = version.split(".").map(Number);
  if (releaseType === "major") return `${major + 1}.0.0`;
  if (releaseType === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Compute and return the next version string.
 *
 * When called with no git tags the function returns the version already
 * declared in package.json so the release workflow can create the first tag
 * automatically without any manual bootstrapping.
 */
export async function computeNextVersion() {
  const current = readVersion();
  const lastTag = getLastTag();

  if (!lastTag) {
    // No tags exist yet — treat the declared version as the first release.
    return current;
  }

  const bumper = new Bumper(process.cwd());
  bumper.loadPreset("conventionalcommits");
  const { releaseType } = await bumper.bump();
  return applyBump(current, releaseType);
}

// Run only when executed directly (not when imported in tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(await computeNextVersion());
}
