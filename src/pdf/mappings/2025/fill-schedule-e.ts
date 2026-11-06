import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
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

import { PDFDocument, StandardFonts } from "pdf-lib";
import Decimal from "decimal.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  loadReviewTemplate,
  setTextField,
  setCurrencyField,
  setCheckBox,
} from "../../pdf-utils.js";
import { d, sum, roundDollar, zeroFloor } from "@/utils/decimal.js";
import { requiresScheduleEReview, scheduleEReviewSourceDetails, type PreparedScheduleEReview, type ScheduleEPassiveDistributionSource, type ScheduleEPassiveCapitalSource } from "../../schedule-e-review-context.js";

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

  lossA: tblExp("Line22[0]", "f1_74[0]"),
  lossB: tblExp("Line22[0]", "f1_75[0]"),
  lossC: tblExp("Line22[0]", "f1_76[0]"),
  // Actual printed identities, independently inspected against final2025.
  line23a: p1("f1_77[0]"), // Gross rents, line3.
  line23b: p1("f1_78[0]"), // Gross royalties, line4.
  line23c: p1("f1_79[0]"), // Mortgage interest, line12.
  line23d: p1("f1_80[0]"), // Depreciation/depletion, line18.
  line23e: p1("f1_81[0]"), // Total expenses, line20.
  line24: p1("f1_82[0]"),  // Positive property income, line21.
  line25: p1("f1_83[0]"),  // Allowed losses, positive magnitude.
  line26: p1("f1_84[0]"),

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
  // Historical key suffixes f-j refer to actual printed columns g-k respectively.
  //   Printed(g) passive loss, (h) passive income, (i) nonpassive loss,
  //   (j) Section179, (k) nonpassive income.
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

  // 29a has two income cells;29b has three loss/179 cells. Shaded cells stay blank.
  line29a_h: p2("f2_36[0]"),
  line29a_k: p2("f2_39[0]"),
  line29b_g: p2("f2_40[0]"),
  line29b_i: p2("f2_42[0]"),
  line29b_j: p2("f2_43[0]"),
  line30: p2("f2_45[0]"),
  line31: p2("f2_46[0]"),
  line32: p2("f2_47[0]"),
  line41: p2("f2_78[0]"),
  line42: p2("Line42_ReadOrder[0].f2_79[0]"),
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
  royalties: string;
  allowedLoss: string;
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
    royalties: FIELDS.royaltiesA,
    allowedLoss: FIELDS.lossA,
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
    royalties: FIELDS.royaltiesB,
    allowedLoss: FIELDS.lossB,
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
    royalties: FIELDS.royaltiesC,
    allowedLoss: FIELDS.lossC,
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

