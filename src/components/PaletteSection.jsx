function PaletteSection({
  title,
  colors,
  isMobile,
  rgbToHex,
  onToggleColor,
  onUpdateName,
  onUpdateRgb,
}) {
  if (!colors.length) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
        {colors.map((color) => (
          <div
            key={color.id}
            style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
          >
            <input
              type="checkbox"
              checked={color.enabled}
              onChange={() => onToggleColor(color.id)}
            />
            <input
              type="text"
              value={color.name}
              onChange={(event) => onUpdateName(color.id, event.target.value)}
              style={{ width: isMobile ? "100%" : 130, maxWidth: "100%" }}
            />
            <input
              type="color"
              value={rgbToHex(color.rgb)}
              onChange={(event) => onUpdateRgb(color.id, event.target.value)}
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
}

export default PaletteSection;
