import type { Form2210OwnerSourceContext } from './form-2210-owner-source.js';
/** Form 2210 Schedule AI. Spec: spec/federal/form-2210-schedule-ai.yaml. */
import Decimal from 'decimal.js';
import { getConstants, type FilingStatus } from '@/models/constants.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { roundDollar } from '@/utils/decimal.js';
import { calculateCapitalGainsTax, calculateRegularIncomeTax } from '@/utils/tax-math.js';

const FORM = 'Form 2210 Schedule AI', COLUMNS = ['a', 'b', 'c', 'd'] as const;
const MULTIPLIERS = ['4', '2.4', '1.5', '1'], PERCENTS = ['0.225', '0.45', '0.675', '0.9'];
const WAGE_LIMIT_TWELFTHS = [3, 5, 8, 12];
const SOCIAL_SECURITY = ['0.496', '0.2976', '0.186', '0.124'], MEDICARE = ['0.116', '0.0696', '0.0435', '0.029'];
const MONEY = /^\d+(\.\d+)?$/, SIGNED = /^-?\d+(\.\d+)?$/;

/** Completed return facts. Column (d) covers the full year, so it must reconcile. */
export interface Form2210ScheduleAiReturn {
  standardDeduction: Decimal; agi: Decimal; taxableIncome: Decimal; itemizedDeductions?: Decimal; preferentialIncome: boolean;
  ordinaryPreferentialIncome?: { qualifiedDividends: Decimal; netCapitalGain: Decimal };
  specialRatePreferentialIncome?: { qualifiedDividends: Decimal; netCapitalGain: Decimal; rate28GainLoss: Decimal; unrecaptured1250BeforeLosses: Decimal };
  selfEmployedOwners: number; specialTaxMethod: boolean; schedule1ADeduction?: Decimal; ownerSources?: Form2210OwnerSourceContext;
}
export interface Form2210ScheduleAiInput {
  taxYear: number; filingStatus: FilingStatus; requiredAnnualPayment: Decimal; taxAfterRefundableCredits: Decimal;
  returnContext: Form2210ScheduleAiReturn; facts: NonNullable<TaxYearInput['form2210']>;
}
export interface Form2210ScheduleAiResult { installments: Decimal[]; lines: CalculatedLine[] }

function amount(value: string | undefined, label: string, signed = false): Decimal {
  if (value === undefined || !(signed ? SIGNED : MONEY).test(value)) throw new Error(`Form 2210 Schedule AI requires the actual ${label}`);
  return new Decimal(value);
}

function periodEarningsSubjectToSelfEmploymentTax(profit: Decimal, earningsMultiplier: Decimal): Decimal {
  const exactEarnings = profit.times(earningsMultiplier);
  return exactEarnings.lt(400) ? new Decimal(0) : roundDollar(exactEarnings);
}

