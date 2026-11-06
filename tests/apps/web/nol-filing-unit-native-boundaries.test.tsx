// @vitest-environment jsdom
// Spec: nol-filing-unit-native-boundaries.yaml. No product or old-fixture mutation.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { NetOperatingLossDetails } from '@/components/guided-interview/net-operating-loss-details';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { guidedNewMarriageNolFixture } from '../../fixtures/guided-net-operating-loss-new-marriage';
import { guidedJointNolFixture } from '../../fixtures/guided-net-operating-loss-joint-pools';

type State = ReturnType<typeof guidedNewMarriageNolFixture>;
function need<T>(value: T | null | undefined): T { if (value === null || value === undefined) throw new Error('Required fictional original source is missing'); return value; }
function withoutConfirmations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutConfirmations);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !key.endsWith('Confirmed')).map(([key, entry]) => [key, withoutConfirmations(entry)]));
  return value;
}
const active: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of active.splice(0)) await cleanup(); });
async function mount(state: State) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const original = structuredClone(state), element = document.createElement('div'); document.body.appendChild(element);
  let current = need(state.sectionData.adjustments?.netOperatingLossSources), root = createRoot(element), stopped = false;
  function Harness() {
    const [data, setData] = useState(current);
    return <NetOperatingLossDetails data={data} onChange={next => { current = need(next); setData(current); }} />;
  }
  const render = () => act(async () => root.render(<Harness />));
  const destroy = async () => { if (!stopped) { await act(async () => root.unmount()); stopped = true; element.remove(); } };
  active.push(destroy); await render();
  const read = (): NetOperatingLossData => current;
  const field = (label: string, ordinal = 0) => {
    const matches = [...element.querySelectorAll('label')].filter(node => node.querySelector('.guided-field-label')?.textContent === label);
    const result = matches[ordinal]?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!result) throw new Error(`Missing actual native field ${label} #${ordinal}`); return result;
  };
  const change = async (label: string, value: string, ordinal = 0) => {
    const input = field(label, ordinal), prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  };
  const click = async (text: string, ordinal = 0) => {
    const button = [...element.querySelectorAll('button')].filter(item => item.textContent === text)[ordinal];
    if (!button) throw new Error(`Missing actual native button ${text} #${ordinal}`); await act(async () => button.click());
  };
  const canonical = () => {
    const next = structuredClone(original); need(next.sectionData.adjustments).netOperatingLossSources = structuredClone(current);
    return buildTaxInputFromGuidedData(next);
  };
  const invalid = () => { expect(current.sourceFactsConfirmed).toBeNull(); expect(current.alternativeTax?.sourceFactsConfirmed).toBeNull(); expect(canonical()).toBeNull(); };
  const remount = async () => {
    const retained = JSON.stringify(current); await act(async () => root.unmount()); current = JSON.parse(retained) as NetOperatingLossData;
    root = createRoot(element); await render(); expect(JSON.stringify(current)).toBe(retained);
  };
  return { read, field, change, click, canonical, invalid, remount, element, original };
}

it.each(['new-marriage', 'same-couple'] as const)('retains reviewed current owner and same-couple originals %s', async kind => {
  const state = kind === 'new-marriage' ? guidedNewMarriageNolFixture() : guidedJointNolFixture(), before = structuredClone(state);
  const h = await mount(state), parsed = TaxYearInputSchema.parse(h.canonical()), result = calculateFederalTax(parsed);
  if (kind === 'new-marriage') {
    expect(result.netOperatingLoss?.deduction.toString()).toBe('24250'); expect(result.netOperatingLoss?.carryforward.toString()).toBe('25750');
    expect(result.netOperatingLoss?.alternativeTax.deduction.toString()).toBe('20000'); expect(result.netOperatingLoss?.alternativeTax.carryforward.toString()).toBe('0');
  } else { expect(result.agi.toString()).toBe('45200'); expect(result.netOperatingLoss?.carryforward.toString()).toBe('30200'); }
  expect(state).toEqual(before); expect(h.read()).toEqual(before.sectionData.adjustments?.netOperatingLossSources);
});

