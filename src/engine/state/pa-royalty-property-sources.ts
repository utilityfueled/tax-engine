/** Actual PA Schedule E royalty sources; spec/state/pa-royalty-property-sources.yaml. */
import Decimal from 'decimal.js';
import { calculateRoyaltyPropertySources, type RoyaltyPropertyReturnInput } from '@/engine/forms/royalty-property-sources.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum } from '@/utils/decimal.js';

export type PARoyaltyPropertyInput = RoyaltyPropertyReturnInput & {
  taxpayer?: NonNullable<RoyaltyPropertyReturnInput['taxpayer']> & Pick<TaxYearInput['taxpayer'], 'stateResidency'>;
};
export interface PARoyaltyPropertyResult {
  sourceIndex: number;
  accountHolder: 'primary' | 'spouse';
  grossIncome: Decimal;
  allowableExpenses: Decimal;
  disallowedSurfaceExpenses: Decimal;
  netIncome: Decimal;
  lines: CalculatedLine[];
}
export interface PARoyaltyPropertySourcesResult {
  properties: PARoyaltyPropertyResult[];
  grossIncome: Decimal;
  allowableExpenses: Decimal;
  netIncome: Decimal;
  lines: CalculatedLine[];
}

function amount(value: string | undefined): Decimal {
  if (value === undefined || !/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('PA royalty expense requires its actual paid amount');
  const result=d(value);
  if(!result.isFinite()) throw new Error('PA royalty expense must be finite');
  return result;
}
function round(value: Decimal): Decimal { return value.toDecimalPlaces(0,Decimal.ROUND_HALF_UP); }

/** Recompute from original sources; no federal-net or entered state-net shortcut. */
export function calculatePARoyaltyPropertySources(input: PARoyaltyPropertyInput): PARoyaltyPropertySourcesResult {
  const sources=input.royaltyPropertySources;
  if(!sources) return {properties:[],grossIncome:sum(...input.form1099Misc.map(row=>d(row.royalties))),allowableExpenses:d(0),netIncome:sum(...input.form1099Misc.map(row=>d(row.royalties))),lines:[]};
  if(input.taxpayer?.stateResidency!=='full-year') throw new Error('PA royalty source classification requires actual full-year resident facts');
  const original=calculateRoyaltyPropertySources(input),audit=new AuditTrail();
  const properties=original.properties.map(property=>{
    const source=sources.properties?.[property.sourceIndex],pa=source?.paTreatment;
    if(!source || !pa || pa.sourceTaxYear!==input.taxpayer?.taxYear || !pa.sourceReference?.trim()
      || pa.sourceFactsConfirmed!==true || pa.accountHolder!==property.accountHolder
      || pa.propertyType!==source.propertyType || pa.ownerFullYearPAResident!==true
      || pa.paIncomeClass!=='royalties-copyrights-patents' || pa.forProfit!==true
      || pa.allExpenseClassificationsIncluded!==true || pa.expenses===undefined) {
      throw new Error('PA royalty property requires matching year, classification, resident owner and confirmed expense sources');
    }
    if(!pa.propertyType || !['copyright','patent','nonoperating-mineral'].includes(pa.propertyType)) throw new Error('PA royalty property type requires its separate classification method');
    const receipts=source.expenses ?? [],seen=new Set<string>(),parts={'6':d(0),'7':d(0),'8':d(0),'9':d(0),'14':d(0)};
    const categories={commissions:'6',insurance:'7','legal-professional':'8','management-fees':'9','property-production-taxes':'14'} as const;
    let disallowedSurfaceExpenses=d(0);
    for(const stateReceipt of pa.expenses){
      const receipt=receipts.find(row=>row.sourceId===stateReceipt.sourceId);
      if(!receipt || !stateReceipt.sourceId || seen.has(stateReceipt.sourceId)
        || receipt.category!==stateReceipt.category || receipt.paidDate!==stateReceipt.paidDate
        || !amount(receipt.amountPaid).eq(amount(stateReceipt.amountPaid))) {
        throw new Error('PA royalty original receipt identity, date, category or amount changed or duplicated');
      }
      seen.add(stateReceipt.sourceId);
      if(stateReceipt.netIncomeTax!==false || stateReceipt.surfaceRights===undefined
        || stateReceipt.relatesToRoyaltyRights===undefined) throw new Error('PA royalty expense requires its actual tax and property-right classification');
      if(stateReceipt.surfaceRights){
        if(pa.propertyType!=='nonoperating-mineral' || stateReceipt.relatesToRoyaltyRights) throw new Error('PA royalty surface and subsurface expense classifications conflict');
        disallowedSurfaceExpenses=disallowedSurfaceExpenses.plus(amount(receipt.amountPaid));
      } else {
        if(!stateReceipt.relatesToRoyaltyRights || !receipt.category) throw new Error('PA royalty expense must relate to the actual royalty rights');
        const line=categories[receipt.category];parts[line]=parts[line].plus(amount(receipt.amountPaid));
      }
    }
    if(seen.size!==receipts.length) throw new Error('PA royalty source classifications must include every original expense receipt');
    const propertyAudit=new AuditTrail(),prefix=`${property.sourceIndex}:`,grossIncome=round(property.grossIncome);
    propertyAudit.record('PA-Royalty-Property',`${prefix}2`,'Gross royalties received',grossIncome,'Round the conserved original MISC gross once for the actual owner property');
    const rounded=Object.entries(parts).map(([line,value])=>{
      const result=round(value);propertyAudit.record('PA-Royalty-Property',prefix+line,'Allowed current royalty expense category',result,'Sum actual allowed receipts in this category, then round the printed line');return result;
    });
    const allowableExpenses=sum(...rounded),netIncome=grossIncome.minus(allowableExpenses);
    propertyAudit.record('PA-Royalty-Property',`${prefix}19`,'Total allowed property expenses',allowableExpenses,'Sum rounded expense categories');
    propertyAudit.record('PA-Royalty-Property',`${prefix}20`,'Property net income',Decimal.max(0,netIncome),'Positive gross less actual PA expenses');
    propertyAudit.record('PA-Royalty-Property',`${prefix}21`,'Property net loss',Decimal.max(0,netIncome.negated()),'Positive current loss magnitude; no federal carryover');
    propertyAudit.record('PA-Royalty-Property',`${prefix}surface-excluded`,'Actual surface-right expenses excluded',disallowedSurfaceExpenses,'Actual receipt amounts; excluded from the royalty deduction');
    const lines=propertyAudit.getLines();audit.merge(lines);
    return {sourceIndex:property.sourceIndex,accountHolder:property.accountHolder,grossIncome,allowableExpenses,disallowedSurfaceExpenses,netIncome,lines};
  });
  return {properties,grossIncome:sum(...properties.map(row=>row.grossIncome)),allowableExpenses:sum(...properties.map(row=>row.allowableExpenses)),netIncome:sum(...properties.map(row=>row.netIncome)),lines:audit.getLines()};
}
