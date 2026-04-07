/**
 * PDF filler for IRS Schedule E (Form 1040) — Supplemental Income and Loss.
 *
 * Field names from the official 2025 IRS fillable PDF.
 * Schedule E uses "topmostSubform[0]" as root.
 *
 * Sections:
 *   Page 1 — Part I: Income or Loss From Rental Real Estate and Royalties
 *     Header:       Name, SSN
 *     Lines 1a-1b:  Property descriptions and type codes (up to 3 properties A/B/C)
 *     Line 2:       Fair rental days, personal use days, QJV
 *     Lines 3-4:    Income (rents received, royalties)
 *     Lines 5-19:   Expenses per property
 *     Line 20:      Total expenses
 *     Line 21:      Net income/loss per property
 *     Lines 23-26:  Part I totals
 *
 *   Page 2 — Part II: Income or Loss From Partnerships and S Corporations
 *     Line 28:      Partnership/S-Corp rows (up to 4: A-D)
 *     Lines 29-32:  Part II totals
 *   Page 2 — Part V: Summary
 *     Line 41:      Total supplemental income/loss
 */

import { PDFDocument } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadBlankPdf,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "./pdf-utils.js";
import { d } from "@/utils/decimal.js";

// ─── PDF Field Name Helpers ────────────────────────────────────────────────

const p1 = (n: string) => `topmostSubform[0].Page1[0].${n}`;
const p2 = (n: string) => `topmostSubform[0].Page2[0].${n}`;

// Tables on Page 1
const tbl1a = (row: string, n: string) =>
  p1(`Table_Line1a[0].${row}.${n}`);
const tbl1b = (row: string, n: string) =>
  p1(`Table_Line1b[0].${row}.${n}`);
const tbl2 = (row: string, n: string) =>
  p1(`Table_Line2[0].${row}.${n}`);
const tblIncome = (line: string, n: string) =>
  p1(`Table_Income[0].${line}.${n}`);
const tblExp = (line: string, n: string) =>
  p1(`Table_Expenses[0].${line}.${n}`);

// Tables on Page 2
const tbl28af = (row: string, n: string) =>
  p2(`Table_Line28a-f[0].${row}.${n}`);
const tbl28gk = (row: string, n: string) =>
  p2(`Table_Line28g-k[0].${row}.${n}`);

// ─── Property Type Code Mapping ───────────────────────────────────────────
// IRS Schedule E property type codes (Line 1b)

const PROPERTY_TYPE_CODES: Record<string, string> = {
  single_family: "1",
  multi_family: "2",
  vacation: "3",
  commercial: "4",
  land: "5",
  other: "8",
};

// ─── Row identifiers ─────────────────────────────────────────────────────

const PROPERTY_ROWS = ["RowA[0]", "RowB[0]", "RowC[0]"] as const;
const PARTNERSHIP_ROWS = ["RowA[0]", "RowB[0]", "RowC[0]", "RowD[0]"] as const;

// ─── Field Mapping ─────────────────────────────────────────────────────────
// Verified against 2025 Schedule E fillable PDF field inspection.

