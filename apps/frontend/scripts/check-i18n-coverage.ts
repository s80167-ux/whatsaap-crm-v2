import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_GLOB = "src/**/*.{ts,tsx}";
const IGNORE_SEGMENTS = ["/api/", "/types/", "/constants/", "/config/"];
const SUSPECT_TEXT = />([^<{][^<>{}]*[A-Za-z][^<>{}]*)</g;
const ATTRIBUTE_TEXT = /(?:placeholder|title|aria-label)=\s*(?:"([^"]*[A-Za-z][^"]*)"|'([^']*[A-Za-z][^']*)')/g;
const SKIP_PATTERNS = [
  /^\s*(import|export)\s/m,
  /console\.(log|warn|error|info)/,
  /className\s*=/,
  /\benum\b/,
  /\bconst\s+[A-Z0-9_]+\s*=/
];

type Finding = {
  filePath: string;
  line: number;
  text: string;
};

function shouldSkipFile(filePath: string) {
  return IGNORE_SEGMENTS.some((segment) => filePath.includes(segment));
}

function isLikelyTranslatable(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (normalized.startsWith("t(")) return false;
  if (normalized.startsWith("{")) return false;
  if (/[;()[\]{}]/.test(normalized)) return false;
  if (/=>|\bconst\b|\breturn\b|\buseState\b|\buseMemo\b|\bqueryClient\b|\borganizationId\b|\bselectedOrganizationId\b|React\.Dispatch/.test(normalized)) {
    return false;
  }
  if (/^[A-Z0-9_\-.]+$/.test(normalized)) return false;
  if (/^[0-9\s.,:/-]+$/.test(normalized)) return false;
  return /[A-Za-z]/.test(normalized);
}

function lineNumberAt(content: string, index: number) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function collectMatches(filePath: string, content: string, pattern: RegExp) {
  const findings: Finding[] = [];
  for (const match of content.matchAll(pattern)) {
    const text = (match[1] ?? match[2] ?? "").replace(/\s+/g, " ").trim();
    if (!isLikelyTranslatable(text)) continue;
    const line = lineNumberAt(content, match.index ?? 0);
    findings.push({ filePath, line, text });
  }
  return findings;
}

const files = globSync(SOURCE_GLOB, { cwd: ROOT }).filter((relativePath) => {
  const normalizedPath = path.join(ROOT, relativePath).replace(/\\/g, "/");
  return !shouldSkipFile(normalizedPath);
});

const findings: Finding[] = [];

for (const relativePath of files) {
  const absolutePath = path.join(ROOT, relativePath);
  const normalizedPath = absolutePath.replace(/\\/g, "/");
  if (shouldSkipFile(normalizedPath)) continue;

  const content = readFileSync(absolutePath, "utf8");
  if (SKIP_PATTERNS.some((pattern) => pattern.test(content) && content.trim().split(/\r?\n/).length === 1)) {
    continue;
  }

  findings.push(...collectMatches(relativePath, content, SUSPECT_TEXT));
  findings.push(...collectMatches(relativePath, content, ATTRIBUTE_TEXT));
}

const uniqueFindings = findings.filter(
  (finding, index, all) =>
    all.findIndex((candidate) => candidate.filePath === finding.filePath && candidate.line === finding.line && candidate.text === finding.text) === index
);

if (uniqueFindings.length === 0) {
  console.log("No suspected untranslated UI strings found.");
  process.exit(0);
}

console.log("Suspected untranslated UI strings:\n");
for (const finding of uniqueFindings) {
  console.log(`${finding.filePath}:${finding.line} ${finding.text}`);
}

console.log("\nReview these warnings and move visible UI text into i18n resources when appropriate.");