it.each(['owner', 'return'] as const)('keeps actual original owner and return selections distinct %s', async kind => {
  const h = await mount(guidedNewMarriageNolFixture()), before = structuredClone(h.read()), label = kind === 'owner' ? 'Regular loss 1 original carry owner' : 'Regular loss 1 original filed return';
  await h.change(label, ''); expect(need(h.read().vintages?.[0]?.filingUnitOrigin)[kind === 'owner' ? 'ownerPersonId' : 'returnSourceId']).toBeUndefined(); h.invalid();
  await h.change(label, kind === 'owner' ? 'alex' : 'jane2022');
  expect(need(h.read().vintages?.[0]?.filingUnitOrigin)[kind === 'owner' ? 'ownerPersonId' : 'returnSourceId']).toBe(kind === 'owner' ? 'alex' : 'jane2022');
  expect(h.read().vintages?.[0]?.originalLoss).toBe('50000'); expect(withoutConfirmations(h.read().alternativeTax)).toEqual(withoutConfirmations(before.alternativeTax));
});

it('adds and removes separate original computations without pooling owners', async () => {
  const h = await mount(guidedNewMarriageNolFixture()), before = structuredClone(h.read().vintages?.[0]?.filingUnitOrigin?.separateComputations);
  await h.click('Add original owner computation for Regular loss 1');
  await h.change('Regular loss 1 original owner 2 person', 'alex'); await h.change('Regular loss 1 original owner 2 separate NOL', '100.25'); await h.change('Regular loss 1 original owner 2 source reference', 'Independently retained original worksheet');
  expect(h.read().vintages?.[0]?.filingUnitOrigin?.separateComputations?.[1]).toEqual({ personId: 'alex', netOperatingLoss: '100.25', sourceReference: 'Independently retained original worksheet' });
  h.invalid(); expect(h.read().vintages?.[0]?.originalLoss).toBe('50000');
  await h.click('Remove Regular loss 1 original owner 2'); expect(h.read().vintages?.[0]?.filingUnitOrigin?.separateComputations).toEqual(before);
});

it.each(['claimed deduction', 'modified absorption', 'attribute reduction'] as const)('retains unknown versus established zero in actual filed use %s', async label => {
  const h = await mount(guidedNewMarriageNolFixture()), key = label === 'claimed deduction' ? 'claimedDeduction' : label === 'modified absorption' ? 'modifiedAbsorption' : 'attributeReduction';
  const prefix = 'Regular loss 1 history 1 filed use 1', before = structuredClone(h.read().alternativeTax);
  await h.change(`${prefix} return ${label}`, ''); expect(h.read().vintages?.[0]?.history?.[0]?.filingUnitUses?.[0]?.[key]).toBe(''); h.invalid();
  await h.change(`${prefix} return ${label}`, '0'); expect(h.read().vintages?.[0]?.history?.[0]?.filingUnitUses?.[0]?.[key]).toBe('0');
  await h.change(`${prefix} owner 1 ${label}`, ''); expect(h.read().vintages?.[0]?.history?.[0]?.filingUnitUses?.[0]?.owners?.[0]?.[key]).toBe('');
  await h.change(`${prefix} owner 1 ${label}`, '0'); expect(h.read().vintages?.[0]?.history?.[0]?.filingUnitUses?.[0]?.owners?.[0]?.[key]).toBe('0');
  expect(withoutConfirmations(h.read().alternativeTax)).toEqual(withoutConfirmations(before));
});

it('keeps filed owner use rows independent and preserves unknown history', async () => {
  const h = await mount(guidedNewMarriageNolFixture()), prefix = 'Regular loss 1 history 1 filed use 1', before = structuredClone(h.read().vintages?.[0]?.history);
  await h.click(`Add owner amounts for ${prefix}`); await h.change(`${prefix} owner 2 person`, 'alex');
  for (const label of ['claimed deduction', 'modified absorption', 'attribute reduction']) await h.change(`${prefix} owner 2 ${label}`, '0');
  expect(h.read().vintages?.[0]?.history?.[0]?.filingUnitUses?.[0]?.owners?.[1]).toEqual({ personId: 'alex', claimedDeduction: '0', modifiedAbsorption: '0', attributeReduction: '0' });
  await h.click(`Remove ${prefix} owner 2`); expect(withoutConfirmations(h.read().vintages?.[0]?.history)).toEqual(withoutConfirmations(before));
  await h.click('Add actual filed use for Regular loss 1 history 1'); expect(h.read().vintages?.[0]?.history?.[0]?.filingUnitUses).toHaveLength(2);
  await h.click('Remove Regular loss 1 history 1 filed use 2');
  await h.click('Mark filed-owner history unknown for Regular loss 1 history 1'); expect(h.read().vintages?.[0]?.history?.[0]?.filingUnitUses).toBeUndefined();
  expect(h.read().vintages?.[0]?.history?.[1]?.filingUnitUses).toBeDefined(); h.invalid();
});

