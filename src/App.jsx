import { useEffect, useRef, useState } from "react";
import { extractDominantColors, processImage } from "./legoProcessor";
import { palette as defaultPalette } from "./palette";
import PaletteSection from "./components/PaletteSection";
import RealSizePreviewModal from "./components/RealSizePreviewModal";
import { hexToRgb, rgbToHex } from "./utils/colorUtils";
import { buildCountsFromGrid, cloneGrid } from "./utils/gridUtils";
import { downloadBrickBlueprintPdf } from "./utils/blueprintPdf";
import {
  createAdjustedCanvas,
  extractGrayscaleRecommendations,
} from "./utils/imageUtils";

const RECOMMENDATION_CASE_SIZES = [10, 13, 16, 20];

function pickEvenlySpaced(list, count) {
  if (!list.length || count <= 0) return [];
  if (count >= list.length) return list;

  const picked = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const q = count === 1 ? 0 : i / (count - 1);
    const index = Math.min(list.length - 1, Math.round(q * (list.length - 1)));
    if (!used.has(index)) {
      used.add(index);
      picked.push(list[index]);
    }
  }

  if (picked.length === count) return picked;
  for (let i = 0; i < list.length && picked.length < count; i++) {
    if (used.has(i)) continue;
    used.add(i);
    picked.push(list[i]);
  }

  return picked;
}

