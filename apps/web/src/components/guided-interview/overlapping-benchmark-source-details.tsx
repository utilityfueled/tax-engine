"use client";
import { copyBenchmarkGroupPeople, type OverlappingBenchmarkData, type OverlappingBenchmarkGroupData, type SharedPolicyAllocationData } from "@/lib/guided-shared-policy";
import { BooleanFact, TextFact } from "./fact-fields";
import { CurrencyField } from "./currency-field";

export function OverlappingBenchmarkSourceDetails({ packet, onCapture, onChange, onError }: {
  packet: SharedPolicyAllocationData; onCapture: () => void; onChange: (value: OverlappingBenchmarkData | undefined) => void; onError: (action: () => void) => void;
}) {
  const value = packet.overlappingCoverage;
  return <section><h5>Overlapping unshared coverage benchmarks</h5>
    <p className="guided-hint">When two unshared policies cover the same month, use Marketplace records to group the covered people by rating area. Enter the applicable benchmark for each complete group once. Each selected policy&apos;s original benchmark must be correct for that group.</p>
    <button type="button" onClick={onCapture}>Copy overlapping unshared months</button>
    {value && <>
      <div className="guided-form-grid">
        <TextFact label="Overlapping benchmark source year" value={value.sourceTaxYear} onChange={sourceTaxYear => onChange({ ...value, sourceTaxYear })} />
        <TextFact label="Overlapping benchmark worksheet reference" value={value.sourceReference} onChange={sourceReference => onChange({ ...value, sourceReference })} />
        <BooleanFact label="All overlapping benchmark months are included" value={value.allBenchmarkMonthsIncluded} onChange={allBenchmarkMonthsIncluded => onChange({ ...value, allBenchmarkMonthsIncluded })} />
      </div>
      {value.months.map((row, rowIndex) => {
        const setGroups = (groups: OverlappingBenchmarkGroupData[]) => onChange({ ...value, months: value.months.map((current, i) => i === rowIndex ? { ...current, groups } : current) });
        const sources = packet.policies.filter(policy => policy.situation === "not_shared" && policy.original?.monthlyPremiums.some(source => Number(source.month) === Number(row.month)));
        return <fieldset key={rowIndex}><legend>Month {row.month}: Actual coverage groups</legend>
          {row.groups.map((group, groupIndex) => {
            const prefix = `Month ${row.month} group ${groupIndex + 1}`;
            const set = (patch: Partial<OverlappingBenchmarkGroupData>) => setGroups(row.groups.map((current, i) => i === groupIndex ? { ...current, ...patch } : current));
            return <fieldset key={groupIndex}><legend>{prefix}</legend>
              <div className="guided-form-grid">
                <TextFact label={`${prefix}: Source ID`} value={group.sourceId} onChange={sourceId => set({ sourceId })} />
                <TextFact label={`${prefix}: Source reference`} value={group.sourceReference} onChange={sourceReference => set({ sourceReference })} />
                <TextFact label={`${prefix}: Rating area`} value={group.ratingArea} onChange={ratingArea => set({ ratingArea })} />
                <CurrencyField label={`${prefix}: Applicable benchmark`} value={group.slcsp} onChange={slcsp => set({ slcsp })} />
              </div>
              {sources.map(policy => {
                const ordinal = Number(policy.sourceId.slice('form1095A:'.length)) + 1;
                return <label key={policy.sourceId} style={{ display: "block", marginBlock: 8 }}><input type="checkbox" aria-label={`${prefix}: Include original policy ${ordinal}`} checked={group.policySourceIds.includes(policy.sourceId)} onChange={event => onError(() => {
                  const policySourceIds = event.target.checked ? [...group.policySourceIds, policy.sourceId] : group.policySourceIds.filter(id => id !== policy.sourceId);
                  set({ policySourceIds, coveredIndividualSsns: copyBenchmarkGroupPeople(packet, row.month, policySourceIds), slcsp: "",
                    allUnsharedCoverageFamilyMembersIncludedConfirmed: null, allCoveredPeopleShareRatingAreaConfirmed: null });
                })} /> Include original policy {ordinal}: {policy.original?.policyNumber}</label>;
              })}
              <p className="guided-hint">Copied {group.coveredIndividualSsns.length} covered people from the selected originals. Changing the group clears its benchmark and confirmation answers.</p>
              <div className="guided-form-grid">
                <BooleanFact label={`${prefix}: All unshared coverage-family members are included`} value={group.allUnsharedCoverageFamilyMembersIncludedConfirmed} onChange={allUnsharedCoverageFamilyMembersIncludedConfirmed => set({ allUnsharedCoverageFamilyMembersIncludedConfirmed })} />
                <BooleanFact label={`${prefix}: These people share this rating area`} value={group.allCoveredPeopleShareRatingAreaConfirmed} onChange={allCoveredPeopleShareRatingAreaConfirmed => set({ allCoveredPeopleShareRatingAreaConfirmed })} />
              </div>
              <button type="button" onClick={() => setGroups(row.groups.filter((_, i) => i !== groupIndex))}>{prefix}: Remove group</button>
            </fieldset>;
          })}
          <button type="button" onClick={() => setGroups([...row.groups, { sourceId: "", sourceReference: "", ratingArea: "", slcsp: "", policySourceIds: [], coveredIndividualSsns: [],
            allUnsharedCoverageFamilyMembersIncludedConfirmed: null, allCoveredPeopleShareRatingAreaConfirmed: null }])}>Month {row.month}: Add actual benchmark group</button>
        </fieldset>;
      })}
      <BooleanFact label="Overlapping benchmark sources checked after the last edit" value={value.sourceFactsConfirmed} onChange={sourceFactsConfirmed => onChange({ ...value, sourceFactsConfirmed })} />
      <button type="button" onClick={() => onChange(undefined)}>Remove overlapping benchmark worksheet</button>
    </>}
  </section>;
}
