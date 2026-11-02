# PA reciprocal employee credit correction

The [official PA deduction/credit guide](https://www.pa.gov/agencies/revenue/forms-and-publications/pa-personal-income-tax-guide/deductions-and-credits), refreshed November2, distinguishes reciprocal employee withholding that should be refunded by the other state from eligible resident-credit tax. The former scalar Schedule G-L spec incorrectly permitted withholding as a practical credit proxy.

The arithmetic primitive now rejects positive reciprocal employee or unknown-class entries for IN, MD, NJ, OH, VA and WV, including normalized codes. Explicit business/rental arithmetic remains possible but does not qualify originals, dual-resident or shareholder exceptions. Actual final tax paid and same-income eligibility require the separate source-bound method.

Spec/control changes preceded the real red: original32 controls produced30 passes/two failures; normalization added a separate observed failure. The unchanged numerical generic-credit, PDF privacy and readiness oracles now use explicitly fictional nonreciprocal NY sources. The original actual NJ commuter facts remain and require refund/source rejection. Historical source copies and nine caller failures are retained; no unknown employee was relabeled a business.

Author345 tests/fivefiles and independent22 controls pass together (367/sixfiles). Independent source review found no issues and verified all six frozen source hashes plus4,196 unrelated base files. Review receipt `.local/upgrade-evidence/nov02-pa-gl-reciprocal-independent/independent-review-result.json`, SHA25692f403ad018e3de0f42ce03892195ed6d43527e6058fff975bdcd7f8f1cdec4d.

Main383 tests/sevenfiles, root/web/contracts types,6741 spec references, inventory/freshness, scoped lint and library build pass. Main receipts: `.local/upgrade-evidence/nov02-parent-pa-gl-main-checks/checks.json`. The132 old caller lint warnings remain exact against the original baseline; no rule or threshold changed. Pure product and independent controls have zero warnings.

This correction does not qualify the legacy scalar overrides, final2026 forms, a complete PA return, human review or filing. The actual original-return credit successor remains required internal work.
