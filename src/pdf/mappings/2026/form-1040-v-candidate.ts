/** Physical field candidate only. Spec: spec/federal/form-1040-v-2026-template.yaml. */
const voucher = "topmostSubform[0].Page1[0].";

export const FORM_1040_V_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-prior/f1040v--2026.pdf",
  sourceRevision: "Created 8/19/26",
  sha256: "7533914c5674c1486e4c60dba1e852d65669aece7b840c3644761bac64e64335",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  paymentsEnabled: false,
  fields: Object.freeze({
    primaryTaxpayerId: `${voucher}f1_1[0]`,
    spouseTaxpayerId: `${voucher}f1_2[0]`,
    checkOrMoneyOrderAmount: `${voucher}f1_3[0]`,
    primaryFirstNameAndMiddleInitial: `${voucher}f1_5[0]`,
    primaryLastName: `${voucher}f1_6[0]`,
    spouseFirstNameAndMiddleInitial: `${voucher}f1_7[0]`,
    spouseLastName: `${voucher}f1_8[0]`,
    streetAddress: `${voucher}f1_9[0]`,
    apartment: `${voucher}f1_10[0]`,
    city: `${voucher}f1_11[0]`,
    state: `${voucher}f1_12[0]`,
    zipCode: `${voucher}f1_13[0]`,
    foreignCountry: `${voucher}f1_14[0]`,
    foreignProvince: `${voucher}f1_15[0]`,
    foreignPostalCode: `${voucher}f1_16[0]`,
  }),
});
