/**
 * Coordinate-based PDF table detection and Markdown formatting.
 *
 * Uses PDF.js TextItem x/y coordinates to reconstruct table structure
 * that would otherwise be lost when linearizing PDF content to plain text.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const Y_TOLERANCE = 4;
export const COL_ANCHOR_TOLERANCE = 5;
export const MIN_TABLE_ROWS = 2;
export const MIN_TABLE_COLS = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PositionedTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  hasEOL: boolean;
};

export function isPositionedTextItem(
  item: unknown
): item is { str: string; transform?: number[]; width?: number; hasEOL?: boolean } {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof (item as { str?: unknown }).str === "string"
  );
}

// ---------------------------------------------------------------------------
// Row grouping
// ---------------------------------------------------------------------------

export function groupIntoRows(items: PositionedTextItem[]): PositionedTextItem[][] {
  if (items.length === 0) return [];

  // Sort by descending y (PDF origin is bottom-left, so higher y = higher on page)
  const sorted = [...items].sort((a, b) => b.y - a.y);

  const buckets: { representativeY: number; items: PositionedTextItem[] }[] = [];

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

  // Sort items within each bucket by ascending x
  return buckets.map((b) => b.items.slice().sort((a, b) => a.x - b.x));
}

// ---------------------------------------------------------------------------
// Column anchor detection
// ---------------------------------------------------------------------------

export function detectColumnAnchors(rows: PositionedTextItem[][]): number[] {
  if (rows.length < MIN_TABLE_ROWS) return [];

  // Collect all x-values with their row index
  const xByRow: { x: number; rowIndex: number }[] = [];
  rows.forEach((row, rowIndex) => {
    for (const item of row) {
      xByRow.push({ x: item.x, rowIndex });
    }
  });

  // Cluster x-values within COL_ANCHOR_TOLERANCE
  const clusters: { xs: number[]; rowIndices: Set<number> }[] = [];
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

  // Keep only anchors that appear in MIN_TABLE_ROWS or more distinct rows
  return clusters
    .filter((c) => c.rowIndices.size >= MIN_TABLE_ROWS)
    .map((c) => c.xs.reduce((s, v) => s + v, 0) / c.xs.length)
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Markdown table formatting
// ---------------------------------------------------------------------------

export function formatAsMarkdownTable(
  rows: PositionedTextItem[][],
  anchors: number[]
): string {
  const lines: string[] = [];

  for (const row of rows) {
    const cells: string[] = new Array(anchors.length).fill("");

    for (const item of row) {
      // Find nearest anchor
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

    lines.push(`| ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main extraction entry point
// ---------------------------------------------------------------------------

export function extractStructuredPageText(items: PositionedTextItem[]): string {
  if (items.length === 0) return "";

  const rows = groupIntoRows(items);
  if (rows.length === 0) return "";

  // Identify contiguous table-candidate blocks
  const segments: { isTable: boolean; rows: PositionedTextItem[][] }[] = [];
  let i = 0;

  while (i < rows.length) {
    // Try to build a table block starting at row i
    // Expand window until adding more rows no longer satisfies the table conditions
    let windowEnd = i + MIN_TABLE_ROWS;
    if (windowEnd > rows.length) {
      // Not enough rows for a table
      segments.push({ isTable: false, rows: [rows[i]] });
      i++;
      continue;
    }

    const windowRows = rows.slice(i, windowEnd);
    const anchors = detectColumnAnchors(windowRows);

    if (anchors.length < MIN_TABLE_COLS) {
      // Not a table start
      segments.push({ isTable: false, rows: [rows[i]] });
      i++;
      continue;
    }

    // Extend table as long as subsequent rows share the same anchors
    while (windowEnd < rows.length) {
      const extendedRows = rows.slice(i, windowEnd + 1);
      const extendedAnchors = detectColumnAnchors(extendedRows);
      if (extendedAnchors.length >= MIN_TABLE_COLS) {
        windowEnd++;
      } else {
        break;
      }
    }

    const tableRows = rows.slice(i, windowEnd);
    segments.push({ isTable: true, rows: tableRows });
    i = windowEnd;
  }

  // Merge consecutive plain-text segments
  const merged: { isTable: boolean; rows: PositionedTextItem[][] }[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && !last.isTable && !seg.isTable) {
      last.rows.push(...seg.rows);
    } else {
      merged.push({ isTable: seg.isTable, rows: [...seg.rows] });
    }
  }

  // Render each segment
  const parts: string[] = [];
  for (const seg of merged) {
    if (seg.isTable) {
      const anchors = detectColumnAnchors(seg.rows);
      parts.push(formatAsMarkdownTable(seg.rows, anchors));
    } else {
      const lines = seg.rows.map((row) => row.map((item) => item.str).join(" "));
      parts.push(lines.join("\n"));
    }
  }

  return parts.join("\n\n");
}
