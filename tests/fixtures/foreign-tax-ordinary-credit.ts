import { TaxYearInputSchema } from '@/models/inputs.js';
import { foreignTaxDirectCreditFixture } from './foreign-tax-direct-credit.js';

/** Explicit synthetic source facts; omissions in real records are never filled. */
export function foreignTaxOrdinaryCreditFixture(year=2025) {
  const input=foreignTaxDirectCreditFixture(year);
  const annual=input.foreignTaxElection;
  if(!annual?.creditWithoutForm1116||!annual.sources?.[0])throw new Error('Missing explicit synthetic foreign source');
  const common=annual.creditWithoutForm1116;
  input.w2s[0].wages='80000';
  input.form1099Int[0].interestIncome='20000';input.form1099Int[0].foreignTaxPaid='900';
  annual.sources[0].reportedTaxAmount='900';annual.sources[0].payments=[{date:`${year}-09-15`,amountUsd:'900'}];
  return TaxYearInputSchema.parse({...input,foreignTaxElection:{...annual,creditWithoutForm1116:undefined,
    creditWithForm1116:{...common,sourceTaxYear:year,method:'ordinary_passive',
      allForeignIncomeSourcesIncludedConfirmed:true,noForeignOrDomesticLossAccountsConfirmed:true,noCfcOrQbuIncomeConfirmed:true,
      incomeSources:[{sourceId:'form1099Int:0',payerName:'Synthetic investment bank',payerTin:'112233445',accountReference:'Private synthetic account A',
        owner:'primary',foreignCountry:'Canada',reportedIncome:'20000',foreignIncome:'10000',sourceReference:'Private foreign income allocation',passiveGroup:'withholding_under_15'}],
      amt:{sourceFactsConfirmed:true,sourceReference:'Private original AMT election history',foreignAmountsSameAsRegularConfirmed:true,
        firstPost1997CreditClaimTaxYear:year,simplifiedElectionMadeInFirstClaimYear:false,noRevocationConfirmed:true},
    },
  }});
}
