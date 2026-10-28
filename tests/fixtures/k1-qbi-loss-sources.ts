import { TaxYearInputSchema } from '@/models/inputs.js';

/** Fictional original statements and actual opening worksheets, including zeros. */
export function k1QbiLossSourceInput() {
  return TaxYearInputSchema.parse({ taxpayer: {
    taxYear: 2025, filingStatus: 'single', primary: { firstName: 'Jordan', lastName: 'Source', ssn: '123456789', dateOfBirth: '1980-05-01' },
    address: { street: '10 Example Street', city: 'Austin', state: 'TX', zip: '78701' },
  }, scheduleK1: [{ taxYear:2025, partnershipName:'Actual ordinary activity', partnershipEIN:'12-3456789', accountHolder:'primary',
    entityType:'partnership', ordinaryIncome:'-100000.00', section199AQBI:'-80000.00', section199AW2Wages:'0', section199AUBIA:'0',
    section199AIsSST:false, isPassiveActivity:false, qbiMateriallyParticipated:true, beginningBasis:'100000',
    selfEmploymentEarnings:'0', selfEmploymentNetEarningsAfterAdjustments:'0', selfEmploymentIncomeType:'nonfarm', selfEmploymentFactsConfirmed:true,
    priorSuspendedLosses:{ordinary:'0'}, form6198:{activityName:'Actual ordinary activity',ordinaryIncome:'-100000.00',
      gainLossFromDispositions:'0',otherIncomeGains:'0',otherDeductionsLosses:'0',adjustedBasisAtEffectiveDate:'0',
      priorYearAmountAtRisk:'60000',currentYearIncreases:'0',currentYearDecreases:'0'},
  }], priorYear:{qbiLossCarryforward:'0',suspendedPassiveLosses:[{partnershipName:'Actual ordinary activity',amount:'0',qbiLossTracking:{
    sourceTaxYear:2024,sourceReference:'Prior filed passive/QBI worksheet',sourceFactsConfirmed:true,vintages:[],
  }}]}, qbiLossSources:{sourceTaxYear:2025,sourceReference:'Complete actual K1 source set',sourceFactsConfirmed:true,
    priorQbiCarry:{sourceTaxYear:2024,sourceReference:'Fictional completed2024 Form8995 ordinary carry record',sourceFactsConfirmed:true,
      returnSourceId:'fictional-jordan-source-2024',formKind:'form_8995_line_16',primaryName:'Jordan Source',primaryTaxpayerIdLast4:'6789',
      sameFilingUnit:{priorFilingStatus:'single',sameTaxpayersConfirmed:true},lossCarryforward:'0'},
    allK1ActivitiesIncluded:true,activities:[{k1SourceId:'scheduleK1:0',sourceTaxYear:2025,sourceReference:'Original K1 and199A attachment',
      accountHolder:'primary',entityType:'partnership',entityName:'Actual ordinary activity',entityEIN:'12-3456789',
      recipientName:'Jordan Source',recipientTaxpayerIdLast4:'6789',ordinaryBusinessOnlyConfirmed:true,continuingActivityConfirmed:true,
      statement:{ordinaryIncome:'-100000.00',section199AQBI:'-80000.00',section199AW2Wages:'0',section199AUBIA:'0',
        selfEmploymentEarnings:'0',selfEmploymentNetEarningsAfterAdjustments:'0',selfEmploymentIncomeType:'nonfarm',
        section199AIsSST:false,isPassiveActivity:false,qbiMateriallyParticipated:true},
      basis:{sourceTaxYear:2024,sourceReference:'Actual year-end outside-basis worksheet',sourceFactsConfirmed:true,
        beginningBasis:'100000',noOtherBasisChangesConfirmed:true,priorSuspendedLoss:'0'},
      atRisk:{sourceTaxYear:2025,sourceReference:'Actual simplified6198 source worksheet',sourceFactsConfirmed:true,
        simplifiedMethodEligible:true,adjustedBasisAtEffectiveDate:'0',priorYearAmountAtRisk:'60000',currentYearIncreases:'0',currentYearDecreases:'0',priorSuspendedLoss:'0',
        priorLossHistory:{sourceTaxYear:2024,sourceReference:'Actual preceding-year at-risk loss history',sourceFactsConfirmed:true,vintages:[]}},
      priorPassiveLoss:'0',sameOwnerHistoryConfirmed:true,sameRegularAmtTreatmentConfirmed:true,
    }]},
  });
}
