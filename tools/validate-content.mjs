#!/usr/bin/env node
// Validates the content files before they can be deployed.
//
// A malformed or internally inconsistent dataset is the one change that leaves
// the live site showing an error state instead of the index, so this runs as a
// deploy gate in CI. Run it locally the same way: node tools/validate-content.mjs
//
// Exits non-zero and prints every problem it found.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

async function loadJSON(rel) {
  let raw;
  try {
    raw = await readFile(join(ROOT, rel), "utf8");
  } catch {
    problems.push(`${rel}: file is missing`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    problems.push(`${rel}: not valid JSON — ${err.message}`);
    return null;
  }
}

const index = await loadJSON("links.json");
if (!index) {
  report();
}

const categories = index.categories || [];
if (!categories.length) problems.push("links.json: no categories defined");

const ids = new Set();
const byCategory = new Map();
let total = 0;

for (const cat of categories) {
  for (const field of ["id", "label", "order", "file"]) {
    if (cat[field] === undefined) problems.push(`links.json: category "${cat.id ?? "?"}" missing ${field}`);
  }
  if (!cat.file) continue;

  const part = await loadJSON(cat.file);
  if (!part) continue;

  if (part.categoryId !== cat.id) {
    problems.push(`${cat.file}: categoryId "${part.categoryId}" does not match "${cat.id}"`);
  }
  const links = part.links || [];
  byCategory.set(cat.id, links);
  total += links.length;

  for (const link of links) {
    for (const field of ["id", "title", "url", "category", "note"]) {
      if (!link[field]) problems.push(`${cat.file}: ${link.id ?? "(no id)"} missing ${field}`);
    }
    if (ids.has(link.id)) problems.push(`${cat.file}: duplicate id "${link.id}"`);
    ids.add(link.id);

    if (link.category !== cat.id) {
      problems.push(`${cat.file}: ${link.id} has category "${link.category}" but lives in ${cat.id}`);
    }
    if (link.url && !/^https:\/\//.test(link.url)) {
      problems.push(`${cat.file}: ${link.id} url is not absolute HTTPS`);
    }
    if (!link.detail || !link.detail.whatItGives) {
      problems.push(`${cat.file}: ${link.id} missing detail.whatItGives`);
    }
    // Dates must be real ISO dates, never a guessed placeholder.
    for (const df of ["lastVerified", "publishedDate", "lastAmendedDate"]) {
      const v = link[df];
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        problems.push(`${cat.file}: ${link.id} ${df} "${v}" is not YYYY-MM-DD`);
      }
    }
  }
}

// Cross-file references resolve only once every id is known.
for (const [file, links] of byCategory) {
  for (const link of links) {
    for (const rel of (link.detail && link.detail.relatedIds) || []) {
      if (!ids.has(rel)) problems.push(`${file}: ${link.id} relatedIds -> unknown "${rel}"`);
    }
    if (link.amendmentOf && !ids.has(link.amendmentOf)) {
      problems.push(`${file}: ${link.id} amendmentOf -> unknown "${link.amendmentOf}"`);
    }
    if (link.replacedBy && !ids.has(link.replacedBy)) {
      problems.push(`${file}: ${link.id} replacedBy -> unknown "${link.replacedBy}"`);
    }
  }
}

// Contacts are a transcription, so the provenance fields are not optional.
if (index.contacts && index.contacts.file) {
  const contacts = await loadJSON(index.contacts.file);
  if (contacts) {
    if (!contacts.transcribedOn) problems.push("contacts: missing transcribedOn");
    for (const [key, src] of Object.entries(contacts.source || {})) {
      if (!src.url) problems.push(`contacts: source "${key}" missing url`);
      if (!src.sourceUpdated) problems.push(`contacts: source "${key}" missing sourceUpdated`);
    }
    if (!(contacts.groups || []).length) problems.push("contacts: no groups defined");
    for (const g of contacts.groups || []) {
      if (!g.group) problems.push("contacts: a group is missing its name");
      for (const p of g.people || []) {
        if (!p.name) problems.push(`contacts: a person in "${g.group}" has no name`);
        if (!p.designation) problems.push(`contacts: ${p.name} has no designation`);
        // phone/email may legitimately be null — the view renders "Not available".
      }
    }
  }
}

report();

function report() {
  if (problems.length) {
    console.error("Content failed validation:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`Content OK — ${total} links across ${categories.length} categories, plus contacts`);
  process.exit(0);
}
