/** Canonical Schedule1-A source binding. Spec: spec/federal/schedule-1-a-return.yaml. */
import Decimal from "decimal.js";
import { Schedule1ASchema, type Schedule1AInput, type TaxYearInput } from "@/models/inputs.js";
import type { QBIDeductionSource } from "./qbi-source-deductions.js";
import type { calculateUnreportedTipPayroll } from "./unreported-tip-payroll.js";
import type { ScheduleCResult } from "../schedules/schedule-c.js";
import { calculateSchedule1A } from "../schedules/schedule-1-a.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, sum, zeroFloor } from "@/utils/decimal.js";

type Owner = "primary" | "spouse";
interface Params {
  input: TaxYearInput;
  agi: Decimal;
  foreignExcludedIncome: Decimal;
  tipPayroll: ReturnType<typeof calculateUnreportedTipPayroll>;
  scheduleC: ScheduleCResult;
  businessSources: QBIDeductionSource[];
  adjustedBusinessSources: QBIDeductionSource[];
  businessDeductionsVerified: boolean;
}
// TD10044 section1.224-1(h), final table; code000 is not a qualifying occupation.
const occupations = new Set([
  "101","102","103","104","105","106","107","108","109","110",
  "201","202","203","204","205","206","207","208","209","210","211",
  "301","302","303","304","401","402","403","404","405","406","407","408","409",
  "501","502","503","504","505","506","507","508","509","510",
  "601","602","603","604","605","606","607","608","609","610","611",
  "701","702","703","704","705","706","801","802","803","804","805","806","807","808","809","810",
]);
const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
function requiredAmount(value: string | undefined, label: string): Decimal {
  if (value === undefined) throw new Error(`Schedule1-A requires the actual ${label}.`);
  const amount = d(value);
  if (!amount.isFinite() || amount.lt(0)) throw new Error(`Schedule1-A ${label} must be finite and nonnegative.`);
  return amount;
}
function sourceIndex(id: string | undefined, kind: string): number {
  if (!id || !new RegExp(`^${kind}:(0|[1-9][0-9]*)$`).test(id)) throw new Error(`Schedule1-A requires an original ${kind} source index.`);
  const index = Number(id.slice(kind.length + 1));
  if (!Number.isSafeInteger(index)) throw new Error("Schedule1-A source index is invalid.");
  return index;
}
function sourceIdentity(source: { taxYear?: number; accountHolder?: Owner } | undefined, owner: Owner, year: number) {
  if (!source || source.taxYear !== year || source.accountHolder !== owner) throw new Error("Schedule1-A source year and actual owner must match the return claim.");
}
function occupationReporting(codes: string[] | undefined) {
  if (!codes?.length || codes.some(code => code !== "000" && !occupations.has(code))) throw new Error("Schedule1-A requires actual valid TTOC occupation reporting for2026.");
  // IRS permits any two codes when there are more occupations. A missing third
  // code does not disprove the independently documented actual occupation.
}