// ─── Source rows and physical pages ───────────────────────────────────────
type ExpenseKey = 'advertising'|'autoTravel'|'cleaning'|'commissions'|'insurance'|'legalProfessional'|'managementFees'|'mortgageInterest'|'otherInterest'|'repairs'|'supplies'|'taxes'|'utilities'|'depreciation'|'otherExpenses';
const EXPENSE_KEYS: ExpenseKey[] = ['advertising','autoTravel','cleaning','commissions','insurance','legalProfessional','managementFees','mortgageInterest','otherInterest','repairs','supplies','taxes','utilities','depreciation','otherExpenses'];
interface PropertyRow {
  kind: 'rental'|'royalty'; sourceIndex:number; description:string; propertyType:string;
  rentalDays?:number; personalDays?:number; gross:Decimal; net:Decimal; totalExpenses:Decimal;
  expenses:Partial<Record<ExpenseKey,Decimal>>; allowedLoss:Decimal;
}
interface PartnershipRow {
  sourceIndex:number; passiveIncome:Decimal; passiveLoss:Decimal; nonpassiveIncome:Decimal; nonpassiveLoss:Decimal; section179?:Decimal;
}
function propertyRows(input:TaxYearInput,result:TaxReturnResult):PropertyRow[] {
  const se=result.scheduleE;if(!se)return [];
  const k1PassiveCount=se.partnerships.filter(row=>row.isPassive).length;
  const depreciation=se.lines.filter(row=>row.form==='Sched E'&&row.line==='18');
  const otherExpenses=se.lines.filter(row=>row.form==='Sched E'&&row.line==='19');
  const rentals:PropertyRow[]=se.rentalProperties.map((row,index)=>{
    const source=input.rentalProperties[index];
    if(!source)throw new Error('Schedule E rental property sources do not reconcile');
    const ownership=d(source.ownershipPercentage??'100').div(100);
    const expenses:Partial<Record<ExpenseKey,Decimal>>={};
    for(const key of EXPENSE_KEYS)expenses[key]=d(source[key]).times(ownership);
    expenses.depreciation=depreciation[index]?.value??expenses.depreciation;
    expenses.otherExpenses=otherExpenses[index]?.value??expenses.otherExpenses;
    const personal=source.personalUseDays,rental=source.rentalDays;
    if(personal!==undefined&&rental!==undefined&&personal>14&&d(personal).gt(d(rental).times('0.1'))) {
      const ratio=d(rental).div(d(rental).plus(personal));
      for(const key of EXPENSE_KEYS)expenses[key]=expenses[key]!.times(ratio);
    }
    const allocation=result.form8582?.activityAllocations.find(activity=>activity.sourceIndex===k1PassiveCount+index);
    return {kind:'rental',sourceIndex:index,description:row.description,propertyType:row.propertyType,
      rentalDays:rental,personalDays:personal,gross:row.rents,net:row.netRentalIncome,totalExpenses:row.totalExpenses,
      expenses,allowedLoss:allocation?.allowedLoss??d(0)};
  });
  const royalties:PropertyRow[]=(se.royaltyProperties??[]).map(row=>({kind:'royalty',sourceIndex:row.sourceIndex,
    description:'',propertyType:'6',gross:row.grossIncome,net:row.netIncome,totalExpenses:row.totalExpenses,
    expenses:{commissions:row.commissions,insurance:row.insurance,legalProfessional:row.legalProfessional,managementFees:row.managementFees,taxes:row.taxes},allowedLoss:zeroFloor(row.netIncome.negated())}));
  return [...rentals,...royalties];
}
function partnershipRows(input:TaxYearInput,result:TaxReturnResult,passiveDistributions:ScheduleEPassiveDistributionSource[],passiveCapital:ScheduleEPassiveCapitalSource[]):PartnershipRow[] {
  let passiveIndex=0;
  return (result.scheduleE?.partnerships??[]).map((row,sourceIndex)=>{
    const index=row.isPassive?passiveIndex++:undefined;
    const activity=result.form8582?.activityRows.find(item=>item.sourceIndex===index&&index!==undefined);
    const allowance=result.form8582?.activityAllocations.find(item=>item.sourceIndex===index&&index!==undefined);
    if(row.isPassive&&!row.isPubliclyTradedPartnership) {
      const capital=passiveCapital.find(source=>source.k1Index===sourceIndex);
      if(capital) {
        if(!activity||capital.passiveIndex!==index||!activity.sourceCurrentIncome.eq(capital.sourceCurrentIncome)
          ||!activity.sourceCurrentLoss.eq(capital.sourceCurrentLoss)||!activity.sourcePriorYearSuspendedLoss.eq(capital.sourcePriorLoss))
          throw new Error('Schedule E passive capital source does not reconcile with original-index Form8582');
        return {sourceIndex,passiveIncome:capital.ordinaryIncome,passiveLoss:capital.ordinaryAllowedLoss,
          nonpassiveIncome:row.nonpassiveIncome,nonpassiveLoss:row.nonpassiveLoss.abs()};
      }
      const distribution=passiveDistributions.find(source=>source.k1Index===sourceIndex);
      if(distribution&&(!activity||distribution.passiveIndex!==index||!activity.sourceCurrentIncome.eq(distribution.sourceIncome)))
        throw new Error('Schedule E passive distribution source does not reconcile with original-index Form8582');
      // Capital income can release an ordinary loss without becoming ordinary
      // income itself. Keep its validated original rounded component separate.
      const passiveIncome=distribution?activity!.currentIncome.minus(distribution.ordinaryTransferExclusion):activity?.currentIncome??row.passiveIncome;
      return {sourceIndex,passiveIncome,passiveLoss:allowance?.allowedLoss??d(0),
        nonpassiveIncome:row.nonpassiveIncome,nonpassiveLoss:row.nonpassiveLoss.abs()};
    }
    if(row.isPassive&&row.isPubliclyTradedPartnership) {
      const prior=sum(...(input.priorYear?.suspendedPTPLosses??[]).filter(item=>item.partnershipName===row.name).map(item=>d(item.amount)));
      const released=result.form8582?.ptpDispositionReleasedLosses.find(item=>item.name===row.name);
      return {sourceIndex,passiveIncome:d(0),passiveLoss:d(0),
        nonpassiveIncome:row.nonpassiveIncome.plus(released?row.passiveIncome:zeroFloor(row.passiveIncome.minus(prior))),
        nonpassiveLoss:row.nonpassiveLoss.abs().plus(released?.totalReleased??d(0))};
    }
    const source179=d(input.scheduleK1[sourceIndex]?.section179Deduction);
    // The existing result fully absorbs this current deduction only when its
    // unchanged net remains nonnegative. A binding character allocation is not inferred.
    const separate179=source179.gt(0)&&row.rawNetAmount.gte(0)&&row.netAmount.eq(row.rawNetAmount)?source179:d(0);
    return {sourceIndex,passiveIncome:d(0),passiveLoss:d(0),nonpassiveIncome:row.nonpassiveIncome.plus(separate179),nonpassiveLoss:row.nonpassiveLoss.abs(),section179:separate179};
  });
}
function fillProperties(doc:PDFDocument,rows:PropertyRow[]):void {
  const form=doc.getForm();
  rows.forEach((row,index)=>{
    const fields=PROPERTY_EXPENSE_FIELDS[index];
    setTextField(form,fields.description,row.description);
    setTextField(form,fields.typeCode,row.kind==='royalty'?'6':PROPERTY_TYPE_CODES[row.propertyType]??'8');
    if(row.kind==='rental') {
      if(row.rentalDays!==undefined)setTextField(form,fields.rentalDays,String(row.rentalDays));
      if(row.personalDays!==undefined&&row.personalDays>0)setTextField(form,fields.personalDays,String(row.personalDays));
    }
    setCurrencyField(form,row.kind==='royalty'?fields.royalties:fields.rents,row.gross);
    for(const key of EXPENSE_KEYS)setCurrencyField(form,fields[key],row.expenses[key]??d(0));
    setCurrencyField(form,fields.totalExpenses,row.totalExpenses);setCurrencyField(form,fields.net,row.net);
    if(row.kind==='rental')setCurrencyField(form,fields.allowedLoss,row.allowedLoss);
  });
}
function fillPartnerships(doc:PDFDocument,input:TaxYearInput,result:TaxReturnResult,rows:PartnershipRow[]):void {
  const form=doc.getForm();
  rows.forEach((row,index)=>{
    const fields=PARTNERSHIP_FIELD_SETS[index],source=input.scheduleK1[row.sourceIndex],value=result.scheduleE!.partnerships[row.sourceIndex];
    setTextField(form,fields.name,value.name);setTextField(form,fields.ein,value.ein);
    setTextField(form,fields.entityType,source?.entityType==='s_corporation'?'S':'P');
    setCurrencyField(form,fields.colF,row.passiveLoss);setCurrencyField(form,fields.colG,row.passiveIncome);
    setCurrencyField(form,fields.colH,row.nonpassiveLoss);setCurrencyField(form,fields.colI,row.section179??d(0));setCurrencyField(form,fields.colJ,row.nonpassiveIncome);
    if(source?.entityType==='s_corporation'&&(value.rawNetAmount.lt(0)||d(source.distributions).gt(0)))setCheckBox(form,fields.check1,true);
    if(value.suspendedAtRiskLoss.lt(0))setCheckBox(form,fields.check2,true);
  });
}
async function appendReference(doc:PDFDocument,lines:string[]):Promise<void> {
  if(!lines.length)return;
  const font=await doc.embedFont(StandardFonts.Helvetica);
  let page=doc.addPage([612,792]),y=742;
  for(const line of ['Schedule E source reconciliation',...lines]) {
    let current='';
    const write=()=>{if(y<65){page=doc.addPage([612,792]);y=742;}page.drawText(current,{x:42,y,size:10,font});y-=16;};
    for(const word of line.split(' ')) {const next=current?`${current} ${word}`:word;if(current&&font.widthOfTextAtSize(next,10)>528){write();current=word;}else current=next;}
    if(current)write();y-=7;
  }
}
/** Fill final2025 review maps; source preparation happens before template I/O. */
export async function fillScheduleE(input:TaxYearInput,result:TaxReturnResult,blankPdfPath:string,prepared?:PreparedScheduleEReview):Promise<PDFDocument> {
  assertPdfExportAllowed(input.taxpayer.taxYear,result.taxYear);
  const sources=requiresScheduleEReview(input,result)||prepared?
    scheduleEReviewSourceDetails(input,result,prepared):{passiveDistributions:[],passiveCapital:[]};
  const supplementalIncome=result.schedule1?.supplementalIncome;
  if(result.scheduleE&&supplementalIncome===undefined)throw new Error("Schedule E review requires the final Schedule1 source amount");
  const properties=propertyRows(input,result),partnerships=partnershipRows(input,result,sources.passiveDistributions,sources.passiveCapital);
  const doc=await loadReviewTemplate(blankPdfPath,2025),form=doc.getForm(),se=result.scheduleE;
  const name=input.taxpayer.spouse?`${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName} & ${input.taxpayer.spouse.firstName} ${input.taxpayer.spouse.lastName}`:`${input.taxpayer.primary.firstName} ${input.taxpayer.primary.lastName}`;
  const ssn=input.taxpayer.primary.ssn.replace(/-/g,'');
  for(const field of [FIELDS.name,FIELDS.namePg2])setTextField(form,field,name);
  for(const field of [FIELDS.ssn,FIELDS.ssnPg2])setTextField(form,field,ssn);
  if(!se||supplementalIncome===undefined)return doc;
  fillProperties(doc,properties.slice(0,3));fillPartnerships(doc,input,result,partnerships.slice(0,4));
  // Continuations carry actual rows only; all totals occur once on the first schedule.
  for(let start=3;start<properties.length;start+=3) {
    const extra=await loadReviewTemplate(blankPdfPath,2025);fillProperties(extra,properties.slice(start,start+3));
    setTextField(extra.getForm(),FIELDS.name,name);setTextField(extra.getForm(),FIELDS.ssn,ssn);
    const font=await extra.embedFont(StandardFonts.Helvetica);
    extra.getPages()[0].drawText(`Continuation: property rows ${start+1}-${Math.min(start+3,properties.length)}; totals on first schedule`,{x:180,y:780,size:8,font});
    extra.getForm().flatten();const [page]=await doc.copyPages(extra,[0]);doc.addPage(page);
  }
  for(let start=4;start<partnerships.length;start+=4) {
    const extra=await loadReviewTemplate(blankPdfPath,2025);fillPartnerships(extra,input,result,partnerships.slice(start,start+4));
    setTextField(extra.getForm(),FIELDS.namePg2,name);setTextField(extra.getForm(),FIELDS.ssnPg2,ssn);
    const font=await extra.embedFont(StandardFonts.Helvetica);
    extra.getPages()[1].drawText(`Continuation: K1 rows ${start+1}-${Math.min(start+4,partnerships.length)}; totals on first schedule`,{x:180,y:780,size:8,font});
    extra.getForm().flatten();const [page]=await doc.copyPages(extra,[1]);doc.addPage(page);
  }
  const total=(read:(row:PropertyRow)=>Decimal)=>sum(...properties.map(read));
  const unallocatedRoyalty=se.totalRoyaltyIncome.minus(total(row=>row.kind==='royalty'?row.net:d(0)));
  const line24=total(row=>zeroFloor(row.kind==='rental'?roundDollar(row.net):row.net)).plus(zeroFloor(unallocatedRoyalty));
  const line25=total(row=>row.allowedLoss).plus(zeroFloor(unallocatedRoyalty.negated()));
  const line26=line24.minus(line25);
  setCurrencyField(form,FIELDS.line23a,total(row=>row.kind==='rental'?row.gross:d(0)));
  setCurrencyField(form,FIELDS.line23b,se.grossRoyaltyIncome);
  setCurrencyField(form,FIELDS.line23c,total(row=>row.expenses.mortgageInterest??d(0)));
  setCurrencyField(form,FIELDS.line23d,total(row=>row.expenses.depreciation??d(0)));
  setCurrencyField(form,FIELDS.line23e,total(row=>row.totalExpenses));
  setCurrencyField(form,FIELDS.line24,line24);setCurrencyField(form,FIELDS.line25,line25);setCurrencyField(form,FIELDS.line26,line26);
  const totals={passiveIncome:sum(...partnerships.map(row=>row.passiveIncome)),passiveLoss:sum(...partnerships.map(row=>row.passiveLoss)),
    nonpassiveIncome:sum(...partnerships.map(row=>row.nonpassiveIncome)),nonpassiveLoss:sum(...partnerships.map(row=>row.nonpassiveLoss))};
  const section179=sum(...partnerships.map(row=>row.section179??d(0)));
  const line30=totals.passiveIncome.plus(totals.nonpassiveIncome),line31=totals.passiveLoss.plus(totals.nonpassiveLoss).plus(section179);
  setCurrencyField(form,FIELDS.line29a_h,totals.passiveIncome);setCurrencyField(form,FIELDS.line29a_k,totals.nonpassiveIncome);
  setCurrencyField(form,FIELDS.line29b_g,totals.passiveLoss);setCurrencyField(form,FIELDS.line29b_i,totals.nonpassiveLoss);setCurrencyField(form,FIELDS.line29b_j,section179);
  setCurrencyField(form,FIELDS.line30,line30);setCurrencyField(form,FIELDS.line31,line31);setCurrencyField(form,FIELDS.line32,line30.minus(line31));
  setCurrencyField(form,FIELDS.line41,supplementalIncome);
  const notes:string[]=[];
  for(const row of partnerships)if(d(input.scheduleK1[row.sourceIndex]?.section179Deduction).gt(0)&&!(row.section179?.gt(0)))notes.push(`K1 source ${row.sourceIndex+1} includes a section179 amount within the retained net result. Its separate passive or binding loss character must be allocated before qualifying physical columns(g)-(k); no allowance is inferred.`);
  if(!unallocatedRoyalty.isZero())notes.push(`Original portfolio royalty amount without property-column detail: $${unallocatedRoyalty.toFixed()}. This known income is included once in Part I totals. Property allocation and expense completeness are unverified; no property or zero expense fact was invented.`);
  const difference=supplementalIncome.minus(line26.plus(line30).minus(line31));
  if(!difference.isZero())notes.push(`Retained Schedule1 line5 amount: $${supplementalIncome.toFixed()}. Difference from mapped Part I and II amounts: $${difference.toFixed()}. Separate source allocation is required before qualifying these physical rows. The final retained amount is displayed on line41; no allocation is inferred.`);
  await appendReference(doc,notes);await markReviewPdf(doc);
  return doc;
}
/** Physical field map; legacy row suffixes f-j correspond to printed g-k. */
export { FIELDS as SCHEDULE_E_FIELDS };
