import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs");

import { readFileSync, writeFileSync } from "fs";
import { bumpVersions } from "../bump-versions.mjs";

const BASE_PKG = {
  name: "dashlight",
  version: "0.1.0",
  private: true,
  scripts: { build: "tsc" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify(BASE_PKG));
});

describe("bumpVersions", () => {
  it("writes the new version to every provided file", () => {
    bumpVersions("0.2.0", ["a/package.json", "b/package.json"]);

    expect(writeFileSync).toHaveBeenCalledTimes(2);
    const [fileA, contentA] = vi.mocked(writeFileSync).mock.calls[0];
    const [fileB] = vi.mocked(writeFileSync).mock.calls[1];
    expect(fileA).toBe("a/package.json");
    expect(fileB).toBe("b/package.json");
    expect(JSON.parse(contentA).version).toBe("0.2.0");
  });

  it("preserves all existing fields", () => {
    bumpVersions("1.0.0", ["package.json"]);

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1]);
    expect(written.name).toBe("dashlight");
    expect(written.private).toBe(true);
    expect(written.scripts).toEqual({ build: "tsc" });
  });

  it("appends a trailing newline", () => {
    bumpVersions("0.2.0", ["package.json"]);

    const content = vi.mocked(writeFileSync).mock.calls[0][1];
    expect(content.endsWith("\n")).toBe(true);
  });

  it("uses the three monorepo package.json files by default", () => {
    bumpVersions("0.2.0");

    const writtenPaths = vi.mocked(writeFileSync).mock.calls.map((c) => c[0]);
    expect(writtenPaths).toEqual([
      "package.json",
      "packages/server/package.json",
      "packages/web/package.json",
    ]);
  });
});