export function calculateForm2210ScheduleAi(input: Form2210ScheduleAiInput): Form2210ScheduleAiResult {
  const { taxYear, filingStatus, facts, returnContext } = input, periods = facts.annualizedIncomePeriods;
  if (periods?.length !== 4) throw new Error('Form 2210 Schedule AI requires all four actual cumulative periods');
  const specialRatePreferentialIncome = facts.specialRatePeriodsConfirmed === true ? returnContext.specialRatePreferentialIncome : undefined;
  const specialSourcesPresent = periods.some(period => period.rate28GainLoss !== undefined || period.unrecaptured1250BeforeLosses !== undefined);
  if ((facts.specialRatePeriodsConfirmed === true || specialSourcesPresent) && !specialRatePreferentialIncome) throw new Error('Form 2210 Schedule AI requires confirmed special period worksheet sources and the actual completed source worksheets');
  const ordinaryPreferentialIncome = facts.ordinaryPreferentialPeriodsConfirmed === true
    ? returnContext.ordinaryPreferentialIncome : undefined;
  const preferentialError = 'Form 2210 Schedule AI with qualified dividends or net capital gain needs its separate period worksheet method or confirmed ordinary period worksheet sources';
  if ((returnContext.preferentialIncome || facts.ordinaryPreferentialPeriodsConfirmed === true) && !ordinaryPreferentialIncome && !specialRatePreferentialIncome) {
    throw new Error(preferentialError);
  }
  if (returnContext.specialTaxMethod) throw new Error('Form 2210 Schedule AI with Schedule J, Form 8615 or foreign earned income needs its separate tax method');
  if (returnContext.selfEmployedOwners > 1 && facts.selfEmploymentOwnerPeriods === undefined) throw new Error('Form 2210 Schedule AI needs a separate PartII for each self-employed spouse with actual owner sources');
  if (filingStatus === 'married_filing_jointly' && typeof facts.bothSpousesSelfEmployed !== 'boolean') {
    throw new Error('Form 2210 Schedule AI requires the actual answer on whether both spouses were self-employed');
  }
  const ownerFacts=facts.selfEmploymentOwnerPeriods, ownerContext=returnContext.ownerSources;
  if(facts.bothSpousesSelfEmployed===true&&ownerFacts===undefined) throw new Error('Form 2210 Schedule AI needs a separate PartII for each self-employed spouse with actual owner sources');
  if(ownerFacts!==undefined){
    if(filingStatus!=='married_filing_jointly'||facts.bothSpousesSelfEmployed!==true||ownerFacts.length!==2||!ownerContext||!/^[a-f0-9]{64}$/.test(ownerContext.sourceCommitment)||ownerContext.owners.length!==2)throw new Error('Form2210 separate PartII owner sources and actual canonical owner context are required');
    for(const owner of ['primary','spouse'] as const){
      const rows=ownerFacts.filter(row=>row.accountHolder===owner),contexts=ownerContext.owners.filter(row=>row.accountHolder===owner);
      const row=rows[0],ctx=contexts[0];
      if(rows.length!==1||contexts.length!==1||!row||!ctx||row.sourceTaxYear!==taxYear||!row.sourceReference?.trim()||row.sourceFactsConfirmed!==true||row.periods?.length!==4)throw new Error('Form2210 actual owner source year, reference, confirmation and all four periods are required');
      if(!amount(row.periods[3]?.netProfitFromSelfEmployment,'owner full-year net profit',true).eq(ctx.netProfit)||!amount(row.periods[3]?.socialSecurityWages,'owner full-year SocialSecurity payroll').eq(ctx.socialSecurityWages))throw new Error('Form2210 owner full-year profit/payroll must reconcile independently to canonical ScheduleSE sources');
    }
  }else if(ownerContext!==undefined)throw new Error('Form2210 canonical owner context requires its actual owner period sources');
  const constants = getConstants(taxYear), wageBase = constants.selfEmploymentTax.socialSecurityWageBase, audit = new AuditTrail();
  const installments: Decimal[] = [], line24 = input.requiredAnnualPayment.times('0.25');
  let priorInstallments = new Decimal(0), line25 = new Decimal(0);
  periods.forEach((period, index) => {
    const column = COLUMNS[index]!, multiplier = MULTIPLIERS[index]!;
    const qualifiedDividends = amount(period.qualifiedDividends, 'period qualified dividends');
    const netCapitalGain = amount(period.netCapitalGain, 'period net capital gain');
    if (!ordinaryPreferentialIncome && !specialRatePreferentialIncome && (qualifiedDividends.gt(0) || netCapitalGain.gt(0))) throw new Error(preferentialError);
    const preferentialContext = specialRatePreferentialIncome ?? ordinaryPreferentialIncome;
    if (index === 3 && preferentialContext
      && (!qualifiedDividends.eq(preferentialContext.qualifiedDividends)
        || !netCapitalGain.eq(preferentialContext.netCapitalGain))) {
      throw new Error('Form 2210 Schedule AI column (d) qualified dividends and net capital gain must each reconcile to the completed return');
    }
    const annualized = amount(period.adjustedGrossIncome, 'period adjusted gross income', true).times(multiplier);
    const itemized = amount(period.itemizedDeductions, 'period itemized deductions').times(multiplier);
    if (returnContext.itemizedDeductions === undefined && !itemized.isZero()) throw new Error('Form 2210 Schedule AI itemized deductions apply only to a return that itemizes');
    const line7 = returnContext.standardDeduction, deduction = Decimal.max(itemized, line7), line9 = amount(period.qbiDeduction, 'period QBI deduction');
    const line13 = Decimal.max(0, annualized.minus(deduction).minus(line9));
    // Spec: line-14-schedule-1a. The instructions give no period rule, so the amount is entered.
    const schedule1A = returnContext.schedule1ADeduction ?? new Decimal(0);
    const adjustment = schedule1A.isZero() && period.schedule1AAdjustment === undefined ? new Decimal(0) : amount(period.schedule1AAdjustment, 'period Schedule 1-A adjustment');
    if (adjustment.gt(schedule1A)) throw new Error('Form 2210 Schedule AI period Schedule 1-A adjustment cannot exceed the deduction on the return');
    if (index === 3 && !adjustment.eq(schedule1A)) throw new Error('Form 2210 Schedule AI column (d) Schedule 1-A adjustment must equal the deduction on the return');
    const taxable = Decimal.max(0, line13.minus(adjustment));
    const annualizedDividends = qualifiedDividends.times(multiplier), annualizedGain = netCapitalGain.times(multiplier);
    let specialOptions: { collectiblesGain: Decimal; section1250Gain: Decimal } | undefined;
    if (specialRatePreferentialIncome) {
      const signed28 = amount(period.rate28GainLoss, 'period signed 28 percent worksheet sum of lines 1 through 6', true);
      const beforeLosses = amount(period.unrecaptured1250BeforeLosses, 'period unrecaptured1250 worksheet line13 before losses');
      if (index === 3 && (!signed28.eq(specialRatePreferentialIncome.rate28GainLoss) || !beforeLosses.eq(specialRatePreferentialIncome.unrecaptured1250BeforeLosses))) throw new Error('Form 2210 Schedule AI column (d) special source components must each reconcile to the completed return');
      const annualized28 = signed28.times(multiplier), annualizedBefore = beforeLosses.times(multiplier);
      specialOptions = { collectiblesGain: Decimal.max(0, annualized28), section1250Gain: Decimal.max(0, annualizedBefore.plus(Decimal.min(0, annualized28))) };
      for (const [id, value, label] of [['rate28-gain-loss',annualized28,'Annualized signed 28 percent worksheet total'],['unrecaptured1250-before-losses',annualizedBefore,'Annualized1250 worksheet line13 before losses'],['collectibles-gain',specialOptions.collectiblesGain,'Annualized completed ScheduleD18'],['section1250-gain',specialOptions.section1250Gain,'Annualized completed ScheduleD19']] as const) audit.record(FORM, `14-${id}-${column}`, label, value, 'Actual period worksheet sources; 28percent sum1-6 and1250 lines13-18');
    }
    const tax = qualifiedDividends.gt(0) || netCapitalGain.gt(0)
      ? calculateCapitalGainsTax(taxable, annualizedDividends, annualizedGain, filingStatus, constants, specialOptions).tax
      : calculateRegularIncomeTax(taxable, filingStatus, constants);
    if (preferentialContext) {
      audit.record(FORM, `14-qualified-dividends-${column}`, 'Annualized qualified dividends', annualizedDividends, 'Actual cumulative qualified dividends times the annualization factor');
      audit.record(FORM, `14-net-capital-gain-${column}`, 'Annualized net capital gain', annualizedGain, 'Actual cumulative net capital gain times the annualization factor');
    }
    const profit = amount(period.netProfitFromSelfEmployment, 'period self-employment profit', true);
    const line28 = periodEarningsSubjectToSelfEmploymentTax(profit, constants.selfEmploymentTax.earningsMultiplier);
    const periodWageBase = wageBase.times(WAGE_LIMIT_TWELFTHS[index]!).div(12), ssRate = SOCIAL_SECURITY[index]!, medicareRate = MEDICARE[index]!;
    const periodWages = amount(period.socialSecurityWages, 'period social security wages');
    const line31 = Decimal.max(0, periodWageBase.minus(periodWages));
    const line33 = Decimal.min(line28, line31).times(ssRate), line35 = line28.times(medicareRate);
    let line36 = line33.plus(line35);
    if(ownerFacts&&ownerContext){
      let totalProfit=new Decimal(0),totalWages=new Decimal(0);line36=new Decimal(0);
      for(const owner of ['primary','spouse'] as const){
        const row=ownerFacts.find(item=>item.accountHolder===owner)?.periods?.[index];
        if(!row)throw new Error('Form2210 requires all actual owner periods');
        const p=amount(row.netProfitFromSelfEmployment,`${owner} period net profit`,true),w=amount(row.socialSecurityWages,`${owner} period SocialSecurity payroll`);
        totalProfit=totalProfit.plus(p);totalWages=totalWages.plus(w);
        const n = periodEarningsSubjectToSelfEmploymentTax(p, constants.selfEmploymentTax.earningsMultiplier);
        const cap=Decimal.max(0,periodWageBase.minus(w));
        const ss=Decimal.min(n,cap).times(ssRate),med=n.times(medicareRate),tax=ss.plus(med);
        line36=line36.plus(tax);
        for(const [id,value,label] of [['28',n,'Actual owner net earnings'],['29',periodWageBase,'Owner prorated wage base'],['30',w,'Actual owner SocialSecurity payroll'],['31',cap,'Owner remaining wage base'],['33',ss,'Owner annualized SocialSecurity tax'],['35',med,'Owner annualized Medicare tax'],['36',tax,'Owner annualized self-employment tax']] as const)audit.record(FORM,`${id}${column}-${owner}`,label,value,`Separate actual ${owner} PartII`,{'Taxpayer owner':owner});
      }
      if(!totalProfit.eq(profit)||!totalWages.eq(periodWages))throw new Error('Form2210 combined period profit/payroll contradict actual owner source sums');
      audit.record(FORM,`15${column}`,'Combined separate-owner self-employment tax',line36,'Sum each actual owner PartII line36 once');
      if(index===3&&(!amount(period.otherTaxes,'full-year other taxes').eq(ownerContext.otherTaxes)||!amount(period.credits,'full-year credits').eq(ownerContext.credits)))throw new Error('Form2210 full-year other taxes and credits must separately reconcile to actual canonical sources');
    } else {
      for (const [line, value, description] of [
        ['28', line28, 'Net earnings subject to self-employment tax'], ['30', periodWages, 'Social Security wages'],
        ['31', line31, 'Remaining Social Security wage base'], ['33', line33, 'Annualized Social Security tax'],
        ['35', line35, 'Annualized Medicare tax'],
      ] as const) audit.record(FORM, `${line}${column}`, description, value, `Schedule AI line${line}`);
    }
    const line16 = amount(period.otherTaxes, 'period other taxes'), line18 = amount(period.credits, 'period credits');
    const line17 = tax.plus(line36).plus(line16);
    const line19 = Decimal.max(0, line17.minus(line18));
    const line21 = line19.times(PERCENTS[index]!), line23 = Decimal.max(0, line21.minus(priorInstallments));
    if (index === 3) {
      const reconciled = roundDollar(annualized).eq(roundDollar(returnContext.agi)) && roundDollar(taxable).eq(roundDollar(returnContext.taxableIncome))
        && (returnContext.itemizedDeductions === undefined || roundDollar(itemized).eq(roundDollar(returnContext.itemizedDeductions)));
      if (!reconciled) throw new Error('Form 2210 Schedule AI column (d) income and deductions must reconcile to the completed return; other deductions with no line here need a separate method');
      // The return rounds Schedule SE parts separately, so tax can differ by small dollars.
      if (line19.minus(input.taxAfterRefundableCredits).abs().gt(2)) throw new Error('Form 2210 Schedule AI column (d) tax after credits must reconcile to Form 2210 line 4');
    }
    const line26 = line24.plus(line25), line27 = Decimal.min(line23, line26);
    for (const [line, value, description] of [['3', annualized, 'Annualized income'], ['6', itemized, 'Annualized itemized deductions'], ['7', line7, 'Standard deduction'],
      ['8', deduction, 'Larger annualized itemized or standard deduction'], ['9', line9, 'QBI deduction'], ['13', line13, 'Annualized taxable income'], ['14', tax, 'Tax on annualized income'],
      ['36', line36, 'Annualized self-employment tax'], ['16', line16, 'Other taxes'], ['18', line18, 'Credits'], ['19', line19, 'Annualized tax after credits'], ['21', line21, 'Applicable percentage of tax'],
      ['22', priorInstallments, 'Previous required installments'], ['23', line23, 'Line21 less line22'], ['24', line24, 'One-fourth of line9'], ['25', line25, 'Carried limit'],
      ['26', line26, 'Line24 plus line25'], ['27', line27, 'Required installment']] as const) {
      audit.record(FORM, `${line}${column}`, description, value, `Schedule AI line${line}`);
    }
    if (!schedule1A.isZero()) audit.record(FORM, `14-adjustment-${column}`, 'Schedule 1-A amount subtracted from line13 before tax', adjustment, 'Schedule AI line14 instruction');
    installments.push(line27);
    priorInstallments = priorInstallments.plus(line27);
    line25 = line26.minus(line27);
  });
  if(ownerContext)audit.record(FORM,'owner-source-commitment','Actual two-owner original source commitment',new Decimal(0),'Digest only; no original private references printed',{'Original source commitment':ownerContext.sourceCommitment});
  return { installments, lines: audit.getLines() };
}
