/** Fictional complete documentary originals, never an actual taxpayer record. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { ohio2026OrdinaryFixture } from './oh-2026-ordinary-return.js';

export function ohio2026ResidentCapitalGainFixture(gain = '400000', annualPayroll = '100000', wages = '50000') {
  const ordinary = ohio2026OrdinaryFixture('full_year_resident', wages);
  const input = ordinary.input;
  delete input.ohioPayments;
  const securityIdentifier = '000000AA7', issuerIdentity = 'PRIVATE-FICTIONAL-ISSUER CORPORATION';
  const identity = { ownerReference: 'PRIVATE-CAPITAL-OWNER', entityReference: JSON.stringify(['CUSIP', securityIdentifier, issuerIdentity]), saleReference: 'PRIVATE-CAPITAL-SALE' };
  const transaction = { description: 'PRIVATE-ORIGINAL-SHARE-LOT', securityIdentifier, issuerIdentity, dateAcquired: '2019-06-01', dateSold: '2026-07-15',
    proceeds: new Decimal(gain).plus('50000').toFixed(), costBasis: '50000', adjustments: '0',
    basisReportedToIRS: true, holdingPeriod: 'long' as const, washSale: false, washSaleDisallowed: '0',
    digitalAsset: false, sourceDocumentType: '1099-b' as const };
  input.form1099B = [{ broker: 'PRIVATE-BROKER', sourceId: 'PRIVATE-ORIGINAL-STATEMENT', taxYear: 2026,
    accountReference: 'PRIVATE-BROKER-ACCOUNT', accountHolder: 'primary', federalWithheld: '0', stateWithheld: '0', state: 'OH', transactions: [transaction] }];
  input.priorYear = { capitalLossCarryforward: '0', shortTermCapitalLoss: '0', longTermCapitalLoss: '0' };
  if (!input.ohioResidency?.owners[0]?.amounts) throw new Error('Complete fictional resident source required');
  input.ohioResidency.noBusinessIncomeConfirmed = false;
  input.ohioResidency.owners[0].amounts.capitalGains = { federalAmount: gain, residentAmount: gain, nonresidentOhioAmount: '0', sourceReference: 'PRIVATE-CURRENT-CAPITAL-GAIN' };
  const sources = {
    methodId: 'oh-2026-resident-capital-gain-draft-v1' as const,
    taxYear: 2026, sourceReference: 'PRIVATE-COMPLETE-RESIDENT-ORIGINALS', sourceFactsConfirmed: true,
    calendarYearConfirmed: true, allIncomeAndAdjustmentOriginalsIncludedConfirmed: true,
    noOtherIncomeOrAdjustmentSourcesConfirmed: true, noOtherOhioAdditionsOrDeductionsConfirmed: true,
    noOtherOhioCreditOrTaxSourcesConfirmed: true, noOtherStateTaxOnOhioResidentIncomeConfirmed: true,
    noTaxingSchoolDistrictResidencyConfirmed: true, noQualifyingEitcChildrenConfirmed: true,
    originalTaxInput: {} as TaxYearInput,
    employmentOriginal: structuredClone(ordinary.sources.employmentOriginals[0]),
    saleAgreementOriginal: { ...identity, sourceReference: 'PRIVATE-ORIGINAL-SALE-AGREEMENT', sourceTaxYear: 2026,
      sourceFactsConfirmed: true, completeExecutedAgreementAndIssuerReconciliationConfirmed: true,
      owner: { firstName: input.taxpayer.primary.firstName, lastName: input.taxpayer.primary.lastName, ssn: input.taxpayer.primary.ssn },
      securityIdentifier, issuerIdentity, dateSold: transaction.dateSold, sharesTransferred: '20',
      federalReportedProceeds: transaction.proceeds, proceedsReconciliationConfirmed: true },
    equityOriginal: { ...identity, securityIdentifier, issuerIdentity, sourceReference: 'PRIVATE-ORIGINAL-SALE-AGREEMENT', sourceTaxYear: 2026,
      owner: { firstName: input.taxpayer.primary.firstName, lastName: input.taxpayer.primary.lastName, ssn: input.taxpayer.primary.ssn },
      formSourceId: 'PRIVATE-ORIGINAL-STATEMENT', accountReference: 'PRIVATE-BROKER-ACCOUNT', transactionIndex: 0,
      originalTransaction: structuredClone(transaction), equityType: 'c_corporation_common_stock',
      acquisition: { sourceReference: 'PRIVATE-ORIGINAL-PURCHASE-AGREEMENT', date: '2019-06-01',
        method: 'secondary_market_cash_purchase', acquiredAtOriginalIssue: false,
        noSection1202FOrHExceptionConfirmed: true, continuousUnchangedSharesConfirmed: true,
        completeAcquisitionAndDispositionHistoryConfirmed: true } },
    carryoverOriginal: { sourceReference: 'PRIVATE-2025-COMPLETED-LOSS-WORKSHEET', sourceTaxYear: 2025,
      ownerReference: identity.ownerReference, completeCapitalCarryoverWorksheetConfirmed: true,
      capitalLossCarryforward: '0', shortTermCapitalLoss: '0', longTermCapitalLoss: '0' },
    qualifyingCapitalGainSources: {
      taxYear: 2026, calendarYearConfirmed: true, asOfDate: '2027-03-01', ownerReference: identity.ownerReference,
      sale: { ...identity, sourceReference: 'PRIVATE-ORIGINAL-SALE-AGREEMENT', date: transaction.dateSold, capitalGain: gain,
        directEquitySaleConfirmed: true, onlySaleForOwnerConfirmed: true, equalRightsSingleClassConfirmed: true },
      recognition: { ...identity, sourceReference: 'PRIVATE-COMPLETED-FEDERAL-GAIN', taxYear: 2026,
        saleDate: transaction.dateSold, reportedToIrsConfirmed: true, currentGainInclusionAndExclusionsComplete: true,
        noInstallmentOrDeferredRecognitionConfirmed: true, noUnresolvedCapitalLossNettingConfirmed: true,
        reportedCapitalGain: gain, includedFederalAgi: gain, otherwiseOhioDeductedOrExcluded: '0' },
      entity: { entityReference: identity.entityReference, sourceReference: 'PRIVATE-ORIGINAL-ENTITY-HISTORY', organizationMethod: 'incorporated',
        ohioOrganizationFrom: '2010-01-01', ohioOrganizationThrough: transaction.dateSold,
        ohioHeadquartersFrom: '2010-01-01', ohioHeadquartersThrough: transaction.dateSold,
        continuousHistoryConfirmed: true, ohioTradeOrBusinessAtSaleConfirmed: true },
      participation: { ownerReference: identity.ownerReference, entityReference: identity.entityReference, sourceReference: 'PRIVATE-COMPLETED-PARTICIPATION-ASSESSMENT',
        method: '5747.79(A)(1)(a)(i)', coveredFrom: '2021-07-15', coveredThrough: transaction.dateSold,
        federalCriterion: 'a1', completeApplicableFederalConditionsConfirmed: true },
      ownership: { ...identity, sourceReference: 'PRIVATE-ORIGINAL-CAPITALIZATION-AND-TRANSFER',
        totalEntityUnits: '100', ownerUnitsBefore: '40', unitsSold: '20', percentageOfEntireEntitySold: '20',
        completeCapitalizationAndTransferConfirmed: true },
      payroll: [2021, 2022, 2023, 2024, 2025].map(year => ({ year, entityReference: identity.entityReference,
        sourceReference: `PRIVATE-ORIGINAL-PAYROLL-${year}`, completeAnnualCompensationConfirmed: true,
        withholdingBaseReconciliationConfirmed: true, stableRecipientIdentitiesConfirmed: true,
        annual5747_06ACompensation: annualPayroll,
        recipients: [{ recipientReference: 'PRIVATE-UNRELATED-WORKER', sourceReference: `PRIVATE-ORIGINAL-PAYROLL-${year}`,
          originalPayrollRowReference: `PRIVATE-ORIGINAL-ROW-${year}`, relationship: 'not-enumerated', relationshipConfirmed: true,
          compensationPaid: annualPayroll, compensationUsedFor5747_06A: annualPayroll }] })),
    },
  };
  const packet = { input, sources };
  rebindOhio2026ResidentCapitalGain(packet);
  return packet;
}
export function rebindOhio2026ResidentCapitalGain(packet: ReturnType<typeof ohio2026ResidentCapitalGainFixture>) {
  const { ohioResidency: _residency, ...federal } = packet.input;
  if (!packet.input.ohioResidency) throw new Error('Fictional complete residency required');
  packet.input.ohioResidency.originalFederalSources = structuredClone(federal);
  packet.sources.originalTaxInput = structuredClone(packet.input);
}
