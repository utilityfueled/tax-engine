import { startCompleteInterview, completeW2Entry } from './complete-facts';
import { actualTipIncome } from './guided-tip-income-fixtures';
export function nativeRRTA() {
    const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['additional-deductions'], stateCode: null });
    state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, sourceTaxYear: '2025', employerName: 'Fictional Railroad', employerEin: '11-1111111', wages: '230000', federalWithheld: '60000', allocatedTips: '0' }] };
    const tips = actualTipIncome();
    tips.railroadRetirementCompensation = '230000';
    tips.noncashTipsNotIncludedInWages = '0';
    tips.employers[0] = { ...need(tips.employers[0]), w2SourceIds: [], cashAndChargeTipsReceived: '1000', tipsReportedToEmployer: '0', allocatedTips: '0', smallTipMonths: [] };
    const rrta = { sourceTaxYear: '2025', sourceReference: 'Actual railroad annual payroll and Box14 originals', sourceFactsConfirmed: null, allRRTASourcesIncludedConfirmed: true, noEmployeeRepresentativeCompensationConfirmed: true, noCorrectionsConfirmed: true, noOtherRRTATaxAdjustmentsConfirmed: true, noSelfEmploymentIncomeConfirmed: true, sources: [{ sourceId: 'rail-original', w2SourceId: 'formW2:0', owner: 'primary' as const, sourceTaxYear: '2025', sourceReference: 'Actual W2 Box14 original', sourceFactsConfirmed: true, ordinaryBox1EqualsMedicareCompensationConfirmed: true, nonRRTAPayrollBoxesKnownZeroConfirmed: true, noRailroadTipsConfirmed: true, tier1SocialSecurityCompensation: '230000', tier1MedicareCompensation: '230000', additionalMedicareTaxWithheld: '270' }] };
    state.sectionData['additional-deductions'] = { tipIncomeAccounts: [tips], rrtaPayrollSources: rrta };
    return state;
}

function need<T>(value:T|null|undefined):T {if(value==null)throw Error('Required fictional fixture value');return value;}
