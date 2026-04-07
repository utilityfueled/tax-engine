export default function Loading() {
  return (
    <div className="workspace-grid">
      <div
        className="panel"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-display-pixel), monospace",
            fontSize: "1.6rem",
            margin: 0,
            color: "var(--muted)"
          }}
        >
          Loading
          <span className="blink-cursor" />
        </p>
        <style>{`
          .blink-cursor::after {
            content: "_";
            animation: blink 1s step-end infinite;
          }
          @keyframes blink {
            50% { opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}
