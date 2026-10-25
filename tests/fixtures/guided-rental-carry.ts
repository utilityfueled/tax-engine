import type { RentalCarryoverData } from '@/lib/guided-rental-carry-sources';

/** Fictional filed sources, never application defaults. */
export const actualGuidedRentalCarry: RentalCarryoverData = {
  sourceTaxYear: '2024', sourceReference: 'Synthetic filed rental loss packet', sourceFactsConfirmed: true,
  propertyDescription: '100 Actual Rental Road, Columbus OH 43215', ownerName: 'Jordan Example', ownerTaxpayerIdLast4: '3333',
  priorFilingStatus: 'single', sameTaxpayersConfirmed: true, ownershipUnchangedConfirmed: true,
  activityContinuesConfirmed: true, ordinaryRentalLossesOnly: true, ownerAmountsConfirmed: true, allPriorLossesIncluded: true,
  amtSourceReference: 'Synthetic separate AMT rental comparison', amtBasisAndDepreciationMatch: true,
  amtPriorLossMatches: true, amtAllowedLossMatches: true,
  vintages: [{ taxYear: '2024', originalLoss: '5000', qualifiedOriginalLoss: '5000', remainingLoss: '3000',
    qualifiedRemainingLoss: '3000', activelyParticipatedInLossYear: true, materiallyParticipatedInCurrentYear: false }],
};
