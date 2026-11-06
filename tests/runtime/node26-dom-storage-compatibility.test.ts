// @vitest-environment jsdom
// Spec: spec/federal/node26-dom-storage-compatibility.yaml
import { afterEach, expect, it } from "vitest";
import {
  clearGuidedFlowState,
  emptyCreditsData,
  initialFlowState,
  loadGuidedFlowState,
  saveGuidedFlowState,
} from "@/lib/guided-interview-flow";

// Vitest documents this original jsdom instance as an environment global.
// Declare its used public surface without replacing any implementation.
interface OriginalDomWindow {
  localStorage: Storage;
  sessionStorage: Storage;
  close(): void;
}
interface OriginalDomInstance {
  window: OriginalDomWindow;
  constructor: new (html: string, options: { url: string }) => OriginalDomInstance;
}
declare const jsdom: OriginalDomInstance;

const key = "fictional-node26-dom-storage";
const workspace = "fictional-node26-guided-storage";

afterEach(() => {
  // Use original DOM storage for cleanup so a failed global-binding assertion
  // remains visible instead of being replaced by another cleanup failure.
  jsdom.window.localStorage.removeItem(key);
  jsdom.window.sessionStorage.removeItem(key);
  clearGuidedFlowState(jsdom.window.localStorage, workspace);
});

it("uses the actual DOM window local storage", () => {
  expect(globalThis.localStorage).toBe(jsdom.window.localStorage);
});

it("uses the actual DOM window session storage", () => {
  expect(globalThis.sessionStorage).toBe(jsdom.window.sessionStorage);
});

it("retains local values across independent same-window calls", () => {
  const write = (value: string) => localStorage.setItem(key, value);
  const read = () => localStorage.getItem(key);
  write("actual-source-1");
  expect(read()).toBe("actual-source-1");
  write("0");
  expect(read()).toBe("0");
  localStorage.removeItem(key);
  expect(read()).toBeNull();
});

it("keeps same-window session values separate from local values", () => {
  localStorage.setItem(key, "local-source");
  sessionStorage.setItem(key, "session-source");
  expect(localStorage.getItem(key)).toBe("local-source");
  expect(sessionStorage.getItem(key)).toBe("session-source");
  sessionStorage.removeItem(key);
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(localStorage.getItem(key)).toBe("local-source");
});

it("isolates independently constructed same-origin DOM windows", () => {
  const separate = new jsdom.constructor("", { url: location.href });
  try {
    jsdom.window.localStorage.setItem(key, "first-local");
    jsdom.window.sessionStorage.setItem(key, "first-session");
    expect(separate.window.localStorage).not.toBe(jsdom.window.localStorage);
    expect(separate.window.sessionStorage).not.toBe(jsdom.window.sessionStorage);
    expect(separate.window.localStorage.getItem(key)).toBeNull();
    expect(separate.window.sessionStorage.getItem(key)).toBeNull();
    separate.window.localStorage.setItem(key, "second-local");
    separate.window.sessionStorage.setItem(key, "second-session");
    expect(jsdom.window.localStorage.getItem(key)).toBe("first-local");
    expect(jsdom.window.sessionStorage.getItem(key)).toBe("first-session");
    expect(separate.window.localStorage.getItem(key)).toBe("second-local");
    expect(separate.window.sessionStorage.getItem(key)).toBe("second-session");
  } finally {
    separate.window.close();
  }
});

it("reopens guided sources with unknown and known-zero values intact", () => {
  const original = structuredClone(initialFlowState);
  original.taxYear = 2025;
  original.phase = "interview";
  original.sectionData.credits = structuredClone(emptyCreditsData);
  original.sectionData.credits.dependentCare = {
    expenses: "0",
    qualifyingIndividuals: "",
    eligibilityConfirmed: null,
    sourceFactsConfirmed: null,
    receivedBenefits: false,
    providers: [],
    qualifyingPersons: [],
  };
  const before = structuredClone(original);
  saveGuidedFlowState(localStorage, workspace, original);
  const loaded = loadGuidedFlowState(localStorage, workspace);
  expect(loaded).not.toBeNull();
  if (!loaded) throw new Error("Existing public storage API did not retain the current guided source");
  expect(loaded.taxYear).toBe(2025);
  expect(loaded.sectionData.credits?.dependentCare).toEqual({
    expenses: "0",
    qualifyingIndividuals: "",
    eligibilityConfirmed: null,
    sourceFactsConfirmed: null,
    receivedBenefits: false,
    providers: [],
    qualifyingPersons: [],
  });
  expect(original).toEqual(before);
});

it("opens a fresh DOM window without a closed windows saved sentinel", () => {
  const closed = new jsdom.constructor("", { url: location.href });
  try {
    closed.window.localStorage.setItem(key, "retained-only-by-closed-window");
    closed.window.sessionStorage.setItem(key, "retained-only-by-closed-session");
    expect(closed.window.localStorage.getItem(key)).toBe("retained-only-by-closed-window");
    expect(closed.window.sessionStorage.getItem(key)).toBe("retained-only-by-closed-session");
  } finally {
    closed.window.close();
  }
  const fresh = new jsdom.constructor("", { url: location.href });
  try {
    expect(fresh.window.localStorage.getItem(key)).toBeNull();
    expect(fresh.window.sessionStorage.getItem(key)).toBeNull();
  } finally {
    fresh.window.close();
  }
});
