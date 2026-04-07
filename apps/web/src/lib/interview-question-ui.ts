import type { SeededFactId } from "@tax-engine/contracts";

export interface InterviewQuestionQuickAnswer {
  label: string;
  value: string;
}

export interface InterviewQuestionUiHint {
  helperText: string;
  placeholder: string;
  quickAnswers: InterviewQuestionQuickAnswer[];
}

const defaultQuestionUiHint: InterviewQuestionUiHint = {
  helperText: "Answer in plain English. Describe what you confirmed, or say clearly that nothing else applies. Do not enter 0 unless the question is asking for an actual dollar amount.",
  placeholder: "Type a short plain-English answer explaining what you confirmed.",
  quickAnswers: [
    {
      label: "No follow-up needed",
      value: "No additional follow-up is needed. The document values look complete and final.",
    },
    {
      label: "Needs follow-up",
      value: "This needs follow-up before filing because additional details or corrections may still be required.",
    },
  ],
};

const questionUiByFactId: Partial<Record<SeededFactId, InterviewQuestionUiHint>> = {
  wages: {
    helperText: "Answer in plain English. Confirm whether the W-2 is final, or explain if a corrected W-2 or missing box still needs follow-up.",
    placeholder: "Example: Every W-2 is final and no corrected copy is expected.",
    quickAnswers: [
      {
        label: "W-2 is final",
        value: "Every W-2 is final and no corrected copy is expected.",
      },
      {
        label: "Needs W-2 follow-up",
        value: "A W-2 may still need follow-up because a corrected copy or missing box detail is expected.",
      },
    ],
  },
  withholding: {
    helperText: "Answer in plain English. Confirm whether the withholding amounts match the wage statements, or explain what needs correction.",
    placeholder: "Example: Federal and state withholding amounts match the W-2s.",
    quickAnswers: [
      {
        label: "Withholding matches",
        value: "Federal and state withholding amounts match the wage statements.",
      },
      {
        label: "Withholding needs review",
        value: "Withholding needs follow-up because one or more amounts may be missing or incorrect.",
      },
    ],
  },
  "taxable-interest": {
    helperText: "Answer in plain English. Say whether anything else applies beyond the uploaded 1099-INT, such as tax-exempt interest or an early withdrawal penalty.",
    placeholder: "Example: No tax-exempt interest or early withdrawal penalty applies.",
    quickAnswers: [
      {
        label: "Nothing else applies",
        value: "No tax-exempt interest or early withdrawal penalty applies.",
      },
      {
        label: "Additional details apply",
        value: "Additional follow-up is needed because tax-exempt interest, an early withdrawal penalty, or another missing amount may apply.",
      },
    ],
  },
  "ordinary-dividends": {
    helperText: "Answer in plain English. Confirm whether all dividend statements for the year are included, or say if any are still missing.",
    placeholder: "Example: All dividend statements for the year are included.",
    quickAnswers: [
      {
        label: "All dividend forms included",
        value: "All dividend statements for the year are included.",
      },
      {
        label: "Missing dividend form",
        value: "At least one dividend statement may still be missing and needs follow-up.",
      },
    ],
  },
  "qualified-dividends": {
    helperText: "Answer in plain English. Confirm the qualified dividend treatment and whether any foreign tax was paid.",
    placeholder: "Example: Qualified dividend amounts look correct and no foreign tax was paid.",
    quickAnswers: [
      {
        label: "Qualified dividends confirmed",
        value: "Qualified dividend amounts look correct and no foreign tax was paid.",
      },
      {
        label: "Needs dividend follow-up",
        value: "Qualified dividend treatment or foreign tax needs follow-up before filing.",
      },
    ],
  },
  "capital-gain-distributions": {
    helperText: "Answer in plain English. Confirm whether the 1099-DIV capital gain distributions are final, or explain if reinvested dividends or basis adjustments still need review. Do not enter 0 here.",
    placeholder: "Example: No basis review is needed. The capital gain distributions are final and there were no reinvested dividends.",
    quickAnswers: [
      {
        label: "No basis review needed",
        value: "No basis review is needed. The capital gain distributions are final and there were no reinvested dividends.",
      },
      {
        label: "Basis review needed",
        value: "Basis review is still needed because reinvested dividends or other basis adjustments may apply.",
      },
    ],
  },
  "government-payments-review": {
    helperText: "Answer in plain English. Confirm the unemployment or state refund details, or explain what still needs follow-up.",
    placeholder: "Example: The unemployment amount and withholding are correct, and there was no taxable state refund issue.",
    quickAnswers: [
      {
        label: "Looks complete",
        value: "The unemployment or state refund details look complete and no additional follow-up is needed.",
      },
      {
        label: "Needs review",
        value: "This still needs follow-up because one or more unemployment, withholding, or state refund details are incomplete.",
      },
    ],
  },
  "retirement-distribution-review": {
    helperText: "Answer in plain English. Confirm whether the retirement distribution details are complete, or explain what still needs follow-up.",
    placeholder: "Example: The retirement distribution amounts are correct and no early-distribution exception applies.",
    quickAnswers: [
      {
        label: "Distribution confirmed",
        value: "The retirement distribution details are complete and no additional follow-up is needed.",
      },
      {
        label: "Needs retirement review",
        value: "This retirement distribution still needs follow-up because one or more taxability, exception, or withholding details are incomplete.",
      },
    ],
  },
  "social-security-benefits-review": {
    helperText: "Answer in plain English. Confirm whether the SSA-1099 details are complete, or explain what still needs follow-up.",
    placeholder: "Example: The SSA-1099 benefits and withholding are complete and no manual adjustment is needed.",
    quickAnswers: [
      {
        label: "SSA-1099 confirmed",
        value: "The SSA-1099 benefits and withholding are complete and no manual adjustment is needed.",
      },
      {
        label: "Needs SSA review",
        value: "This still needs follow-up because the SSA-1099 details or related adjustments may be incomplete.",
      },
    ],
  },
  "hsa-distribution-review": {
    helperText: "Answer in plain English. Confirm whether the HSA distribution was fully qualified, or explain what exception or missing detail still needs review.",
    placeholder: "Example: The HSA distribution was used for qualified medical expenses and no exception review is needed.",
    quickAnswers: [
      {
        label: "Qualified HSA use",
        value: "The HSA distribution was used for qualified medical expenses and no exception review is needed.",
      },
      {
        label: "Needs HSA follow-up",
        value: "This HSA distribution still needs follow-up because rollover, exception, or medical-expense details are incomplete.",
      },
    ],
  },
  "student-loan-interest-review": {
    helperText: "Answer in plain English. Confirm whether the 1098-E amount is complete, or explain if capitalized interest or another manual amount still needs to be added.",
    placeholder: "Example: The 1098-E amount is complete and no additional interest needs to be entered.",
    quickAnswers: [
      {
        label: "1098-E complete",
        value: "The 1098-E amount is complete and no additional interest needs to be entered.",
      },
      {
        label: "Needs interest follow-up",
        value: "Student loan interest still needs follow-up because capitalized interest or another manual amount may need to be added.",
      },
    ],
  },
  "premium-tax-credit-review": {
    helperText: "Answer in plain English. Confirm whether the 1095-A amounts are final, or explain if allocation or corrected-form follow-up is still needed.",
    placeholder: "Example: The 1095-A amounts are final and no allocation or corrected-form review is needed.",
    quickAnswers: [
      {
        label: "1095-A confirmed",
        value: "The 1095-A amounts are final and no allocation or corrected-form review is needed.",
      },
      {
        label: "Needs 1095-A follow-up",
        value: "This still needs follow-up because allocation details or a corrected Form 1095-A may be required.",
      },
    ],
  },
  "nonemployee-compensation": {
    helperText: "Answer in plain English. Confirm whether the 1099-NEC belongs on Schedule C, or explain if any amount should be excluded or reclassified.",
    placeholder: "Example: Every 1099-NEC amount belongs on Schedule C and no reclassification is needed.",
    quickAnswers: [
      {
        label: "Belongs on Schedule C",
        value: "Every 1099-NEC amount belongs on Schedule C and no reclassification is needed.",
      },
      {
        label: "Needs Schedule C review",
        value: "This still needs follow-up because one or more 1099-NEC amounts may need to be excluded or reclassified.",
      },
    ],
  },
  "schedule-c-expense-review": {
    helperText: "Answer in plain English. Confirm whether the business expense records are complete enough to use, or explain what is still missing.",
    placeholder: "Example: The business expense, mileage, and home office records are complete enough to use.",
    quickAnswers: [
      {
        label: "Expense records are complete",
        value: "The business expense, mileage, and home office records are complete enough to use.",
      },
      {
        label: "Expense records need follow-up",
        value: "Business expense follow-up is still needed because records are incomplete or require cleanup before filing.",
      },
    ],
  },
  "broker-proceeds": {
    helperText: "Answer in plain English. Confirm whether all broker sales are included, or explain if any sale or statement is still missing.",
    placeholder: "Example: Every broker sale belongs on Form 8949 and no statements are missing.",
    quickAnswers: [
      {
        label: "All sales included",
        value: "Every broker sale belongs on Form 8949 and no statements are missing.",
      },
      {
        label: "Missing broker detail",
        value: "Broker sale follow-up is still needed because one or more statements or transactions may be missing.",
      },
    ],
  },
  "cost-basis-review": {
    helperText: "Answer in plain English. Confirm whether basis, wash sale adjustments, and holding periods are complete, or explain what still needs review.",
    placeholder: "Example: Basis reporting and holding periods are complete and no wash sale adjustments are needed.",
    quickAnswers: [
      {
        label: "Basis details complete",
        value: "Basis reporting and holding periods are complete and no wash sale adjustments are needed.",
      },
      {
        label: "Basis follow-up needed",
        value: "Cost basis follow-up is still needed because wash sales, basis adjustments, or holding periods may be incomplete.",
      },
    ],
  },
};

export function getInterviewQuestionUiHint(factId: SeededFactId): InterviewQuestionUiHint {
  return questionUiByFactId[factId] ?? defaultQuestionUiHint;
}
