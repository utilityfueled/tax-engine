import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#16191d",
          borderRadius: 32,
        }}
      >
        <div
          style={{
            fontSize: 120,
            fontWeight: 700,
            fontFamily: "monospace",
            color: "#f7f6ef",
            lineHeight: 1,
            display: "flex",
          }}
        >
          V
        </div>
      </div>
    ),
    { ...size }
  );
}
