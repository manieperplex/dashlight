import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted lets us reference mock instances both inside the vi.mock factory
// and in test bodies, which is required when mocking classes.
const mockBump = vi.hoisted(() => vi.fn());

vi.mock("conventional-recommended-bump", () => ({
  // Must use a regular function (not arrow) so it can be called with `new`.
  Bumper: vi.fn(function () {
    return { loadPreset: vi.fn(), bump: mockBump };
  }),
}));
vi.mock("fs");
vi.mock("child_process");

import { Bumper } from "conventional-recommended-bump";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import {
  readVersion,
  getLastTag,
  applyBump,
  computeNextVersion,
} from "../compute-next-version.mjs";

// ── readVersion ──────────────────────────────────────────────────────────────

describe("readVersion", () => {
  it("returns the version field from package.json", () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ name: "dashlight", version: "1.2.3" }),
    );
    expect(readVersion()).toBe("1.2.3");
  });

  it("forwards a custom file path to readFileSync", () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: "0.0.1" }));
    readVersion("packages/server/package.json");
    expect(readFileSync).toHaveBeenCalledWith("packages/server/package.json", "utf8");
  });
});

// ── getLastTag ───────────────────────────────────────────────────────────────

describe("getLastTag", () => {
  it("returns the trimmed tag when git describe succeeds", () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("v1.2.3\n"));
    expect(getLastTag()).toBe("v1.2.3");
  });

  it("returns null when no tags exist (first release)", () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("fatal: No names found, cannot describe anything.");
    });
    expect(getLastTag()).toBeNull();
  });
});

// ── applyBump ────────────────────────────────────────────────────────────────

describe("applyBump", () => {
  it("increments major and resets minor + patch", () => {
    expect(applyBump("1.2.3", "major")).toBe("2.0.0");
  });

  it("increments minor and resets patch", () => {
    expect(applyBump("1.2.3", "minor")).toBe("1.3.0");
  });

  it("increments patch only", () => {
    expect(applyBump("1.2.3", "patch")).toBe("1.2.4");
  });

  it("falls back to patch for an unrecognised release type", () => {
    expect(applyBump("1.2.3", "unknown")).toBe("1.2.4");
  });
});

// ── computeNextVersion ───────────────────────────────────────────────────────

describe("computeNextVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: "0.1.0" }));
    mockBump.mockResolvedValue({ releaseType: "patch" });
  });

  it("returns the declared version unchanged when no tags exist (first release)", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("No tags");
    });
    expect(await computeNextVersion()).toBe("0.1.0");
  });

  it("does not instantiate Bumper on the first release", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("No tags");
    });
    await computeNextVersion();
    expect(Bumper).not.toHaveBeenCalled();
  });

  it("bumps patch when all commits are fixes", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("v0.1.0\n"));
    mockBump.mockResolvedValue({ releaseType: "patch" });
    expect(await computeNextVersion()).toBe("0.1.1");
  });

  it("bumps minor when commits include a feat", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("v0.1.0\n"));
    mockBump.mockResolvedValue({ releaseType: "minor" });
    expect(await computeNextVersion()).toBe("0.2.0");
  });

  it("bumps major for a breaking change", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("v0.1.0\n"));
    mockBump.mockResolvedValue({ releaseType: "major" });
    expect(await computeNextVersion()).toBe("1.0.0");
  });
});
