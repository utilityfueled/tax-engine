/** Actual fictional reciprocal originals, pinned before candidate outputs. */
import { paOrdinaryResidencyFixture } from "./pa-residency-sources.js";

export function paReciprocityFixture(year = 2025, state = "OH") {
  const { input, sources: residencySources } = paOrdinaryResidencyFixture("nonresident", year);
  input.form1099Int = []; residencySources.interest = [];
  input.w2s[0].stateWages = "50000"; input.w2s[0].stateTaxWithheld = "1535";
  residencySources.residency.domicilePeriods[0].state = state;
  residencySources.residency.dec31PrincipalResidenceState = state;
  const payroll = residencySources.wages[0].payroll[0];
  payroll.paServicesCompensation = "50000"; payroll.outsidePAServicesCompensation = "0";
  residencySources.wages[0].original = structuredClone(input.w2s[0]);
  const reciprocalSources = {
    sourceTaxYear: year, sourceReference: "fictional-private-reciprocal-legal-originals", sourceFactsConfirmed: true,
    owner: structuredClone(residencySources.owner),
    originals: [{ originalIndex: 0, sourceTaxYear: year, sourceReference: "fictional-private-W2-reciprocal-copy", sourceFactsConfirmed: true,
      originalW2: structuredClone(input.w2s[0]), zeroOrOneStateRowOnActualOriginalConfirmed: true,
      paWithholdingStatus: "reported_PA_box17", actualPAWithheld: "1535", noAdditionalPAStateRowOnOriginalConfirmed: true,
      refundRequested: true, refundSupportFactsConfirmed: true, w2CopySourceReference: "fictional-private-retained-W2-copy",
      residentStateReturn: { sourceTaxYear: year, state, ownerOriginal: structuredClone(residencySources.owner.originalTaxpayer),
        sourceReference: "fictional-private-resident-return-copy", filedConfirmed: true },
      residencyStatementSourceReference: "fictional-private-residency-statement",
    }],
    segments: [{ originalIndex: 0, payrollIndex: 0, sourceReference: "fictional-private-employee-classification-and-period", sourceFactsConfirmed: true,
      actualPayroll: structuredClone(payroll), reciprocalState: state,
      employeeCompensationOnlyConfirmed: true, compensationLegallySubjectToEmployerWithholdingConfirmed: true,
      earnedWhileReciprocalResidentConfirmed: true, noPAResidentEarnedDeferredCompensationConfirmed: true,
      employerIsPASCorporation: false, shareholderEmployee: false, actualOwnershipPercent: "",
    }],
  };
  return { input, residencySources, reciprocalSources };
}

export function paPartYearReciprocityFixture(year = 2025) {
  const f = paReciprocityFixture(year); const start = `${year}-01-01`, end = `${year}-12-31`;
  f.residencySources.residency.status = "part_year";
  f.residencySources.residency.domicilePeriods = [
    { from: start, through: `${year}-06-30`, state: "PA", daysInPA: 180 },
    { from: `${year}-07-01`, through: end, state: "OH", daysInPA: 20 },
  ];
  f.residencySources.residency.paPermanentAbodePeriods = [{ from: start, through: `${year}-06-30` }];
  f.residencySources.residency.outsidePAPermanentAbodePeriods = [{ from: `${year}-07-01`, through: end }];
  f.residencySources.residency.moveAbandonmentNewDomicileAndPresenceConfirmed = true;
  f.residencySources.wages[0].payroll = [
    { sourceReference: "actual-resident-period-cash", paidOn: `${year}-06-30`, serviceFrom: start, serviceThrough: `${year}-06-30`, grossCompensation: "20000", paServicesCompensation: "0", outsidePAServicesCompensation: "20000" },
    { sourceReference: "actual-OH-period-cash", paidOn: end, serviceFrom: `${year}-07-01`, serviceThrough: end, grossCompensation: "30000", paServicesCompensation: "30000", outsidePAServicesCompensation: "0" },
  ];
  f.reciprocalSources.segments[0].payrollIndex = 1;
  f.reciprocalSources.segments[0].actualPayroll = structuredClone(f.residencySources.wages[0].payroll[1]);
  return f;
}
