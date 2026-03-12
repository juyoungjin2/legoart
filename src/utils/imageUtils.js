export function createAdjustedCanvas(image, brightness, contrast, saturation) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  canvas.width = image.width;
  canvas.height = image.height;
  ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
  ctx.drawImage(image, 0, 0);
  ctx.filter = "none";

  return canvas;
}

export function extractGrayscaleRecommendations(image, steps = 7) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const maxSampleSize = 120;
  const scale = Math.min(1, maxSampleSize / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);

  const { data } = ctx.getImageData(0, 0, width, height);
  const values = [];

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 16) continue;
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    values.push(gray);
  }

  if (!values.length) return [];

  values.sort((a, b) => a - b);
  const recommendations = [];

  for (let i = 0; i < steps; i++) {
    const quantile = steps === 1 ? 0 : i / (steps - 1);
    const index = Math.min(values.length - 1, Math.round(quantile * (values.length - 1)));
    const gray = values[index];
    recommendations.push({
      rgb: [gray, gray, gray],
      count: 1,
      ratio: 1 / steps,
    });
  }

  return recommendations;
}
