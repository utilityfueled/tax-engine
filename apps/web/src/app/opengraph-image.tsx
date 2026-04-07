import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Viva La Tax — Experimental Open-Source Tax Software";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#16191d",
          color: "#f7f6ef",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: 16,
            display: "flex",
          }}
        >
          Viva La Tax
        </div>
        <div
          style={{
            fontSize: 28,
            opacity: 0.7,
            display: "flex",
          }}
        >
          Experimental, open-source tax software
        </div>
        <div
          style={{
            fontSize: 20,
            opacity: 0.5,
            marginTop: 24,
            display: "flex",
          }}
        >
          Review everything before relying on it.
        </div>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 4,
            backgroundColor: "#1f6feb",
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
