/** Actual source prerequisite; spec/federal/savings-bond-reissue-sources.yaml. */
import Decimal from "decimal.js";
import type { SavingsBondReissueSources } from "@/models/savings-bond-reissue-sources.js";
import type { SavingsBondRedemption, TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";

export interface BondSourceRatio { numerator: Decimal; denominator: Decimal }
export interface SavingsBondReissueInput {
  taxpayer: Pick<TaxYearInput["taxpayer"], "taxYear" | "filingStatus"> & {
    primary: Pick<TaxYearInput["taxpayer"]["primary"], "firstName" | "lastName" | "ssn" | "dateOfBirth">;
    spouse?: Pick<NonNullable<TaxYearInput["taxpayer"]["spouse"]>, "firstName" | "lastName" | "ssn" | "dateOfBirth">;
  };
  redemptions: Array<Partial<SavingsBondRedemption> & { reissueSourceId?: string; bondIdentifier?: string }>;
  sources?: SavingsBondReissueSources;
}
export interface SavingsBondReissueResult {
  currentTransferInterest: { primary: BondSourceRatio; spouse: BondSourceRatio };
  groups: Array<{ sourceId: string; recognizedAtReissue: { primary: BondSourceRatio; spouse: BondSourceRatio } }>;
  redemptions: Array<{
    sourceId: string; reissueSourceId: string; principal: Decimal; owner: "primary" | "spouse";
    redemptionInterest: BondSourceRatio; previouslyRecognizedInterest: BondSourceRatio;
    currentTransferInterest: BondSourceRatio;
  }>;
  lines: CalculatedLine[];
}
export function calculateSavingsBondReissueSources(input: SavingsBondReissueInput): SavingsBondReissueResult | undefined {
  if (!input.sources) {
    if (input.redemptions.some(row => row.reissueSourceId !== undefined)) throw new Error("Actual bond reissue source link needs its complete history packet.");
    return undefined;
  }
  const sources = input.sources, year = input.taxpayer.taxYear;
  if (year !== 2025 && year !== 2026) throw new Error("Actual bond reissue source year is unsupported.");
  if (sources.sourceTaxYear !== year || sources.sourceFactsConfirmed !== true || !sources.sourceReference?.trim()
    || !sources.groups?.length) throw new Error("Actual bond reissue history requires its year, reference, complete originals and confirmation.");
  if (input.taxpayer.filingStatus !== "married_filing_jointly" || !input.taxpayer.spouse)
    throw new Error("This actual reissue source method requires both original co-owners on the current joint return.");

  // All finite original digits participate in precision. Products and ratio sums
  // remain exact; no finite quotient is subsequently treated as the source.
  const numeric: Decimal[] = [];
  const scan = (value: unknown): void => {
    if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) numeric.push(new Decimal(value));
    else if (value && typeof value === "object") Object.values(value).forEach(scan);
  };
  scan([sources, input.redemptions]);
  const digits = Math.max(1, ...numeric.map(value => value.precision(true) + value.decimalPlaces()));
  const nodes = sources.groups.reduce((count, row) => count + 1 + (row.successors?.length ?? 0), 0);
  const D = Decimal.clone({ precision: Math.max(80, digits * (12 + 6 * nodes)) });
  type Ratio = { numerator: Decimal; denominator: Decimal };
  const ratio = (numerator: Decimal.Value, denominator: Decimal.Value = 1): Ratio => ({ numerator: new D(numerator), denominator: new D(denominator) });
  const add = (a: Ratio, b: Ratio): Ratio => ratio(a.numerator.times(b.denominator).plus(b.numerator.times(a.denominator)), a.denominator.times(b.denominator));
  const subtract = (a: Ratio, b: Ratio): Ratio => ratio(a.numerator.times(b.denominator).minus(b.numerator.times(a.denominator)), a.denominator.times(b.denominator));
  const scale = (a: Ratio, numerator: Decimal, denominator: Decimal): Ratio => ratio(a.numerator.times(numerator), a.denominator.times(denominator));
  const total = (values: Decimal[]) => values.reduce((sum, value) => sum.plus(value), new D(0));
  const exposed = (value: Ratio): BondSourceRatio => ({ numerator: new Decimal(value.numerator.toFixed()), denominator: new Decimal(value.denominator.toFixed()) });
  const normalized = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const text = (value: string | undefined, label: string): string => {
    if (!value?.trim()) throw new Error(`Actual bond reissue ${label} source is missing.`);
    return value.trim();
  };
  const amount = (value: string | undefined, label: string): Decimal => {
    if (value === undefined || !/^\d+(\.\d+)?$/.test(value)) throw new Error(`Actual bond reissue ${label} is missing or invalid.`);
    const parsed = new D(value);
    if (!parsed.isFinite() || parsed.lt(0)) throw new Error(`Actual bond reissue ${label} must be nonnegative.`);
    return parsed;
  };
  const date = (value: string | undefined, label: string): string => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Actual bond reissue ${label} date is missing.`);
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`Actual bond reissue ${label} date is invalid.`);
    return value;
  };
  const unique = (value: string | undefined, seen: Set<string>, label: string): string => {
    const original = text(value, label), key = normalized(original);
    if (seen.has(key)) throw new Error(`Actual bond reissue ${label} source identity is duplicated.`);
    seen.add(key); return original;
  };
  for (const owner of ["primary", "spouse"] as const) {
    const actual = input.taxpayer[owner], copied = sources[owner];
    if (!actual || !copied
      || normalized(text(actual.firstName, `${owner} current first name`)) !== normalized(text(copied.firstName, `${owner} original first name`))
      || normalized(text(actual.lastName, `${owner} current last name`)) !== normalized(text(copied.lastName, `${owner} original last name`))
      || !/^\d{4}$/.test(copied.ssnLast4 ?? "") || !/^\d{9}$/.test(actual.ssn.replace(/\D/g, ""))
      || actual.ssn.replace(/\D/g, "").slice(-4) !== copied.ssnLast4
      || date(actual.dateOfBirth, `${owner} current birth`) !== date(copied.dateOfBirth, `${owner} original birth`))
      throw new Error("Actual bond reissue original owner identity does not match the current living joint filers.");
  }
  if (input.taxpayer.primary.ssn.replace(/\D/g, "") === input.taxpayer.spouse.ssn.replace(/\D/g, ""))
    throw new Error("Actual bond reissue joint owners must be distinct.");

  const redemptions = new Map<string, SavingsBondReissueInput["redemptions"][number]>();
  const redemptionIds = new Set<string>(), originalIds = new Set<string>(), successorIds = new Set<string>();
  const originalIdentifiers = new Set<string>(), successorIdentifiers = new Set<string>();
  for (const row of input.redemptions) {
    if (row.sourceId !== undefined) unique(row.sourceId, redemptionIds, "redemption");
    if (row.reissueSourceId === undefined) continue;
    const id = text(row.sourceId, "linked redemption"), successorId = normalized(text(row.reissueSourceId, "linked successor"));
    if (redemptions.has(successorId)) throw new Error("Actual bond reissue successor has duplicate current redemption originals.");
    redemptions.set(successorId, { ...row, sourceId: id });
  }
  const matched = new Set<string>();
  const transfers = { primary: ratio(0), spouse: ratio(0) };
  const result: SavingsBondReissueResult = { currentTransferInterest: { primary: exposed(ratio(0)), spouse: exposed(ratio(0)) }, groups: [], redemptions: [], lines: [] };
  const audit = new AuditTrail();

  for (const [index, group] of sources.groups.entries()) {
    const sourceId = unique(group.sourceId, originalIds, "original group");
    unique(group.originalBondIdentifier, originalIdentifiers, "original bond identifier");
    text(group.sourceReference, "original purchase and reissue reference");
    if (group.originalRegisteredOwner !== "taxpayer_and_spouse" || group.bothOriginalOwnersLivingConfirmed !== true)
      throw new Error("Actual bond reissue method requires original living joint co-owners.");
    if (group.communityProperty !== false) throw new Error("Actual bond reissue community-property history requires its separate source method; unknown is not false.");
    if (group.allPriorReportingCompleteConfirmed !== true || group.allSuccessorsCompleteConfirmed !== true || !group.successors?.length)
      throw new Error("Actual bond reissue reporting and successor history must be complete and confirmed.");
    if (group.originalBondType !== "paper_ee" && group.originalBondType !== "electronic_ee" && group.originalBondType !== "series_i")
      throw new Error("Actual bond reissue method requires the original series EE or I classification.");
    const issued = date(group.originalIssueDate, "original issue"), reissued = date(group.reissueDate, "reissue");
    if (!issued.endsWith("-01") || issued > reissued || reissued > `${year}-12-31`
      || issued < date(sources.primary?.dateOfBirth, "primary birth") || issued < date(sources.spouse?.dateOfBirth, "spouse birth"))
      throw new Error("Actual bond reissue issue, owner or reissue dates contradict the source chronology.");
    const face = amount(group.originalFaceValue, "original face value");
    const principal = group.originalBondType === "paper_ee" ? face.times("0.5") : face;
    const accrued = amount(group.valueAtReissue, "value at reissue").minus(principal);
    const funds = { primary: amount(group.taxpayerPurchaseFunds, "taxpayer purchase funds"), spouse: amount(group.spousePurchaseFunds, "spouse purchase funds") };
    const prior = { primary: amount(group.taxpayerPreviouslyReportedInterest, "taxpayer pre-reissue reports"), spouse: amount(group.spousePreviouslyReportedInterest, "spouse pre-reissue reports") };
    if (principal.lte(0) || accrued.lt(0) || !funds.primary.plus(funds.spouse).eq(principal))
      throw new Error("Actual bond reissue original face, funds and accrued value do not reconcile.");
    const deferred = { primary: subtract(ratio(accrued.times(funds.primary), principal), ratio(prior.primary)), spouse: subtract(ratio(accrued.times(funds.spouse), principal), ratio(prior.spouse)) };
    if (deferred.primary.numerator.lt(0) || deferred.spouse.numerator.lt(0)) throw new Error("Actual bond reissue owner prior reporting exceeds that owner's accrued interest.");
    const successors = group.successors.map(successor => {
      const successorId = unique(successor.sourceId, successorIds, "successor");
      const identifier = unique(successor.bondIdentifier, successorIdentifiers, "successor bond identifier");
      text(successor.sourceReference, "successor reference");
      if (successor.registeredOwner !== "taxpayer" && successor.registeredOwner !== "spouse") throw new Error("Actual bond reissue successor registration must identify one original owner.");
      if (successor.furtherOwnershipChanges !== false) throw new Error("Actual bond reissue successor needs its unchanged subsequent ownership history.");
      if (successor.status !== "redeemed" && successor.status !== "held") throw new Error("Actual bond reissue successor redemption or held status is unknown.");
      const successorFace = amount(successor.faceValue, "successor face value");
      if (successorFace.lte(0)) throw new Error("Actual bond reissue successor face value must be positive.");
      return { original: successor, sourceId: successorId, identifier, face: successorFace, owner: successor.registeredOwner === "taxpayer" ? "primary" as const : "spouse" as const };
    });
    if (!total(successors.map(row => row.face)).eq(face)) throw new Error("Actual bond reissue successor face values do not conserve the complete original.");
    const ownerFace = { primary: total(successors.filter(row => row.owner === "primary").map(row => row.face)), spouse: total(successors.filter(row => row.owner === "spouse").map(row => row.face)) };
    const wholeOwner = ownerFace.primary.isZero() ? "spouse" : ownerFace.spouse.isZero() ? "primary" : undefined;
    const soleFunder = funds.primary.isZero() ? "spouse" : funds.spouse.isZero() ? "primary" : undefined;
    const proportional = ownerFace.primary.times(principal).eq(face.times(funds.primary)) && ownerFace.spouse.times(principal).eq(face.times(funds.spouse));
    if (!wholeOwner && !soleFunder && !proportional) throw new Error("Actual bond reissue nonproportional two-funder split requires its separate source method.");
    const recognized = { primary: ratio(0), spouse: ratio(0) };
    for (const successor of successors) {
      let preReports: Ratio, transferred: Ratio, transferOwner: "primary" | "spouse" | undefined;
      if (wholeOwner) {
        transferOwner = wholeOwner === "primary" ? "spouse" : "primary";
        transferred = scale(deferred[transferOwner], successor.face, face);
        preReports = ratio(prior.primary.plus(prior.spouse).times(successor.face), face);
      } else if (soleFunder) {
        transferOwner = soleFunder;
        transferred = successor.owner === soleFunder ? ratio(0) : scale(deferred[soleFunder], successor.face, face);
        preReports = ratio(prior[soleFunder].times(successor.face), face);
      } else {
        transferred = ratio(0);
        preReports = ratio(prior[successor.owner].times(successor.face), ownerFace[successor.owner]);
      }
      if (transferOwner) recognized[transferOwner] = add(recognized[transferOwner], transferred);
      const currentEvent = reissued.startsWith(`${year}-`);
      const postPrior = amount(successor.original.postReissuePriorInterestReported, "successor post-reissue prior reporting");
      if (currentEvent && !postPrior.isZero()) throw new Error("Actual current-year reissue cannot have post-reissue reporting in an earlier tax year.");
      const historical = add(add(preReports, currentEvent ? ratio(0) : transferred), ratio(postPrior));
      const currentTransfer = currentEvent ? transferred : ratio(0);
      const linked = redemptions.get(normalized(successor.sourceId));
      if (successor.original.status === "held") {
        if (successor.original.redemptionSourceId !== undefined || linked) throw new Error("Actual held successor conflicts with a current redemption source.");
        continue;
      }
      if (!linked || normalized(text(successor.original.redemptionSourceId, "successor redemption link")) !== normalized(text(linked.sourceId, "original redemption link")))
        throw new Error("Actual reissue successor does not match its original current redemption.");
      matched.add(normalized(successor.sourceId));
      if (normalized(text(linked.bondIdentifier, "original redemption bond identifier")) !== normalized(successor.identifier))
        throw new Error("Actual reissue successor identifier does not match the original redemption bond identifier.");
      const redeemed = date(linked.redemptionDate, "redemption"), owner = input.taxpayer[successor.owner];
      if (linked.registeredOwner !== successor.original.registeredOwner || linked.ownershipConfirmed !== true || linked.bondType !== group.originalBondType
        || date(linked.issueDate, "successor assigned issue") !== issued || redeemed < reissued || !redeemed.startsWith(`${year}-`)
        || !owner || date(linked.ownerDateOfBirth, "redemption owner birth") !== date(owner.dateOfBirth, "current owner birth")
        || !amount(linked.faceValue, "redemption face value").eq(successor.face) || linked.incomeOwnership !== undefined)
        throw new Error("Actual reissue original redemption classification, owner, face or dates do not match its history.");
      const successorPrincipal = group.originalBondType === "paper_ee" ? successor.face.times("0.5") : successor.face;
      const lifetime = amount(linked.proceeds, "actual redemption proceeds").minus(successorPrincipal);
      // Actual successor value cannot be below its allocated value at reissue.
      if (lifetime.lt(0) || lifetime.times(face).lt(accrued.times(successor.face))) throw new Error("Actual redemption value contradicts the original reissue value.");
      const redemptionInterest = subtract(subtract(ratio(lifetime), historical), currentTransfer);
      if (redemptionInterest.numerator.lt(0)) throw new Error("Actual successor prior reporting exceeds the deferred redemption interest.");
      if (linked.priorYearInterestReported !== undefined && !amount(linked.priorYearInterestReported, "legacy prior interest").times(historical.denominator).eq(historical.numerator))
        throw new Error("Actual reissue history contradicts the supplied prior-interest summary.");
      if (linked.interest !== undefined && !amount(linked.interest, "legacy redemption interest").times(redemptionInterest.denominator).eq(redemptionInterest.numerator))
        throw new Error("Actual reissue history contradicts the supplied redemption-interest summary.");
      result.redemptions.push({ sourceId: text(linked.sourceId, "redemption"), reissueSourceId: successor.sourceId,
        principal: new Decimal(successorPrincipal.toFixed()), owner: successor.owner,
        redemptionInterest: exposed(redemptionInterest), previouslyRecognizedInterest: exposed(historical), currentTransferInterest: exposed(currentTransfer) });
    }
    if (reissued.startsWith(`${year}-`)) for (const owner of ["primary", "spouse"] as const) transfers[owner] = add(transfers[owner], recognized[owner]);
    result.groups.push({ sourceId, recognizedAtReissue: { primary: exposed(recognized.primary), spouse: exposed(recognized.spouse) } });
    for (const owner of ["primary", "spouse"] as const) audit.record("Savings bond reissue sources", `${index + 1}:${owner}`, `Original ${index + 1} ${owner} interest recognized at reissue`, recognized[owner].numerator.div(recognized[owner].denominator),
      "Actual funded ownership and original accrued value less actual prior reporting; exact source fraction retained", { numerator: recognized[owner].numerator, denominator: recognized[owner].denominator, reissueTaxYear: reissued.slice(0, 4) });
  }
  if (matched.size !== redemptions.size) throw new Error("Actual redemption source has no unique matching reissue successor history.");
  result.currentTransferInterest = { primary: exposed(transfers.primary), spouse: exposed(transfers.spouse) };
  result.lines = audit.getLines();
  return result;
}
