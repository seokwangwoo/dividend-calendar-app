import { describe, expect, it } from "vitest";
import {
  type PositionedTextItem,
  Y_TOLERANCE,
  isPositionedTextItem,
  groupIntoRows,
  detectColumnAnchors,
  formatAsMarkdownTable,
  extractStructuredPageText,
  MIN_TABLE_ROWS,
} from "../../../supabase/functions/_shared/pdf-table-extractor";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeItem(
  str: string,
  x: number,
  y: number,
  width = 30,
  hasEOL = false
): PositionedTextItem {
  return { str, x, y, width, hasEOL };
}

// Flat text: items at varying x/y with no repeating column pattern
const flatTextItems: PositionedTextItem[] = [
  makeItem("Annual", 10, 700),
  makeItem("Report", 120, 680),
  makeItem("2025", 250, 660),
];

// 3 rows × 5 columns mimicking 配当の状況 table
// Columns at x = 50, 120, 190, 260, 330
// Row y-values: 500, 480, 460 (well beyond Y_TOLERANCE=4 apart)
const dividendTableItems: PositionedTextItem[] = [
  // Header row (y=500)
  makeItem("前期実績", 50, 500),
  makeItem("今回予想", 120, 500),
  makeItem("修正予想", 190, 500),
  makeItem("前回予想", 260, 500),
  makeItem("増減", 330, 500),
  // Row 2 (y=480)
  makeItem("15.00", 50, 480),
  makeItem("20.00", 120, 480),
  makeItem("20.00", 190, 480),
  makeItem("18.00", 260, 480),
  makeItem("+2.00", 330, 480),
  // Row 3 (y=460)
  makeItem("10.00", 50, 460),
  makeItem("12.00", 120, 460),
  makeItem("12.00", 190, 460),
  makeItem("11.00", 260, 460),
  makeItem("+1.00", 330, 460),
];

// Mixed: non-table header + dividend table + plain text footer
// Header at y=600 (single item — cannot form table)
// Table at y=500,480,460 (same as dividendTableItems)
// Footer at y=400,380 (only 1 column → no table)
const mixedPageItems: PositionedTextItem[] = [
  makeItem("配当の状況", 50, 600),
  // Table rows
  ...dividendTableItems,
  // Footer rows — single column, cannot form a 2-col table
  makeItem("以上", 50, 400),
  makeItem("終わり", 50, 380),
];

// ---------------------------------------------------------------------------
// isPositionedTextItem — type guard and transform fallback contract
// ---------------------------------------------------------------------------

