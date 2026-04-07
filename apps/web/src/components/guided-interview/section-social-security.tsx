"use client";

import { RetroShell } from "@/components/retro-shell";
import {
  type SocialSecurityData,
  emptySocialSecurityData,
} from "@/lib/guided-interview-flow";
import { CurrencyField } from "./currency-field";

export function SectionSocialSecurity({
  data,
  onDataChange,
}: {
  data: SocialSecurityData | undefined;
  onDataChange: (data: SocialSecurityData) => void;
}) {
  const current = data ?? emptySocialSecurityData;

  return (
    <RetroShell title="Social Security Benefits" eyebrow="INCOME">
      <div className="guided-question">
        <p className="guided-prompt">Did you receive Social Security benefits this year?</p>
        <p className="guided-hint">
          You&apos;ll find this on your SSA-1099 form from the Social Security Administration.
          Not all of your benefits may be taxable — it depends on your other income.
          We&apos;ll calculate the taxable portion for you.
        </p>

        <div className="guided-form-grid">
          <CurrencyField
            label="Net benefits (SSA-1099 Box 5)"
            hint="This is your total benefits received minus any repayments"
            value={current.netBenefits}
            onChange={(v) => onDataChange({ ...current, netBenefits: v })}
          />
          <CurrencyField
            label="Federal tax withheld (SSA-1099 Box 6)"
            hint="Optional — only if you elected to have taxes withheld"
            value={current.federalWithheld}
            onChange={(v) => onDataChange({ ...current, federalWithheld: v })}
          />
        </div>

        <details className="guided-expand" style={{ marginTop: "16px" }}>
          <summary className="guided-expand-trigger">How Social Security is taxed</summary>
          <div className="guided-expand-body">
            <p>
              Up to 85% of your Social Security benefits may be taxable, depending on your
              &quot;combined income&quot; (AGI + nontaxable interest + half your SS benefits).
              If your combined income is below $25,000 (single) or $32,000 (married filing jointly),
              none of your benefits are taxable. The engine handles this calculation automatically.
            </p>
          </div>
        </details>
      </div>
    </RetroShell>
  );
}