function App() {
  const sampleCanvasRef = useRef(null);
  const realSizeModalRef = useRef(null);
  const realSizeViewportRef = useRef(null);
  const realSizePanStartRef = useRef(null);
  const [image, setImage] = useState(null);
  const [grid, setGrid] = useState(null);
  const [originalGrid, setOriginalGrid] = useState(null);
  const [gridHistory, setGridHistory] = useState([]);
  const [counts, setCounts] = useState([]);
  const [selectedBrickHexes, setSelectedBrickHexes] = useState([]);
  const [selectedCellKeys, setSelectedCellKeys] = useState([]);
  const [paintMode, setPaintMode] = useState("add");
  const [paintTool, setPaintTool] = useState("brush");
  const [brushSize, setBrushSize] = useState(2);
  const [isPainting, setIsPainting] = useState(false);
  const [isRealSizePreviewOpen, setIsRealSizePreviewOpen] = useState(false);
  const [isRealSizeFullscreen, setIsRealSizeFullscreen] = useState(false);
  const [isRealSizeDragging, setIsRealSizeDragging] = useState(false);
  const [realSizeScalePercent, setRealSizeScalePercent] = useState(100);
  const [targetColorHex, setTargetColorHex] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [size, setSize] = useState(48);
  const [brickSizeMm, setBrickSizeMm] = useState(8);
  const [boundarySmoothing, setBoundarySmoothing] = useState(60);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [adjustedPreviewSrc, setAdjustedPreviewSrc] = useState("");
  const [recommendedColorCases, setRecommendedColorCases] = useState({
    10: [],
    13: [],
    16: [],
    20: [],
  });
  const [recommendationCaseSize, setRecommendationCaseSize] = useState(20);
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
  const selectedCellKeySet = new Set(selectedCellKeys);
  const brushMax = Math.max(1, Math.min(48, size));
  const pieceCountPerSide = grid?.[0]?.length || size;
  const finalWidthMm = pieceCountPerSide * brickSizeMm;
  const finalHeightMm = pieceCountPerSide * brickSizeMm;
  const totalBrickCount = counts.reduce((sum, item) => sum + item.count, 0);
  const previewWidth = "min(480px, 90vw)";
  const cssPxPerMm = 96 / 25.4;
  const lego98138PitchMm = 8;
  const lego98138OuterDiameterMm = 7.8;
  const lego65803StudsPerSide = 16;
  const realSizePitchPx = Math.max(
    1,
    lego98138PitchMm * cssPxPerMm * (realSizeScalePercent / 100)
  );
  const realSizeBrickOuterDiameterPx = Math.max(
    1,
    lego98138OuterDiameterMm * cssPxPerMm * (realSizeScalePercent / 100)
  );
  const realSizeGridWidthPx = (grid?.[0]?.length || 0) * realSizePitchPx;
  const realSizeGridHeightPx = (grid?.length || 0) * realSizePitchPx;
  const realSizeModelWidthMm = (grid?.[0]?.length || 0) * lego98138PitchMm;
  const realSizeModelHeightMm = (grid?.length || 0) * lego98138PitchMm;
  const realSizeBaseplateStepPx = lego65803StudsPerSide * realSizePitchPx;
  const realSizeBaseplateCols = Math.ceil((grid?.[0]?.length || 0) / lego65803StudsPerSide);
  const realSizeBaseplateRows = Math.ceil((grid?.length || 0) / lego65803StudsPerSide);
  const realSizeBaseplateCount = realSizeBaseplateCols * realSizeBaseplateRows;
  const recommendedColors = recommendedColorCases[recommendationCaseSize] || [];
  const targetColorRgb = targetColorHex ? hexToRgb(targetColorHex) : null;
  const selectedForChangeKeySet = new Set(selectedCellKeys);

  if (grid?.length && selectedBrickHexes.length) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (selectedBrickHexSet.has(rgbToHex(grid[y][x].rgb))) {
          selectedForChangeKeySet.add(`${x},${y}`);
        }
      }
    }
  }

  const selectedColorHexSet = new Set();
  const selectedColorHexes = [];
  const addSelectedHex = (hex) => {
    if (!hex || selectedColorHexSet.has(hex)) return;
    selectedColorHexSet.add(hex);
    selectedColorHexes.push(hex);
  };

  for (const hex of selectedBrickHexes) {
    addSelectedHex(hex);
  }

  if (grid?.length && selectedCellKeys.length) {
    for (const key of selectedCellKeys) {
      const [xStr, yStr] = key.split(",");
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);
      if (Number.isNaN(x) || Number.isNaN(y)) continue;
      if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) continue;

      addSelectedHex(rgbToHex(grid[y][x].rgb));
    }
  }

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();

    img.onload = () => {
      setImage(img);
      setRecommendedColorCases({ 10: [], 13: [], 16: [], 20: [] });
      setRecommendationCaseSize(20);
      setSelectedRecommendationIndexes([]);
      setHoveredColor(null);
      setPickedColors([]);
      setGrid(null);
      setOriginalGrid(null);
      setGridHistory([]);
      setCounts([]);
      setSelectedBrickHexes([]);
      setSelectedCellKeys([]);
      setIsPainting(false);
      setIsRealSizePreviewOpen(false);
      setIsRealSizeFullscreen(false);
      setIsRealSizeDragging(false);
      setRealSizeScalePercent(100);
      setTargetColorHex("");
    };

    img.src = URL.createObjectURL(file);
  };

  const generate = () => {
    if (!image) return;
    if (!activePalette.length) return;

    const source = sampleCanvasRef.current || image;
    const result = processImage(source, size, activePalette, {
      boundarySmoothing,
    });
    const nextGrid = cloneGrid(result.grid);
    setGrid(nextGrid);
    setOriginalGrid(cloneGrid(nextGrid));
    setGridHistory([]);
    setCounts(result.counts);
    setSelectedBrickHexes([]);
    setSelectedCellKeys([]);
    setIsPainting(false);
    setIsRealSizePreviewOpen(false);
    setIsRealSizeFullscreen(false);
    setIsRealSizeDragging(false);
    setRealSizeScalePercent(100);
    setTargetColorHex(result.counts[0] ? rgbToHex(result.counts[0].rgb) : "");
  };

  const toggleSelectedBrick = (hex) => {
    setSelectedBrickHexes((prev) =>
      prev.includes(hex) ? prev.filter((item) => item !== hex) : [...prev, hex]
    );
  };

  const clampBrushSize = (value) => Math.min(brushMax, Math.max(1, value));

  const getConnectedComponentKeys = (startX, startY) => {
    if (!grid || !grid.length || !grid[0]?.length) return [];

    const height = grid.length;
    const width = grid[0].length;
    const targetHex = rgbToHex(grid[startY][startX].rgb);
    const queue = [[startX, startY]];
    const visited = new Set();
    const componentKeys = [];
    const directions = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];

    while (queue.length) {
      const [x, y] = queue.pop();
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (rgbToHex(grid[y][x].rgb) !== targetHex) continue;
      componentKeys.push(key);

      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nextKey = `${nx},${ny}`;
        if (!visited.has(nextKey)) {
          queue.push([nx, ny]);
        }
      }
    }

    return componentKeys;
  };

  const applyBrushAtCell = (centerX, centerY, mode) => {
    if (!grid || !grid.length || !grid[0]?.length) return;

    const height = grid.length;
    const width = grid[0].length;
    const radius = Math.max(0, brushSize - 1);

    setSelectedCellKeys((prev) => {
      const next = new Set(prev);

      for (let y = Math.max(0, centerY - radius); y <= Math.min(height - 1, centerY + radius); y++) {
        for (let x = Math.max(0, centerX - radius); x <= Math.min(width - 1, centerX + radius); x++) {
          const dx = x - centerX;
          const dy = y - centerY;
          if (dx * dx + dy * dy > radius * radius) continue;

          const key = `${x},${y}`;
          if (mode === "add") {
            next.add(key);
          } else {
            next.delete(key);
          }
        }
      }

      return [...next];
    });
  };

  const applyConnectedComponentAtCell = (centerX, centerY) => {
    const componentKeys = getConnectedComponentKeys(centerX, centerY);
    if (!componentKeys.length) return;

    setSelectedCellKeys((prev) => {
      const next = new Set(prev);
      const isSelectedComponent = componentKeys.every((key) => next.has(key));

      for (const key of componentKeys) {
        if (isSelectedComponent) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }

      return [...next];
    });
  };

  const handlePreviewCellMouseDown = (event, x, y) => {
    event.preventDefault();
    setIsPainting(true);
    if (paintTool === "wand") {
      applyConnectedComponentAtCell(x, y);
      return;
    }
    applyBrushAtCell(x, y, paintMode);
  };

  const handlePreviewCellMouseEnter = (x, y) => {
    if (!isPainting) return;
    if (paintTool === "wand") {
      applyConnectedComponentAtCell(x, y);
      return;
    }
    applyBrushAtCell(x, y, paintMode);
  };

  const applySelectedColorChange = () => {
    if (!grid?.length || !selectedForChangeKeySet.size || !targetColorHex) return;

    const targetRgb = hexToRgb(targetColorHex);
    const targetColor = {
      id: Date.now(),
      name: targetColorHex,
      rgb: targetRgb,
    };
    const nextGrid = grid.map((row, y) =>
      row.map((cell, x) => (selectedForChangeKeySet.has(`${x},${y}`) ? targetColor : cell))
    );

    const nextCounts = buildCountsFromGrid(nextGrid);
    const availableHexes = new Set(nextCounts.map((item) => rgbToHex(item.rgb)));

    setGridHistory((prev) => [...prev, cloneGrid(grid)]);
    setGrid(nextGrid);
    setCounts(nextCounts);
    setSelectedBrickHexes((prev) => prev.filter((hex) => availableHexes.has(hex)));
  };

  const undoLastGridChange = () => {
    if (!gridHistory.length) return;

    const previousGrid = cloneGrid(gridHistory[gridHistory.length - 1]);
    const previousCounts = buildCountsFromGrid(previousGrid);
    const availableHexes = new Set(previousCounts.map((item) => rgbToHex(item.rgb)));

    setGrid(previousGrid);
    setCounts(previousCounts);
    setGridHistory((prev) => prev.slice(0, -1));
    setSelectedBrickHexes((prev) => prev.filter((hex) => availableHexes.has(hex)));
  };

  const restoreOriginalGrid = () => {
    if (!originalGrid?.length) return;

    const restoredGrid = cloneGrid(originalGrid);
    const restoredCounts = buildCountsFromGrid(restoredGrid);
    const availableHexes = new Set(restoredCounts.map((item) => rgbToHex(item.rgb)));

    setGrid(restoredGrid);
    setCounts(restoredCounts);
    setGridHistory([]);
    setSelectedBrickHexes((prev) => prev.filter((hex) => availableHexes.has(hex)));
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

  const handleDownloadBlueprintPdf = async () => {
    await downloadBrickBlueprintPdf({ grid, counts });
  };

  const closeRealSizePreview = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setIsRealSizePreviewOpen(false);
    setIsRealSizeFullscreen(false);
    setIsRealSizeDragging(false);
  };

  const toggleRealSizeFullscreen = () => {
    const element = realSizeModalRef.current;
    if (!element) return;

    if (document.fullscreenElement === element) {
      document.exitFullscreen().catch(() => {});
      return;
    }

    element.requestFullscreen().catch(() => {});
  };

  const handleRealSizePanStart = (event) => {
    if (!isRealSizeFullscreen) return;
    const viewport = realSizeViewportRef.current;
    if (!viewport) return;

    event.preventDefault();
    setIsRealSizeDragging(true);
    realSizePanStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
  };

  useEffect(() => {
    const endPainting = () => setIsPainting(false);
    window.addEventListener("mouseup", endPainting);
    return () => {
      window.removeEventListener("mouseup", endPainting);
    };
  }, []);

  useEffect(() => {
    if (!isRealSizePreviewOpen) return;

    const handleEscClose = (event) => {
      if (event.key === "Escape") {
        if (isRealSizeFullscreen) {
          document.exitFullscreen().catch(() => {});
          return;
        }
        setIsRealSizePreviewOpen(false);
        setIsRealSizeFullscreen(false);
        setIsRealSizeDragging(false);
      }
    };

    window.addEventListener("keydown", handleEscClose);
    return () => {
      window.removeEventListener("keydown", handleEscClose);
    };
  }, [isRealSizeFullscreen, isRealSizePreviewOpen]);

  useEffect(() => {
    if (!isRealSizePreviewOpen) return;

    const handleFullscreenChange = () => {
      const isActive = document.fullscreenElement === realSizeModalRef.current;
      setIsRealSizeFullscreen(isActive);
      if (!isActive) {
        setIsRealSizeDragging(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    handleFullscreenChange();
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [isRealSizePreviewOpen]);

  useEffect(() => {
    if (!isRealSizeDragging) return;

    const handleMouseMove = (event) => {
      const viewport = realSizeViewportRef.current;
      const start = realSizePanStartRef.current;
      if (!viewport || !start) return;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      viewport.scrollLeft = start.scrollLeft - dx;
      viewport.scrollTop = start.scrollTop - dy;
    };

    const handleMouseUp = () => {
      setIsRealSizeDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isRealSizeDragging]);

  useEffect(() => {
    setBrushSize((prev) => clampBrushSize(prev));
  }, [brushMax]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!counts.length) {
      if (targetColorHex) setTargetColorHex("");
      return;
    }

    const availableHexes = counts.map((item) => rgbToHex(item.rgb));
    if (!targetColorHex || !availableHexes.includes(targetColorHex)) {
      setTargetColorHex(availableHexes[0]);
    }
  }, [counts, targetColorHex]);

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
    if (recommendationMode === "grayscale") {
      const base = extractGrayscaleRecommendations(adjustedCanvas, 20);
      setRecommendedColorCases({
        10: pickEvenlySpaced(base, 10),
        13: pickEvenlySpaced(base, 13),
        16: pickEvenlySpaced(base, 16),
        20: pickEvenlySpaced(base, 20),
      });
    } else {
      setRecommendedColorCases({
        10: extractDominantColors(adjustedCanvas, 10, { groupSimilar: true }),
        13: extractDominantColors(adjustedCanvas, 13, { groupSimilar: true }),
        16: extractDominantColors(adjustedCanvas, 16, { groupSimilar: true }),
        20: extractDominantColors(adjustedCanvas, 20, { groupSimilar: true }),
      });
    }
    setSelectedRecommendationIndexes([]);
    setHoveredColor(null);
  }, [image, recommendationMode, brightness, contrast, saturation]);

  useEffect(() => {
    setSelectedRecommendationIndexes((prev) =>
      prev.filter((index) => index >= 0 && index < recommendedColors.length)
    );
  }, [recommendedColors.length, recommendationCaseSize]);

  const userPickedPalette = palette.filter((color) => color.source === "user-picked");
  const recommendedPalette = palette.filter((color) => color.source === "recommended");
  const otherPalette = palette.filter(
    (color) => color.source !== "user-picked" && color.source !== "recommended"
  );

  return (
    <div style={{ padding: isMobile ? 12 : 20 }}>
      <h2>레고 아트 도안 생성기</h2>

      <input type="file" onChange={handleUpload} />
      {image && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: 0 }}>선택한 사진</h3>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              gap: isMobile ? 10 : 16,
              alignItems: "flex-start",
              flexWrap: isMobile ? "nowrap" : "wrap",
              flexDirection: isMobile ? "column" : "row",
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
            <div style={{ minWidth: isMobile ? "100%" : 180, width: isMobile ? "100%" : "auto" }}>
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
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13 }}>경계 정리 강도: {boundarySmoothing}</div>
        <input
          type="range"
          min={0}
          max={100}
          value={boundarySmoothing}
          onChange={(e) => setBoundarySmoothing(parseInt(e.target.value, 10))}
        />
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
      <div
        style={{
          marginBottom: 10,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 12, opacity: 0.9 }}>추천 케이스</span>
        {RECOMMENDATION_CASE_SIZES.map((caseSize) => {
          const isActive = recommendationCaseSize === caseSize;
          return (
            <button
              key={`case-${caseSize}`}
              type="button"
              onClick={() => {
                setRecommendationCaseSize(caseSize);
                setSelectedRecommendationIndexes([]);
              }}
              style={{
                minWidth: 52,
                fontWeight: 700,
                borderRadius: 4,
                border: isActive ? "2px solid #1f4f7f" : "1px solid #a8b5c2",
                background: isActive ? "#eaf4ff" : "transparent",
              }}
            >
              {caseSize}개
            </button>
          );
        })}
      </div>
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
      <PaletteSection
        title="사용자 선택 색상 팔레트"
        colors={userPickedPalette}
        isMobile={isMobile}
        rgbToHex={rgbToHex}
        onToggleColor={togglePaletteColor}
        onUpdateName={updatePaletteName}
        onUpdateRgb={updatePaletteRgb}
      />
      <PaletteSection
        title="추천 색상 팔레트"
        colors={recommendedPalette}
        isMobile={isMobile}
        rgbToHex={rgbToHex}
        onToggleColor={togglePaletteColor}
        onUpdateName={updatePaletteName}
        onUpdateRgb={updatePaletteRgb}
      />
      <PaletteSection
        title="기본/기타 팔레트"
        colors={otherPalette}
        isMobile={isMobile}
        rgbToHex={rgbToHex}
        onToggleColor={togglePaletteColor}
        onUpdateName={updatePaletteName}
        onUpdateRgb={updatePaletteRgb}
      />

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
          <div style={{ marginTop: 10, marginBottom: 10 }}>
            <button type="button" onClick={handleDownloadBlueprintPdf}>
              브릭 도안 PDF 다운로드 (16x16 판, A4 1장당 6판)
            </button>
          </div>
          <h3>전후 비교</h3>
          <div
            style={{
              display: "flex",
              gap: isMobile ? 12 : 24,
              alignItems: "flex-start",
              flexWrap: isMobile ? "nowrap" : "wrap",
              flexDirection: isMobile ? "column" : "row",
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
              <div
                style={{
                  marginTop: 0,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <h4 style={{ margin: 0 }}>도안 미리보기</h4>
                <button type="button" onClick={() => setIsRealSizePreviewOpen(true)}>
                  실제 크기로 보기
                </button>
              </div>
              <div
                style={{
                  marginBottom: 10,
                  padding: 8,
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700 }}>선택된 색</span>
                <div style={{ display: "flex", gap: 6, minHeight: 24 }}>
                  {selectedColorHexes.length ? (
                    selectedColorHexes.map((hex) => (
                      <button
                        key={`selected-${hex}`}
                        type="button"
                        title={hex}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          border: "1px solid #888",
                          background: hex,
                        }}
                      />
                    ))
                  ) : (
                    <span style={{ fontSize: 12, opacity: 0.7 }}>없음</span>
                  )}
                </div>
                <span style={{ fontSize: 12, opacity: 0.8 }}>-&gt;</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>변경 색</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 24 }}>
                  {counts.map((item, index) => {
                    const hex = rgbToHex(item.rgb);
                    const isActive = hex === targetColorHex;
                    return (
                      <button
                        key={`target-${hex}-${index}`}
                        type="button"
                        onClick={() => setTargetColorHex(hex)}
                        title={hex}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          border: isActive ? "2px solid #222" : "1px solid #888",
                          background: hex,
                        }}
                      />
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={applySelectedColorChange}
                  disabled={!selectedForChangeKeySet.size || !targetColorHex}
                >
                  변경
                </button>
                <button
                  type="button"
                  onClick={undoLastGridChange}
                  disabled={!gridHistory.length}
                >
                  이전 단계
                </button>
                <button
                  type="button"
                  onClick={restoreOriginalGrid}
                  disabled={!originalGrid?.length}
                >
                  오리지널 도안
                </button>
              </div>
              <div
                style={{
                  marginBottom: 8,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setPaintTool("brush");
                    setPaintMode("add");
                  }}
                  style={{
                    minWidth: 32,
                    fontWeight: 700,
                    background:
                      paintTool === "brush" && paintMode === "add"
                        ? "#d7f6df"
                        : "transparent",
                    border: "1px solid #8fbf9f",
                    borderRadius: 4,
                  }}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaintTool("brush");
                    setPaintMode("remove");
                  }}
                  style={{
                    minWidth: 32,
                    fontWeight: 700,
                    background:
                      paintTool === "brush" && paintMode === "remove"
                        ? "#ffdede"
                        : "transparent",
                    border: "1px solid #d4a0a0",
                    borderRadius: 4,
                  }}
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => setPaintTool((prev) => (prev === "wand" ? "brush" : "wand"))}
                  style={{
                    minWidth: 56,
                    fontWeight: 700,
                    background: paintTool === "wand" ? "#fff2cc" : "transparent",
                    border: "1px solid #c8b36b",
                    borderRadius: 4,
                  }}
                >
                  마법봉
                </button>
                <span style={{ fontSize: 12, opacity: 0.9 }}>브러시 크기</span>
                <button
                  type="button"
                  onClick={() => setBrushSize((prev) => clampBrushSize(prev - 1))}
                  disabled={paintTool === "wand" || brushSize <= 1}
                >
                  -
                </button>
                <input
                  type="range"
                  min={1}
                  max={brushMax}
                  value={brushSize}
                  onChange={(e) => setBrushSize(clampBrushSize(parseInt(e.target.value, 10)))}
                  disabled={paintTool === "wand"}
                />
                <button
                  type="button"
                  onClick={() => setBrushSize((prev) => clampBrushSize(prev + 1))}
                  disabled={paintTool === "wand" || brushSize >= brushMax}
                >
                  +
                </button>
                <input
                  type="number"
                  min={1}
                  max={brushMax}
                  value={brushSize}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (Number.isNaN(value)) return;
                    setBrushSize(clampBrushSize(value));
                  }}
                  disabled={paintTool === "wand"}
                  style={{ width: 56 }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  width: previewWidth,
                  maxWidth: "100%",
                  gridTemplateColumns: `repeat(${grid[0]?.length || size}, 1fr)`,
                  border: "1px solid #ccc",
                  userSelect: "none",
                }}
                onMouseUp={() => setIsPainting(false)}
                onMouseLeave={() => setIsPainting(false)}
              >
                {grid.flat().map((cell, index) => {
                  const width = grid[0]?.length || size;
                  const x = index % width;
                  const y = Math.floor(index / width);
                  const cellKey = `${x},${y}`;
                  const hex = rgbToHex(cell.rgb);
                  const isSelected =
                    selectedBrickHexSet.has(hex) || selectedCellKeySet.has(cellKey);

                  return (
                    <div
                      key={index}
                      title={`${cell.name} ${hex}`}
                      onMouseDown={(event) => handlePreviewCellMouseDown(event, x, y)}
                      onMouseEnter={() => handlePreviewCellMouseEnter(x, y)}
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        backgroundColor: `rgb(${cell.rgb.join(",")})`,
                        backgroundImage: isSelected
                          ? "linear-gradient(rgba(255, 0, 0, 0.28), rgba(255, 0, 0, 0.28)), repeating-linear-gradient(0deg, rgba(255, 0, 0, 0.5) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(255, 0, 0, 0.5) 0 1px, transparent 1px 4px)"
                          : "none",
                        cursor: "pointer",
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <div>
              <h4 style={{ marginTop: 0 }}>변경사항 미리보기</h4>
              <div
                style={{
                  display: "grid",
                  width: previewWidth,
                  maxWidth: "100%",
                  gridTemplateColumns: `repeat(${grid[0]?.length || size}, 1fr)`,
                  border: "1px solid #ccc",
                  userSelect: "none",
                }}
              >
                {grid.flat().map((cell, index) => {
                  const width = grid[0]?.length || size;
                  const x = index % width;
                  const y = Math.floor(index / width);
                  const cellKey = `${x},${y}`;
                  const willChange =
                    Boolean(targetColorRgb) &&
                    selectedForChangeKeySet.has(cellKey) &&
                    rgbToHex(cell.rgb) !== targetColorHex;
                  const previewRgb = willChange ? targetColorRgb : cell.rgb;
                  const previewHex = rgbToHex(previewRgb);

                  return (
                    <div
                      key={`preview-${index}`}
                      title={`${cell.name} ${previewHex}`}
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        backgroundColor: `rgb(${previewRgb.join(",")})`,
                      }}
                    />
                  );
                })}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                선택 영역 + 변경 색을 고르면 여기서 적용 결과를 먼저 확인할 수 있어.
              </div>
            </div>
          </div>

          <RealSizePreviewModal
            isOpen={isRealSizePreviewOpen}
            onClose={closeRealSizePreview}
            modalRef={realSizeModalRef}
            viewportRef={realSizeViewportRef}
            onPanStart={handleRealSizePanStart}
            isFullscreen={isRealSizeFullscreen}
            isDragging={isRealSizeDragging}
            onToggleFullscreen={toggleRealSizeFullscreen}
            realSizeScalePercent={realSizeScalePercent}
            onChangeScalePercent={setRealSizeScalePercent}
            onResetScale={() => setRealSizeScalePercent(100)}
            realSizeModelWidthMm={realSizeModelWidthMm}
            realSizeModelHeightMm={realSizeModelHeightMm}
            realSizeBaseplateCols={realSizeBaseplateCols}
            realSizeBaseplateRows={realSizeBaseplateRows}
            realSizeBaseplateCount={realSizeBaseplateCount}
            grid={grid}
            size={size}
            realSizeGridWidthPx={realSizeGridWidthPx}
            realSizeGridHeightPx={realSizeGridHeightPx}
            realSizePitchPx={realSizePitchPx}
            realSizeBaseplateStepPx={realSizeBaseplateStepPx}
            realSizeBrickOuterDiameterPx={realSizeBrickOuterDiameterPx}
          />

          <h3>
            브릭 개수 <span style={{ fontSize: 14, fontWeight: 500 }}>(총 {totalBrickCount}개)</span>
          </h3>

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
