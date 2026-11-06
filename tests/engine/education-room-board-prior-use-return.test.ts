// Spec: spec/federal/form-1099-q-room-board-prior-use.yaml canonical-recipient.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { roomBoardPriorUseFixture } from '../fixtures/education-room-board-prior-use.js';
it('carries only current earnings after actual prior period usage', () => {
  for (const medium of ['cash', 'in_kind_prepaid_tuition'] as const) {
    const { input, facts, form } = roomBoardPriorUseFixture();
    form.distributionMedium = medium; if (medium === 'cash') facts.inKindBenefits = [];
    const before = JSON.stringify(input), actual = TaxYearInputSchema.parse(input), result = calculateFederalTax(actual);
    expect(actual.qualifiedEducationExpenses?.sourceFacts?.roomBoardPriorUses).toEqual(facts.roomBoardPriorUses);
    expect([result.agi, result.form1099Q?.taxableEarnings, result.form1099Q?.netPenalty].map(v => v?.toFixed())).toEqual(['51800', '1800', '180']);
    expect(result.allLines.filter(l => l.form === 'Sched 1' && l.line === '8z').map(l => l.value.toFixed())).toEqual(['1800']);
    expect(JSON.stringify(input)).toBe(before);
  }
});