const FIELDS = {
  // ── Page 1 Header ──
  name: p1("f1_1[0]"),
  ssn: p1("f1_2[0]"),

  // ── Line 1a/1b/2 checkboxes (1099 filing questions) ──
  payments1099Yes: p1("c1_1[0]"),
  payments1099No: p1("c1_1[1]"),
  filed1099Yes: p1("c1_2[0]"),
  filed1099No: p1("c1_2[1]"),

  // ── Table Line 1a: Property descriptions (A, B, C) ──
  propDescA: tbl1a("RowA[0]", "f1_3[0]"),
  propDescB: tbl1a("RowB[0]", "f1_4[0]"),
  propDescC: tbl1a("RowC[0]", "f1_5[0]"),

  // ── Table Line 1b: Property type codes (A, B, C) ──
  propTypeA: tbl1b("RowA[0]", "f1_6[0]"),
  propTypeB: tbl1b("RowB[0]", "f1_7[0]"),
  propTypeC: tbl1b("RowC[0]", "f1_8[0]"),

  // ── Table Line 2: Fair rental days / personal use days / QJV (A, B, C) ──
  rentalDaysA: tbl2("RowA[0]", "f1_9[0]"),
  personalDaysA: tbl2("RowA[0]", "f1_10[0]"),
  qjvA: tbl2("RowA[0]", "c1_3[0]"),
  rentalDaysB: tbl2("RowB[0]", "f1_11[0]"),
  personalDaysB: tbl2("RowB[0]", "f1_12[0]"),
  qjvB: tbl2("RowB[0]", "c1_4[0]"),
  rentalDaysC: tbl2("RowC[0]", "f1_13[0]"),
  personalDaysC: tbl2("RowC[0]", "f1_14[0]"),
  qjvC: tbl2("RowC[0]", "c1_5[0]"),

  // ── Income table: Line 3 (Rents) — columns A, B, C ──
  rentsA: tblIncome("Line3[0]", "f1_16[0]"),
  rentsB: tblIncome("Line3[0]", "f1_17[0]"),
  rentsC: tblIncome("Line3[0]", "f1_18[0]"),

  // ── Income table: Line 4 (Royalties) — columns A, B, C ──
  royaltiesA: tblIncome("Line4[0]", "f1_19[0]"),
  royaltiesB: tblIncome("Line4[0]", "f1_20[0]"),
  royaltiesC: tblIncome("Line4[0]", "f1_21[0]"),

  // ── Expense table: Lines 5-19, each with columns A, B, C ──
  // Line 5: Advertising
  advA: tblExp("Line5[0]", "f1_22[0]"),
  advB: tblExp("Line5[0]", "f1_23[0]"),
  advC: tblExp("Line5[0]", "f1_24[0]"),
  // Line 6: Auto and travel
  autoA: tblExp("Line6[0]", "f1_25[0]"),
  autoB: tblExp("Line6[0]", "f1_26[0]"),
  autoC: tblExp("Line6[0]", "f1_27[0]"),
  // Line 7: Cleaning and maintenance
  cleanA: tblExp("Line7[0]", "f1_28[0]"),
  cleanB: tblExp("Line7[0]", "f1_29[0]"),
  cleanC: tblExp("Line7[0]", "f1_30[0]"),
  // Line 8: Commissions
  commA: tblExp("Line8[0]", "f1_31[0]"),
  commB: tblExp("Line8[0]", "f1_32[0]"),
  commC: tblExp("Line8[0]", "f1_33[0]"),
  // Line 9: Insurance
  insA: tblExp("Line9[0]", "f1_34[0]"),
  insB: tblExp("Line9[0]", "f1_35[0]"),
  insC: tblExp("Line9[0]", "f1_36[0]"),
  // Line 10: Legal and professional fees
  legalA: tblExp("Line10[0]", "f1_37[0]"),
  legalB: tblExp("Line10[0]", "f1_38[0]"),
  legalC: tblExp("Line10[0]", "f1_39[0]"),
  // Line 11: Management fees
  mgmtA: tblExp("Line11[0]", "f1_40[0]"),
  mgmtB: tblExp("Line11[0]", "f1_41[0]"),
  mgmtC: tblExp("Line11[0]", "f1_42[0]"),
  // Line 12: Mortgage interest paid to financial institutions
  mortA: tblExp("Line12[0]", "f1_43[0]"),
  mortB: tblExp("Line12[0]", "f1_44[0]"),
  mortC: tblExp("Line12[0]", "f1_45[0]"),
  // Line 13: Other interest
  otherIntA: tblExp("Line13[0]", "f1_46[0]"),
  otherIntB: tblExp("Line13[0]", "f1_47[0]"),
  otherIntC: tblExp("Line13[0]", "f1_48[0]"),
  // Line 14: Repairs
  repairsA: tblExp("Line14[0]", "f1_49[0]"),
  repairsB: tblExp("Line14[0]", "f1_50[0]"),
  repairsC: tblExp("Line14[0]", "f1_51[0]"),
  // Line 15: Supplies
  suppliesA: tblExp("Line15[0]", "f1_52[0]"),
  suppliesB: tblExp("Line15[0]", "f1_53[0]"),
  suppliesC: tblExp("Line15[0]", "f1_54[0]"),
  // Line 16: Taxes
  taxesA: tblExp("Line16[0]", "f1_55[0]"),
  taxesB: tblExp("Line16[0]", "f1_56[0]"),
  taxesC: tblExp("Line16[0]", "f1_57[0]"),
  // Line 17: Utilities
  utilA: tblExp("Line17[0]", "f1_58[0]"),
  utilB: tblExp("Line17[0]", "f1_59[0]"),
  utilC: tblExp("Line17[0]", "f1_60[0]"),
  // Line 18: Depreciation expense or depletion
  deprA: tblExp("Line18[0]", "f1_61[0]"),
  deprB: tblExp("Line18[0]", "f1_62[0]"),
  deprC: tblExp("Line18[0]", "f1_63[0]"),
  // Line 19: Other (specify)
  otherA: tblExp("Line19[0]", "f1_64[0]"),
  otherB: tblExp("Line19[0]", "f1_65[0]"),
  otherC: tblExp("Line19[0]", "f1_66[0]"),

  // Line 20: Total expenses
  totalExpA: tblExp("Line20[0]", "f1_68[0]"),
  totalExpB: tblExp("Line20[0]", "f1_69[0]"),
  totalExpC: tblExp("Line20[0]", "f1_70[0]"),

  // Line 21: Subtract line 20 from line 3 (rents) or line 4 (royalties)
  netA: tblExp("Line21[0]", "f1_71[0]"),
  netB: tblExp("Line21[0]", "f1_72[0]"),
  netC: tblExp("Line21[0]", "f1_73[0]"),

  // ── Part I Totals (Lines 23-26) ──
  line23a: p1("f1_77[0]"),  // Total income (positive Line 21s)
  line23b: p1("f1_78[0]"),  // Total losses (negative Line 21s)
  line23c: p1("f1_79[0]"),  // Combined 23a + 23b
  line23d: p1("f1_80[0]"),  // Net income from Form 4835 (farm rental)
  line23e: p1("f1_81[0]"),  // Net farm rental from K-1
  line24: p1("f1_82[0]"),   // Income: 23a + 23d
  line25: p1("f1_83[0]"),   // Losses: 23b + 23e (after Form 8582)
  line26: p1("f1_84[0]"),   // Total rental real estate and royalty income/loss

  // ═══════════════════════════════════════════════════════
  // Page 2
  // ═══════════════════════════════════════════════════════

  // ── Header ──
  namePg2: p2("f2_1[0]"),
  ssnPg2: p2("f2_2[0]"),

  // ── Part II: Partnerships/S-Corps Line 28 (rows A-D) ──
  // Table_Line28a-f columns: (a) Name, (b) P/S type (maxLen=1),
  //   (c) Foreign checkbox, (d) EIN (maxLen=10), (e) at-risk checkbox, (f) checkbox
  partNameA: tbl28af("RowA[0]", "f2_3[0]"),
  partTypeA: tbl28af("RowA[0]", "f2_4[0]"),      // "P" or "S" (maxLen=1)
  partForeignA: tbl28af("RowA[0]", "c2_2[0]"),
  partEinA: tbl28af("RowA[0]", "f2_5[0]"),        // EIN with dash (maxLen=10)
  partCheckA1: tbl28af("RowA[0]", "c2_3[0]"),
  partCheckA2: tbl28af("RowA[0]", "c2_4[0]"),

  partNameB: tbl28af("RowB[0]", "f2_6[0]"),
  partTypeB: tbl28af("RowB[0]", "f2_7[0]"),
  partForeignB: tbl28af("RowB[0]", "c2_5[0]"),
  partEinB: tbl28af("RowB[0]", "f2_8[0]"),
  partCheckB1: tbl28af("RowB[0]", "c2_6[0]"),
  partCheckB2: tbl28af("RowB[0]", "c2_7[0]"),

  partNameC: tbl28af("RowC[0]", "f2_9[0]"),
  partTypeC: tbl28af("RowC[0]", "f2_10[0]"),
  partForeignC: tbl28af("RowC[0]", "c2_8[0]"),
  partEinC: tbl28af("RowC[0]", "f2_11[0]"),
  partCheckC1: tbl28af("RowC[0]", "c2_9[0]"),
  partCheckC2: tbl28af("RowC[0]", "c2_10[0]"),

  partNameD: tbl28af("RowD[0]", "f2_12[0]"),
  partTypeD: tbl28af("RowD[0]", "f2_13[0]"),
  partForeignD: tbl28af("RowD[0]", "c2_11[0]"),
  partEinD: tbl28af("RowD[0]", "f2_14[0]"),
  partCheckD1: tbl28af("RowD[0]", "c2_12[0]"),
  partCheckD2: tbl28af("RowD[0]", "c2_13[0]"),

  // Table_Line28g-k: 5 amount columns per row
  //   (f) Passive loss allowed, (g) Passive income, (h) Nonpassive loss,
  //   (i) Section 179, (j) Nonpassive income
  partCol_A_f: tbl28gk("RowA[0]", "f2_15[0]"),
  partCol_A_g: tbl28gk("RowA[0]", "f2_16[0]"),
  partCol_A_h: tbl28gk("RowA[0]", "f2_17[0]"),
  partCol_A_i: tbl28gk("RowA[0]", "f2_18[0]"),
  partCol_A_j: tbl28gk("RowA[0]", "f2_19[0]"),

  partCol_B_f: tbl28gk("RowB[0]", "f2_20[0]"),
  partCol_B_g: tbl28gk("RowB[0]", "f2_21[0]"),
  partCol_B_h: tbl28gk("RowB[0]", "f2_22[0]"),
  partCol_B_i: tbl28gk("RowB[0]", "f2_23[0]"),
  partCol_B_j: tbl28gk("RowB[0]", "f2_24[0]"),

  partCol_C_f: tbl28gk("RowC[0]", "f2_25[0]"),
  partCol_C_g: tbl28gk("RowC[0]", "f2_26[0]"),
  partCol_C_h: tbl28gk("RowC[0]", "f2_27[0]"),
  partCol_C_i: tbl28gk("RowC[0]", "f2_28[0]"),
  partCol_C_j: tbl28gk("RowC[0]", "f2_29[0]"),

  partCol_D_f: tbl28gk("RowD[0]", "f2_30[0]"),
  partCol_D_g: tbl28gk("RowD[0]", "f2_31[0]"),
  partCol_D_h: tbl28gk("RowD[0]", "f2_32[0]"),
  partCol_D_i: tbl28gk("RowD[0]", "f2_33[0]"),
  partCol_D_j: tbl28gk("RowD[0]", "f2_34[0]"),

  // ── Part II Totals (Lines 29-32) ──
  line29a: p2("f2_35[0]"),  // Passive income total
  line29b: p2("f2_36[0]"),  // Passive loss total
  line30a: p2("f2_37[0]"),  // Nonpassive income total
  line30b: p2("f2_38[0]"),  // Nonpassive loss total
  line31: p2("f2_39[0]"),   // Total partnership income/loss
  line32: p2("f2_40[0]"),   // Total Part II

  // ── Part V: Summary (bottom of Page 2) ──
  line41: p2("Line42_ReadOrder[0].f2_79[0]"),  // Total supplemental income/loss
} as const;

