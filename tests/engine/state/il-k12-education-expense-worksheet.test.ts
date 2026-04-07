import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculateILK12EducationExpenseWorksheet,
  type ILK12EducationExpenseWorksheetInput,
} from "@/engine/state/il-k12-education-expense-worksheet.js";

const d = (value: number | string) => new Decimal(value);

function makeInput(
  overrides: Partial<ILK12EducationExpenseWorksheetInput> = {},
): ILK12EducationExpenseWorksheetInput {
  return {
    taxYear: 2025,
    students: [],
    ...overrides,
  };
}

describe("Illinois K-12 Education Expense Worksheet", () => {
  it("K-12 Worksheet Line 14 - preserves multiple qualifying student rows and sums their expenses", () => {
    const result = calculateILK12EducationExpenseWorksheet(makeInput({
      students: [
        {
          studentName: "Alex Rivera",
          studentSSN: "111-22-3333",
          grade: "5",
          schoolName: "Lincoln Elementary",
          schoolCity: "Springfield",
          schoolType: "public",
          tuitionBookLabFees: d(450.25),
        },
        {
          studentName: "Alex Rivera",
          studentSSN: "111-22-3333",
          grade: "5",
          schoolName: "St. Mark School",
          schoolCity: "Springfield",
          schoolType: "non_public",
          tuitionBookLabFees: d(349.75),
        },
      ],
    }));

    expect(result.students).toHaveLength(2);
    expect(result.totalQualifiedEducationExpenses.toNumber()).toBe(800);
  });

  it("K-12 Worksheet Line 15 - rounds the summed tuition, book, and lab fees to the nearest whole dollar", () => {
    const result = calculateILK12EducationExpenseWorksheet(makeInput({
      students: [
        {
          studentName: "Jordan Lee",
          studentSSN: "222-33-4444",
          grade: "K",
          schoolName: "home school",
          schoolCity: "Peoria",
          schoolType: "home_school",
          tuitionBookLabFees: d(125),
        },
        {
          studentName: "Morgan Lee",
          studentSSN: "333-44-5555",
          grade: "9",
          schoolName: "Peoria High",
          schoolCity: "Peoria",
          schoolType: "public",
          tuitionBookLabFees: d(275.5),
        },
      ],
    }));

    expect(result.totalQualifiedEducationExpenses.toNumber()).toBe(401);
    expect(result.lines.find((line) => line.line === "15")?.value.toNumber()).toBe(401);
  });

  it("rejects unsupported grades outside K-12", () => {
    expect(() =>
      calculateILK12EducationExpenseWorksheet(makeInput({
        students: [
          {
            studentName: "Pat Student",
            studentSSN: "444-55-6666",
            grade: "13",
            schoolName: "Lincoln High",
            schoolCity: "Decatur",
            schoolType: "public",
            tuitionBookLabFees: d(100),
          },
        ],
      })),
    ).toThrow("K-12 Worksheet student grade must be K or 1 through 12");
  });

  it("rejects negative qualifying expenses", () => {
    expect(() =>
      calculateILK12EducationExpenseWorksheet(makeInput({
        students: [
          {
            studentName: "Pat Student",
            studentSSN: "444-55-6666",
            grade: "2",
            schoolName: "Lincoln Elementary",
            schoolCity: "Decatur",
            schoolType: "public",
            tuitionBookLabFees: d(-1),
          },
        ],
      })),
    ).toThrow("K-12 Worksheet tuition, book, and lab fees cannot be negative");
  });
});
