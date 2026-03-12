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

function rgbToHue(rgb) {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) return 0;
  let hue;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return (hue * 60 + 360) % 360;
}

function colorFamilyKey(rgb) {
  const c = chroma(rgb);
  const b = brightness(rgb);
  if (c < 18) {
    if (b < 75) return "neutral-dark";
    if (b > 180) return "neutral-light";
    return "neutral-mid";
  }

  const hue = rgbToHue(rgb);
  if (hue < 20 || hue >= 340) return "red";
  if (hue < 55) return "orange";
  if (hue < 80) return "yellow";
  if (hue < 165) return "green";
  if (hue < 250) return "blue";
  if (hue < 300) return "purple";
  return "pink";
}

function mergeSimilarColors(candidates, distanceThreshold = 34) {
  if (!candidates.length) return [];

  const total = candidates.reduce((sum, item) => sum + item.count, 0) || 1;
  const groups = [];

  for (const item of candidates) {
    const family = colorFamilyKey(item.rgb);
    let targetGroup = null;

    for (const group of groups) {
      if (group.family !== family) continue;
      if (Math.abs(brightness(item.rgb) - brightness(group.rgb)) > 34) continue;
      if (colorDistance(item.rgb, group.rgb) > distanceThreshold) continue;
      targetGroup = group;
      break;
    }

    if (!targetGroup) {
      groups.push({
        family,
        count: item.count,
        sumR: item.rgb[0] * item.count,
        sumG: item.rgb[1] * item.count,
        sumB: item.rgb[2] * item.count,
        rgb: [...item.rgb],
      });
      continue;
    }

    targetGroup.count += item.count;
    targetGroup.sumR += item.rgb[0] * item.count;
    targetGroup.sumG += item.rgb[1] * item.count;
    targetGroup.sumB += item.rgb[2] * item.count;
    targetGroup.rgb = [
      Math.round(targetGroup.sumR / targetGroup.count),
      Math.round(targetGroup.sumG / targetGroup.count),
      Math.round(targetGroup.sumB / targetGroup.count),
    ];
  }

  return groups
    .map((group) => ({
      rgb: group.rgb,
      count: group.count,
      ratio: group.count / total,
    }))
    .sort((a, b) => b.count - a.count);
}

function pickLineBaseColor(palette) {
  if (!palette.length) return null;

  const neutralCandidates = palette.filter((item) => chroma(item.rgb) <= 52);
  const candidates = neutralCandidates.length ? neutralCandidates : palette;

  return candidates.reduce((darkest, item) =>
    brightness(item.rgb) < brightness(darkest.rgb) ? item : darkest
  );
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

function clampStrength(value) {
  return Math.max(0, Math.min(100, value));
}

function smoothingConfig(strength) {
  const s = clampStrength(strength);

  if (s === 0) {
    return {
      enabled: false,
      pass1MajorityMin: 99,
      ownSupportKeepMin: 99,
      pass2MajorityMin: 99,
      distanceAllowance: 0,
    };
  }

  return {
    enabled: true,
    pass1MajorityMin: Math.max(3, Math.round(6 - (s / 100) * 3)),
    ownSupportKeepMin: Math.min(3, Math.max(1, Math.round(1 + (s / 100) * 2))),
    pass2MajorityMin: Math.max(3, Math.round(5 - (s / 100) * 2)),
    distanceAllowance: Math.round(8 + (s / 100) * 24),
  };
}

function smoothColorBoundaries(grid, cellStats, strength = 50) {
  if (!grid?.length || !grid[0]?.length) return grid;
  const config = smoothingConfig(strength);
  if (!config.enabled) return grid;

  const height = grid.length;
  const width = grid[0].length;
  const directions8 = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  // Pass 1: remove isolated speckles by following strong neighborhood majority.
  let next = grid.map((row) => [...row]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const current = grid[y][x];
      const currentKey = current.rgb.join(",");
      const neighborCountByKey = new Map();
      const sampleByKey = new Map();

      for (const [dx, dy] of directions8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const color = grid[ny][nx];
        const key = color.rgb.join(",");
        neighborCountByKey.set(key, (neighborCountByKey.get(key) || 0) + 1);
        if (!sampleByKey.has(key)) {
          sampleByKey.set(key, color);
        }
      }

      let bestKey = currentKey;
      let bestCount = 0;
      for (const [key, count] of neighborCountByKey.entries()) {
        if (count > bestCount) {
          bestKey = key;
          bestCount = count;
        }
      }

      if (bestKey !== currentKey && bestCount >= config.pass1MajorityMin) {
        next[y][x] = sampleByKey.get(bestKey);
      }
    }
  }

  // Pass 2: if current color has weak support, snap to dominant adjacent color
  // only when it's not much farther from the original average cell color.
  const pass2 = next.map((row) => [...row]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const current = next[y][x];
      const currentKey = current.rgb.join(",");
      const neighborCountByKey = new Map();
      const sampleByKey = new Map();

      for (const [dx, dy] of directions8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const color = next[ny][nx];
        const key = color.rgb.join(",");
        neighborCountByKey.set(key, (neighborCountByKey.get(key) || 0) + 1);
        if (!sampleByKey.has(key)) {
          sampleByKey.set(key, color);
        }
      }

      const ownSupport = neighborCountByKey.get(currentKey) || 0;
      if (ownSupport >= config.ownSupportKeepMin) continue;

      let bestKey = currentKey;
      let bestCount = ownSupport;
      for (const [key, count] of neighborCountByKey.entries()) {
        if (count > bestCount) {
          bestKey = key;
          bestCount = count;
        }
      }

      if (bestKey === currentKey || bestCount < config.pass2MajorityMin) continue;

      const target = sampleByKey.get(bestKey);
      const avgRgb = cellStats[y][x].avgRgb;
      const currentDist = colorDistance(avgRgb, current.rgb);
      const targetDist = colorDistance(avgRgb, target.rgb);

      if (targetDist <= currentDist + config.distanceAllowance) {
        pass2[y][x] = target;
      }
    }
  }

  return pass2;
}

export function extractDominantColors(image, maxColors = 20, options = {}) {
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

  const shouldGroupSimilar = options.groupSimilar !== false;
  const grouped = shouldGroupSimilar
    ? mergeSimilarColors(sorted, options.similarDistance || 34)
    : sorted;

  return pickDiverseColors(grouped, maxColors, options.minDistance || 48);
}

export function processImage(image, gridSize, palette = defaultPalette, options = {}) {
  if (!palette.length) {
    return { grid: [], counts: [] };
  }

  const boundarySmoothing =
    typeof options.boundarySmoothing === "number" ? options.boundarySmoothing : 50;

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

  const cleanedResult = smoothColorBoundaries(result, cellStats, boundarySmoothing);
  for (let y = 0; y < gridSize; y++) {
    result[y] = cleanedResult[y];
  }

  const countsByColor = new Map();
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const color = result[y][x];
      const key = color.rgb.join(",");
      if (!countsByColor.has(key)) {
        countsByColor.set(key, { rgb: [...color.rgb], count: 0 });
      }
      countsByColor.get(key).count += 1;
    }
  }

  const counts = [...countsByColor.values()].sort((a, b) => b.count - a.count);

  return { grid: result, counts };
}
