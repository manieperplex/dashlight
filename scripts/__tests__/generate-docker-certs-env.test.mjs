import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildExtraCaCertsB64,
  normalizeCertificateContent,
  parseArgs,
  writeDockerCertsEnv,
} from "../generate-docker-certs-env.mjs";

const PEM_A = [
  "-----BEGIN CERTIFICATE-----",
  "MIIBAAAATESTCERTA",
  "-----END CERTIFICATE-----",
].join("\n");

const PEM_B = [
  "-----BEGIN CERTIFICATE-----",
  "MIIBBBBATESTCERTB",
  "-----END CERTIFICATE-----",
].join("\n");

function decodeEnvValue(line) {
  const value = line.split("=")[1] ?? "";
  return Buffer.from(value, "base64").toString("utf8");
}

describe("normalizeCertificateContent", () => {
  it("returns PEM blocks unchanged when input is PEM", () => {
    const blocks = normalizeCertificateContent(PEM_A, "pem-file");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("BEGIN CERTIFICATE");
  });

  it("decodes base64-wrapped PEM input", () => {
    const b64 = Buffer.from(`${PEM_A}\n`, "utf8").toString("base64");
    const blocks = normalizeCertificateContent(b64, "b64-file");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("BEGIN CERTIFICATE");
  });

  it("throws for invalid input", () => {
    expect(() => normalizeCertificateContent("not a cert", "bad-file")).toThrow(
      /not PEM and not valid base64|did not contain PEM/,
    );
  });
});

describe("writeDockerCertsEnv", () => {
  it("writes one EXTRA_CA_CERTS_B64 line from mixed PEM/base64 sources", () => {
    const dir = mkdtempSync(join(tmpdir(), "dashlight-certs-"));
    try {
      const cert1 = join(dir, "cert1.pem");
      const cert2 = join(dir, "cert2.pem");
      const out = join(dir, ".docker-certs.env");

      writeFileSync(cert1, `${PEM_A}\n`, "utf8");
      writeFileSync(
        cert2,
        Buffer.from(`${PEM_B}\n`, "utf8").toString("base64"),
        "utf8",
      );

      const line = writeDockerCertsEnv(out, [cert1, cert2]);
      expect(line.startsWith("EXTRA_CA_CERTS_B64=")).toBe(true);

      const file = readFileSync(out, "utf8");
      expect(file.split("\n").filter(Boolean)).toHaveLength(1);

      const decoded = decodeEnvValue(file.trim());
      expect(decoded).toContain("MIIBAAAATESTCERTA");
      expect(decoded).toContain("MIIBBBBATESTCERTB");
      expect(decoded.match(/BEGIN CERTIFICATE/g)?.length).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("buildExtraCaCertsB64 requires at least one cert path", () => {
    expect(() => buildExtraCaCertsB64([])).toThrow(/at least one certificate/);
  });
});

describe("parseArgs", () => {
  it("ignores standalone -- separator", () => {
    const parsed = parseArgs(["--", "ca-1.pem", "ca-2.pem"]);
    expect(parsed.outputPath).toBe(".docker-certs.env");
    expect(parsed.certPaths).toEqual(["ca-1.pem", "ca-2.pem"]);
  });

  it("supports --out alongside -- separator", () => {
    const parsed = parseArgs(["--out", "custom.env", "--", "ca-1.pem"]);
    expect(parsed.outputPath).toBe("custom.env");
    expect(parsed.certPaths).toEqual(["ca-1.pem"]);
  });
});
