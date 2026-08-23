#!/usr/bin/env node
// Builds a single self-contained HTML file for review/sharing.
//
// The deployed site always fetches links.json at runtime. Some review surfaces
// serve one file with nothing alongside it, so this inlines links.json into an
// application/json script tag that index.html picks up ahead of the fetch.
//
// Output is a build artifact, not a source file — regenerate it, don't edit it.
//
// Usage: node tools/build-review-copy.mjs [outputPath] [--fragment]
//
// --fragment strips the outer document shell (doctype/html/head/body) for hosts
// that supply their own skeleton and would otherwise nest a second document.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const asFragment = args.includes("--fragment");
const outArg = args.find((a) => !a.startsWith("--"));
const outPath = outArg ? resolve(outArg) : join(ROOT, "upinfradesk-review.html");

const html = await readFile(join(ROOT, "index.html"), "utf8");
const linksRaw = await readFile(join(ROOT, "links.json"), "utf8");

// Fail loudly rather than shipping a broken review build.
JSON.parse(linksRaw);

// `</script>` inside JSON string content would close the tag early.
const safeJson = linksRaw.replace(/<\//g, "<\\/");

const marker = "</head>";
if (!html.includes(marker)) {
  throw new Error("Could not find </head> in index.html");
}

const injected = html.replace(
  marker,
  `<script type="application/json" id="embedded-links-data">\n${safeJson}\n</script>\n${marker}`
);

// The service worker and manifest have no meaning in a single-file copy, and a
// failed registration would log a console error on every load.
let cleaned = injected
  .replace(/\s*<link rel="manifest"[^>]*>/, "")
  .replace(/navigator\.serviceWorker\.register\("sw\.js"\)/, "Promise.reject()");

if (asFragment) {
  cleaned = cleaned
    .replace(/^[\s\S]*?<meta charset="utf-8">\s*/, "")
    .replace(/<meta name="viewport"[^>]*>\s*/, "")
    .replace(/<meta name="theme-color"[^>]*>\s*/g, "")
    .replace(/<link rel="(icon|apple-touch-icon)"[^>]*>\s*/g, "")
    .replace(/<\/head>\s*/, "")
    .replace(/<body>\s*/, "")
    .replace(/\s*<\/body>\s*<\/html>\s*$/, "\n");

  // Hosts that list pages in a gallery want the bare product name, not the
  // descriptive tag line the deployed site carries for its browser tab.
  cleaned = cleaned.replace(/<title>[\s\S]*?<\/title>/i, "<title>UPInfradesk</title>");

  if (/<!doctype|<html|<\/head>|<body>/i.test(cleaned)) {
    throw new Error("Fragment build still contains document-shell tags");
  }
  if (!/<title>/i.test(cleaned)) {
    throw new Error("Fragment build lost its <title>");
  }
}

await writeFile(outPath, cleaned, "utf8");

const kb = (Buffer.byteLength(cleaned, "utf8") / 1024).toFixed(1);
console.log(`Review build written to ${outPath} (${kb} KB)`);
