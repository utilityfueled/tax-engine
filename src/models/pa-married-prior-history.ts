/** Actual prior documents. Empty drafts are unknown; no derived relief flag. */
import {z} from 'zod';
const answer=z.boolean().nullable();
const identity={name:z.string(),ssn:z.string()};
const columns=z.object({'1':z.string(),'2':z.string(),'3':z.string(),'4':z.string(),'5':z.string(),'6':z.string(),'7':z.string(),'8':z.string(),'9':z.string(),'10':z.string()}).strict();
export const PAMarriedPriorHistorySchema=z.object({
 sourceTaxYear:z.number().int().nullable(),sourceReference:z.string(),sourceFactsConfirmed:answer,
 rows:z.array(z.object({accountHolder:z.enum(['','primary','spouse']),sourceReference:z.string(),
  originalPA40:z.object({...identity,taxYear:z.number().int().nullable(),returnType:z.string(),filingStatus:z.string(),residency:z.string(),filedOn:z.string(),filedConfirmed:answer,taxableIncome:z.string(),taxLiability:z.string(),taxForgivenessCredit:z.string()}).strict(),
  originalSP:z.object({...identity,spouse:z.object(identity).strict(),taxYear:z.number().int().nullable(),returnType:z.string(),filingCategory:z.string(),calendarFrom:z.string(),calendarThrough:z.string(),marriedAndLivedTogetherEntireYearConfirmed:answer,bothAliveEntireYearConfirmed:answer,neitherClaimedAsDependentConfirmed:answer,noDependentChildrenConfirmed:answer,allWorldwideSourcesCompleteConfirmed:answer,noOtherStateTaxCreditConfirmed:answer,taxpayerColumn:columns,spouseColumn:columns,line11:z.string(),line12:z.string(),line13:z.string(),line14:z.string(),line15:z.string(),line16:z.string()}).strict(),
 }).strict()),capturedOriginals:z.record(z.string(),z.unknown()).optional(),
}).strict();
export type PAMarriedPriorHistory=z.infer<typeof PAMarriedPriorHistorySchema>;
