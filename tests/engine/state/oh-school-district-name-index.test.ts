import { describe, expect, it } from "vitest";
import { OHIO_SCHOOL_DISTRICT_NAMES } from "@/engine/state/oh-school-district-name-index.js";

describe("Ohio school district name index", () => {
  it("Ohio school district name index preserves official zero-padded district names from the Finder list", () => {
    expect(OHIO_SCHOOL_DISTRICT_NAMES["0101"]).toBe("ADAMS COUNTY/OHIO VALLEY LSD");
    expect(OHIO_SCHOOL_DISTRICT_NAMES["2501"]).toBe("BEXLEY CSD (TRADITIONAL)");
    expect(OHIO_SCHOOL_DISTRICT_NAMES["3101"]).toBe("CINCINNATI PSD");

    expect(
      Object.keys(OHIO_SCHOOL_DISTRICT_NAMES).every((districtNumber) => /^\d{4}$/.test(districtNumber)),
    ).toBe(true);
  });

  it("Ohio school district name index keeps official traditional and earned-income suffixes", () => {
    expect(OHIO_SCHOOL_DISTRICT_NAMES["0404"]).toBe("GENEVA AREA CSD (EARNED INCOME)");
    expect(OHIO_SCHOOL_DISTRICT_NAMES["2501"]).toBe("BEXLEY CSD (TRADITIONAL)");
  });
});