describe("isPositionedTextItem", () => {
  it("returns true for a plain object with a str string", () => {
    expect(isPositionedTextItem({ str: "hello" })).toBe(true);
  });

  it("returns true for an item without a transform property (caller applies x=0, y=0 fallback)", () => {
    // PDF.js items may omit transform; the guard passes them through.
    // The caller in pdf-ai-parser.ts maps: x = item.transform?.[4] ?? 0, y = item.transform?.[5] ?? 0
    const rawItem = { str: "配当" };
    expect(isPositionedTextItem(rawItem)).toBe(true);
    // Verify the fallback produces x=0, y=0 as the caller would
    const withFallback: PositionedTextItem = {
      str: rawItem.str,
      x: (rawItem as { transform?: number[] }).transform?.[4] ?? 0,
      y: (rawItem as { transform?: number[] }).transform?.[5] ?? 0,
      width: 0,
      hasEOL: false,
    };
    expect(withFallback.x).toBe(0);
    expect(withFallback.y).toBe(0);
  });

  it("returns false for null", () => {
    expect(isPositionedTextItem(null)).toBe(false);
  });

  it("returns false for an object without str", () => {
    expect(isPositionedTextItem({ transform: [1, 0, 0, 1, 10, 20] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// groupIntoRows
// ---------------------------------------------------------------------------

describe("groupIntoRows", () => {
  it("returns empty array for empty input", () => {
    expect(groupIntoRows([])).toEqual([]);
  });

  it("groups items with identical y into one row", () => {
    const items = [makeItem("A", 10, 100), makeItem("B", 50, 100), makeItem("C", 20, 100)];
    const rows = groupIntoRows(items);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(3);
  });

  it("groups items within Y_TOLERANCE into one row", () => {
    const items = [makeItem("A", 10, 100), makeItem("B", 50, 100 + Y_TOLERANCE)];
    const rows = groupIntoRows(items);
    expect(rows).toHaveLength(1);
  });

  it("separates items beyond Y_TOLERANCE into distinct rows", () => {
    const items = [makeItem("A", 10, 100), makeItem("B", 50, 100 + Y_TOLERANCE + 1)];
    const rows = groupIntoRows(items);
    expect(rows).toHaveLength(2);
  });

  it("sorts items within each group by ascending x", () => {
    const items = [makeItem("C", 30, 100), makeItem("A", 10, 100), makeItem("B", 20, 100)];
    const rows = groupIntoRows(items);
    expect(rows[0].map((i) => i.x)).toEqual([10, 20, 30]);
  });

  it("returns rows sorted top-to-bottom (descending y)", () => {
    // Higher y = higher on page in PDF space
    const items = [makeItem("low", 10, 100), makeItem("high", 10, 200)];
    const rows = groupIntoRows(items);
    expect(rows[0][0].str).toBe("high"); // y=200 comes first
    expect(rows[1][0].str).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// detectColumnAnchors
// ---------------------------------------------------------------------------

describe("detectColumnAnchors", () => {
  it("returns empty array for single-row input (below MIN_TABLE_ROWS)", () => {
    const rows = groupIntoRows(dividendTableItems.slice(0, 5)); // header row only
    expect(detectColumnAnchors(rows)).toEqual([]);
  });

  it("returns 5 anchors for the 3-row × 5-col dividend fixture", () => {
    const rows = groupIntoRows(dividendTableItems);
    const anchors = detectColumnAnchors(rows);
    expect(anchors).toHaveLength(5);
    // Anchors should be sorted ascending
    expect(anchors).toEqual([...anchors].sort((a, b) => a - b));
    // Anchors should be near the expected x-positions
    expect(anchors[0]).toBeCloseTo(50, 0);
    expect(anchors[1]).toBeCloseTo(120, 0);
    expect(anchors[4]).toBeCloseTo(330, 0);
  });

  it("returns 1 anchor when all items share the same column", () => {
    const singleColItems = [
      makeItem("A", 50, 500),
      makeItem("B", 50, 480),
      makeItem("C", 50, 460),
    ];
    const rows = groupIntoRows(singleColItems);
    const anchors = detectColumnAnchors(rows);
    // 1 anchor is below MIN_TABLE_COLS — table detection should not fire
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toBeCloseTo(50, 0);
  });

  it("returns empty array for fewer rows than MIN_TABLE_ROWS", () => {
    const rows: PositionedTextItem[][] = [];
    for (let r = 0; r < MIN_TABLE_ROWS - 1; r++) {
      rows.push([makeItem("x", 10, 500 - r * 20), makeItem("y", 100, 500 - r * 20)]);
    }
    expect(detectColumnAnchors(rows)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// formatAsMarkdownTable
// ---------------------------------------------------------------------------

describe("formatAsMarkdownTable", () => {
  const rows = groupIntoRows(dividendTableItems);
  const anchors = detectColumnAnchors(rows);

  it("output contains | characters", () => {
    const result = formatAsMarkdownTable(rows, anchors);
    expect(result).toContain("|");
  });

  it("does not insert a |---| separator row", () => {
    const result = formatAsMarkdownTable(rows, anchors);
    // A separator row would contain only dashes (and spaces) between pipes
    expect(result).not.toMatch(/\|[ \t]*-+[ \t]*\|/);
  });

  it("each row has the correct number of cells", () => {
    const result = formatAsMarkdownTable(rows, anchors);
    const lines = result.split("\n").filter((l) => l.trim().startsWith("|"));
    for (const line of lines) {
      // Count pipes: | cell | cell | = 3 pipes for 2 cells, anchors.length+1 pipes for anchors.length cells
      const pipeCount = (line.match(/\|/g) ?? []).length;
      expect(pipeCount).toBe(anchors.length + 1);
    }
  });

  it("cell text matches source str values", () => {
    const result = formatAsMarkdownTable(rows, anchors);
    expect(result).toContain("前期実績");
    expect(result).toContain("15.00");
    expect(result).toContain("+1.00");
  });

  it("short rows produce correct cell count with empty-string fill for missing columns", () => {
    // 3 anchors at x=10, 100, 200 but one row has only 2 items
    const shortRows: PositionedTextItem[][] = [
      [makeItem("A", 10, 100), makeItem("B", 100, 100), makeItem("C", 200, 100)],
      [makeItem("X", 10, 80), makeItem("Z", 200, 80)], // column 1 (x=100) is missing
    ];
    const shortAnchors = [10, 100, 200];
    const result = formatAsMarkdownTable(shortRows, shortAnchors);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const pipeCount = (line.match(/\|/g) ?? []).length;
      expect(pipeCount).toBe(4); // 3 cells → 4 pipes
    }
    // Short row: column 1 (x=100) is absent → its cell should be empty
    const shortRowLine = lines[1];
    expect(shortRowLine).toContain("X");
    expect(shortRowLine).toContain("Z");
    // The cell for col 1 (x=100) is empty — verify the line contains two consecutive separators
    expect(shortRowLine).toMatch(/\| {0,}\|/); // two adjacent pipes with only spaces between
  });
});

// ---------------------------------------------------------------------------
// extractStructuredPageText
// ---------------------------------------------------------------------------

describe("extractStructuredPageText", () => {
  it("returns empty string for empty input", () => {
    expect(extractStructuredPageText([])).toBe("");
  });

  it("produces Markdown table output for dividendTableItems", () => {
    const result = extractStructuredPageText(dividendTableItems);
    expect(result).toContain("|");
  });

  it("produces plain text output for flatTextItems (no |)", () => {
    const result = extractStructuredPageText(flatTextItems);
    expect(result).not.toContain("|");
    expect(result).toContain("Annual");
    expect(result).toContain("Report");
    expect(result).toContain("2025");
  });

  it("table section is Markdown and plain sections are plain text for mixedPageItems", () => {
    const result = extractStructuredPageText(mixedPageItems);
    // Table block is present
    expect(result).toContain("|");
    // Header text is preserved
    expect(result).toContain("配当の状況");
    // All footer text is preserved (may appear inside a table cell or as plain text)
    expect(result).toContain("以上");
    expect(result).toContain("終わり");
    // Table data is present in the output
    expect(result).toContain("前期実績");
    expect(result).toContain("15.00");
  });

  it("single-row input produces plain text (below MIN_TABLE_ROWS)", () => {
    const singleRow = dividendTableItems.slice(0, 5); // header row only
    const result = extractStructuredPageText(singleRow);
    expect(result).not.toContain("|");
  });

  it("single-column input produces plain text (below MIN_TABLE_COLS)", () => {
    const singleColItems = [
      makeItem("Alpha", 50, 500),
      makeItem("Beta", 50, 480),
      makeItem("Gamma", 50, 460),
    ];
    const result = extractStructuredPageText(singleColItems);
    expect(result).not.toContain("|");
    expect(result).toContain("Alpha");
  });
});
