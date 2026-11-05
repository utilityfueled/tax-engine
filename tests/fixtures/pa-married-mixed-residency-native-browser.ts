/** Literal fictional unrelated guide facts; target calendars/payroll never enter initial state. */
import {loadGuidedFlowState,getGuidedFlowStorageKey} from '../../apps/web/src/lib/guided-interview-flow';
import {buildTaxInputFromGuidedData} from '../../apps/web/src/lib/guided-interview-bridge';
import {TaxYearInputSchema} from '@/models/inputs';
import {PAMarriedOrdinarySourcesSchema} from '@/models/pa-married-ordinary-sources';
import {snapshotPAMarriedOrdinaryOriginals} from '@/engine/state/pa-married-ordinary-return';
import {paMarriedResidencyNativeFixture} from './pa-married-residency-native';
const unrelated={
  "phase": "interview",
  "taxYear": 2025,
  "segmentation": {
    "filingStatus": "mfj",
    "incomeTypes": [
      "w2-wages"
    ],
    "lifeEvents": [],
    "stateCode": "PA"
  },
  "currentSectionIndex": 0,
  "completedSections": [],
  "sectionData": {
    "deductions": {
      "method": "standard",
      "medicalExpenses": "",
      "stateLocalTaxes": "",
      "realEstateTaxes": "",
      "mortgageInterest": "",
      "charitableContributions": "",
      "casualtyLosses": "",
      "otherItemized": ""
    },
    "personal-info": {
      "dateOfBirth": "1950-04-02",
      "usResidencyMonths": "12",
      "stateResidency": "full-year",
      "firstName": "Taylor",
      "middleName": "",
      "lastName": "NativeReview",
      "ssn": "900-70-0411",
      "addressLine1": "41 Fictional Avenue",
      "addressLine2": "",
      "city": "Pittsburgh",
      "state": "PA",
      "zip": "15201",
      "dependentCount": "0",
      "dependents": [],
      "standardDeductionFacts": {
        "primaryBlind": false,
        "spouseBlind": false,
        "primaryCanBeClaimedAsDependent": false,
        "spouseCanBeClaimedAsDependent": false,
        "primaryDeceased": false,
        "spouseDeceased": false,
        "dualStatusAlien": false,
        "nonresidentAlien": false,
        "shortTaxYear": false,
        "spouseItemizes": false,
        "claimSpouseAdditionalDeduction": false
      },
      "livedWithSpouseAtAnyTimeDuringYear": true,
      "employmentValidSsnIssuedByDueDate": true,
      "tinIssuedByDueDate": true,
      "spouse": {
        "firstName": "Robin",
        "lastName": "NativeReview",
        "ssn": "900-70-0412",
        "dateOfBirth": "1952-05-03",
        "usResidencyMonths": "12",
        "employmentValidSsnIssuedByDueDate": true,
        "tinIssuedByDueDate": true
      },
      "eicClaimantEligibility": {
        "sourceTaxYear": "2025",
        "sourceReference": "Fictional actual native household childless eligibility",
        "sourceFactsConfirmed": true,
        "primaryNonresidentAlienDuringYear": false,
        "primaryQualifyingChildOfAnotherTaxpayer": false,
        "spouseNonresidentAlienDuringYear": false,
        "spouseQualifyingChildOfAnotherTaxpayer": false,
        "primaryChildless": {
          "mainHomeInUnitedStatesMoreThanHalfYear": true,
          "countedMilitaryDutyOutsideUnitedStates": false
        },
        "spouseChildless": {
          "mainHomeInUnitedStatesMoreThanHalfYear": true,
          "countedMilitaryDutyOutsideUnitedStates": false
        }
      }
    },
    "income-w2": {
      "entries": [
        {
          "accountHolder": "primary",
          "stateTaxReporting": "single",
          "state": "PA",
          "employerName": "Fictional Native Taylor Employer",
          "employerEin": "91-0000411",
          "wages": "50000",
          "federalWithheld": "0",
          "socialSecurityWages": "50000",
          "socialSecurityTips": "0",
          "socialSecurityWithheld": "3100",
          "medicareWages": "50000",
          "medicareWithheld": "725",
          "stateWages": "50000",
          "stateWithheld": "1535",
          "aiSuggestedFields": {},
          "box10DependentCareBenefits": "0",
          "box12CodeW": "0",
          "id": "native-wage-1",
          "sourceTaxYear": "2025",
          "allocatedTips": "0",
          "localWages": "0",
          "localTaxWithheld": "0"
        },
        {
          "accountHolder": "spouse",
          "stateTaxReporting": "single",
          "state": "PA",
          "employerName": "Fictional Native Robin Employer",
          "employerEin": "91-0000412",
          "wages": "30000",
          "federalWithheld": "0",
          "socialSecurityWages": "30000",
          "socialSecurityTips": "0",
          "socialSecurityWithheld": "1860",
          "medicareWages": "30000",
          "medicareWithheld": "435",
          "stateWages": "30000",
          "stateWithheld": "921",
          "aiSuggestedFields": {},
          "box10DependentCareBenefits": "0",
          "box12CodeW": "0",
          "id": "native-wage-2",
          "sourceTaxYear": "2025",
          "allocatedTips": "0",
          "localWages": "0",
          "localTaxWithheld": "0"
        }
      ]
    }
  }
};
export const mixedResidencyPrivatePrefix='fictional-mixed-browser-private-';
export const mixedResidencyEditedReference=mixedResidencyPrivatePrefix+'same-cash-replacement-payroll';
function references(value:unknown,at='household'):void{if(Array.isArray(value)){value.forEach((row,i)=>references(row,at+'-'+i));return;}if(value===null||typeof value!=='object')return;for(const[key,child]of Object.entries(value)){if(/sourceReference$/iu.test(key)&&typeof child==='string')(value as Record<string,unknown>)[key]=mixedResidencyPrivatePrefix+at+'-'+key;else references(child,at+'-'+key);}}
export function paMarriedMixedResidencyNativeBrowserFixture(kind:'nonresident'|'part_year'){
 const key=getGuidedFlowStorageKey('fictional-mixed-browser-base'),encoded=JSON.stringify(unrelated);
 // Real saved-state parser retains documentary extras such as the existing W2id.
 // This read-only in-memory adapter is preparation, never a browser storage write.
 const state=loadGuidedFlowState({getItem:k=>k===key?encoded:null,setItem:()=>{throw Error('Read-only original fixture');},removeItem:()=>{throw Error('Read-only original fixture');},clear:()=>{throw Error('Read-only original fixture');},key:n=>n===0?key:null,length:1},'fictional-mixed-browser-base');
 if(!state)throw Error('Captured actual guide state is invalid');
 const literal=paMarriedResidencyNativeFixture(kind);
 const spouseWage=state.sectionData['income-w2']?.entries[1];if(!spouseWage)throw Error('Explicit current synthetic W2 required');
 spouseWage.stateWages=kind==='part_year'?'18000':'12000';spouseWage.stateWithheld=kind==='part_year'?'553':'368';
 const input=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)),expected=PAMarriedOrdinarySourcesSchema.parse(literal.sources);
 references(expected);expected.originalFederalSources=snapshotPAMarriedOrdinaryOriginals(input);
 for(const owner of expected.owners){const actual=owner.accountHolder==='primary'?input.taxpayer.primary:input.taxpayer.spouse;if(!actual)throw Error('Actual synthetic spouse required');owner.originalTaxpayer={firstName:actual.firstName,lastName:actual.lastName,ssn:actual.ssn};}
 for(const wage of expected.wages){if(wage.originalIndex===null)throw Error('Explicit originalW2 index required');const actual=input.w2s[wage.originalIndex],person=wage.accountHolder==='primary'?input.taxpayer.primary:input.taxpayer.spouse;if(!actual||!person)throw Error('Actual original currentW2 and owner required');wage.original=structuredClone(actual);wage.originalRecipientSsn=person.ssn;}
 const target=expected.residencySources;if(!target)throw Error('Literal actual calendar sources required');
 for(const owner of target.owners){const actual=owner.accountHolder==='primary'?input.taxpayer.primary:input.taxpayer.spouse;if(!actual)throw Error('Actual calendar owner required');owner.originalTaxpayer={firstName:actual.firstName,lastName:actual.lastName,ssn:actual.ssn};}
 const initial=PAMarriedOrdinarySourcesSchema.parse(expected);delete initial.residencySources;initial.sourceFactsConfirmed=null;for(const wage of initial.wages)wage.payroll=[];
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paMarriedOrdinarySources:initial};
 const privateMarkers=[...new Set([mixedResidencyPrivatePrefix,input.taxpayer.primary.ssn,input.taxpayer.primary.ssn.replace(/\D/gu,''),...(input.taxpayer.spouse?[input.taxpayer.spouse.ssn,input.taxpayer.spouse.ssn.replace(/\D/gu,'')]:[]),...input.w2s.flatMap(wage=>[wage.employer.ein,wage.employer.ein.replace(/\D/gu,'')])])];
 return{state,input,expected,target:structuredClone(target),privateMarkers};
}
