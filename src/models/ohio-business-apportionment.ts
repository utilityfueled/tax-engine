import { z } from 'zod';

// Finite first-source contract: exact cents, bounded to retain exact factor tests.
const money = z.string().regex(/^-?\d{1,15}(?:\.\d{1,2})?$/);
const reference = z.string().trim().min(1);
const owner = z.enum(['primary', 'spouse']);
const residency = z.enum(['nonresident', 'part_year_resident']);
const amountPair = z.object({ ohio: money, everywhere: money }).strict();
const original = z.record(z.string(), z.unknown());

export const OhioBusinessApportionmentInputSchema = z.object({
  taxYear: z.union([z.literal(2025), z.literal(2026)]),
  filingStatus: z.enum(['single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household', 'qualifying_surviving_spouse']),
  federalAgi: money,
  // These are current canonical source projections, never caller credit overrides.
  originalBusinesses: z.array(z.object({
    businessSourceId: reference,
    accountHolder: owner,
    ownerResidencyStatus: residency,
    original,
    netProfit: money,
    grossReceipts: money,
    employeeCompensation: money,
    netAnnualRent: money,
  }).strict()).min(1),
  facts: z.object({
    taxYear: z.union([z.literal(2025), z.literal(2026)]),
    sourceReference: reference,
    sourceFactsConfirmed: z.literal(true),
    allBusinessesIncludedConfirmed: z.literal(true),
    noOtherBusinessIncomeOrAdjustmentsConfirmed: z.literal(true),
    noFullYearResidentBusinessOwnersConfirmed: z.literal(true),
    businesses: z.array(z.object({
      businessSourceId: reference,
      accountHolder: owner,
      ownerResidencyStatus: residency,
      sourceTaxYear: z.union([z.literal(2025), z.literal(2026)]),
      sourceReference: reference,
      sourceFactsConfirmed: z.literal(true),
      originalBusiness: original,
      ordinarySoleProprietorshipConfirmed: z.literal(true),
      fullCalendarYearBusinessConfirmed: z.literal(true),
      noLowerTierEntitiesConfirmed: z.literal(true),
      noSpecialIndustryOrAlternativeAllocationConfirmed: z.literal(true),
      noSpecialBusinessSaleConfirmed: z.literal(true),
      noOhioDepreciationAdjustmentsConfirmed: z.literal(true),
      noOtherBusinessIncomeOrAdjustmentsConfirmed: z.literal(true),
      property: z.object({
        sourceReference: reference,
        originalCostAndStatutoryExclusionsConfirmed: z.literal(true),
        ownedBeginning: amountPair,
        ownedEnd: amountPair,
        annualRent: amountPair,
        annualSubrent: amountPair,
        fullYearUnchangedRentalConfirmed: z.literal(true),
      }).strict(),
      payroll: amountPair.extend({
        sourceReference: reference,
        qualifyingEmployeeCompensationConfirmed: z.literal(true),
        noResearchOrSpecialIndustryPayrollConfirmed: z.literal(true),
      }).strict(),
      sales: z.object({
        sourceReference: reference,
        allReceiptsIncludedConfirmed: z.literal(true),
        noDuplicateReceiptSourcesConfirmed: z.literal(true),
        ordinaryServicesAndStatutoryExclusionsConfirmed: z.literal(true),
        rows: z.array(z.object({
          receiptId: reference,
          sourceReference: reference,
          grossReceipt: money,
          ohioBenefitReceipt: money,
          purchaserBenefitSitusingConfirmed: z.literal(true),
        }).strict()),
      }).strict(),
    }).strict()).min(1),
  }).strict(),
}).strict();

export type OhioBusinessApportionmentInput = z.infer<typeof OhioBusinessApportionmentInputSchema>;