// ─── Per-property expense field arrays (indexed by property 0=A, 1=B, 2=C) ──

interface PropertyExpenseFields {
  advertising: string;
  autoTravel: string;
  cleaning: string;
  commissions: string;
  insurance: string;
  legalProfessional: string;
  managementFees: string;
  mortgageInterest: string;
  otherInterest: string;
  repairs: string;
  supplies: string;
  taxes: string;
  utilities: string;
  depreciation: string;
  otherExpenses: string;
  totalExpenses: string;
  net: string;
  rents: string;
  description: string;
  typeCode: string;
  rentalDays: string;
  personalDays: string;
}

const PROPERTY_EXPENSE_FIELDS: PropertyExpenseFields[] = [
  // Property A
  {
    description: FIELDS.propDescA,
    typeCode: FIELDS.propTypeA,
    rentalDays: FIELDS.rentalDaysA,
    personalDays: FIELDS.personalDaysA,
    rents: FIELDS.rentsA,
    advertising: FIELDS.advA,
    autoTravel: FIELDS.autoA,
    cleaning: FIELDS.cleanA,
    commissions: FIELDS.commA,
    insurance: FIELDS.insA,
    legalProfessional: FIELDS.legalA,
    managementFees: FIELDS.mgmtA,
    mortgageInterest: FIELDS.mortA,
    otherInterest: FIELDS.otherIntA,
    repairs: FIELDS.repairsA,
    supplies: FIELDS.suppliesA,
    taxes: FIELDS.taxesA,
    utilities: FIELDS.utilA,
    depreciation: FIELDS.deprA,
    otherExpenses: FIELDS.otherA,
    totalExpenses: FIELDS.totalExpA,
    net: FIELDS.netA,
  },
  // Property B
  {
    description: FIELDS.propDescB,
    typeCode: FIELDS.propTypeB,
    rentalDays: FIELDS.rentalDaysB,
    personalDays: FIELDS.personalDaysB,
    rents: FIELDS.rentsB,
    advertising: FIELDS.advB,
    autoTravel: FIELDS.autoB,
    cleaning: FIELDS.cleanB,
    commissions: FIELDS.commB,
    insurance: FIELDS.insB,
    legalProfessional: FIELDS.legalB,
    managementFees: FIELDS.mgmtB,
    mortgageInterest: FIELDS.mortB,
    otherInterest: FIELDS.otherIntB,
    repairs: FIELDS.repairsB,
    supplies: FIELDS.suppliesB,
    taxes: FIELDS.taxesB,
    utilities: FIELDS.utilB,
    depreciation: FIELDS.deprB,
    otherExpenses: FIELDS.otherB,
    totalExpenses: FIELDS.totalExpB,
    net: FIELDS.netB,
  },
  // Property C
  {
    description: FIELDS.propDescC,
    typeCode: FIELDS.propTypeC,
    rentalDays: FIELDS.rentalDaysC,
    personalDays: FIELDS.personalDaysC,
    rents: FIELDS.rentsC,
    advertising: FIELDS.advC,
    autoTravel: FIELDS.autoC,
    cleaning: FIELDS.cleanC,
    commissions: FIELDS.commC,
    insurance: FIELDS.insC,
    legalProfessional: FIELDS.legalC,
    managementFees: FIELDS.mgmtC,
    mortgageInterest: FIELDS.mortC,
    otherInterest: FIELDS.otherIntC,
    repairs: FIELDS.repairsC,
    supplies: FIELDS.suppliesC,
    taxes: FIELDS.taxesC,
    utilities: FIELDS.utilC,
    depreciation: FIELDS.deprC,
    otherExpenses: FIELDS.otherC,
    totalExpenses: FIELDS.totalExpC,
    net: FIELDS.netC,
  },
];

