/**
 * Tests for Form 8606 traditional IRA basis allocation.
 * Spec: spec/federal/form-8606.yaml
 */

import { describe, expect, it } from "vitest";
import { calculateForm8606 } from "@/engine/forms/form-8606.js";

describe("Form 8606 traditional IRA basis allocation", () => {
  const qualifiedReservistRepaymentBasis = calculateForm8606({
    nondeductibleContributions: "2000",
    qualifiedReservistDistributionRepayments: "1500",
    priorYearBasis: "4000",
    contributionsMadeNextYear: "0",
    yearEndValue: "18000",
    traditionalDistributions: "12000",
    rothConversions: "0",
  });

  const simpleDistribution = calculateForm8606({
    nondeductibleContributions: "2000",
    priorYearBasis: "4000",
    contributionsMadeNextYear: "0",
    yearEndValue: "18000",
    traditionalDistributions: "12000",
    rothConversions: "0",
  });

  const reducedAllocationBasis = calculateForm8606({
    nondeductibleContributions: "8000",
    priorYearBasis: "4000",
    contributionsMadeNextYear: "2000",
    yearEndValue: "20000",
    traditionalDistributions: "12000",
    rothConversions: "8000",
  });

  const carryforwardOnly = calculateForm8606({
    nondeductibleContributions: "1500",
    priorYearBasis: "3500",
    contributionsMadeNextYear: "0",
    yearEndValue: "50000",
    traditionalDistributions: "0",
    rothConversions: "0",
  });

  const cappedRatio = calculateForm8606({
    nondeductibleContributions: "5000",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "3000",
    rothConversions: "0",
  });

  const roundedRatioAllocation = calculateForm8606({
    nondeductibleContributions: "1000",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "2000",
    rothConversions: "1000",
  });

  const halfUpBoundaryRatioAllocation = calculateForm8606({
    nondeductibleContributions: "667",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "2000",
    rothConversions: "0",
  });

  const outstandingRolloverDenominator = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "20000",
    outstandingRollovers: "5000",
    traditionalDistributions: "0",
    rothConversions: "0",
  });

  const qcdPreservesBasis = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "5000",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "5000",
    qualifiedCharitableDistributions: "5000",
    rothConversions: "0",
  });

  const excludedLine7Amounts = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "10000",
    qualifiedCharitableDistributions: "1000",
    rolledOverDistributions: "3000",
    qualifiedHsaFundingDistributions: "2000",
    rothConversions: "0",
  });

  const overflowingLine7Exclusions = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "5000",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "9000",
    qualifiedCharitableDistributions: "4000",
    rolledOverDistributions: "4000",
    returnedContributionsByDueDate: "2000",
    returnedExcessContributions: "2000",
    qualifiedHsaFundingDistributions: "2000",
    rothConversions: "0",
  });

  const returnedExcessContributionDistribution = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "4000",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "6500",
    returnedExcessContributions: "6500",
    rothConversions: "0",
  });

  const timelyReturnedContributionDistribution = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "4000",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "6500",
    returnedContributionsByDueDate: "6500",
    rothConversions: "0",
  });

  const mixedQualifiedDisasterDistributions = calculateForm8606({
    nondeductibleContributions: "3000",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "33000",
    qualifiedDisasterDistributions: "22000",
    rothConversions: "0",
  });

  const allQualifiedDisasterDistributions = calculateForm8606({
    nondeductibleContributions: "3000",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "33000",
    qualifiedDisasterDistributions: "33000",
    rothConversions: "0",
  });

  const partialThreeYearRepayment = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "2000",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "12000",
    repaymentEligibleDistributions: "6000",
    repaymentDistributionExceptionNumber: "20",
    repaymentWithin3YearWindow: "3000",
    rothConversions: "0",
  });

  const fullThreeYearRepaymentWithBasisAdjustment = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "2500",
    contributionsMadeNextYear: "0",
    yearEndValue: "5000",
    currentYearRepaymentsTreatedAsRollovers: "5000",
    traditionalDistributions: "12500",
    repaymentEligibleDistributions: "5000",
    repaymentWithin3YearWindow: "5000",
    rothConversions: "0",
  });

  const carryforwardWithPriorWorksheetAdjustment = calculateForm8606({
    nondeductibleContributions: "1500",
    priorYearBasis: "3500",
    contributionsMadeNextYear: "0",
    yearEndValue: "50000",
    traditionalDistributions: "0",
    priorYearLine15cBasisAdjustment: "750",
    rothConversions: "0",
  });

  const cappedRepaymentInputs = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "3000",
    contributionsMadeNextYear: "0",
    yearEndValue: "3000",
    currentYearRepaymentsTreatedAsRollovers: "9000",
    traditionalDistributions: "12000",
    repaymentEligibleDistributions: "2000",
    repaymentWithin3YearWindow: "7000",
    rothConversions: "0",
  });

  const irsTraditionalRepaymentExample = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "3750",
    contributionsMadeNextYear: "0",
    yearEndValue: "5000",
    traditionalDistributions: "10000",
    repaymentEligibleDistributions: "10000",
    repaymentDistributionExceptionNumber: "19",
    repaymentWithin3YearWindow: "3000",
    rothConversions: "0",
  });

  const rothHomebuyerOrdering = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "15000",
    qualifiedFirstTimeHomebuyerExpenses: "12000",
    priorQualifiedFirstTimeHomebuyerDistributions: "4000",
    rothContributionBasis: "3000",
    rothConversionBasis: "2500",
    priorYearLine25cBasisAdjustment: "750",
  });

  const exhaustedRothHomebuyerLimit = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "5000",
    qualifiedFirstTimeHomebuyerExpenses: "3000",
    priorQualifiedFirstTimeHomebuyerDistributions: "10000",
    rothContributionBasis: "0",
    rothConversionBasis: "0",
  });

  const rothDistributionLimitedHomebuyerExclusion = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "5000",
    qualifiedFirstTimeHomebuyerExpenses: "6000",
    priorQualifiedFirstTimeHomebuyerDistributions: "0",
    rothContributionBasis: "0",
    rothConversionBasis: "0",
  });

  const mixedRothQualifiedDisasterDistributions = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "33000",
    qualifiedFirstTimeHomebuyerExpenses: "3000",
    rothContributionBasis: "0",
    rothConversionBasis: "0",
    rothQualifiedDisasterDistributions: "20000",
  });

  const rothRepaymentReduction = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "12500",
    rothContributionBasis: "2500",
    rothConversionBasis: "0",
    rothRepaymentEligibleDistributions: "12500",
    rothRepaymentsWithin3YearWindow: "3000",
  });

  const partialEligibleRothRepaymentReduction = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "15000",
    rothContributionBasis: "5000",
    rothConversionBasis: "0",
    rothRepaymentEligibleDistributions: "3000",
    rothRepaymentDistributionExceptionNumber: "19",
    rothRepaymentsWithin3YearWindow: "4000",
  });

  const irsRothRepaymentExample = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "12500",
    rothContributionBasis: "2500",
    rothConversionBasis: "0",
    rothRepaymentEligibleDistributions: "12500",
    rothRepaymentDistributionExceptionNumber: "19",
    rothRepaymentsWithin3YearWindow: "3000",
  });

  const rothOverRepayment = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "12500",
    rothContributionBasis: "4500",
    rothConversionBasis: "0",
    rothRepaymentEligibleDistributions: "12500",
    rothRepaymentsWithin3YearWindow: "12500",
  });

  const rothRepaymentCategoryTrace = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "12500",
    rothContributionBasis: "2500",
    rothConversionBasis: "0",
    rothRepaymentEligibleDistributions: "5000",
    rothRepaymentDistributionExceptionNumber: "19",
    rothRepaymentsWithin3YearWindow: "3000",
  });

  const excludedRothLine19Amounts = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "15000",
    rothRolledOverDistributions: "5000",
    rothQualifiedHsaFundingDistributions: "2000",
    rothContributionBasis: "3000",
    rothConversionBasis: "2500",
  });

  const qualifiedRothLine19Exclusion = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "15000",
    qualifiedRothDistributionsExcludedFromLine19: "9000",
    rothContributionBasis: "1000",
    rothConversionBasis: "500",
  });

  const returnedRothLine19Amounts = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "15000",
    rothReturnedContributionsByDueDate: "4000",
    rothReturnedExcessContributions: "2000",
    rothRolledOverDistributions: "3000",
    rothQualifiedHsaFundingDistributions: "1000",
    rothContributionBasis: "2500",
    rothConversionBasis: "500",
  });

  const overflowingRothLine19Exclusions = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "8000",
    qualifiedRothDistributionsExcludedFromLine19: "3000",
    rothRolledOverDistributions: "3000",
    rothReturnedContributionsByDueDate: "3000",
    rothReturnedExcessContributions: "2000",
    rothQualifiedHsaFundingDistributions: "2000",
    rothContributionBasis: "0",
    rothConversionBasis: "0",
  });

  it("Form 8606 Line 1 - qualified reservist repayments increase the current-year basis amount", () => {
    expect(qualifiedReservistRepaymentBasis.line1.toNumber()).toBe(3500);
  });

  it("Form 8606 Line 2 - prior-year basis carries into current-year total basis", () => {
    expect(simpleDistribution.line2.toNumber()).toBe(4000);
  });

  it("Form 8606 Line 3 - total basis sums current and prior-year basis", () => {
    expect(simpleDistribution.line3.toNumber()).toBe(6000);
  });

  it("Form 8606 Line 4 - post-year-end contributions reduce basis available for allocation", () => {
    expect(reducedAllocationBasis.line4.toNumber()).toBe(2000);
  });

  it("Form 8606 Line 5 - allocation basis excludes post-year-end designated contributions", () => {
    expect(reducedAllocationBasis.line5.toNumber()).toBe(10000);
  });

  it("Form 8606 Line 6 - outstanding rollovers increase the denominator value", () => {
    expect(reducedAllocationBasis.line6.toNumber()).toBe(20000);
    expect(outstandingRolloverDenominator.line6.toNumber()).toBe(25000);
    expect(fullThreeYearRepaymentWithBasisAdjustment.line6.toNumber()).toBe(0);
    expect(cappedRepaymentInputs.currentYearRepaymentsTreatedAsRollovers.toNumber()).toBe(3000);
    expect(cappedRepaymentInputs.line6.toNumber()).toBe(0);
  });

  it("Form 8606 Line 7 - QCDs, rollovers, timely returned contributions, returned excess contributions, and HSA funding distributions are excluded before basis allocation", () => {
    expect(qcdPreservesBasis.line7.toNumber()).toBe(0);
    expect(excludedLine7Amounts.line7.toNumber()).toBe(4000);
    expect(timelyReturnedContributionDistribution.line7.toNumber()).toBe(0);
    expect(timelyReturnedContributionDistribution.returnedContributionsByDueDate.toNumber()).toBe(6500);
    expect(returnedExcessContributionDistribution.line7.toNumber()).toBe(0);
    expect(returnedExcessContributionDistribution.line7Exclusions.toNumber()).toBe(6500);
  });

  it("Form 8606 Line 7 - combined exclusion branches are capped at the remaining traditional distribution amount", () => {
    expect(overflowingLine7Exclusions.qualifiedCharitableDistributions.toNumber()).toBe(4000);
    expect(overflowingLine7Exclusions.rolledOverDistributions.toNumber()).toBe(4000);
    expect(overflowingLine7Exclusions.returnedContributionsByDueDate.toNumber()).toBe(1000);
    expect(overflowingLine7Exclusions.returnedExcessContributions.toNumber()).toBe(0);
    expect(overflowingLine7Exclusions.qualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(overflowingLine7Exclusions.line7Exclusions.toNumber()).toBe(9000);
    expect(overflowingLine7Exclusions.line7.toNumber()).toBe(0);
  });

  it("Form 8606 Line 7 - non-conversion distributions receive a pro-rata nontaxable share", () => {
    expect(reducedAllocationBasis.line7.toNumber()).toBe(12000);
  });

  it("Form 8606 Line 8 - Roth conversions participate in the same basis ratio", () => {
    expect(reducedAllocationBasis.line8.toNumber()).toBe(8000);
  });

  it("Form 8606 Line 9 - denominator combines year-end value, distributions, and conversions", () => {
    expect(reducedAllocationBasis.line9.toNumber()).toBe(40000);
  });

  it("Form 8606 Line 10 - nontaxable percentage uses the pro-rata ratio and never exceeds 1", () => {
    expect(reducedAllocationBasis.line10.toNumber()).toBe(0.25);
    expect(roundedRatioAllocation.line10.toNumber()).toBe(0.333);
    expect(halfUpBoundaryRatioAllocation.line10.toNumber()).toBe(0.334);
    expect(cappedRatio.line10.toNumber()).toBe(1);
  });

  it("Form 8606 Line 11 - conversions receive their share of basis first", () => {
    expect(reducedAllocationBasis.line11.toNumber()).toBe(2000);
    expect(roundedRatioAllocation.line11.toNumber()).toBe(333);
  });

  it("Form 8606 Line 12 - non-conversion distributions receive the remaining pro-rata basis share", () => {
    expect(reducedAllocationBasis.line12.toNumber()).toBe(3000);
    expect(roundedRatioAllocation.line12.toNumber()).toBe(666);
  });

  it("Form 8606 Line 13 - total nontaxable amount sums conversions and distributions", () => {
    expect(reducedAllocationBasis.line13.toNumber()).toBe(5000);
    expect(roundedRatioAllocation.line13.toNumber()).toBe(999);
  });

  it("Form 8606 Line 14 - unused basis carries forward", () => {
    expect(carryforwardOnly.line14.toNumber()).toBe(5000);
    expect(reducedAllocationBasis.line14.toNumber()).toBe(7000);
    expect(qcdPreservesBasis.line14.toNumber()).toBe(5000);
    expect(roundedRatioAllocation.line14.toNumber()).toBe(1);
    expect(halfUpBoundaryRatioAllocation.line14.toNumber()).toBe(0);
    expect(carryforwardWithPriorWorksheetAdjustment.line14.toNumber()).toBe(5750);
  });

  it("Form 8606 Lines 12 and 13 - half-up rounding at the three-decimal boundary can allocate the last dollar of basis", () => {
    expect(halfUpBoundaryRatioAllocation.line12.toNumber()).toBe(668);
    expect(halfUpBoundaryRatioAllocation.line13.toNumber()).toBe(668);
    expect(halfUpBoundaryRatioAllocation.line15a.toNumber()).toBe(1332);
  });

  it("Form 8606 Line 15a - taxable traditional distributions are gross less nontaxable share", () => {
    expect(simpleDistribution.line15a.toNumber()).toBe(9600);
  });

  it("Form 8606 Line 15b - mixed qualified disaster distributions receive a proportional exclusion", () => {
    expect(mixedQualifiedDisasterDistributions.line15a.toNumber()).toBe(29997);
    expect(mixedQualifiedDisasterDistributions.line15b.toNumber()).toBe(19998);
    expect(allQualifiedDisasterDistributions.line15b.toNumber()).toBe(29997);
  });

  it("Form 8606 Line 15c - Form 1040 taxable IRA distributions follow the allocated basis result", () => {
    expect(simpleDistribution.line15c.toNumber()).toBe(9600);
    expect(qcdPreservesBasis.line15c.toNumber()).toBe(0);
    expect(mixedQualifiedDisasterDistributions.line15c.toNumber()).toBe(9999);
    expect(allQualifiedDisasterDistributions.line15c.toNumber()).toBe(0);
    expect(partialThreeYearRepayment.line15c.toNumber()).toBe(6996);
    expect(partialThreeYearRepayment.line15cExceptionNumber).toBe("20");
    expect(fullThreeYearRepaymentWithBasisAdjustment.line15c.toNumber()).toBe(6000);
    expect(partialThreeYearRepayment.line15cRepaymentReduction.toNumber()).toBe(3000);
    expect(fullThreeYearRepaymentWithBasisAdjustment.line15cRepaymentReduction.toNumber()).toBe(4000);
    expect(fullThreeYearRepaymentWithBasisAdjustment.line15cBasisAdjustment.toNumber()).toBe(1000);
    expect(cappedRepaymentInputs.repaymentWithin3YearWindow.toNumber()).toBe(2000);
    expect(cappedRepaymentInputs.line15cRepaymentReduction.toNumber()).toBe(1500);
    expect(cappedRepaymentInputs.line15cBasisAdjustment.toNumber()).toBe(500);
    expect(cappedRepaymentInputs.line15c.toNumber()).toBe(7500);
  });

  it("Form 8606 Line 15c - IRS 2025 Example 1 leaves $4,500 taxable after a $3,000 repayment", () => {
    expect(irsTraditionalRepaymentExample.line7.toNumber()).toBe(10000);
    expect(irsTraditionalRepaymentExample.line15a.toNumber()).toBe(7500);
    expect(irsTraditionalRepaymentExample.line15cRepaymentEligibleTaxableShare.toNumber()).toBe(7500);
    expect(irsTraditionalRepaymentExample.line15cRepaymentReduction.toNumber()).toBe(3000);
    expect(irsTraditionalRepaymentExample.line15cRepaymentEligibleRemainingTaxableShare.toNumber()).toBe(4500);
    expect(irsTraditionalRepaymentExample.line15cBasisAdjustment.toNumber()).toBe(0);
    expect(irsTraditionalRepaymentExample.line15c.toNumber()).toBe(4500);
  });

  it("Form 8606 Line 16 - Part II starts with the Roth conversion amount", () => {
    expect(reducedAllocationBasis.line16.toNumber()).toBe(8000);
  });

  it("Form 8606 Line 17 - Part II carries forward the nontaxable conversion amount", () => {
    expect(reducedAllocationBasis.line17.toNumber()).toBe(2000);
  });

  it("Form 8606 Line 18 - taxable Roth conversions are gross conversions less allocated basis", () => {
    expect(reducedAllocationBasis.line18.toNumber()).toBe(6000);
  });

  it("Form 8606 Line 19 - returned Roth contributions, Roth rollovers, and Roth-to-HSA funding distributions are excluded from Part III", () => {
    expect(excludedRothLine19Amounts.rothRolledOverDistributions.toNumber()).toBe(5000);
    expect(excludedRothLine19Amounts.rothQualifiedHsaFundingDistributions.toNumber()).toBe(2000);
    expect(excludedRothLine19Amounts.line19Exclusions.toNumber()).toBe(7000);
    expect(excludedRothLine19Amounts.line19.toNumber()).toBe(8000);
    expect(excludedRothLine19Amounts.line25a.toNumber()).toBe(2500);
    expect(qualifiedRothLine19Exclusion.qualifiedRothDistributionsExcludedFromLine19.toNumber()).toBe(9000);
    expect(qualifiedRothLine19Exclusion.line19Exclusions.toNumber()).toBe(9000);
    expect(qualifiedRothLine19Exclusion.line19.toNumber()).toBe(6000);
    expect(qualifiedRothLine19Exclusion.line25a.toNumber()).toBe(4500);
    expect(returnedRothLine19Amounts.rothReturnedContributionsByDueDate.toNumber()).toBe(4000);
    expect(returnedRothLine19Amounts.rothReturnedExcessContributions.toNumber()).toBe(2000);
    expect(returnedRothLine19Amounts.line19Exclusions.toNumber()).toBe(10000);
    expect(returnedRothLine19Amounts.line19.toNumber()).toBe(5000);
    expect(returnedRothLine19Amounts.line25a.toNumber()).toBe(2000);
  });

  it("Form 8606 Line 19 - combined Roth exclusion branches are capped at the remaining Part III distribution amount", () => {
    expect(overflowingRothLine19Exclusions.qualifiedRothDistributionsExcludedFromLine19.toNumber()).toBe(3000);
    expect(overflowingRothLine19Exclusions.rothRolledOverDistributions.toNumber()).toBe(3000);
    expect(overflowingRothLine19Exclusions.rothReturnedContributionsByDueDate.toNumber()).toBe(2000);
    expect(overflowingRothLine19Exclusions.rothReturnedExcessContributions.toNumber()).toBe(0);
    expect(overflowingRothLine19Exclusions.rothQualifiedHsaFundingDistributions.toNumber()).toBe(0);
    expect(overflowingRothLine19Exclusions.line19Exclusions.toNumber()).toBe(8000);
    expect(overflowingRothLine19Exclusions.line19.toNumber()).toBe(0);
    expect(overflowingRothLine19Exclusions.line25c.toNumber()).toBe(0);
  });

  it("Form 8606 Line 19 - Roth IRA distributions start Part III ordering", () => {
    expect(rothHomebuyerOrdering.line19.toNumber()).toBe(15000);
  });

  it("Form 8606 Line 20 - first-time homebuyer expenses are capped by the remaining lifetime limit", () => {
    expect(rothHomebuyerOrdering.line20.toNumber()).toBe(6000);
    expect(exhaustedRothHomebuyerLimit.line20.toNumber()).toBe(0);
    expect(rothDistributionLimitedHomebuyerExclusion.line20.toNumber()).toBe(5000);
  });

  it("Form 8606 Line 21 - Part III removes qualified first-time homebuyer expenses before basis recovery", () => {
    expect(rothHomebuyerOrdering.line21.toNumber()).toBe(9000);
    expect(exhaustedRothHomebuyerLimit.line21.toNumber()).toBe(5000);
    expect(rothDistributionLimitedHomebuyerExclusion.line21.toNumber()).toBe(0);
  });

  it("Form 8606 Line 22 - regular Roth contribution basis includes prior worksheet carryforwards", () => {
    expect(rothHomebuyerOrdering.line22.toNumber()).toBe(3750);
  });

  it("Form 8606 Line 23 - regular contribution basis is recovered before conversion basis", () => {
    expect(rothHomebuyerOrdering.line23.toNumber()).toBe(5250);
  });

  it("Form 8606 Line 24 - remaining Roth conversion basis offsets distributions after contribution basis", () => {
    expect(rothHomebuyerOrdering.line24.toNumber()).toBe(2500);
  });

  it("Form 8606 Line 25a - taxable Roth distributions remain only after both contribution and conversion basis are exhausted", () => {
    expect(rothHomebuyerOrdering.line25a.toNumber()).toBe(2750);
    expect(exhaustedRothHomebuyerLimit.line25a.toNumber()).toBe(5000);
  });

  it("Form 8606 Line 25b - mixed qualified disaster Roth distributions use the Line 21 fraction", () => {
    expect(mixedRothQualifiedDisasterDistributions.line21.toNumber()).toBe(30000);
    expect(mixedRothQualifiedDisasterDistributions.line25a.toNumber()).toBe(30000);
    expect(mixedRothQualifiedDisasterDistributions.line25b.toNumber()).toBe(20000);
  });

  it("Form 8606 Line 25c - Roth repayment worksheet reduces taxable income and carries excess into next-year basis", () => {
    expect(rothRepaymentReduction.line25a.toNumber()).toBe(10000);
    expect(rothRepaymentReduction.line25c.toNumber()).toBe(7000);
    expect(rothRepaymentReduction.line25cBasisAdjustment.toNumber()).toBe(0);
    expect(rothOverRepayment.line25a.toNumber()).toBe(8000);
    expect(rothOverRepayment.line25c.toNumber()).toBe(0);
    expect(rothOverRepayment.line25cBasisAdjustment.toNumber()).toBe(4500);
    expect(rothOverRepayment.taxableRothDistributions.toNumber()).toBe(0);
  });

  it("Form 8606 Line 25c - IRS 2025 Example 2 leaves $7,000 taxable after a $3,000 Roth repayment", () => {
    expect(irsRothRepaymentExample.line19.toNumber()).toBe(12500);
    expect(irsRothRepaymentExample.line22.toNumber()).toBe(2500);
    expect(irsRothRepaymentExample.line25a.toNumber()).toBe(10000);
    expect(irsRothRepaymentExample.line25cRepaymentEligibleTaxableShare.toNumber()).toBe(10000);
    expect(irsRothRepaymentExample.line25cRepaymentReduction.toNumber()).toBe(3000);
    expect(irsRothRepaymentExample.line25cBasisAdjustment.toNumber()).toBe(0);
    expect(irsRothRepaymentExample.line25c.toNumber()).toBe(7000);
  });

  it("Form 8606 Line 25c - Roth repayments cannot offset taxable amounts outside the eligible worksheet share", () => {
    expect(partialEligibleRothRepaymentReduction.line21.toNumber()).toBe(15000);
    expect(partialEligibleRothRepaymentReduction.line25a.toNumber()).toBe(10000);
    expect(partialEligibleRothRepaymentReduction.line25cRepaymentEligibleTaxableShare.toNumber()).toBe(2000);
    expect(partialEligibleRothRepaymentReduction.line25cRepaymentReduction.toNumber()).toBe(2000);
    expect(partialEligibleRothRepaymentReduction.line25cBasisAdjustment.toNumber()).toBe(1000);
    expect(partialEligibleRothRepaymentReduction.line25cRepaymentEligibleRemainingTaxableShare.toNumber()).toBe(0);
    expect(partialEligibleRothRepaymentReduction.line25c.toNumber()).toBe(8000);
    expect(partialEligibleRothRepaymentReduction.taxableRothDistributions.toNumber()).toBe(8000);

    const line25c = partialEligibleRothRepaymentReduction.lines.find((line) => line.form === "Form 8606" && line.line === "25c");
    expect(String(line25c?.inputs["Line 25c worksheet repayments"])).toBe("3000");
  });

  it("Form 8606 audit trail names every supported Line 7 exclusion branch and uses readable Line 15b labels", () => {
    const auditAwareResult = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "4000",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "10000",
      qualifiedCharitableDistributions: "1000",
      rolledOverDistributions: "2000",
      returnedContributionsByDueDate: "1500",
      returnedExcessContributions: "500",
      qualifiedHsaFundingDistributions: "1000",
      qualifiedDisasterDistributions: "4000",
      rothConversions: "0",
    });

    const line7 = auditAwareResult.lines.find((line) => line.form === "Form 8606" && line.line === "7");
    const line15b = auditAwareResult.lines.find((line) => line.form === "Form 8606" && line.line === "15b");

    expect(line7?.formula).toContain("returned by the due date");
    expect(line7?.formula).toContain("returned excess contributions");
    expect(String(line7?.inputs["Returned contributions by due date"])).toBe("1500");
    expect(String(line7?.inputs["Returned excess contributions"])).toBe("500");
    expect(String(line15b?.inputs["Qualified disaster distributions"])).toBe("4000");
  });

  it("Form 8606 Line 15c - repayment-category exception numbers are preserved in the audit trail", () => {
    const line15c = partialThreeYearRepayment.lines.find((line) => line.form === "Form 8606" && line.line === "15c");

    expect(partialThreeYearRepayment.line15cExceptionNumber).toBe("20");
    expect(line15c?.inputs["Line 15c worksheet exception number"]).toBe("20");
  });

  it("Form 8606 Line 15c - domestic-abuse repayment-category exception numbers are preserved in the audit trail", () => {
    const domesticAbuseRepaymentTrace = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "10000",
      repaymentEligibleDistributions: "4000",
      repaymentDistributionExceptionNumber: "22",
      repaymentWithin3YearWindow: "1000",
      rothConversions: "0",
    });
    const line15c = domesticAbuseRepaymentTrace.lines.find((line) => line.form === "Form 8606" && line.line === "15c");

    expect(domesticAbuseRepaymentTrace.line15cRepaymentEligibleTaxableShare.toNumber()).toBe(4000);
    expect(domesticAbuseRepaymentTrace.line15cRepaymentReduction.toNumber()).toBe(1000);
    expect(domesticAbuseRepaymentTrace.line15cRepaymentEligibleRemainingTaxableShare.toNumber()).toBe(3000);
    expect(domesticAbuseRepaymentTrace.line15cExceptionNumber).toBe("22");
    expect(line15c?.inputs["Line 15c worksheet exception number"]).toBe("22");
    expect(String(line15c?.inputs["Line 15c worksheet remaining eligible taxable share"])).toBe("3000");
  });

  it("Form 8606 Line 25c - repayment-category exception numbers and remaining taxable share are preserved in the audit trail", () => {
    const line25c = rothRepaymentCategoryTrace.lines.find((line) => line.form === "Form 8606" && line.line === "25c");

    expect(rothRepaymentCategoryTrace.line25a.toNumber()).toBe(10000);
    expect(rothRepaymentCategoryTrace.line25cRepaymentEligibleTaxableShare.toNumber()).toBe(4000);
    expect(rothRepaymentCategoryTrace.line25cRepaymentEligibleRemainingTaxableShare.toNumber()).toBe(1000);
    expect(rothRepaymentCategoryTrace.line25cExceptionNumber).toBe("19");
    expect(String(line25c?.inputs["Line 25c worksheet eligible distributions"])).toBe("5000");
    expect(line25c?.inputs["Line 25c worksheet exception number"]).toBe("19");
    expect(String(line25c?.inputs["Line 25c worksheet remaining eligible taxable share"])).toBe("1000");
  });

  it("Form 8606 Line 25c - emergency personal expense repayment-category exception numbers are preserved in the audit trail", () => {
    const emergencyPersonalExpenseRepaymentTrace = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "12500",
      rothContributionBasis: "2500",
      rothConversionBasis: "0",
      rothRepaymentEligibleDistributions: "5000",
      rothRepaymentDistributionExceptionNumber: "23",
      rothRepaymentsWithin3YearWindow: "3000",
    });
    const line25c = emergencyPersonalExpenseRepaymentTrace.lines.find(
      (line) => line.form === "Form 8606" && line.line === "25c"
    );

    expect(emergencyPersonalExpenseRepaymentTrace.line25cRepaymentEligibleTaxableShare.toNumber()).toBe(4000);
    expect(emergencyPersonalExpenseRepaymentTrace.line25cRepaymentEligibleRemainingTaxableShare.toNumber()).toBe(1000);
    expect(emergencyPersonalExpenseRepaymentTrace.line25cExceptionNumber).toBe("23");
    expect(line25c?.inputs["Line 25c worksheet exception number"]).toBe("23");
    expect(String(line25c?.inputs["Line 25c worksheet remaining eligible taxable share"])).toBe("1000");
  });

  it("Form 8606 audit trail names returned Roth contribution exclusions on Line 19", () => {
    const auditAwareResult = calculateForm8606({
      nondeductibleContributions: "0",
      priorYearBasis: "0",
      contributionsMadeNextYear: "0",
      yearEndValue: "0",
      traditionalDistributions: "0",
      rothConversions: "0",
      rothDistributions: "14000",
      rothReturnedContributionsByDueDate: "3500",
      rothReturnedExcessContributions: "1500",
      rothRolledOverDistributions: "2000",
      rothQualifiedHsaFundingDistributions: "1000",
      rothContributionBasis: "3000",
      rothConversionBasis: "1000",
    });

    const line19 = auditAwareResult.lines.find((line) => line.form === "Form 8606" && line.line === "19");

    expect(line19?.formula).toContain("returned by the due date");
    expect(line19?.formula).toContain("returned Roth excess contributions");
    expect(String(line19?.inputs["Roth returned contributions by due date"])).toBe("3500");
    expect(String(line19?.inputs["Returned Roth excess contributions"])).toBe("1500");
  });

  // ── Per-year Roth conversion basis chart (Line 24) ──

  const perYearBasicChart = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "20000",
    rothContributionBasis: "5000",
    rothConversionBasisByYear: [
      { year: 2019, conversionAmount: "10000", previouslyRecoveredTaxFree: "0" },
      { year: 2021, conversionAmount: "8000", previouslyRecoveredTaxFree: "3000" },
      { year: 2023, conversionAmount: "6000", previouslyRecoveredTaxFree: "1000" },
    ],
  });

  const perYearPartialDepletion = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "12000",
    rothContributionBasis: "5000",
    rothConversionBasisByYear: [
      { year: 2020, conversionAmount: "15000", previouslyRecoveredTaxFree: "0" },
    ],
  });

  const perYearFifoDepletion = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "25000",
    rothContributionBasis: "3000",
    rothConversionBasisByYear: [
      { year: 2018, conversionAmount: "8000", previouslyRecoveredTaxFree: "0" },
      { year: 2020, conversionAmount: "10000", previouslyRecoveredTaxFree: "2000" },
      { year: 2022, conversionAmount: "6000", previouslyRecoveredTaxFree: "0" },
    ],
  });

  const perYearAllBasisExhausted = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "50000",
    rothContributionBasis: "2000",
    rothConversionBasisByYear: [
      { year: 2019, conversionAmount: "5000", previouslyRecoveredTaxFree: "0" },
      { year: 2021, conversionAmount: "3000", previouslyRecoveredTaxFree: "0" },
    ],
  });

  const perYearNoDistributions = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "0",
    rothConversionBasisByYear: [
      { year: 2020, conversionAmount: "10000", previouslyRecoveredTaxFree: "3000" },
      { year: 2022, conversionAmount: "7000", previouslyRecoveredTaxFree: "0" },
    ],
  });

  const perYearOverridesSingleValue = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "5000",
    rothContributionBasis: "0",
    rothConversionBasis: "99999", // should be ignored when per-year chart is present
    rothConversionBasisByYear: [
      { year: 2020, conversionAmount: "4000", previouslyRecoveredTaxFree: "0" },
    ],
  });

  const perYearFullyRecoveredPreserved = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "5000",
    rothContributionBasis: "0",
    rothConversionBasisByYear: [
      { year: 2018, conversionAmount: "3000", previouslyRecoveredTaxFree: "3000" }, // already fully recovered
      { year: 2020, conversionAmount: "10000", previouslyRecoveredTaxFree: "2000" },
    ],
  });

  it("Form 8606 Line 24 per-year chart - computes total remaining basis from per-year records", () => {
    // 2019: 10000 - 0 = 10000, 2021: 8000 - 3000 = 5000, 2023: 6000 - 1000 = 5000 → total = 20000
    expect(perYearBasicChart.line24.toNumber()).toBe(20000);
  });

  it("Form 8606 Line 24 per-year chart - single conversion year with partial basis recovery", () => {
    // 15000 - 0 = 15000 remaining
    expect(perYearPartialDepletion.line24.toNumber()).toBe(15000);
    // rothDistributions=12000, rothContributionBasis=5000, line23=7000, consume 7000 from 2020
    expect(perYearPartialDepletion.line25a.toNumber()).toBe(0);
    const cf = perYearPartialDepletion.rothConversionBasisByYearCarryforward!;
    expect(cf).toHaveLength(1);
    expect(cf[0].year).toBe(2020);
    expect(cf[0].previouslyRecoveredTaxFree.toNumber()).toBe(7000);
    expect(cf[0].basisRemaining.toNumber()).toBe(8000);
  });

  it("Form 8606 Line 24 per-year chart - FIFO depletion depletes oldest conversion years first", () => {
    // Total remaining: 8000 + 8000 + 6000 = 22000
    // rothDistributions=25000, rothContributionBasis=3000, line23=22000
    // FIFO: 2018 has 8000 remaining → consume 8000, 2020 has 8000 remaining → consume 8000, 2022 has 6000 → consume 6000
    expect(perYearFifoDepletion.line24.toNumber()).toBe(22000);
    expect(perYearFifoDepletion.line25a.toNumber()).toBe(0);
    const cf = perYearFifoDepletion.rothConversionBasisByYearCarryforward!;
    expect(cf).toHaveLength(3);
    // 2018: fully depleted
    expect(cf[0].year).toBe(2018);
    expect(cf[0].previouslyRecoveredTaxFree.toNumber()).toBe(8000);
    expect(cf[0].basisRemaining.toNumber()).toBe(0);
    // 2020: fully depleted
    expect(cf[1].year).toBe(2020);
    expect(cf[1].previouslyRecoveredTaxFree.toNumber()).toBe(10000);
    expect(cf[1].basisRemaining.toNumber()).toBe(0);
    // 2022: fully depleted
    expect(cf[2].year).toBe(2022);
    expect(cf[2].previouslyRecoveredTaxFree.toNumber()).toBe(6000);
    expect(cf[2].basisRemaining.toNumber()).toBe(0);
  });

  it("Form 8606 Line 24 per-year chart - all basis exhausted leaves taxable earnings on Line 25a", () => {
    // Total remaining: 5000 + 3000 = 8000
    // rothDistributions=50000, rothContributionBasis=2000, line23=48000, line25a=40000
    expect(perYearAllBasisExhausted.line24.toNumber()).toBe(8000);
    expect(perYearAllBasisExhausted.line25a.toNumber()).toBe(40000);
    const cf = perYearAllBasisExhausted.rothConversionBasisByYearCarryforward!;
    expect(cf).toHaveLength(2);
    expect(cf[0].basisRemaining.toNumber()).toBe(0);
    expect(cf[1].basisRemaining.toNumber()).toBe(0);
  });

  it("Form 8606 Line 24 per-year chart - no distributions preserve the chart unchanged", () => {
    expect(perYearNoDistributions.line24.toNumber()).toBe(14000);
    expect(perYearNoDistributions.line25a.toNumber()).toBe(0);
    const cf = perYearNoDistributions.rothConversionBasisByYearCarryforward!;
    expect(cf).toHaveLength(2);
    expect(cf[0].year).toBe(2020);
    expect(cf[0].previouslyRecoveredTaxFree.toNumber()).toBe(3000);
    expect(cf[0].basisRemaining.toNumber()).toBe(7000);
    expect(cf[1].year).toBe(2022);
    expect(cf[1].previouslyRecoveredTaxFree.toNumber()).toBe(0);
    expect(cf[1].basisRemaining.toNumber()).toBe(7000);
  });

  it("Form 8606 Line 24 per-year chart - per-year chart takes precedence over single rothConversionBasis", () => {
    // rothConversionBasis=99999 but per-year chart says only 4000 remaining
    expect(perYearOverridesSingleValue.line24.toNumber()).toBe(4000);
    expect(perYearOverridesSingleValue.line25a.toNumber()).toBe(1000);
  });

  it("Form 8606 Line 24 per-year chart - fully recovered prior years are preserved in carryforward", () => {
    // 2018: already fully recovered (3000/3000), 2020: 8000 remaining
    expect(perYearFullyRecoveredPreserved.line24.toNumber()).toBe(8000);
    const cf = perYearFullyRecoveredPreserved.rothConversionBasisByYearCarryforward!;
    expect(cf).toHaveLength(2);
    // 2018 stays fully recovered
    expect(cf[0].year).toBe(2018);
    expect(cf[0].basisRemaining.toNumber()).toBe(0);
    expect(cf[0].previouslyRecoveredTaxFree.toNumber()).toBe(3000);
    // 2020: 5000 consumed from 8000 remaining → 3000 left
    expect(cf[1].year).toBe(2020);
    expect(cf[1].previouslyRecoveredTaxFree.toNumber()).toBe(7000);
    expect(cf[1].basisRemaining.toNumber()).toBe(3000);
  });

  it("Form 8606 Line 24 per-year chart - backward compatibility without per-year chart returns no carryforward", () => {
    // Existing test fixture uses single rothConversionBasis
    expect(rothHomebuyerOrdering.rothConversionBasisByYearCarryforward).toBeUndefined();
    expect(rothHomebuyerOrdering.line24.toNumber()).toBe(2500);
  });

  it("Form 8606 Line 24 per-year chart - audit trail shows per-year computation when chart is provided", () => {
    const line24Audit = perYearBasicChart.lines.find((line) => line.form === "Form 8606" && line.line === "24");
    expect(line24Audit?.formula).toContain("per-year");
  });

  // ── Per-year Roth contribution basis chart (Line 22) ──

  const contribPerYearBasicChart = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "10000",
    rothContributionBasisByYear: [
      { year: 2005, contributionAmount: "3000", previouslyWithdrawnTaxFree: "0" },
      { year: 2010, contributionAmount: "5000", previouslyWithdrawnTaxFree: "1000" },
      { year: 2020, contributionAmount: "6000", previouslyWithdrawnTaxFree: "500" },
    ],
    rothConversionBasis: "2000",
  });

  const contribPerYearPartialDepletion = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "8000",
    rothContributionBasisByYear: [
      { year: 2015, contributionAmount: "6000", previouslyWithdrawnTaxFree: "0" },
      { year: 2020, contributionAmount: "5500", previouslyWithdrawnTaxFree: "0" },
    ],
    rothConversionBasis: "3000",
  });

  const contribPerYearFifoDepletion = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "15000",
    rothContributionBasisByYear: [
      { year: 2005, contributionAmount: "4000", previouslyWithdrawnTaxFree: "0" },
      { year: 2012, contributionAmount: "5000", previouslyWithdrawnTaxFree: "2000" },
      { year: 2022, contributionAmount: "7000", previouslyWithdrawnTaxFree: "0" },
    ],
    rothConversionBasis: "5000",
  });

  const contribPerYearAllExhausted = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "50000",
    rothContributionBasisByYear: [
      { year: 2010, contributionAmount: "5000", previouslyWithdrawnTaxFree: "0" },
      { year: 2015, contributionAmount: "3000", previouslyWithdrawnTaxFree: "0" },
    ],
    rothConversionBasis: "4000",
  });

  const contribPerYearNoDistributions = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "0",
    rothContributionBasisByYear: [
      { year: 2018, contributionAmount: "6000" },
      { year: 2020, contributionAmount: "6000", previouslyWithdrawnTaxFree: "1000" },
    ],
    rothConversionBasis: "2000",
  });

  const contribPerYearOverridesSingleValue = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "5000",
    rothContributionBasis: "99999", // Should be overridden by per-year chart
    rothContributionBasisByYear: [
      { year: 2019, contributionAmount: "3000", previouslyWithdrawnTaxFree: "1000" },
    ],
    rothConversionBasis: "1000",
  });

  const contribPerYearWithLine25cAdjustment = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "10000",
    rothContributionBasisByYear: [
      { year: 2018, contributionAmount: "4000", previouslyWithdrawnTaxFree: "0" },
    ],
    priorYearLine25cBasisAdjustment: "500",
    rothConversionBasis: "2000",
  });

  const contribPerYearFullyRecoveredPreserved = calculateForm8606({
    nondeductibleContributions: "0",
    priorYearBasis: "0",
    contributionsMadeNextYear: "0",
    yearEndValue: "0",
    traditionalDistributions: "0",
    rothConversions: "0",
    rothDistributions: "15000",
    rothContributionBasisByYear: [
      { year: 2010, contributionAmount: "3000", previouslyWithdrawnTaxFree: "3000" }, // Already fully recovered
      { year: 2018, contributionAmount: "8000", previouslyWithdrawnTaxFree: "0" },
    ],
    rothConversionBasis: "2000",
  });

  it("Form 8606 Line 22 per-year contribution basis chart - computes total remaining basis from per-year records", () => {
    // 2005: 3000-0=3000, 2010: 5000-1000=4000, 2020: 6000-500=5500 → total = 12500
    expect(contribPerYearBasicChart.rothContributionBasis.toNumber()).toBe(12500);
    expect(contribPerYearBasicChart.line22.toNumber()).toBe(12500);
  });

  it("Form 8606 Line 22 per-year contribution basis chart - single contribution year with partial distribution", () => {
    // 2015: 6000-0=6000, 2020: 5500-0=5500 → total = 11500
    expect(contribPerYearPartialDepletion.line22.toNumber()).toBe(11500);
    // rothDistributions=8000, line22=11500, line23=0 (distributions don't exceed basis)
    expect(contribPerYearPartialDepletion.line23.toNumber()).toBe(0);
    // FIFO depletion: 8000 consumed from oldest first → 2015: 6000 consumed, 2020: 2000 consumed
    const cf = contribPerYearPartialDepletion.rothContributionBasisByYearCarryforward!;
    expect(cf).toHaveLength(2);
    expect(cf[0].year).toBe(2015);
    expect(cf[0].previouslyWithdrawnTaxFree.toNumber()).toBe(6000);
    expect(cf[0].basisRemaining.toNumber()).toBe(0);
    expect(cf[1].year).toBe(2020);
    expect(cf[1].previouslyWithdrawnTaxFree.toNumber()).toBe(2000);
    expect(cf[1].basisRemaining.toNumber()).toBe(3500);
  });

  it("Form 8606 Line 22 per-year contribution basis chart - FIFO depletion depletes oldest contribution years first", () => {
    // 2005: 4000-0=4000, 2012: 5000-2000=3000, 2022: 7000-0=7000 → total = 14000
    expect(contribPerYearFifoDepletion.line22.toNumber()).toBe(14000);
    // rothDistributions=15000, line22=14000, line23=1000 (exceeds by 1000, goes to conversion)
    expect(contribPerYearFifoDepletion.line23.toNumber()).toBe(1000);
    // FIFO depletion: 14000 consumed (all contribution basis used)
    // 2005: consume 4000, 2012: consume 3000, 2022: consume 7000
    const cf = contribPerYearFifoDepletion.rothContributionBasisByYearCarryforward!;
    expect(cf).toHaveLength(3);
    expect(cf[0].year).toBe(2005);
    expect(cf[0].previouslyWithdrawnTaxFree.toNumber()).toBe(4000);
    expect(cf[0].basisRemaining.toNumber()).toBe(0);
    expect(cf[1].year).toBe(2012);
    expect(cf[1].previouslyWithdrawnTaxFree.toNumber()).toBe(5000);
    expect(cf[1].basisRemaining.toNumber()).toBe(0);
    expect(cf[2].year).toBe(2022);
    expect(cf[2].previouslyWithdrawnTaxFree.toNumber()).toBe(7000);
    expect(cf[2].basisRemaining.toNumber()).toBe(0);
  });

  it("Form 8606 Line 22 per-year contribution basis chart - all basis exhausted leaves remaining to conversion and earnings", () => {
    // 2010: 5000-0=5000, 2015: 3000-0=3000 → total = 8000
    expect(contribPerYearAllExhausted.line22.toNumber()).toBe(8000);
    // rothDistributions=50000, line22=8000, line23=42000, rothConversionBasis=4000, line24=4000, line25a=38000
    expect(contribPerYearAllExhausted.line23.toNumber()).toBe(42000);
    expect(contribPerYearAllExhausted.line25a.toNumber()).toBe(38000);
  });

  it("Form 8606 Line 22 per-year contribution basis chart - no distributions preserve the chart unchanged", () => {
    // 2018: 6000-0=6000, 2020: 6000-1000=5000 → total = 11000
    expect(contribPerYearNoDistributions.line22.toNumber()).toBe(11000);
    expect(contribPerYearNoDistributions.line23.toNumber()).toBe(0);
    const cf = contribPerYearNoDistributions.rothContributionBasisByYearCarryforward!;
    expect(cf).toHaveLength(2);
    // No depletion: records unchanged
    expect(cf[0].year).toBe(2018);
    expect(cf[0].previouslyWithdrawnTaxFree.toNumber()).toBe(0);
    expect(cf[0].basisRemaining.toNumber()).toBe(6000);
    expect(cf[1].year).toBe(2020);
    expect(cf[1].previouslyWithdrawnTaxFree.toNumber()).toBe(1000);
    expect(cf[1].basisRemaining.toNumber()).toBe(5000);
  });

  it("Form 8606 Line 22 per-year contribution basis chart - per-year chart takes precedence over single rothContributionBasis", () => {
    // rothContributionBasis=99999 but per-year chart says only 2000 remaining
    // 2019: 3000-1000=2000
    expect(contribPerYearOverridesSingleValue.line22.toNumber()).toBe(2000);
    expect(contribPerYearOverridesSingleValue.rothContributionBasis.toNumber()).toBe(2000);
  });

  it("Form 8606 Line 22 per-year contribution basis chart - prior-year Line 25c adjustment adds on top of chart total", () => {
    // 2018: 4000-0=4000 + priorYearLine25cBasisAdjustment=500 → line22=4500
    expect(contribPerYearWithLine25cAdjustment.line22.toNumber()).toBe(4500);
  });

  it("Form 8606 Line 22 per-year contribution basis chart - fully recovered prior years are preserved in carryforward", () => {
    // 2010: already fully recovered (3000/3000=0 remaining), 2018: 8000 remaining → total = 8000
    expect(contribPerYearFullyRecoveredPreserved.line22.toNumber()).toBe(8000);
    // rothDistributions=15000, line22=8000, line23=7000
    const cf = contribPerYearFullyRecoveredPreserved.rothContributionBasisByYearCarryforward!;
    expect(cf).toHaveLength(2);
    // 2010 stays fully recovered, 2018 fully consumed
    expect(cf[0].year).toBe(2010);
    expect(cf[0].previouslyWithdrawnTaxFree.toNumber()).toBe(3000);
    expect(cf[0].basisRemaining.toNumber()).toBe(0);
    expect(cf[1].year).toBe(2018);
    expect(cf[1].previouslyWithdrawnTaxFree.toNumber()).toBe(8000);
    expect(cf[1].basisRemaining.toNumber()).toBe(0);
  });

  it("Form 8606 Line 22 per-year contribution basis chart - backward compatibility without per-year chart returns no carryforward", () => {
    expect(rothHomebuyerOrdering.rothContributionBasisByYearCarryforward).toBeUndefined();
    expect(rothHomebuyerOrdering.line22.toNumber()).toBe(3750);
  });

  it("Form 8606 Line 22 per-year contribution basis chart - audit trail shows per-year computation when chart is provided", () => {
    const line22Audit = contribPerYearBasicChart.lines.find((line) => line.form === "Form 8606" && line.line === "22");
    expect(line22Audit?.formula).toContain("per-year");
  });
});
