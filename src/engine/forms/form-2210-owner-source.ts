/** Actual canonical owner context. Spec: form-2210-schedule-ai two-owner-canonical. */
import Decimal from 'decimal.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import type {TaxYearInput} from '@/models/inputs.js';
import type {ScheduleSEResult} from '@/engine/schedules/schedule-se.js';
export interface Form2210OwnerSourceContext {
  sourceCommitment: string;
  owners: {accountHolder:'primary'|'spouse'; netProfit:Decimal; socialSecurityWages:Decimal}[];
  otherTaxes:Decimal; credits:Decimal;
}
/** Only canonical computed amounts enter this context; no taxpayer profit override. */
export function buildForm2210OwnerSourceContext(input:TaxYearInput,se:ScheduleSEResult,otherTaxes:Decimal,credits:Decimal):Form2210OwnerSourceContext|undefined {
  if(input.form2210?.selfEmploymentOwnerPeriods===undefined) return undefined;
  const fail=()=>{throw new Error('Form2210 separate PartII owner sources require actual joint household, verified business/payroll ownership and independent ScheduleSE sources');};
  if(input.taxpayer.filingStatus!=='married_filing_jointly'||!input.taxpayer.spouse||!se.sourceFactsVerified) return fail();
  const actualOwners=new Set<'primary'|'spouse'>();
  const add=(value:unknown)=>{if(value!=='primary'&&value!=='spouse')return fail();actualOwners.add(value);};
  if(input.scheduleC) add(input.scheduleC.accountHolder);
  if(input.scheduleF) add(input.scheduleF.accountHolder);
  for(const row of input.form1099Nec) add(row.accountHolder);
  for(const row of input.scheduleK1) if(row.entityType!=='s_corporation') add(row.accountHolder);
  if(input.cryptoIncome?.businessAccountHolder) add(input.cryptoIncome.businessAccountHolder);
  for(const row of input.w2s) if(!row.accountHolder||row.socialSecurityWages===undefined||row.socialSecurityTips===undefined) return fail();
  if(!actualOwners.has('primary')||!actualOwners.has('spouse')) return fail();
  const owners=(['primary','spouse'] as const).map(accountHolder=>{
    const rows=se.perTaxpayer.filter(row=>row.accountHolder===accountHolder);
    const [row]=rows;
    if(rows.length!==1||!row) return fail();
    const payroll=row.lines.filter(line=>line.line==='8d'),[reported]=payroll;
    if(payroll.length!==1||!reported) return fail();
    return {accountHolder,netProfit:row.netSEEarnings,socialSecurityWages:reported.value};
  });
  // Existing review redaction changes structured personal IDs only. Exact source
  // references, business identity, owner, money and array order remain committed.
  const canonical=(value:unknown,key=''):unknown=>{
    if(typeof value==='string'&&/(?:ssn(?:last4)?|tin|taxid|taxpayerIdLast4|identifyingnumber(?:last4)?|accountReference)$/i.test(key)) return '';
    if(Array.isArray(value)) return value.map(item=>typeof item==='string'&&/ssns$/i.test(key)?'':canonical(item));
    if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([field,item])=>[field,canonical(item,field)]));
    return value;
  };
  const serializedSource = JSON.stringify(canonical(input));
  const sourceCommitment = bytesToHex(sha256(new TextEncoder().encode(serializedSource)));
  return {sourceCommitment,owners,otherTaxes,credits};
}
