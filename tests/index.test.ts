import { describe, expect, it } from "vitest";
import {
  buildNJ1040Input,
  calculateNJ1040,
  calculateNJ1040HW,
} from "@/index.js";
import {
  buildNJ1040Input as buildNJ1040InputDirect,
} from "@/engine/state/nj-1040-adapter.js";
import {
  calculateNJ1040 as calculateNJ1040Direct,
} from "@/engine/state/nj-1040.js";
import {
  calculateNJ1040HW as calculateNJ1040HWDirect,
} from "@/engine/state/nj-1040-hw.js";

describe("public API", () => {
  it("exports the NJ resident return engine, HW application, and adapter", () => {
    expect(calculateNJ1040).toBe(calculateNJ1040Direct);
    expect(calculateNJ1040HW).toBe(calculateNJ1040HWDirect);
    expect(buildNJ1040Input).toBe(buildNJ1040InputDirect);
  });
});