it.each(['new-marriage', 'same-couple'] as const)('keeps actual marital years and same-couple truth independent %s', async kind => {
  const h = await mount(kind === 'new-marriage' ? guidedNewMarriageNolFixture() : guidedJointNolFixture()), label = kind === 'new-marriage' ? 'Regular NOL new-marriage' : 'Regular NOL';
  const before = structuredClone(h.read().alternativeTax), readHistory = () => kind === 'new-marriage' ? h.read().newMarriageHistory : h.read().sameCoupleJointHistory;
  expect(readHistory()?.years?.[0]?.marriedToEachOther).toBe(kind === 'same-couple');
  await h.change(`${label} marital year 1 married to each other`, ''); expect(readHistory()?.years?.[0]?.marriedToEachOther).toBeNull(); h.invalid();
  await h.change(`${label} marital year 1 married to each other`, 'false'); expect(readHistory()?.years?.[0]?.marriedToEachOther).toBe(false);
  await h.change(`${label} marital year 1 second spouse`, ''); expect(readHistory()?.years?.[0]?.secondPersonId).toBeUndefined();
  await h.click(`Add marital year for ${label}`); expect(readHistory()?.years?.at(-1)).toEqual({});
  const count = need(readHistory()?.years).length; await h.click(`Remove ${label} marital year ${count}`);
  await h.click(`Mark marital years unknown for ${label}`); expect(readHistory()?.years).toBeUndefined();
  await h.click(`Add marital year for ${label}`); expect(readHistory()?.years).toEqual([{}]);
  expect(withoutConfirmations(h.read().alternativeTax)).toEqual(withoutConfirmations(before));
});

it.each([['2', '1'], ['0', 'invalid'], ['not a number', 'invalid'], ['', undefined]] as const)('retains actual owner document number and unknown assignment %s', async (raw, expected) => {
  const h = await mount(guidedNewMarriageNolFixture()); await h.click('Add actual source owner assignment');
  await h.change('Current owner document 1 source', 'form1099Int'); await h.change('Current owner document 1 document number when a list', raw);
  expect(h.read().currentOwnerSources?.sourceOwners?.[0]?.index).toBe(expected);
  await h.change('Current owner document 1 actual owner', 'spouse'); expect(h.read().currentOwnerSources?.sourceOwners?.[0]?.owner).toBe('spouse');
  await h.change('Current owner document 1 actual owner', ''); expect(h.read().currentOwnerSources?.sourceOwners?.[0]?.owner).toBeUndefined();
  await h.change('Current owner document 1 source reference', 'Actual independently assigned bank source'); h.invalid();
  await h.remount(); expect(h.read().currentOwnerSources?.sourceOwners?.[0]?.index).toBe(expected);
  await h.click('Remove Current owner document 1'); expect(h.read().currentOwnerSources?.sourceOwners).toEqual([]);
});

it.each([['scheduleA', 'medicalExpenses', 'adjustments'], ['adjustments', 'earlyWithdrawalPenalty', 'priorYear'], ['priorYear', 'shortTermCapitalLoss', 'scheduleA']] as const)('retains exact raw expense splits and clears incompatible fields %s', async (kind, field, nextKind) => {
  const h = await mount(guidedNewMarriageNolFixture()); await h.click('Add actual owner expense split');
  await h.change('Current owner expense 1 source group', kind); await h.change('Current owner expense 1 actual source amount', field);
  await h.change('Current owner expense 1 primary raw amount', '100.25'); await h.change('Current owner expense 1 spouse raw amount', '0'); await h.change('Current owner expense 1 source reference', 'Actual receipt 100.25 and actual other-owner zero');
  expect(h.read().currentOwnerSources?.expenseAllocations?.[0]).toEqual({ kind, field, primaryAmount: '100.25', spouseAmount: '0', sourceReference: 'Actual receipt 100.25 and actual other-owner zero' });
  h.invalid(); await h.change('Current owner expense 1 source group', nextKind); expect(h.read().currentOwnerSources?.expenseAllocations?.[0]?.field).toBeUndefined();
  expect(h.read().currentOwnerSources?.expenseAllocations?.[0]?.primaryAmount).toBe('100.25'); expect(h.read().currentOwnerSources?.expenseAllocations?.[0]?.spouseAmount).toBe('0');
  await h.click('Remove Current owner expense 1'); expect(h.read().currentOwnerSources?.expenseAllocations).toEqual([]);
});

