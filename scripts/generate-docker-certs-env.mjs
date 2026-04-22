import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CERT_BLOCK_RE =
  /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

function extractPemBlocks(text) {
  const blocks = text.match(CERT_BLOCK_RE);
  return blocks ?? [];
}

function decodeBase64Text(text) {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return null;
  try {
    return Buffer.from(compact, "base64").toString("utf8");
  } catch {
    return null;
  }
}

export function normalizeCertificateContent(raw, sourceLabel = "input") {
  const text = raw.toString("utf8").trim();

  const pemBlocks = extractPemBlocks(text);
  if (pemBlocks.length > 0) return pemBlocks;

  const decoded = decodeBase64Text(text);
  if (!decoded) {
    throw new Error(`${sourceLabel}: not PEM and not valid base64 content`);
  }

  const decodedBlocks = extractPemBlocks(decoded);
  if (decodedBlocks.length === 0) {
    throw new Error(
      `${sourceLabel}: base64 decoded successfully but did not contain PEM certificate blocks`,
    );
  }

  return decodedBlocks;
}

export function buildExtraCaCertsB64(certPaths) {
  if (!Array.isArray(certPaths) || certPaths.length === 0) {
    throw new Error("Provide at least one certificate file path");
  }

  const normalizedBlocks = [];
  for (const certPath of certPaths) {
    const fileContent = readFileSync(certPath, "utf8");
    const pemBlocks = normalizeCertificateContent(fileContent, certPath);
    normalizedBlocks.push(...pemBlocks);
  }

  const normalizedPemBundle = `${normalizedBlocks.join("\n")}\n`;
  return Buffer.from(normalizedPemBundle, "utf8").toString("base64");
}

export function writeDockerCertsEnv(outputPath, certPaths) {
  const encoded = buildExtraCaCertsB64(certPaths);
  const line = `EXTRA_CA_CERTS_B64=${encoded}\n`;
  writeFileSync(outputPath, line, "utf8");
  return line;
}

export function parseArgs(argv) {
  const args = [...argv];
  let outputPath = ".docker-certs.env";
  const certPaths = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--") {
      continue;
    }

    if (arg === "--out") {
      const next = args[i + 1];
      if (!next || next === "--") {
        throw new Error("Missing value for --out");
      }
      outputPath = next;
      i += 1;
      continue;
    }

    certPaths.push(arg);
  }

  if (certPaths.length === 0) {
    throw new Error(
      "Usage: node scripts/generate-docker-certs-env.mjs [--out .docker-certs.env] <cert1> [cert2 ...]",
    );
  }

  return { outputPath, certPaths };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { outputPath, certPaths } = parseArgs(process.argv.slice(2));
    writeDockerCertsEnv(outputPath, certPaths);
    process.stdout.write(
      `Wrote ${outputPath} from ${certPaths.length} certificate file(s).\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
