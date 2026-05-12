/**
 * Phase 03: Real TDnet PDF Validation
 *
 * Validates that coordinate-based table extraction produces Markdown tables
 * from real TDnet dividend disclosure PDFs stored in Supabase Storage.
 *
 * Usage:
 *   node scripts/validate-pdf-table-extraction.mjs [--limit N]
 *
 * Constants are kept in sync with supabase/functions/_shared/pdf-table-extractor.ts
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load .env.local
const envContent = readFileSync(join(root, '.env.local'), 'utf-8');
for (const line of envContent.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (!key || key.startsWith('#')) continue;
  const value = rest.join('=').trim().replace(/^"|"$/g, '');
  process.env[key] = value;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Parse --limit argument
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : 5;

// ---------------------------------------------------------------------------
// Table detection constants — keep in sync with pdf-table-extractor.ts
// ---------------------------------------------------------------------------

const Y_TOLERANCE = 4;
const COL_ANCHOR_TOLERANCE = 5;
const MIN_TABLE_ROWS = 2;
const MIN_TABLE_COLS = 2;

// ---------------------------------------------------------------------------
// Core detection logic (plain JS, mirrors pdf-table-extractor.ts)
// ---------------------------------------------------------------------------

function groupIntoRows(items) {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const buckets = [];
  for (const item of sorted) {
    const existing = buckets.find(
      (b) => Math.abs(b.representativeY - item.y) <= Y_TOLERANCE
    );
    if (existing) {
      existing.items.push(item);
    } else {
      buckets.push({ representativeY: item.y, items: [item] });
    }
  }
  return buckets.map((b) => b.items.slice().sort((a, b) => a.x - b.x));
}

function detectColumnAnchors(rows) {
  if (rows.length < MIN_TABLE_ROWS) return [];
  const xByRow = [];
  rows.forEach((row, rowIndex) => {
    for (const item of row) {
      xByRow.push({ x: item.x, rowIndex });
    }
  });
  const clusters = [];
  for (const { x, rowIndex } of xByRow) {
    const existing = clusters.find(
      (c) => Math.abs(c.xs.reduce((s, v) => s + v, 0) / c.xs.length - x) <= COL_ANCHOR_TOLERANCE
    );
    if (existing) {
      existing.xs.push(x);
      existing.rowIndices.add(rowIndex);
    } else {
      clusters.push({ xs: [x], rowIndices: new Set([rowIndex]) });
    }
  }
  return clusters
    .filter((c) => c.rowIndices.size >= MIN_TABLE_ROWS)
    .map((c) => c.xs.reduce((s, v) => s + v, 0) / c.xs.length)
    .sort((a, b) => a - b);
}

function formatAsMarkdownTable(rows, anchors) {
  const lines = [];
  for (const row of rows) {
    const cells = new Array(anchors.length).fill('');
    for (const item of row) {
      let nearestIdx = 0;
      let nearestDist = Math.abs(anchors[0] - item.x);
      for (let i = 1; i < anchors.length; i++) {
        const dist = Math.abs(anchors[i] - item.x);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
      const existing = cells[nearestIdx];
      cells[nearestIdx] = existing ? `${existing} ${item.str}` : item.str;
    }
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function extractStructuredPageText(items) {
  if (items.length === 0) return '';
  const rows = groupIntoRows(items);
  if (rows.length === 0) return '';

  const segments = [];
  let i = 0;

  while (i < rows.length) {
    let windowEnd = i + MIN_TABLE_ROWS;
    if (windowEnd > rows.length) {
      segments.push({ isTable: false, rows: [rows[i]] });
      i++;
      continue;
    }
    const windowRows = rows.slice(i, windowEnd);
    const anchors = detectColumnAnchors(windowRows);
    if (anchors.length < MIN_TABLE_COLS) {
      segments.push({ isTable: false, rows: [rows[i]] });
      i++;
      continue;
    }
    while (windowEnd < rows.length) {
      const extendedAnchors = detectColumnAnchors(rows.slice(i, windowEnd + 1));
      if (extendedAnchors.length >= MIN_TABLE_COLS) {
        windowEnd++;
      } else {
        break;
      }
    }
    segments.push({ isTable: true, rows: rows.slice(i, windowEnd) });
    i = windowEnd;
  }

  const merged = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && !last.isTable && !seg.isTable) {
      last.rows.push(...seg.rows);
    } else {
      merged.push({ isTable: seg.isTable, rows: [...seg.rows] });
    }
  }

  const parts = [];
  for (const seg of merged) {
    if (seg.isTable) {
      const anchors = detectColumnAnchors(seg.rows);
      parts.push(formatAsMarkdownTable(seg.rows, anchors));
    } else {
      const lines = seg.rows.map((row) => row.map((item) => item.str).join(' '));
      parts.push(lines.join('\n'));
    }
  }
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// PDF.js text extraction
// ---------------------------------------------------------------------------

async function extractTextFromPdfBytes(pdfBytes) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes, useWorkerFetch: false });
  const pdf = await loadingTask.promise;
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({ disableCombineTextItems: false });

    const positionedItems = content.items
      .filter((item) => typeof item === 'object' && item !== null && typeof item.str === 'string')
      .map((item) => ({
        str: item.str,
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0,
        width: item.width ?? 0,
        hasEOL: item.hasEOL ?? false,
      }));

    const pageText = extractStructuredPageText(positionedItems).trim();
    if (pageText.length > 0) {
      pageTexts.push(pageText);
    }
  }

  return pageTexts.join('\n\n').trim();
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function fetchDisclosures(n) {
  const { data, error } = await supabase
    .from('disclosures')
    .select('id,title,disclosure_type,storage_path')
    .not('storage_path', 'is', null)
    .eq('parse_status', 'parsed')
    .order('updated_at', { ascending: false })
    .limit(n);
  if (error) throw new Error(`Failed to fetch disclosures: ${error.message}`);
  return data;
}

async function downloadPdf(storagePath) {
  // storage_path in DB is the full path within the "disclosures" bucket (e.g. "disclosures/6248/...")
  const { data, error } = await supabase.storage.from('disclosures').download(storagePath);
  if (error) throw new Error(`Failed to download PDF ${storagePath}: ${error.message ?? JSON.stringify(error)}`);
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Fetching ${limit} recently parsed disclosures with storage_path...\n`);

  const disclosures = await fetchDisclosures(limit);

  if (disclosures.length === 0) {
    console.log('No disclosures found.');
    return;
  }

  let tablesDetected = 0;

  for (let idx = 0; idx < disclosures.length; idx++) {
    const d = disclosures[idx];
    const label = `[${idx + 1}/${disclosures.length}] ${d.id} - ${d.title} (${d.disclosure_type ?? 'unknown'})`;
    console.log(label);

    let text = '';
    let charCount = 0;
    let hasTable = false;
    let tableCharCount = 0;
    let errorMsg = null;

    try {
      const pdfBytes = await downloadPdf(d.storage_path);
      text = await extractTextFromPdfBytes(pdfBytes);
      charCount = text.length;
      const pipeMatches = text.match(/\|/g) ?? [];
      hasTable = pipeMatches.length > 0;
      tableCharCount = pipeMatches.length;
    } catch (err) {
      errorMsg = err.message;
    }

    if (errorMsg) {
      console.log(`  ERROR: ${errorMsg}`);
    } else {
      console.log(`  Method: pdfjs | Chars: ${charCount} | Tables detected: ${hasTable ? `YES (${tableCharCount} | chars)` : 'NO'}`);
      if (hasTable) tablesDetected++;
      const lines = text.split('\n').slice(0, 30);
      console.log('  --- First 30 lines ---');
      for (const line of lines) {
        console.log('  ' + line);
      }
    }
    console.log('');
  }

  console.log(`\nSummary: ${tablesDetected}/${disclosures.length} disclosures have table structure (| chars) in extracted text.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
