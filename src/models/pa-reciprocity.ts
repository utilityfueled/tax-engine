/** Private original-bound reciprocal employee proof; blanks remain unknown. */
import { z } from "zod";
const answer = z.boolean().nullable();
const year = z.number().int().nullable();
const index = z.number().int().nullable();
const original = z.record(z.string(), z.unknown()).optional();
const owner = z.object({ firstName:z.string(), lastName:z.string(), ssn:z.string() }).strict();
export const PAReciprocitySourcesSchema = z.object({
 sourceTaxYear:year, sourceReference:z.string(), sourceFactsConfirmed:answer,
 owner:z.object({accountHolder:z.enum(["", "primary", "spouse"]),originalTaxpayer:owner.optional()}).strict(),
 originals:z.array(z.object({originalIndex:index,sourceTaxYear:year,sourceReference:z.string(),sourceFactsConfirmed:answer,
 originalW2:original,zeroOrOneStateRowOnActualOriginalConfirmed:answer,
 paWithholdingStatus:z.enum(["","reported_PA_box17","no_PA_row_on_original"]),actualPAWithheld:z.string(),noAdditionalPAStateRowOnOriginalConfirmed:answer,
 refundRequested:answer,refundSupportFactsConfirmed:answer,w2CopySourceReference:z.string(),
 residentStateReturn:z.object({sourceTaxYear:year,state:z.string(),ownerOriginal:owner.optional(),sourceReference:z.string(),filedConfirmed:answer}).strict(),
 residencyStatementSourceReference:z.string()}).strict()),
 segments:z.array(z.object({originalIndex:index,payrollIndex:index,sourceReference:z.string(),sourceFactsConfirmed:answer,actualPayroll:original,
 reciprocalState:z.string(),employeeCompensationOnlyConfirmed:answer,compensationLegallySubjectToEmployerWithholdingConfirmed:answer,
 earnedWhileReciprocalResidentConfirmed:answer,noPAResidentEarnedDeferredCompensationConfirmed:answer,
 employerIsPASCorporation:answer,shareholderEmployee:answer,actualOwnershipPercent:z.string()}).strict())
}).strict();
export type PAReciprocitySources = z.infer<typeof PAReciprocitySourcesSchema>;
