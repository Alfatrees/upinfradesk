#!/usr/bin/env node
// Local link-health checker for UPInfradesk (spec §6, Layer 2).
//
// Runs on your machine, never in the browser — a hosted page cannot fetch
// third-party origins like onlineupsida.com due to CORS. That is a hard
// security boundary, not an oversight.
//
// Usage: node tools/check-links.mjs
// Output: tools/link-report.md (never edits links.json — a 403 usually
// means bot-blocking, not death; only a human should mark something dead).

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LINKS_PATH = join(__dirname, "..", "links.json");
const REPORT_PATH = join(__dirname, "link-report.md");

const TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 3;

const TLS_ERROR_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "CERT_UNTRUSTED",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_SSL_PROTOCOL_ERROR"
]);

async function checkOne(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res;
    try {
      res = await fetch(url, { method: "HEAD", redirect: "manual", signal: controller.signal });
    } catch (headErr) {
      if (isTlsError(headErr)) return { status: "TLS error", detail: describeError(headErr) };
      // Many .aspx endpoints reject HEAD outright — fall back to a ranged GET.
      res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers: { Range: "bytes=0-1023" },
        signal: controller.signal
      });
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") || "(no Location header)";
      return { status: "Redirect", detail: `${res.status} → ${location}` };
    }
    if (res.status >= 200 && res.status < 300) {
      return { status: "OK", detail: String(res.status) };
    }
    return { status: "Broken", detail: String(res.status) };
  } catch (err) {
    if (err.name === "AbortError") return { status: "Timeout", detail: `no response in ${TIMEOUT_MS}ms` };
    if (isTlsError(err)) return { status: "TLS error", detail: describeError(err) };
    return { status: "Broken", detail: describeError(err) };
  } finally {
    clearTimeout(timer);
  }
}

function isTlsError(err) {
  const code = err && err.cause && err.cause.code;
  return code && TLS_ERROR_CODES.has(code);
}

function describeError(err) {
  const code = err && err.cause && err.cause.code;
  return code ? `${err.message} (${code})` : (err && err.message) || String(err);
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, runner);
  await Promise.all(runners);
  return results;
}

async function main() {
  const raw = await readFile(LINKS_PATH, "utf8");
  const data = JSON.parse(raw);
  const links = data.links || [];

  console.log(`Checking ${links.length} links (max ${MAX_CONCURRENT} concurrent, ${TIMEOUT_MS}ms timeout)…`);

  const results = await runPool(links, MAX_CONCURRENT, async (link) => {
    const result = await checkOne(link.url);
    const marker = result.status === "OK" ? "." : result.status[0];
    process.stdout.write(marker);
    return { link, ...result };
  });
  process.stdout.write("\n");

  const byStatus = { OK: [], Redirect: [], Broken: [], Timeout: [], "TLS error": [] };
  for (const r of results) byStatus[r.status].push(r);

  const lines = [];
  lines.push(`# UPInfradesk link report`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`| Status | Count |`);
  lines.push(`|---|---|`);
  for (const status of ["OK", "Redirect", "Broken", "Timeout", "TLS error"]) {
    lines.push(`| ${status} | ${byStatus[status].length} |`);
  }
  lines.push("");

  for (const status of ["Broken", "Timeout", "TLS error", "Redirect"]) {
    if (byStatus[status].length === 0) continue;
    lines.push(`## ${status}`);
    lines.push("");
    for (const r of byStatus[status]) {
      lines.push(`- **${r.link.title}** (\`${r.link.id}\`) — ${r.link.url}`);
      lines.push(`  ${r.detail}`);
    }
    lines.push("");
  }

  lines.push(`## OK`);
  lines.push("");
  for (const r of byStatus.OK) {
    lines.push(`- ${r.link.title} (\`${r.link.id}\`)`);
  }
  lines.push("");
  lines.push(`---`);
  lines.push(`## How to read this report`);
  lines.push("");
  lines.push(`This script never edits \`links.json\`. Confirm every failure in a real browser before marking anything \`deprecated\`. Known false-positive patterns on Indian government hosts:`);
  lines.push("");
  lines.push(`- **TLS error on \`invest.up.gov.in\`** — that server does not send its full intermediate certificate chain. Browsers recover automatically (AIA fetching); Node's \`fetch\` does not. These links work fine for users. Treat as noise unless a browser also warns.`);
  lines.push(`- **403 / 405** — bot-blocking or a WAF rejecting the script's request method, not a dead link (seen on DPIIT, YEIDA, PM Gati Shakti).`);
  lines.push(`- **302 to \`frmHttpErrorPage.aspx\` / \`rmHttpErrorPage.aspx\`** — anti-automation behaviour on NIC-hosted UP ASP.NET sites (seen on GNIDA, UPPCB).`);
  lines.push(`- **Timeout** — several of these hosts are genuinely just slow (BIDA in particular). Retry before concluding anything.`);
  lines.push("");
  lines.push(`A link that resolves is still not proof the content is *current*. Only human review catches a superseded policy sitting at a working URL.`);

  await writeFile(REPORT_PATH, lines.join("\n"), "utf8");
  console.log(`\nReport written to ${REPORT_PATH}`);
  console.log(
    `OK: ${byStatus.OK.length}  Redirect: ${byStatus.Redirect.length}  Broken: ${byStatus.Broken.length}  Timeout: ${byStatus.Timeout.length}  TLS error: ${byStatus["TLS error"].length}`
  );
}

main().catch((err) => {
  console.error("check-links failed:", err);
  process.exitCode = 1;
});
