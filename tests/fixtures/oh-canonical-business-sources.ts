/** Explicit fictional originals; independent Decimal source table frozen before engine runtime. */
import type { TaxYearInput } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';
import { ohioBusinessApportionmentFixture } from './oh-business-apportionment.js';
import { ohioNrcCategories } from './oh-residency.js';

export const canonicalOhioBusinessExpectations = [
  {
    "year": 2025,
    "profit": "100000",
    "ssBase": "176100",
    "netSE": "92350.0000",
    "socialSecurity": "11451",
    "medicare": "2678",
    "SE": "14129",
    "halfSE": "7065",
    "federalAGI": "92935",
    "BID": "92935",
    "OhioAGI": "0",
    "exemption": "1900",
    "taxable": "0",
    "taxBeforeNRC": "0",
    "factor": "0.3125",
    "sectionIII18": "31250",
    "sectionI5": "0",
    "nonresidentRatio": "0.0000",
    "NRC": "0",
    "taxAfterNRC": "0"
  },
  {
    "year": 2025,
    "profit": "400000",
    "ssBase": "176100",
    "netSE": "369400.0000",
    "socialSecurity": "21836",
    "medicare": "10713",
    "SE": "32549",
    "halfSE": "16275",
    "federalAGI": "383725",
    "BID": "250000",
    "OhioAGI": "133725",
    "exemption": "1900",
    "taxable": "131825",
    "taxBeforeNRC": "3955",
    "factor": "0.3125",
    "sectionIII18": "125000",
    "sectionI5": "0",
    "nonresidentRatio": "1.0000",
    "NRC": "3955",
    "taxAfterNRC": "0"
  },
  {
    "year": 2025,
    "profit": "1000000",
    "ssBase": "176100",
    "netSE": "923500.0000",
    "socialSecurity": "21836",
    "medicare": "26782",
    "SE": "48618",
    "halfSE": "24309",
    "federalAGI": "975691",
    "BID": "250000",
    "OhioAGI": "725691",
    "exemption": "0",
    "taxable": "725691",
    "taxBeforeNRC": "21771",
    "factor": "0.3125",
    "sectionIII18": "312500",
    "sectionI5": "62500",
    "nonresidentRatio": "0.9138",
    "NRC": "19894",
    "taxAfterNRC": "1877"
  },
  {
    "year": 2026,
    "profit": "100000",
    "ssBase": "184500",
    "netSE": "92350.0000",
    "socialSecurity": "11451",
    "medicare": "2678",
    "SE": "14129",
    "halfSE": "7065",
    "federalAGI": "92935",
    "BID": "92935",
    "OhioAGI": "0",
    "exemption": "1900",
    "taxable": "0",
    "taxBeforeNRC": "0",
    "factor": "0.3125",
    "sectionIII18": "31250",
    "sectionI5": "0",
    "nonresidentRatio": "0.0000",
    "NRC": "0",
    "taxAfterNRC": "0"
  },
  {
    "year": 2026,
    "profit": "400000",
    "ssBase": "184500",
    "netSE": "369400.0000",
    "socialSecurity": "22878",
    "medicare": "10713",
    "SE": "33591",
    "halfSE": "16796",
    "federalAGI": "383204",
    "BID": "250000",
    "OhioAGI": "133204",
    "exemption": "1900",
    "taxable": "131304",
    "taxBeforeNRC": "3939",
    "factor": "0.3125",
    "sectionIII18": "125000",
    "sectionI5": "0",
    "nonresidentRatio": "1.0000",
    "NRC": "3939",
    "taxAfterNRC": "0"
  },
  {
    "year": 2026,
    "profit": "1000000",
    "ssBase": "184500",
    "netSE": "923500.0000",
    "socialSecurity": "22878",
    "medicare": "26782",
    "SE": "49660",
    "halfSE": "24830",
    "federalAGI": "975170",
    "BID": "250000",
    "OhioAGI": "725170",
    "exemption": "0",
    "taxable": "725170",
    "taxBeforeNRC": "21755",
    "factor": "0.3125",
    "sectionIII18": "312500",
    "sectionI5": "62500",
    "nonresidentRatio": "0.9138",
    "NRC": "19880",
    "taxAfterNRC": "1875"
  }
] as const;
export type OhioBusinessStatus = 'nonresident' | 'part_year_resident';
export function canonicalOhioBusinessFixture(year: 2025 | 2026 = 2025, profit = '1000000', status: OhioBusinessStatus = 'nonresident') {
  const expected = canonicalOhioBusinessExpectations.find(row => row.year === year && row.profit === profit);
  if (!expected) throw new Error('Explicit canonical Ohio fixture requires independently stated source money');
  const input: TaxYearInput = structuredClone(simpleW2Fixture);
  input.taxpayer.taxYear = year;
  input.taxpayer.primary = { firstName: 'Fictional', lastName: 'OhioConsultant', ssn: '900-70-0411', dateOfBirth: '1990-01-15', occupation: 'Consultant' };
  input.taxpayer.address = { street: '100 Fictional Source Street', city: 'Richmond', state: 'VA', zip: '23219' };
  input.w2s = [];
  input.scheduleC = { accountHolder: 'primary', businessName: 'Fictional Current Ordinary Services', businessCode: '541990', ein: '90-7000411', accountingMethod: 'cash',
    grossReceipts: profit, returnsAndAllowances: '0', costOfGoodsSold: '0', otherIncome: '0',
    expenses: { otherExpenses: '0', wages: '0', rentOnBusinessProperty: '0', depreciation: '0' } };
  const business = ohioBusinessApportionmentFixture(profit).facts;
  business.taxYear = year;
  const row = business.businesses[0];
  if (!row) throw new Error('Explicit fictional C source row missing');
  row.sourceTaxYear = year;
  row.ownerResidencyStatus = status;
  row.originalBusiness = structuredClone(input.scheduleC) as typeof row.originalBusiness;
  row.sourceReference = `Fictional original C and annual factor records ${year}`;
  row.sales.rows = [{ receiptId: `fictional-service-invoice-${year}-001`, sourceReference: `Fictional complete December purchaser-benefit invoice records ${year}`,
    grossReceipt: profit, ohioBenefitReceipt: profit === '1000000' ? '250000' : profit === '400000' ? '100000' : '25000', purchaserBenefitSitusingConfirmed: true }];
  const deductionOriginal = { documentId: `fictional-personal-se-adjustment-${year}`, documentType: 'personal_federal_deduction_workpaper',
    accountHolder: 'primary' as const, sourceTaxYear: year, amount: expected.halfSE, date: `${year}-12-31`, paidOrAccrued: 'accrued' as const,
    sourceReference: `Fictional actual dated personal deduction accrual original ${year}`, allUnderlyingDeductionAccrualsIncludedConfirmed: true as const,
    description: 'Explicit fictional all services and personal deduction accrual outside actual Ohio domicile period; this date is an original fact, not a production default.' };
  const businessSources = { taxYear: year, sourceReference: `Fictional actual canonical C source packet ${year}`, sourceFactsConfirmed: true as const,
    facts: business, receiptOriginals: row.sales.rows.map(receipt => ({ ...structuredClone(receipt), accountHolder: 'primary' as const, sourceTaxYear: year, date: `${year}-12-15`, originalDocumentId: `fictional-current-service-original-${year}`, currentUncorrectedNonvoidConfirmed: true as const })),
    allFederalDeductionSourcesIncludedConfirmed: true as const,
    federalDeductionSources: [{ deductionId: `fictional-half-se-${year}`, accountHolder: 'primary' as const, sourceTaxYear: year,
      deductionKind: 'deductible_half_se_tax' as const, sourceReference: deductionOriginal.sourceReference, original: deductionOriginal }] };
  const amounts = Object.fromEntries(ohioNrcCategories.map(category => [category, { federalAmount: category === 'federalAdjustments' ? expected.halfSE : '0',
    residentAmount: '0', nonresidentOhioAmount: '0', sourceReference: `Fictional actual ${category} records ${year}` }]));
  const facts = { taxYear: year, sourceReference: `Fictional complete owner calendar and ordinary source records ${year}`, sourceFactsConfirmed: true as const,
    allFederalSourcesIncludedConfirmed: true as const, noBusinessIncomeConfirmed: false,
    schoolDistrictStatus: 'no_ohio_taxing_district_residency' as const, originalFederalSources: structuredClone(input), businessSources,
    owners: [{ accountHolder: 'primary' as const, status, sourceReference: `Fictional actual primary domicile original ${year}`,
      periods: status === 'nonresident' ? [{ from: `${year}-01-01`, to: `${year}-12-31`, domicileState: 'VA' }] : [
        { from: `${year}-01-01`, to: `${year}-06-30`, domicileState: 'OH' }, { from: `${year}-07-01`, to: `${year}-12-31`, domicileState: 'VA' }],
      amounts, stateAdditions: [], stateDeductions: [] }] };
  return { input, facts, expected };
}
