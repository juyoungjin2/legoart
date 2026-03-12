export function buildCountsFromGrid(grid) {
  if (!grid || !grid.length || !grid[0]?.length) return [];

  const countsByColor = new Map();
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      const color = grid[y][x];
      const key = color.rgb.join(",");
      if (!countsByColor.has(key)) {
        countsByColor.set(key, { rgb: [...color.rgb], count: 0 });
      }
      countsByColor.get(key).count += 1;
    }
  }

  return [...countsByColor.values()].sort((a, b) => b.count - a.count);
}

export function cloneGrid(grid) {
  if (!grid?.length) return [];

  return grid.map((row) =>
    row.map((cell) => ({
      ...cell,
      rgb: [...cell.rgb],
    }))
  );
}
