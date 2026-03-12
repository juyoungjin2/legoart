function RealSizePreviewModal({
  isOpen,
  onClose,
  modalRef,
  viewportRef,
  onPanStart,
  isFullscreen,
  isDragging,
  onToggleFullscreen,
  realSizeScalePercent,
  onChangeScalePercent,
  onResetScale,
  realSizeModelWidthMm,
  realSizeModelHeightMm,
  realSizeBaseplateCols,
  realSizeBaseplateRows,
  realSizeBaseplateCount,
  grid,
  size,
  realSizeGridWidthPx,
  realSizeGridHeightPx,
  realSizePitchPx,
  realSizeBaseplateStepPx,
  realSizeBrickOuterDiameterPx,
}) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <div
        ref={modalRef}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: isFullscreen ? "100%" : "min(96vw, 1400px)",
          height: isFullscreen ? "100%" : "auto",
          maxHeight: isFullscreen ? "100%" : "94vh",
          background: "#fff",
          color: "#111",
          borderRadius: isFullscreen ? 0 : 8,
          boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid #ddd",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 700 }}>실제 크기 도안 미리보기</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onToggleFullscreen}>
              {isFullscreen ? "전체모드 해제" : "전체보기"}
            </button>
            <button type="button" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid #eee",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <span>배율</span>
          <input
            type="range"
            min={50}
            max={200}
            value={realSizeScalePercent}
            onChange={(event) => onChangeScalePercent(parseInt(event.target.value, 10))}
          />
          <span style={{ minWidth: 48 }}>{realSizeScalePercent}%</span>
          <button type="button" onClick={onResetScale}>
            100%
          </button>
          <span style={{ opacity: 0.8 }}>
            98138 + 65803 기준: 약 {realSizeModelWidthMm.toFixed(1)} x {" "}
            {realSizeModelHeightMm.toFixed(1)} mm ({realSizeBaseplateCols} x {" "}
            {realSizeBaseplateRows}장, 총 {realSizeBaseplateCount}장)
          </span>
        </div>
        <div
          ref={viewportRef}
          onMouseDown={onPanStart}
          style={{
            padding: 12,
            overflow: "auto",
            background: "#f6f6f6",
            cursor: isFullscreen ? (isDragging ? "grabbing" : "grab") : "default",
            userSelect: isFullscreen ? "none" : "auto",
          }}
        >
          <div
            style={{
              width: `${realSizeGridWidthPx}px`,
              height: `${realSizeGridHeightPx}px`,
              display: "grid",
              gridTemplateColumns: `repeat(${grid[0]?.length || size}, ${realSizePitchPx}px)`,
              backgroundColor: "#101010",
              backgroundImage:
                realSizeBaseplateStepPx > 0
                  ? `repeating-linear-gradient(90deg, transparent 0, transparent ${Math.max(
                      0,
                      realSizeBaseplateStepPx - 1
                    )}px, rgba(255,255,255,0.15) ${Math.max(
                      0,
                      realSizeBaseplateStepPx - 1
                    )}px, rgba(255,255,255,0.15) ${realSizeBaseplateStepPx}px), repeating-linear-gradient(0deg, transparent 0, transparent ${Math.max(
                      0,
                      realSizeBaseplateStepPx - 1
                    )}px, rgba(255,255,255,0.15) ${Math.max(
                      0,
                      realSizeBaseplateStepPx - 1
                    )}px, rgba(255,255,255,0.15) ${realSizeBaseplateStepPx}px)`
                  : "none",
              border: "1px solid #2a2a2a",
              borderRadius: 6,
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
              boxSizing: "content-box",
            }}
          >
            {grid.flat().map((cell, index) => (
              <div
                key={`real-size-${index}`}
                style={{
                  width: `${realSizePitchPx}px`,
                  height: `${realSizePitchPx}px`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: `${realSizeBrickOuterDiameterPx}px`,
                    height: `${realSizeBrickOuterDiameterPx}px`,
                    borderRadius: "50%",
                    backgroundColor: `rgb(${cell.rgb.join(",")})`,
                    boxShadow:
                      "inset -1px -1px 2px rgba(0,0,0,0.28), inset 1px 1px 2px rgba(255,255,255,0.24), 0 0.4px 1.2px rgba(0,0,0,0.35)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RealSizePreviewModal;
