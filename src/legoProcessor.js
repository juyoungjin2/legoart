import { palette as defaultPalette } from "./palette";

function colorDistance(c1, c2) {
  return Math.sqrt(
    (c1[0]-c2[0])**2 +
    (c1[1]-c2[1])**2 +
    (c1[2]-c2[2])**2
  );
}

function nearestPaletteColor(rgb, palette) {

  let min = Infinity;
  let selected = palette[0];

  for (let p of palette) {
    const d = colorDistance(rgb, p.rgb);
    if (d < min) {
      min = d;
      selected = p;
    }
  }

  return selected;
}

function quantize(value, bucketSize) {
  return Math.min(255, Math.round(value / bucketSize) * bucketSize);
}

function brightness(rgb) {
  return Math.max(rgb[0], rgb[1], rgb[2]);
}

function chroma(rgb) {
  return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
}

function pickLineBaseColor(palette) {
  if (!palette.length) return null;

  const neutralCandidates = palette.filter((item) => chroma(item.rgb) <= 52);
  const candidates = neutralCandidates.length ? neutralCandidates : palette;

  return candidates.reduce((darkest, item) =>
    brightness(item.rgb) < brightness(darkest.rgb) ? item : darkest
  );
}

function colorKey(color) {
  return color.rgb.join(",");
}

function smoothIsolatedCells(grid, passes = 1, minMajority = 5) {
  if (!grid.length || !grid[0]?.length) return grid;

  const height = grid.length;
  const width = grid[0].length;
  const directions = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ];

  let current = grid.map((row) => [...row]);

  for (let pass = 0; pass < passes; pass++) {
    const next = current.map((row) => [...row]);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const counts = new Map();

        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

          const neighborColor = current[ny][nx];
          const key = colorKey(neighborColor);
          if (!counts.has(key)) {
            counts.set(key, { count: 0, color: neighborColor });
          }
          counts.get(key).count += 1;
        }

        let best = null;
        for (const item of counts.values()) {
          if (!best || item.count > best.count) {
            best = item;
          }
        }

        if (!best) continue;

        const selfKey = colorKey(current[y][x]);
        if (best.count >= minMajority && best.color && colorKey(best.color) !== selfKey) {
          next[y][x] = best.color;
        }
      }
    }

    current = next;
  }

  return current;
}

function pickDiverseColors(candidates, maxColors, minDistance = 52) {
  if (!candidates.length || maxColors <= 0) return [];

  const selected = [];

  for (const candidate of candidates) {
    if (selected.length >= maxColors) break;

    const isFarEnough = selected.every(
      (item) => colorDistance(item.rgb, candidate.rgb) >= minDistance
    );

    if (isFarEnough) {
      selected.push(candidate);
    }
  }

  // Fill remaining slots with the colors most distant from the current set.
  while (selected.length < maxColors) {
    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (selected.includes(candidate)) continue;

      const minDistToSelected =
        selected.length === 0
          ? Infinity
          : Math.min(...selected.map((item) => colorDistance(item.rgb, candidate.rgb)));
      const score = minDistToSelected + candidate.ratio * 30;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) break;
    selected.push(candidates[bestIndex]);
  }

  return selected;
}

export function extractDominantColors(image, maxColors = 20) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const maxSampleSize = 120;
  const scale = Math.min(
    1,
    maxSampleSize / Math.max(image.width, image.height)
  );
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);

  const { data } = ctx.getImageData(0, 0, width, height);
  const buckets = new Map();
  const bucketSize = 24;
  let total = 0;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 16) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const qr = quantize(r, bucketSize);
    const qg = quantize(g, bucketSize);
    const qb = quantize(b, bucketSize);
    const key = `${qr},${qg},${qb}`;

    if (!buckets.has(key)) {
      buckets.set(key, { count: 0, r: 0, g: 0, b: 0 });
    }

    const bucket = buckets.get(key);
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    total += 1;
  }

  const sorted = [...buckets.values()]
    .map((bucket) => {
      const rgb = [
        Math.round(bucket.r / bucket.count),
        Math.round(bucket.g / bucket.count),
        Math.round(bucket.b / bucket.count),
      ];
      return {
        rgb,
        count: bucket.count,
        ratio: total > 0 ? bucket.count / total : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  return pickDiverseColors(sorted, maxColors);
}

export function processImage(image, gridSize, palette = defaultPalette) {
  if (!palette.length) {
    return { grid: [], counts: [] };
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = image.width;
  canvas.height = image.height;

  ctx.drawImage(image, 0, 0);

  const cellWidth = image.width / gridSize;
  const cellHeight = image.height / gridSize;

  const result = [];
  const cellStats = [];
  const lineBaseColor = pickLineBaseColor(palette);

  for (let y = 0; y < gridSize; y++) {

    const row = [];
    const statRow = [];

    for (let x = 0; x < gridSize; x++) {

      const data = ctx.getImageData(
        x*cellWidth,
        y*cellHeight,
        cellWidth,
        cellHeight
      ).data;

      let r=0,g=0,b=0;
      let pixels = data.length/4;

      for (let i=0;i<data.length;i+=4){
        r += data[i];
        g += data[i+1];
        b += data[i+2];
      }

      r = Math.round(r/pixels);
      g = Math.round(g/pixels);
      b = Math.round(b/pixels);

      const color = nearestPaletteColor([r,g,b], palette);
      const avgRgb = [r, g, b];

      row.push(color);
      statRow.push({
        avgRgb,
        avgBrightness: brightness(avgRgb),
        avgChroma: chroma(avgRgb),
      });
    }

    result.push(row);
    cellStats.push(statRow);
  }

  if (lineBaseColor) {
    // Pass 1: normalize dark/near-neutral line pixels into one base line color.
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const stat = cellStats[y][x];
        const distToLineBase = colorDistance(stat.avgRgb, lineBaseColor.rgb);
        const shouldNormalize =
          stat.avgBrightness <= 78 &&
          (stat.avgChroma <= 58 || distToLineBase <= 86);

        if (shouldNormalize) {
          result[y][x] = lineBaseColor;
        }
      }
    }

    // Pass 2: enforce continuity for dark lines around already-normalized segments.
    const next = result.map((row) => [...row]);
    const lineKey = lineBaseColor.rgb.join(",");
    const directions = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const stat = cellStats[y][x];
        const current = result[y][x];
        if (current.rgb.join(",") === lineKey) continue;
        if (stat.avgBrightness > 95) continue;

        let lineNeighbors = 0;
        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) continue;
          if (result[ny][nx].rgb.join(",") === lineKey) {
            lineNeighbors += 1;
          }
        }

        if (lineNeighbors >= 2 && colorDistance(stat.avgRgb, lineBaseColor.rgb) <= 105) {
          next[y][x] = lineBaseColor;
        }
      }
    }

    for (let y = 0; y < gridSize; y++) {
      result[y] = next[y];
    }
  }

  const smoothed = smoothIsolatedCells(result, 1, 5);

  const countsByColor = new Map();
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const color = smoothed[y][x];
      const key = color.rgb.join(",");
      if (!countsByColor.has(key)) {
        countsByColor.set(key, { rgb: [...color.rgb], count: 0 });
      }
      countsByColor.get(key).count += 1;
    }
  }

  const counts = [...countsByColor.values()].sort((a, b) => b.count - a.count);

  return { grid: smoothed, counts };
}
