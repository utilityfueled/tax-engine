// @vitest-environment jsdom
/** Spec: state/pa-married-payment-native-browser.yaml#known-receipt-textboxes. */
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { expect, it } from "vitest";
import { PAMarriedPaymentDetails } from "@/components/guided-interview/pa-married-payment-details";
import { paMarriedPaymentNativeBrowserFixture } from "../../fixtures/pa-married-payment-native-browser";

type Action = [kind: "button" | "input" | "detected", label: string, value?: string];
type Account = ReturnType<typeof paMarriedPaymentNativeBrowserFixture>["target"]["accounts"][number];

function originalActions(prefix: string, row: object): Action[] {
  return Object.entries(row).map(([key, value]) => ["input", `${prefix} ${key}`, String(value)]);
}

function expectedActions(account: Account, prefix: string): Action[] {
  const prior = account.priorCredit.originalPriorReturn;
  const priorActions: Action[] = prior ? [
    ["button", `Add ${prefix} original prior return election`],
    ...originalActions(`${prefix} prior original`, prior),
  ] : [];
  return [
    ...account.originalAccount.receipts.flatMap((row, index): Action[] => [
      ["button", `Add ${prefix} posted original receipt row`],
      ...originalActions(`${prefix} posted row ${index + 1}`, row),
    ]),
    ...account.receipts.flatMap((row, index): Action[] => {
      const receipt = `${prefix} receipt ${index + 1}`;
      return [
        ["button", `Add ${prefix} actual payment receipt`],
        ["detected", `${receipt} source reference`, row.sourceReference],
        ["detected", `${receipt} intended installment`, row.intendedInstallment === null ? "" : String(row.intendedInstallment)],
        ...originalActions(`${receipt} original`, row.original),
      ];
    }),
    ["detected", `${prefix} prior credit status`, account.priorCredit.status],
    ["detected", `${prefix} prior credit source reference`, account.priorCredit.sourceReference],
    ...priorActions,
  ];
}

it("keeps all 71 receipt and prior original actions on their rendered native text inputs", async () => {
  const fixture = paMarriedPaymentNativeBrowserFixture();
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <PAMarriedPaymentDetails originalInput={fixture.input} data={fixture.expected} onChange={() => {}} />,
  );
  const labels = [...root.querySelectorAll("label > span")];
  const actions: Action[] = [];
  const known = async (_page: unknown, label: string, value: string, kind: string) => {
    expect(kind, label).toBe("input");
    const matches = labels.filter(node => node.textContent === label);
    expect(matches, label).toHaveLength(1);
    const fields = matches[0]?.parentElement?.querySelectorAll("input,select");
    expect(fields, label).toHaveLength(1);
    expect(fields?.[0], label).toBeInstanceOf(HTMLInputElement);
    expect(fields?.[0], label).toHaveProperty("type", "text");
    actions.push(["input", label, value]);
  };
  const detected = async (_page: unknown, label: string, value: string) => {
    actions.push(["detected", label, value]);
  };
  const panel = {
    getByRole(role: string, options: { name: string; exact: boolean }) {
      expect(role).toBe("button");
      expect(options.exact).toBe(true);
      return { async click() { actions.push(["button", options.name]); } };
    },
  };

  // Run the actual browser loops with recording actions and the real React controls.
  const source = await readFile("apps/web/tests/pa-married-payment-native.spec.ts", "utf8");
  const start = source.indexOf("for(const[n,row]of account.originalAccount.receipts.entries())");
  const end = source.indexOf("const expected=required", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const body = ts.transpileModule(
    `async function enterRows(page, panel, account, prefix) { ${source.slice(start, end)} }`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const enterRows: (page: unknown, renderedPanel: typeof panel, account: Account, prefix: string) => Promise<void> =
    Function("enter", "enterKnownNativeControl", body + "\nreturn enterRows;")(detected, known);
  for (const [index, account] of fixture.target.accounts.entries()) {
    await enterRows({}, panel, account, `Payment account ${index + 1}`);
  }

  const knownActions = actions.filter(([kind]) => kind === "input");
  expect(knownActions).toHaveLength(71);
  expect(new Set(knownActions.map(([, label]) => label)).size).toBe(71);
  expect(actions).toEqual(fixture.target.accounts.flatMap((account, index) => expectedActions(account, `Payment account ${index + 1}`)));
});
