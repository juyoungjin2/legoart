const PLATE_SIZE = 16;

function toHex(value) {
  return value.toString(16).padStart(2, "0");
}

function rgbToHex(rgb) {
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

function rgbKey(rgb) {
  return rgb.join(",");
}

function luminance(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function splitGridToPlates(grid) {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  const plateCols = Math.ceil(width / PLATE_SIZE);
  const plateRows = Math.ceil(height / PLATE_SIZE);
  const plates = [];

  for (let py = 0; py < plateRows; py++) {
    for (let px = 0; px < plateCols; px++) {
      const cells = [];
      for (let y = 0; y < PLATE_SIZE; y++) {
        const row = [];
        for (let x = 0; x < PLATE_SIZE; x++) {
          const gx = px * PLATE_SIZE + x;
          const gy = py * PLATE_SIZE + y;
          row.push(grid[gy]?.[gx] || null);
        }
        cells.push(row);
      }

      plates.push({
        plateIndex: plates.length + 1,
        plateX: px + 1,
        plateY: py + 1,
        cells,
      });
    }
  }

  return { plates, plateCols, plateRows };
}

function drawPlate(doc, plate, paletteNumberMap, layout) {
  const { originX, originY, platePixelMm, circleDiameterMm, numberFontSize } = layout;
  const plateSizeMm = PLATE_SIZE * platePixelMm;

  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.25);
  doc.rect(originX, originY, plateSizeMm, plateSizeMm);

  for (let y = 0; y < PLATE_SIZE; y++) {
    for (let x = 0; x < PLATE_SIZE; x++) {
      const cell = plate.cells[y][x];
      const cx = originX + x * platePixelMm + platePixelMm / 2;
      const cy = originY + y * platePixelMm + platePixelMm / 2;

      if (!cell) {
        doc.setFillColor(238, 238, 238);
        doc.circle(cx, cy, circleDiameterMm / 2, "F");
        continue;
      }

      const number = paletteNumberMap.get(rgbKey(cell.rgb));
      doc.setFillColor(cell.rgb[0], cell.rgb[1], cell.rgb[2]);
      doc.circle(cx, cy, circleDiameterMm / 2, "F");

      const textColor = luminance(cell.rgb) < 140 ? 255 : 20;
      doc.setTextColor(textColor, textColor, textColor);
      doc.setFontSize(numberFontSize);
      doc.text(String(number || ""), cx, cy + numberFontSize * 0.18, { align: "center" });
    }
  }
}

function drawLegendPages(doc, paletteEntries) {
  const perPage = 24;

  for (let start = 0; start < paletteEntries.length; start += perPage) {
    doc.addPage("a4", "portrait");
    const pageEntries = paletteEntries.slice(start, start + perPage);

    doc.setFontSize(14);
    doc.setTextColor(20, 20, 20);
    doc.text("Color Number Map", 12, 14);

    const colWidth = 94;
    const rowHeight = 11;
    const startY = 24;

    pageEntries.forEach((entry, index) => {
      const col = index < 12 ? 0 : 1;
      const row = index % 12;
      const x = 12 + col * colWidth;
      const y = startY + row * rowHeight;

      doc.setFillColor(entry.rgb[0], entry.rgb[1], entry.rgb[2]);
      doc.circle(x + 4, y - 1.5, 2.6, "F");
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(10);
      doc.text(`${entry.number}. ${entry.hex} (${entry.count})`, x + 10, y);
    });
  }
}

export async function downloadBrickBlueprintPdf({ grid, counts }) {
  if (!grid?.length || !grid[0]?.length || !counts?.length) return;
  const { jsPDF } = await import("jspdf");

  const { plates, plateCols, plateRows } = splitGridToPlates(grid);
  const paletteEntries = counts.map((item, index) => ({
    number: index + 1,
    rgb: item.rgb,
    hex: rgbToHex(item.rgb),
    count: item.count,
    key: rgbKey(item.rgb),
  }));
  const paletteNumberMap = new Map(paletteEntries.map((item) => [item.key, item.number]));

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageWidth = 210;
  const pageHeight = 297;
  const platesPerPage = 6;
  const plateColsPerPage = 2;
  const plateRowsPerPage = 3;
  const marginX = 12;
  const marginTop = 12;
  const marginBottom = 12;
  const gapX = 8;
  const gapY = 7;
  const labelHeight = 4.8;

  const slotWidth =
    (pageWidth - marginX * 2 - gapX * (plateColsPerPage - 1)) / plateColsPerPage;
  const slotHeight =
    (pageHeight - marginTop - marginBottom - gapY * (plateRowsPerPage - 1)) /
    plateRowsPerPage;
  const plateSizeMm = Math.min(slotWidth, slotHeight - labelHeight);
  const platePixelMm = plateSizeMm / PLATE_SIZE;
  const circleDiameterMm = Math.max(2.4, platePixelMm * 0.86);
  const numberFontSize = Math.max(3, platePixelMm * 1.04);

  plates.forEach((plate, plateIdx) => {
    if (plateIdx > 0 && plateIdx % platesPerPage === 0) {
      doc.addPage("a4", "portrait");
    }

    const localIndex = plateIdx % platesPerPage;
    const row = Math.floor(localIndex / plateColsPerPage);
    const col = localIndex % plateColsPerPage;
    const slotX = marginX + col * (slotWidth + gapX);
    const slotY = marginTop + row * (slotHeight + gapY);
    const plateOriginX = slotX + (slotWidth - plateSizeMm) / 2;
    const plateOriginY = slotY + labelHeight;

    doc.setTextColor(20, 20, 20);
    doc.setFontSize(8.8);
    doc.text(
      `Plate ${plate.plateIndex} (${plate.plateX},${plate.plateY}) / Grid ${plateCols}x${plateRows}`,
      slotX,
      slotY + 3.7
    );

    drawPlate(doc, plate, paletteNumberMap, {
      originX: plateOriginX,
      originY: plateOriginY,
      platePixelMm,
      circleDiameterMm,
      numberFontSize,
    });
  });

  drawLegendPages(doc, paletteEntries);

  const fileSuffix = new Date().toISOString().slice(0, 10);
  doc.save(`lego-brick-blueprint-${fileSuffix}.pdf`);
}
