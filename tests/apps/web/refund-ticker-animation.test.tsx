// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useAnimatedValue } from "@/components/refund-ticker";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(["1000", "-1000", "9007199254740993"])("bounds animation frames before the start and preserves exact target %s", async target => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let frame: FrameRequestCallback | undefined;
  let nextId = 0;
  vi.spyOn(performance, "now").mockReturnValue(1000);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return ++nextId; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  function Probe({ amount }: { amount: string }) { return <output>{useAnimatedValue(amount)}</output>; }
  async function renderFrame(now: number) {
    if (!frame) throw new Error("No animation frame scheduled");
    const callback = frame;
    frame = undefined;
    await act(async () => callback(now));
  }
  try {
    await act(async () => root.render(<Probe amount="0" />));
    await act(async () => root.render(<Probe amount={target} />));
    // A frame timestamp describes the start of the frame and can precede the effect.
    await renderFrame(999);
    expect(container.textContent).toBe("0");
    await renderFrame(1000);
    expect(container.textContent).toBe("0");
    await renderFrame(1600);
    expect(container.textContent).toBe(target);
    expect(frame).toBeUndefined();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("honors reduced motion without scheduling an amount animation", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  const requestFrame = vi.fn();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  function Probe({ amount }: { amount: string }) { return <output>{useAnimatedValue(amount)}</output>; }
  try {
    await act(async () => root.render(<Probe amount="0" />));
    await act(async () => root.render(<Probe amount="9007199254740993.01" />));
    expect(container.textContent).toBe("9007199254740993.01");
    expect(requestFrame).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});