// ─── Per-partnership field arrays ──────────────────────────────────────────

interface PartnershipFieldSet {
  name: string;
  entityType: string; // "P" or "S" (maxLen=1)
  foreign: string;
  ein: string;       // EIN with dash (maxLen=10)
  check1: string;    // At-risk / passive checkbox
  check2: string;    // Second checkbox
  colF: string;      // Passive loss allowed (from Form 8582)
  colG: string;      // Passive income from K-1
  colH: string;      // Nonpassive loss
  colI: string;      // Section 179
  colJ: string;      // Nonpassive income
}

const PARTNERSHIP_FIELD_SETS: PartnershipFieldSet[] = [
  {
    name: FIELDS.partNameA, entityType: FIELDS.partTypeA,
    foreign: FIELDS.partForeignA, ein: FIELDS.partEinA,
    check1: FIELDS.partCheckA1, check2: FIELDS.partCheckA2,
    colF: FIELDS.partCol_A_f, colG: FIELDS.partCol_A_g,
    colH: FIELDS.partCol_A_h, colI: FIELDS.partCol_A_i, colJ: FIELDS.partCol_A_j,
  },
  {
    name: FIELDS.partNameB, entityType: FIELDS.partTypeB,
    foreign: FIELDS.partForeignB, ein: FIELDS.partEinB,
    check1: FIELDS.partCheckB1, check2: FIELDS.partCheckB2,
    colF: FIELDS.partCol_B_f, colG: FIELDS.partCol_B_g,
    colH: FIELDS.partCol_B_h, colI: FIELDS.partCol_B_i, colJ: FIELDS.partCol_B_j,
  },
  {
    name: FIELDS.partNameC, entityType: FIELDS.partTypeC,
    foreign: FIELDS.partForeignC, ein: FIELDS.partEinC,
    check1: FIELDS.partCheckC1, check2: FIELDS.partCheckC2,
    colF: FIELDS.partCol_C_f, colG: FIELDS.partCol_C_g,
    colH: FIELDS.partCol_C_h, colI: FIELDS.partCol_C_i, colJ: FIELDS.partCol_C_j,
  },
  {
    name: FIELDS.partNameD, entityType: FIELDS.partTypeD,
    foreign: FIELDS.partForeignD, ein: FIELDS.partEinD,
    check1: FIELDS.partCheckD1, check2: FIELDS.partCheckD2,
    colF: FIELDS.partCol_D_f, colG: FIELDS.partCol_D_g,
    colH: FIELDS.partCol_D_h, colI: FIELDS.partCol_D_i, colJ: FIELDS.partCol_D_j,
  },
];

