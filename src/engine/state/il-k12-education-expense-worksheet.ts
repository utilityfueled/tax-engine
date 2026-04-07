/**
 * Illinois Schedule ICR K-12 Education Expense Credit Worksheet
 * Spec: spec/state/il-k12-education-expense-worksheet.yaml
 *
 * Models the page-3 worksheet rows and totals Column G so Schedule ICR can
 * consume the same Line 15 amount the paper return requires.
 */

import Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { roundDollar } from "@/utils/decimal.js";

export type ILK12EducationExpenseSchoolType = "public" | "non_public" | "home_school";

export interface ILK12EducationExpenseStudent {
  studentName: string;
  studentSSN: string;
  grade: string;
  schoolName: string;
  schoolCity: string;
  schoolType: ILK12EducationExpenseSchoolType;
  tuitionBookLabFees: Decimal;
}

export interface ILK12EducationExpenseWorksheetInput {
  taxYear: number;
  students: ILK12EducationExpenseStudent[];
}

export interface ILK12EducationExpenseWorksheetResult {
  students: ILK12EducationExpenseStudent[];
  totalQualifiedEducationExpenses: Decimal;
  lines: CalculatedLine[];
}

const SUPPORTED_TAX_YEARS = new Set([2025]);

export function calculateILK12EducationExpenseWorksheet(
  input: ILK12EducationExpenseWorksheetInput,
): ILK12EducationExpenseWorksheetResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(`Illinois K-12 education expense worksheet is not supported for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const FORM = "Schedule ICR K-12 Worksheet";
  const normalizedStudents = input.students.map((student, index) => normalizeStudent(student, index));

  const totalQualifiedEducationExpenses = normalizedStudents.reduce(
    (sum, student) => sum.plus(student.tuitionBookLabFees),
    new Decimal(0),
  );
  const roundedQualifiedEducationExpenses = roundDollar(totalQualifiedEducationExpenses);

  normalizedStudents.forEach((student, index) => {
    audit.record(
      FORM,
      `14${toWorksheetSuffix(index)}`,
      `Qualifying student row ${index + 1}`,
      student.tuitionBookLabFees,
      "Worksheet Line 14 Column G tuition, book, and lab fees",
      {
        studentName: student.studentName,
        studentSSN: student.studentSSN,
        grade: student.grade,
        schoolName: student.schoolName,
        schoolCity: student.schoolCity,
        schoolType: student.schoolType,
        tuitionBookLabFees: student.tuitionBookLabFees,
      },
    );
  });

  audit.record(
    FORM,
    "15",
    "Total qualified education expenses",
    roundedQualifiedEducationExpenses,
    "Round the sum of Worksheet Line 14 Column G amounts to the nearest whole dollar",
    { studentCount: new Decimal(normalizedStudents.length) },
  );

  return {
    students: normalizedStudents,
    totalQualifiedEducationExpenses: roundedQualifiedEducationExpenses,
    lines: audit.getLines(),
  };
}

function normalizeStudent(
  student: ILK12EducationExpenseStudent,
  index: number,
): ILK12EducationExpenseStudent {
  const studentName = student.studentName.trim();
  if (studentName.length === 0) {
    throw new Error(`K-12 Worksheet student ${index + 1} name is required`);
  }

  const studentSSN = student.studentSSN.trim();
  if (studentSSN.length === 0) {
    throw new Error(`K-12 Worksheet student ${index + 1} SSN is required`);
  }

  const grade = normalizeGrade(student.grade);
  const schoolCity = student.schoolCity.trim();
  if (schoolCity.length === 0) {
    throw new Error(`K-12 Worksheet student ${index + 1} school city is required`);
  }

  const schoolName = normalizeSchoolName(student.schoolName, student.schoolType, index);
  if (student.tuitionBookLabFees.lessThan(0)) {
    throw new Error("K-12 Worksheet tuition, book, and lab fees cannot be negative");
  }

  return {
    studentName,
    studentSSN,
    grade,
    schoolName,
    schoolCity,
    schoolType: student.schoolType,
    tuitionBookLabFees: student.tuitionBookLabFees,
  };
}

function normalizeGrade(grade: string): string {
  const normalizedGrade = grade.trim().toUpperCase();
  if (normalizedGrade === "K") {
    return normalizedGrade;
  }

  if (!/^\d+$/.test(normalizedGrade)) {
    throw new Error("K-12 Worksheet student grade must be K or 1 through 12");
  }

  const numericGrade = Number(normalizedGrade);
  if (numericGrade < 1 || numericGrade > 12) {
    throw new Error("K-12 Worksheet student grade must be K or 1 through 12");
  }

  return String(numericGrade);
}

function normalizeSchoolName(
  schoolName: string,
  schoolType: ILK12EducationExpenseSchoolType,
  index: number,
): string {
  if (schoolType === "home_school") {
    return "home school";
  }

  const normalizedSchoolName = schoolName.trim();
  if (normalizedSchoolName.length === 0) {
    throw new Error(`K-12 Worksheet student ${index + 1} school name is required`);
  }

  return normalizedSchoolName;
}

function toWorksheetSuffix(index: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let current = index;
  let suffix = "";

  do {
    suffix = alphabet[current % alphabet.length] + suffix;
    current = Math.floor(current / alphabet.length) - 1;
  } while (current >= 0);

  return suffix;
}