it('preserves explicit empty expenses versus removed unknown proof across remount', async () => {
  const h = await mount(guidedNewMarriageNolFixture()); await h.click('Add actual owner expense split'); await h.click('Record no joint raw expenses to allocate');
  expect(h.read().currentOwnerSources?.expenseAllocations).toEqual([]); await h.remount(); expect(h.read().currentOwnerSources?.expenseAllocations).toEqual([]);
  await h.click('Remove current owner sources'); expect(h.read().currentOwnerSources).toBeUndefined(); h.invalid();
  await h.click('Add actual current owner income and expense sources'); expect(h.read().currentOwnerSources?.expenseAllocations).toBeUndefined(); expect(h.read().currentOwnerSources?.sourceOwners).toBeUndefined();
  await h.change('Community property applies to these current sources', 'false'); expect(h.read().currentOwnerSources?.communityPropertyApplies).toBe(false);
  await h.remount(); expect(h.field('Community property applies to these current sources').value).toBe('false'); expect(h.read().currentOwnerSources?.expenseAllocations).toBeUndefined();
});

it('reconfirms only actual selected source confirmations after edits', async () => {
  const h = await mount(guidedNewMarriageNolFixture()); await h.change('Current owner records source reference', 'Actual retained source replacement'); h.invalid();
  await h.change('Current owner sources checked after the last edit', 'true'); expect(h.read().currentOwnerSources?.sourceFactsConfirmed).toBe(true); expect(h.read().sourceFactsConfirmed).toBeNull(); expect(h.read().alternativeTax?.sourceFactsConfirmed).toBeNull();
  await h.change('Regular NOL sources checked after the last edit', 'true'); expect(h.read().sourceFactsConfirmed).toBe(true); expect(h.read().alternativeTax?.sourceFactsConfirmed).toBeNull();
  const labels = [...h.element.querySelectorAll('.guided-field-label')].map(node => node.textContent ?? '');
  expect(labels.filter(label => /current.*(?:allowance|taxable income|closing carry)/i.test(label))).toEqual([]);
});

it('edits actual filing-unit people and years without refreshing original sources', async () => {
  const h = await mount(guidedNewMarriageNolFixture()), before = structuredClone(h.read().alternativeTax), timeline = structuredClone(h.read().filingUnitHistory);
  await h.change('Person 1 source ID', 'independently-typed-owner', 0); expect(h.read().filingUnitHistory?.persons?.[0]?.sourceId).toBe('independently-typed-owner');
  expect(h.read().vintages?.[0]?.filingUnitOrigin?.ownerPersonId).toBe('jane');
  await h.change('Return 1 tax year', '', 0); expect(h.read().filingUnitHistory?.returns?.[0]?.taxYear).toBe(''); h.invalid();
  await h.click('Add actual person', 0); expect(h.read().filingUnitHistory?.persons?.at(-1)).toEqual({});
  await h.click(`Remove actual person ${need(timeline?.persons).length + 1}`, 0); expect(h.read().filingUnitHistory?.persons).toHaveLength(need(timeline?.persons).length);
  await h.click('Add actual filed return', 0); expect(h.read().filingUnitHistory?.returns?.at(-1)).toEqual({});
  await h.click(`Remove actual return ${need(timeline?.returns).length + 1}`, 0); expect(h.read().filingUnitHistory?.returns).toHaveLength(need(timeline?.returns).length);
  expect(withoutConfirmations(h.read().alternativeTax)).toEqual(withoutConfirmations(before));
});