export function calculateSchedule1AReturn(params: Params) {
  const { input } = params, year = input.taxpayer.taxYear;
  const facts = Schedule1ASchema.parse(input.schedule1A);
  const audit = new AuditTrail();
  const actual = year >= 2026 || facts.sourceTaxYear !== undefined || facts.sourceReference !== undefined || facts.sourceFactsConfirmed !== undefined || facts.allSourcesIncluded !== undefined
    || facts.employeeTips.some(row => row.w2SourceIds !== undefined || row.form4137EmployerSourceId !== undefined || row.reportingMethod !== undefined || row.reportingSourceReference !== undefined)
    || facts.businessTips.length > 0 || facts.overtime.some(row => row.compensationSourceId !== undefined || row.reportingSourceReference !== undefined);
  if (!actual) return { schedule1A: calculateSchedule1A({ taxpayer: input.taxpayer, agi: params.agi, foreignExcludedIncome: params.foreignExcludedIncome,
    facts, standardDeductionFacts: input.standardDeductionFacts }), sourceFactsVerified: false, businessQbiExclusions: [] as { sourceId: string; owner: Owner; amount: Decimal }[], lines: audit.getLines() };
  if (facts.sourceTaxYear !== year || !facts.sourceReference || facts.sourceFactsConfirmed !== true || facts.allSourcesIncluded !== true) throw new Error("Actual Schedule1-A requires complete confirmed sources for this return year; business QBI cannot use unverified amounts.");
  const owners = new Set<Owner>([...facts.employeeTips, ...facts.businessTips, ...facts.overtime].map(row => row.owner));
  facts.seniorOwners.forEach(owner => owners.add(owner));
  for (const owner of owners) {
    const person = owner === "primary" ? input.taxpayer.primary : input.taxpayer.spouse;
    if (!person || (owner === "spouse" && input.taxpayer.filingStatus !== "married_filing_jointly")) throw new Error("Schedule1-A actual source owner is not in the joint household.");
    const declared = owner === "primary" ? facts.primarySsnEligible : facts.spouseSsnEligible;
    if (person.employmentValidSsnIssuedByDueDate === undefined || declared !== person.employmentValidSsnIssuedByDueDate) throw new Error("Schedule1-A SSN eligibility must match the actual household identity facts.");
  }
  const tipEligible = (row: Schedule1AInput["employeeTips"][number] | Schedule1AInput["businessTips"][number]) => {
    if (row.eligibleOccupation && !occupations.has(row.occupationCode)) throw new Error("Schedule1-A qualifying occupation is not in the final Treasury occupation table.");
    return (row.owner === "primary" ? facts.primarySsnEligible : facts.spouseSsnEligible) && row.eligibleOccupation && row.voluntaryCashTips && row.lawfulActivity && row.meetsSstbRuleOrTransition;
  };
  const employerClaims = new Set<string>(), employeeSources = new Set<string>();
  let eligibleEmployeeTips = d(0);
  for (const row of facts.employeeTips) {
    const eligible = tipEligible(row);
    if (!row.w2SourceIds || !row.reportingMethod || !row.reportingSourceReference) throw new Error("Actual employee tips require complete W2/reporting source links.");
    const linkedW2Ids = row.w2SourceIds;
    const w2s = linkedW2Ids.map(id => {
      if (employeeSources.has(id)) throw new Error("Duplicate employee tip source.");
      employeeSources.add(id);
      const source = input.w2s[sourceIndex(id, "formW2")]; sourceIdentity(source, row.owner, year);
      if (!source.employer?.ein || normalized(source.employer.name) !== normalized(row.employer)) throw new Error("Employee tip source employer does not match.");
      return source;
    });
    const form = params.tipPayroll.byOwner[row.owner];
    const employer = row.form4137EmployerSourceId === undefined ? undefined : form?.employers?.find(source => source.sourceId === row.form4137EmployerSourceId);
    if (row.form4137EmployerSourceId !== undefined && (!employer || !form?.sourceFactsVerified || form.sourceTaxYear !== year)) throw new Error("Schedule1-A requires the actual matching Form4137 employer source.");
    if (employer && (normalized(employer.employerName) !== normalized(row.employer) || employer.w2SourceIds.length !== row.w2SourceIds.length || employer.w2SourceIds.some(id => !linkedW2Ids.includes(id)))) throw new Error("Schedule1-A employer sources must reconcile the same actual W2 records and Form4137 employer.");
    const eins = new Set([...w2s.map(source => source.employer.ein.replace(/\D/g, "")), ...(employer ? [employer.employerEin.replace(/\D/g, "") || employer.employerEin] : [])]);
    if (eins.size !== 1 || ![...eins][0]) throw new Error("Employee tip sources must identify one actual employer.");
    const employerKey = `${row.owner}:${[...eins][0]}`;
    if (employerClaims.has(employerKey)) throw new Error("Duplicate actual employer tip claim.");
    employerClaims.add(employerKey);
    if (w2s.some(source => d(source.allocatedTips).gt(0)) && !employer) throw new Error("Actual allocated tips require the Form4137 source reconciliation.");
    const claim = d(row.qualifiedW2Tips);
    if (row.reportingMethod === "form4137" && (!employer || !claim.isZero())) throw new Error("Form4137-only reporting requires a verified employer source and zero employer-report claim.");
    const reported = row.reportingMethod === "form4137" ? d(0) : year >= 2026
      ? sum(...w2s.map(source => { occupationReporting(source.treasuryTippedOccupationCodes); return requiredAmount(source.box12CodeTP, "W2 Box12TP tip report"); }))
      : row.reportingMethod === "w2" ? sum(...w2s.map(source => requiredAmount(source.socialSecurityTips, "W2 Box7 tips")))
        : requiredAmount(row.reportedEmployerTips, "employer/4070 reported tips");
    if (claim.gt(reported) || (!w2s.length && !claim.isZero())) throw new Error("Qualified employee tips exceed the actual reported source.");
    if (employer && (claim.gt(employer.cashAndChargeTipsReceived) || (year === 2025 && row.reportingMethod !== "w2" && row.reportingMethod !== "form4137" && !reported.eq(employer.tipsReportedToEmployer)))) throw new Error("Actual employer tip reports do not reconcile the matching Form4137 reporting-year sources.");
    if (d(row.qualifiedForm4137Tips).gt(employer?.cashAndChargeTipsReceived ?? d(0))) throw new Error("Qualified Form4137 tips exceed actual employer column1(c).");
    const amount = eligible ? Decimal.max(claim, d(row.qualifiedForm4137Tips)) : d(0);
    eligibleEmployeeTips = eligibleEmployeeTips.plus(amount);
    audit.record("Schedule1-A Source Worksheet", `employee:${employerKey}`, `Qualified tips: ${row.employer}`, amount, "Maximum of qualified actual employer report and Form4137 column1(c), once per employer");
  }
  const overtimeSources = new Set<string>();
  for (const row of facts.overtime) {
    const id = row.compensationSourceId;
    if (!id || !row.reportingSourceReference) throw new Error("Actual overtime requires its compensation source and statement reference.");
    if (overtimeSources.has(id)) throw new Error("Duplicate overtime compensation source.");
    overtimeSources.add(id);
    let gross: Decimal, reported: string | undefined, reportedTips: string | undefined;
    if (id.startsWith("formW2:")) {
      const source = input.w2s[sourceIndex(id, "formW2")]; sourceIdentity(source, row.owner, year);
      gross = requiredAmount(source.wages, "W2 wages").plus(requiredAmount(row.compensationExcludedFromWages, "payroll compensation exclusions"));
      reported = source.box12CodeTT; reportedTips = source.box12CodeTP;
    } else if (id.startsWith("form1099Nec:")) {
      const source = input.form1099Nec[sourceIndex(id, "form1099Nec")]; sourceIdentity(source, row.owner, year);
      gross = requiredAmount(source.nonemployeeCompensation, "NEC gross compensation"); reported = source.qualifiedOvertimeCompensation; reportedTips = source.cashTips;
      if (params.scheduleC.grossReceipts.lt(sum(...input.form1099Nec.map(form => d(form.nonemployeeCompensation))))) throw new Error("Actual overtime compensation is not reconciled to reported business receipts.");
    } else if (id.startsWith("form1099Misc:")) {
      const source = input.form1099Misc[sourceIndex(id, "form1099Misc")]; sourceIdentity(source, row.owner, year);
      gross = requiredAmount(source.otherIncome, "MISC other income"); reported = source.qualifiedOvertimeCompensation; reportedTips = source.cashTips;
    } else throw new Error("Unsupported actual overtime compensation source.");
    if (!gross.eq(row.reportedCompensation)) throw new Error("Overtime reported compensation does not reconcile to actual income and payroll exclusions.");
    if (year >= 2026) {
      const reportedPremium = requiredAmount(reported, "TT/qualified overtime reporting");
      if (reportedPremium.gt(gross)) throw new Error("Reported overtime exceeds the actual gross compensation source.");
      if (reportedTips !== undefined && requiredAmount(reportedTips, "original cash tip reporting").plus(reportedPremium).gt(gross)) throw new Error("Distinct original tip and overtime reports exceed the same gross compensation source.");
      if (d(row.qualifiedPremium).gt(reportedPremium)) throw new Error("Qualified overtime premium exceeds actual year-specific reporting.");
    }
    audit.record("Schedule1-A Source Worksheet", `overtime:${id}`, "Source-bound qualified overtime", row.requiredByFlsa ? d(row.qualifiedPremium) : d(0), "Actual FLSA premium already included in reported compensation");
  }
  const businessClaims = new Set<string>(), businessReportSources = new Set<string>();
  const limitedBusiness: { sourceId: string; owner: Owner; amount: Decimal }[] = [];
  facts.businessTips = facts.businessTips.map(row => {
    const eligible = tipEligible(row), id = row.businessSourceId;
    if (id !== "scheduleC" || !input.scheduleC) throw new Error("Business tips require the supported actual ScheduleC income-source reconciliation; other business routes remain unsupported.");
    if (businessClaims.has(id)) throw new Error("Duplicate actual business tip claim.");
    businessClaims.add(id);
    const original = params.businessSources.find(source => source.id === id), adjusted = params.adjustedBusinessSources.find(source => source.id === id);
    if (!original || !adjusted || original.accountHolder !== row.owner || adjusted.accountHolder !== row.owner || input.scheduleC.accountHolder !== row.owner || normalized(row.businessName) !== normalized(input.scheduleC.businessName ?? "")) throw new Error("Business tips require matching actual business identity and owner.");
    if (!params.businessDeductionsVerified || original.excludedSEIncome) throw new Error("Actual business tip limitation requires verified attributable deduction allocation.");
    if (!original.qbi.eq(params.scheduleC.netProfit)) throw new Error("Canonical ScheduleC business profit does not reconcile.");
    const allocable = original.qbi.minus(adjusted.qbi);
    if (!allocable.isFinite() || allocable.lt(0)) throw new Error("Canonical business deductions are invalid.");
    if (row.netProfit !== undefined && !d(row.netProfit).eq(params.scheduleC.netProfit)) throw new Error("Supplied business profit disagrees with canonical ScheduleC.");
    if (row.otherAllocableDeductions !== undefined && !d(row.otherAllocableDeductions).eq(allocable)) throw new Error("Supplied business deductions disagree with canonical attribution.");
    if (!row.reportedTipSources?.length) throw new Error("Actual business tips require original information-return sources.");
    let qualified = d(0);
    for (const report of row.reportedTipSources) {
      if (businessReportSources.has(report.sourceId)) throw new Error("Duplicate business tip information-return source.");
      businessReportSources.add(report.sourceId);
      const source = input.form1099Nec[sourceIndex(report.sourceId, "form1099Nec")]; sourceIdentity(source, row.owner, year);
      const gross = requiredAmount(source.nonemployeeCompensation, "NEC compensation");
      if (d(report.qualifiedTips).gt(gross)) throw new Error("Business tips exceed actual reported compensation.");
      if (year >= 2026) {
        occupationReporting(source.treasuryTippedOccupationCodes);
        const cashTips = requiredAmount(source.cashTips, "NEC cash tips reporting");
        if (cashTips.gt(gross)) throw new Error("Reported NEC cash tips exceed actual gross compensation.");
        if (source.qualifiedOvertimeCompensation !== undefined && cashTips.plus(requiredAmount(source.qualifiedOvertimeCompensation, "original NEC overtime report")).gt(gross)) throw new Error("Distinct original NEC tip and overtime reports exceed the same gross compensation source.");
        if (d(report.qualifiedTips).gt(cashTips)) throw new Error("Business tips exceed actual separately reported cash tips.");
      }
      qualified = qualified.plus(report.qualifiedTips);
    }
    if (!qualified.eq(row.qualifiedReportedTips)) throw new Error("Business qualified tip source allocations do not reconcile.");
    if (input.form1099Nec.some(source => source.accountHolder !== row.owner) || params.scheduleC.grossReceipts.lt(sum(...input.form1099Nec.map(source => d(source.nonemployeeCompensation))))) throw new Error("Actual business receipts do not reconcile the information-return income and owner.");
    const limited = eligible ? min(qualified, zeroFloor(adjusted.qbi)) : d(0);
    limitedBusiness.push({ sourceId: id, owner: row.owner, amount: limited });
    audit.record("Schedule1-A Source Worksheet", `business:${id}`, `Net-income limited tips: ${row.businessName}`, limited, "Actual reported tips limited by calculated business profit less reconciled attributable deductions", { "Net profit": params.scheduleC.netProfit, "Other allocable deductions": allocable });
    return { ...row, netProfit: params.scheduleC.netProfit.toFixed(), otherAllocableDeductions: allocable.toFixed() };
  });
  const schedule1A = calculateSchedule1A({ taxpayer: input.taxpayer, agi: params.agi, foreignExcludedIncome: params.foreignExcludedIncome, facts,
    canonicalSourcesVerified: true, standardDeductionFacts: input.standardDeductionFacts });
  const eligibleBusiness = limitedBusiness.filter(row => row.amount.gt(0));
  const totalEligibleTips = eligibleEmployeeTips.plus(sum(...limitedBusiness.map(row => row.amount)));
  const threshold = input.taxpayer.filingStatus === "married_filing_jointly" ? d(300000) : d(150000);
  const sharedReduction = totalEligibleTips.gt(25000) || zeroFloor(schedule1A.magi.minus(threshold)).div(1000).floor().gt(0);
  if (!schedule1A.tipsDeduction.isZero() && eligibleBusiness.length && sharedReduction && (eligibleEmployeeTips.gt(0) || eligibleBusiness.length > 1)) throw new Error("Reduced shared employee/business tip deduction requires an authoritative business-QBI allocation method; no automatic allocation is supported.");
  const businessQbiExclusions = limitedBusiness.map(row => ({ ...row,
    amount: schedule1A.tipsDeduction.isZero() ? d(0)
      : eligibleEmployeeTips.isZero() && eligibleBusiness.length === 1 ? schedule1A.tipsDeduction : row.amount,
  }));
  for (const row of businessQbiExclusions) audit.record("Schedule1-A QBI Coordination", row.sourceId, "Allowable business tips excluded from QBI", row.amount,
    sharedReduction ? "Sole eligible business without employee tips: actual final section224 deduction" : "Actual business tips allowable under section224; section199A(c)(4)(D)");
  // No monetary input or calculated business source is mutated by this resolver.
  return { schedule1A, sourceFactsVerified: true, businessQbiExclusions, lines: audit.getLines() };
}