// ─── Fill Logic ────────────────────────────────────────────────────────────

/**
 * Fill IRS Schedule E PDF from engine calculation results.
 * Returns the filled PDFDocument (caller saves it).
 */
export async function fillScheduleE(
  input: TaxYearInput,
  result: TaxReturnResult,
  blankPdfPath: string,
): Promise<PDFDocument> {
  const doc = await loadBlankPdf(blankPdfPath);
  const form = doc.getForm();
  const se = result.scheduleE;

  // ── Header (Page 1) ──
  const name = input.taxpayer.spouse
    ? `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`
    : `${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  const ssn = input.taxpayer.primary.ssn.replace(/-/g, "");
  setTextField(form, FIELDS.name, name);
  setTextField(form, FIELDS.ssn, ssn);

  // ── Header (Page 2) ──
  setTextField(form, FIELDS.namePg2, name);
  setTextField(form, FIELDS.ssnPg2, ssn);

  if (!se) return doc;

  // ═══════════════════════════════════════════════════════════
  // Part I: Rental Real Estate and Royalties (Page 1)
  // ═══════════════════════════════════════════════════════════

  const rentals = input.rentalProperties ?? [];
  const rentalResults = se.rentalProperties;

  // Fill up to 3 properties (A, B, C) — IRS form supports 3 per page
  const propCount = Math.min(rentalResults.length, 3);
  for (let i = 0; i < propCount; i++) {
    const propInput = rentals[i];
    const propResult = rentalResults[i];
    const fields = PROPERTY_EXPENSE_FIELDS[i];

    // Line 1a: Property description
    setTextField(form, fields.description, propResult.description);

    // Line 1b: Property type code
    setTextField(form, fields.typeCode, PROPERTY_TYPE_CODES[propResult.propertyType] ?? "8");

    // Line 2: Fair rental days and personal use days
    if (propInput) {
      const rentalDays = propInput.rentalDays ?? 365;
      const personalDays = propInput.personalUseDays ?? 0;
      setTextField(form, fields.rentalDays, String(rentalDays));
      if (personalDays > 0) {
        setTextField(form, fields.personalDays, String(personalDays));
      }
    }

    // Line 3: Rents received
    setCurrencyField(form, fields.rents, propResult.rents);

    // Lines 5-19: Individual expense categories (from input, with ownership applied)
    if (propInput) {
      const ownershipPct = propInput.ownershipPercentage
        ? d(propInput.ownershipPercentage).dividedBy(100)
        : new Decimal(1);

      const applyOwnership = (val: string | number | undefined): Decimal =>
        d(val).times(ownershipPct);

      setCurrencyField(form, fields.advertising, applyOwnership(propInput.advertising));
      setCurrencyField(form, fields.autoTravel, applyOwnership(propInput.autoTravel));
      setCurrencyField(form, fields.cleaning, applyOwnership(propInput.cleaning));
      setCurrencyField(form, fields.commissions, applyOwnership(propInput.commissions));
      setCurrencyField(form, fields.insurance, applyOwnership(propInput.insurance));
      setCurrencyField(form, fields.legalProfessional, applyOwnership(propInput.legalProfessional));
      setCurrencyField(form, fields.managementFees, applyOwnership(propInput.managementFees));
      setCurrencyField(form, fields.mortgageInterest, applyOwnership(propInput.mortgageInterest));
      setCurrencyField(form, fields.otherInterest, applyOwnership(propInput.otherInterest));
      setCurrencyField(form, fields.repairs, applyOwnership(propInput.repairs));
      setCurrencyField(form, fields.supplies, applyOwnership(propInput.supplies));
      setCurrencyField(form, fields.taxes, applyOwnership(propInput.taxes));
      setCurrencyField(form, fields.utilities, applyOwnership(propInput.utilities));
      setCurrencyField(form, fields.depreciation, applyOwnership(propInput.depreciation));
      setCurrencyField(form, fields.otherExpenses, applyOwnership(propInput.otherExpenses));
    }

    // Line 20: Total expenses (from engine result)
    setCurrencyField(form, fields.totalExpenses, propResult.totalExpenses);

    // Line 21: Net rental income or loss
    setCurrencyField(form, fields.net, propResult.netRentalIncome);
  }

  // ── Part I Totals (Lines 23-26) ──
  const totalIncome = rentalResults
    .filter(p => p.netRentalIncome.greaterThan(0))
    .reduce((acc, p) => acc.plus(p.netRentalIncome), new Decimal(0));
  const totalLosses = rentalResults
    .filter(p => p.netRentalIncome.lessThan(0))
    .reduce((acc, p) => acc.plus(p.netRentalIncome), new Decimal(0));

  setCurrencyField(form, FIELDS.line23a, totalIncome);
  setCurrencyField(form, FIELDS.line23b, totalLosses);
  // Line 23c: combined
  const line23c = totalIncome.plus(totalLosses);
  setCurrencyField(form, FIELDS.line23c, line23c);

  // Lines 23d, 23e: Farm rental (not supported — leave blank)

  // Line 24: Income (23a + 23d = just 23a for now)
  setCurrencyField(form, FIELDS.line24, totalIncome);
  // Line 25: Losses (23b + 23e, after Form 8582 = just 23b for now)
  setCurrencyField(form, FIELDS.line25, totalLosses);
  // Line 26: Total rental real estate and royalty income/loss
  setCurrencyField(form, FIELDS.line26, se.totalRentalIncome);

  // ═══════════════════════════════════════════════════════════
  // Part II: Partnerships and S Corporations (Page 2)
  // ═══════════════════════════════════════════════════════════

  const partnerships = se.partnerships;
  const k1s = input.scheduleK1 ?? [];
  const partCount = Math.min(partnerships.length, 4);

  for (let i = 0; i < partCount; i++) {
    const p = partnerships[i];
    const k1 = k1s[i];
    const flds = PARTNERSHIP_FIELD_SETS[i];

    // Column (a): Name
    setTextField(form, flds.name, p.name);

    // Column (b): Entity type — "P" for partnership, "S" for S corporation
    const entityType = k1?.entityType === "s_corporation" ? "S" : "P";
    setTextField(form, flds.entityType, entityType);

    // Column (d): EIN (keep dashes — field maxLen=10 matches "XX-XXXXXXX")
    setTextField(form, flds.ein, p.ein);

    // Column (f): Passive loss allowed (from Form 8582, if passive with loss)
    if (p.isPassive && p.passiveLoss.isNegative()) {
      setCurrencyField(form, flds.colF, p.passiveLoss);
    }

    // Column (g): Passive income (from K-1)
    if (p.passiveIncome.greaterThan(0)) {
      setCurrencyField(form, flds.colG, p.passiveIncome);
    }

    // Column (h): Nonpassive loss
    if (p.nonpassiveLoss.isNegative()) {
      setCurrencyField(form, flds.colH, p.nonpassiveLoss);
    }

    // Column (j): Nonpassive income
    if (p.nonpassiveIncome.greaterThan(0)) {
      setCurrencyField(form, flds.colJ, p.nonpassiveIncome);
    }
  }

  // ── Part II Totals (Lines 29-32) ──
  setCurrencyField(form, FIELDS.line29a, se.totalPassiveIncome);
  setCurrencyField(form, FIELDS.line29b, se.totalPassiveLoss);
  setCurrencyField(form, FIELDS.line30a, se.totalNonpassiveIncome);
  setCurrencyField(form, FIELDS.line30b, se.totalNonpassiveLoss);
  setCurrencyField(form, FIELDS.line31, se.totalPartnershipIncome);
  setCurrencyField(form, FIELDS.line32, se.totalPartnershipIncome);

  // ═══════════════════════════════════════════════════════════
  // Part V: Summary
  // ═══════════════════════════════════════════════════════════

  setCurrencyField(form, FIELDS.line41, se.totalSupplementalIncome);

  return doc;
}

/** Exported field map for testing and inspection. */
export { FIELDS as SCHEDULE_E_FIELDS };
