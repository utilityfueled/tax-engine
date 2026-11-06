/** Finite standalone worksheet evidence; never canonical owner qualification. */
import {z} from 'zod';
import Decimal from 'decimal.js';
const money=z.string().max(100).refine(v=>/^\d+(\.\d+)?$/.test(v)&&new Decimal(v).isFinite(),'Finite nonnegative decimal required');
const reference=z.string().min(1).max(500).refine(v=>v.trim().length>0,'Original reference required');
function date(v:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const [y,m,d]=v.split('-').map(Number);return y>=2025&&y<=2026&&new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===v;
}
const actualDate=z.string().refine(date,'Actual calendar date required');
const zeroBonus=z.strictObject({treatment:z.literal('elected_out'),electionClass:z.literal('5_year'),electionTaxYear:z.literal(2026),sourceReference:reference,classElectionOutReference:reference,noReducedRateElection:z.literal(true),qualified100Percent:z.literal(false)});
const fullBonus=z.strictObject({treatment:z.literal('qualified_100_percent'),electionClass:z.literal('5_year'),electionTaxYear:z.literal(2026),sourceReference:reference,classElectionOutReference:z.null(),noReducedRateElection:z.literal(true),qualified100Percent:z.literal(true)});
export const PassengerFirstYearSourcesSchema=z.strictObject({
 version:z.literal('passenger-first-year-v1'),sourceTaxYear:z.literal(2026),
 sourceReference:reference,invoiceReference:reference,purchaseContractReference:reference,eligibilityReference:reference,mileageReference:reference,electionReference:reference,partIReference:reference,inventoryReference:reference,
 originalForm:z.record(z.string(),z.unknown()),grossCostBasis:money,acquisitionDate:actualDate,purchaseContractDate:actualDate,unloadedVehicleWeightPounds:money,businessUsePercentage:money,
 vehicleIdentity:z.strictObject({make:reference,model:reference,modelYear:z.literal(2026),vin:z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/),recordReference:reference}),
 mileage:z.strictObject({writtenEvidenceConfirmed:z.literal(true),businessMiles:money,commutingMiles:money,otherPersonalMiles:money,totalMiles:money}),
 eligibility:z.strictObject({cashSoleProprietor:z.literal(true),activeTradeOrBusiness:z.literal(true),noTaxExemptUseOrADSRequirement:z.literal(true),noAlternativeMileageMethod:z.literal(true),notDeductedElsewhere:z.literal(true),newOriginalUse:z.literal(true),purchased:z.literal(true),owned:z.literal(true),domesticBusiness:z.literal(true),fourWheeledRoadCar:z.literal(true),ordinaryPassengerCar:z.literal(true),noVehicleException:z.literal(true),noRelatedOrCompensatoryUse:z.literal(true),allBusinessUseQualified:z.literal(true),noInvestmentUse:z.literal(true),noOtherAssetsOrActivities:z.literal(true),fullCalendarYear:z.literal(true),noBasisAdjustmentsOrCredits:z.literal(true),noConversionOrCarryoverBasis:z.literal(true),noPriorUseOrDepreciation:z.literal(true),noDispositionOrUseChange:z.literal(true),noMarriedSeparateLimit:z.literal(true),section179Eligible:z.literal(true),noOtherSection179Property:z.literal(true)}),
 partI:z.strictObject({maximum:money,threshold:money,totalCost:money,electedCost:money,businessIncomeLimit:money,allowedSection179:money,priorCarryover:money,nextCarryover:money}),
 bonus:z.discriminatedUnion('treatment',[zeroBonus,fullBonus]),
});
export type PassengerFirstYearSources=z.infer<typeof PassengerFirstYearSourcesSchema>;
