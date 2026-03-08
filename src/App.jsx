import { useEffect, useRef, useState } from "react";
import { extractDominantColors, processImage } from "./legoProcessor";
import { palette as defaultPalette } from "./palette";

function toHex(value) {
  return value.toString(16).padStart(2, "0");
}

function rgbToHex(rgb) {
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function createAdjustedCanvas(image, brightness, contrast, saturation) {
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

function extractGrayscaleRecommendations(image, steps = 7) {
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

function App() {
  const sampleCanvasRef = useRef(null);
  const [image, setImage] = useState(null);
  const [grid, setGrid] = useState(null);
  const [counts, setCounts] = useState([]);
  const [selectedBrickHexes, setSelectedBrickHexes] = useState([]);
  const [size, setSize] = useState(48);
  const [brickSizeMm, setBrickSizeMm] = useState(8);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [adjustedPreviewSrc, setAdjustedPreviewSrc] = useState("");
  const [recommendedColors, setRecommendedColors] = useState([]);
  const [recommendationMode, setRecommendationMode] = useState("normal");
  const [selectedRecommendationIndexes, setSelectedRecommendationIndexes] =
    useState([]);
  const [hoveredColor, setHoveredColor] = useState(null);
  const [pickedColors, setPickedColors] = useState([]);
  const [palette, setPalette] = useState(
    defaultPalette.map((color) => ({ ...color, enabled: true, source: "default" }))
  );

  const activeColorCount = palette.filter((color) => color.enabled).length;
  const activePalette = palette.filter((color) => color.enabled);
  const selectedBrickHexSet = new Set(selectedBrickHexes);
  const pieceCountPerSide = grid?.[0]?.length || size;
  const finalWidthMm = pieceCountPerSide * brickSizeMm;
  const finalHeightMm = pieceCountPerSide * brickSizeMm;
  const previewWidth = "min(480px, 90vw)";

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();

    img.onload = () => {
      setImage(img);
      setSelectedRecommendationIndexes([]);
      setHoveredColor(null);
      setPickedColors([]);
      setGrid(null);
      setCounts([]);
      setSelectedBrickHexes([]);
    };

    img.src = URL.createObjectURL(file);
  };

  const generate = () => {
    if (!image) return;
    if (!activePalette.length) return;

    const source = sampleCanvasRef.current || image;
    const result = processImage(source, size, activePalette);
    setGrid(result.grid);
    setCounts(result.counts);
    setSelectedBrickHexes([]);
  };

  const toggleSelectedBrick = (hex) => {
    setSelectedBrickHexes((prev) =>
      prev.includes(hex) ? prev.filter((item) => item !== hex) : [...prev, hex]
    );
  };

  const updatePaletteName = (id, name) => {
    setPalette((prev) =>
      prev.map((color) => (color.id === id ? { ...color, name } : color))
    );
  };

  const updatePaletteRgb = (id, hex) => {
    setPalette((prev) =>
      prev.map((color) =>
        color.id === id ? { ...color, rgb: hexToRgb(hex) } : color
      )
    );
  };

  const togglePaletteColor = (id) => {
    setPalette((prev) =>
      prev.map((color) =>
        color.id === id ? { ...color, enabled: !color.enabled } : color
      )
    );
  };

  const applyRecommendedColors = () => {
    const selectedColors = [...selectedRecommendationIndexes]
      .sort((a, b) => a - b)
      .map((index) => recommendedColors[index])
      .filter(Boolean);

    if (!selectedColors.length) return;

    setPalette(
      selectedColors.map((recommended, index) => ({
        id: index + 1,
        name: `추천 ${index + 1}`,
        rgb: recommended.rgb,
        enabled: true,
        source: "recommended",
      }))
    );
  };

  const sampleColorFromEvent = (event) => {
    const canvas = sampleCanvasRef.current;
    if (!canvas || !image) return null;

    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;
    const x = Math.min(
      image.width - 1,
      Math.max(0, Math.floor(xRatio * image.width))
    );
    const y = Math.min(
      image.height - 1,
      Math.max(0, Math.floor(yRatio * image.height))
    );

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const pixel = ctx.getImageData(x, y, 1, 1).data;
    return { rgb: [pixel[0], pixel[1], pixel[2]], x, y };
  };

  const handlePhotoMouseMove = (event) => {
    const sampled = sampleColorFromEvent(event);
    if (!sampled) return;
    setHoveredColor(sampled);
  };

  const handlePhotoClick = (event) => {
    const sampled = sampleColorFromEvent(event);
    if (!sampled) return;

    const sampledHex = rgbToHex(sampled.rgb);

    setPickedColors((prev) => {
      if (prev.some((item) => rgbToHex(item.rgb) === sampledHex)) {
        return prev;
      }

      return [...prev, { id: Date.now() + Math.random(), rgb: sampled.rgb }];
    });
  };

  const applyPickedColors = () => {
    if (!pickedColors.length) return;

    setPalette(
      pickedColors.map((color, index) => ({
        id: index + 1,
        name: `사용자 ${index + 1}`,
        rgb: color.rgb,
        enabled: true,
        source: "user-picked",
      }))
    );
  };

  const toggleRecommendation = (index) => {
    setSelectedRecommendationIndexes((prev) =>
      prev.includes(index)
        ? prev.filter((item) => item !== index)
        : [...prev, index]
    );
  };

  const selectAllRecommendations = () => {
    setSelectedRecommendationIndexes(recommendedColors.map((_, index) => index));
  };

  const toggleRecommendationMode = () => {
    const nextMode = recommendationMode === "normal" ? "grayscale" : "normal";
    setRecommendationMode(nextMode);
  };

  useEffect(() => {
    if (!image) return;

    const adjustedCanvas = createAdjustedCanvas(
      image,
      brightness,
      contrast,
      saturation
    );
    if (!adjustedCanvas) return;

    sampleCanvasRef.current = adjustedCanvas;
    setAdjustedPreviewSrc(adjustedCanvas.toDataURL());
    setRecommendedColors(
      recommendationMode === "grayscale"
        ? extractGrayscaleRecommendations(adjustedCanvas, 7)
        : extractDominantColors(adjustedCanvas, 20)
    );
    setSelectedRecommendationIndexes([]);
    setHoveredColor(null);
  }, [image, recommendationMode, brightness, contrast, saturation]);

  const userPickedPalette = palette.filter((color) => color.source === "user-picked");
  const recommendedPalette = palette.filter((color) => color.source === "recommended");
  const otherPalette = palette.filter(
    (color) => color.source !== "user-picked" && color.source !== "recommended"
  );

  const renderPaletteSection = (title, colors) => {
    if (!colors.length) return null;

    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          {colors.map((color) => (
            <div
              key={color.id}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <input
                type="checkbox"
                checked={color.enabled}
                onChange={() => togglePaletteColor(color.id)}
              />
              <input
                type="text"
                value={color.name}
                onChange={(e) => updatePaletteName(color.id, e.target.value)}
                style={{ width: 130 }}
              />
              <input
                type="color"
                value={rgbToHex(color.rgb)}
                onChange={(e) => updatePaletteRgb(color.id, e.target.value)}
              />
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  opacity: 0.8,
                }}
              >
                {rgbToHex(color.rgb)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>레고 아트 도안 생성기</h2>

      <input type="file" onChange={handleUpload} />
      {image && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: 0 }}>선택한 사진</h3>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <img
              src={adjustedPreviewSrc || image.src}
              alt="선택한 원본"
              onMouseMove={handlePhotoMouseMove}
              onMouseLeave={() => setHoveredColor(null)}
              onClick={handlePhotoClick}
              style={{
                width: previewWidth,
                maxWidth: "100%",
                height: "auto",
                border: "1px solid #ccc",
                borderRadius: 4,
                cursor: "crosshair",
              }}
            />
            <div style={{ minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                보정
              </div>
              <div style={{ fontSize: 12 }}>밝기: {brightness}%</div>
              <input
                type="range"
                min={50}
                max={150}
                value={brightness}
                onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
              />
              <div style={{ fontSize: 12 }}>대비: {contrast}%</div>
              <input
                type="range"
                min={50}
                max={150}
                value={contrast}
                onChange={(e) => setContrast(parseInt(e.target.value, 10))}
              />
              <div style={{ fontSize: 12 }}>채도: {saturation}%</div>
              <input
                type="range"
                min={0}
                max={200}
                value={saturation}
                onChange={(e) => setSaturation(parseInt(e.target.value, 10))}
              />
              <div style={{ fontSize: 13, fontWeight: 700 }}>호버 색상</div>
              {hoveredColor ? (
                <div style={{ marginTop: 6 }}>
                  <div
                    style={{
                      width: 72,
                      height: 28,
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      background: `rgb(${hoveredColor.rgb.join(",")})`,
                    }}
                  />
                  <div style={{ marginTop: 4, fontSize: 12, fontFamily: "monospace" }}>
                    {rgbToHex(hoveredColor.rgb)}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    ({hoveredColor.rgb.join(", ")})
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                  사진 위에 마우스를 올려 색상을 확인해.
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700 }}>
                사용자 선택 색상 ({pickedColors.length}개)
              </div>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {pickedColors.map((item) => (
                  <div
                    key={item.id}
                    title={rgbToHex(item.rgb)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      border: "1px solid #999",
                      background: `rgb(${item.rgb.join(",")})`,
                    }}
                  />
                ))}
                {!pickedColors.length && (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    클릭한 색상이 여기에 저장돼.
                  </div>
                )}
              </div>
              <button
                onClick={applyPickedColors}
                disabled={pickedColors.length === 0}
                style={{ marginTop: 8 }}
              >
                선택한 사진 색상을 팔레트에 적용 ({pickedColors.length}개)
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        브릭 해상도 :
        <input
          type="number"
          min={1}
          value={size}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10);
            if (Number.isNaN(value) || value < 1) return;
            setSize(value);
          }}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        브릭 1개 크기(mm) :
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={brickSizeMm}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            if (Number.isNaN(value) || value <= 0) return;
            setBrickSizeMm(value);
          }}
        />
      </div>
      <div style={{ marginTop: 8, fontSize: 13 }}>
        예상 최종 작품 크기: {finalWidthMm.toFixed(1)}mm x {" "}
        {finalHeightMm.toFixed(1)}mm
      </div>

      <h3>사진 주요 색상 추천</h3>
      <button
        onClick={toggleRecommendationMode}
        style={{ marginRight: 8, marginBottom: 8 }}
      >
        {recommendationMode === "grayscale"
          ? "일반 추천 모드"
          : "그레이스케일 모드"}
      </button>
      <button
        onClick={selectAllRecommendations}
        disabled={recommendedColors.length === 0}
        style={{ marginBottom: 8 }}
      >
        전체 선택
      </button>
      {recommendedColors.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {recommendedColors.map((item, index) => (
            <div
              key={`${item.rgb.join("-")}-${index}`}
              style={{
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: 6,
                width: 112,
                background: selectedRecommendationIndexes.includes(index)
                  ? "#eef7ff"
                  : "transparent",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedRecommendationIndexes.includes(index)}
                  onChange={() => toggleRecommendation(index)}
                />
                선택
              </label>
              <div
                style={{
                  width: "100%",
                  height: 28,
                  borderRadius: 4,
                  background: `rgb(${item.rgb.join(",")})`,
                }}
              />
              <div
                style={{
                  marginTop: 4,
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              >
                {rgbToHex(item.rgb)}
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>#{index + 1}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {(item.ratio * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.8 }}>
          사진을 업로드하면 주요 색상을 추천해줘.
        </div>
      )}

      <button
        onClick={applyRecommendedColors}
        disabled={selectedRecommendationIndexes.length === 0}
        style={{ marginTop: 10 }}
      >
        선택한 추천 색상을 팔레트에 적용 ({selectedRecommendationIndexes.length}
        개)
      </button>

      <h3>팔레트 선택/수정</h3>
      {renderPaletteSection("사용자 선택 색상 팔레트", userPickedPalette)}
      {renderPaletteSection("추천 색상 팔레트", recommendedPalette)}
      {renderPaletteSection("기본/기타 팔레트", otherPalette)}

      <div style={{ marginTop: 8, fontSize: 13 }}>
        사용 중인 색상: {activeColorCount}개
      </div>

      <button
        onClick={generate}
        disabled={!image || activeColorCount === 0}
        style={{ marginTop: 12 }}
      >
        도안 생성
      </button>

      {grid && (
        <div>
          <h3>전후 비교</h3>
          <div
            style={{
              display: "flex",
              gap: 24,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h4 style={{ marginTop: 0 }}>원본 사진</h4>
              {image && (
                <img
                  src={image.src}
                  alt="원본"
                  style={{
                    width: previewWidth,
                    maxWidth: "100%",
                    height: "auto",
                    border: "1px solid #ccc",
                    borderRadius: 4,
                  }}
                />
              )}
            </div>

            <div>
              <h4 style={{ marginTop: 0 }}>도안 미리보기</h4>
              <div
                style={{
                  display: "grid",
                  width: previewWidth,
                  maxWidth: "100%",
                  gridTemplateColumns: `repeat(${grid[0]?.length || size}, 1fr)`,
                  border: "1px solid #ccc",
                }}
              >
                {grid.flat().map((cell, index) => {
                  const hex = rgbToHex(cell.rgb);
                  const isSelected = selectedBrickHexSet.has(hex);

                  return (
                    <div
                      key={index}
                      title={`${cell.name} ${hex}`}
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        backgroundColor: `rgb(${cell.rgb.join(",")})`,
                        backgroundImage: isSelected
                          ? "linear-gradient(rgba(255, 0, 0, 0.28), rgba(255, 0, 0, 0.28)), repeating-linear-gradient(0deg, rgba(255, 0, 0, 0.5) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(255, 0, 0, 0.5) 0 1px, transparent 1px 4px)"
                          : "none",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <h3>브릭 개수</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {counts.map((item, index) => (
              <div
                key={`${item.rgb.join("-")}-${index}`}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <input
                  type="checkbox"
                  checked={selectedBrickHexes.includes(rgbToHex(item.rgb))}
                  onChange={() => toggleSelectedBrick(rgbToHex(item.rgb))}
                />
                <input type="color" value={rgbToHex(item.rgb)} disabled />
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 12,
                    minWidth: 76,
                    opacity: 0.8,
                  }}
                >
                  {rgbToHex(item.rgb)}
                </span>
                <span>{item.count}개</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
