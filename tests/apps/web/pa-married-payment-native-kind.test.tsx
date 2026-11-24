// @vitest-environment jsdom
/** Spec: state/pa-married-payment-native-browser.yaml#known-receipt-textboxes. */
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { expect, it } from "vitest";
import { PAMarriedOrdinaryDetails } from "@/components/guided-interview/pa-married-ordinary-details";
import { paMarriedPaymentNativeBrowserFixture } from "../../fixtures/pa-married-payment-native-browser";

type Action = [kind: "button" | "input" | "select", label: string, value?: string];
type Account = ReturnType<typeof paMarriedPaymentNativeBrowserFixture>["target"]["accounts"][number];
type Fixture = ReturnType<typeof paMarriedPaymentNativeBrowserFixture>;

function originalActions(prefix: string, row: object): Action[] {
  return Object.entries(row).map(([key, value]) => ["input", `${prefix} ${key}`, String(value)]);
}

function expectedAccountActions(account: Account, prefix: string, fixture: Fixture): Action[] {
  const tag = account.accountHolder === "primary" ? "Primary" : "Spouse";
  const owner = fixture.expected.owners.find(row => row.accountHolder === account.accountHolder)?.payments;
  if (owner === undefined) throw Error("Missing expected fixture owner's payments");
  const { accountName, accountSsn, returnType, filingStatus, accountKind, asOfDate, availablePriorCredit } =
    account.originalAccount;
  const prior = account.priorCredit.originalPriorReturn;
  const priorActions: Action[] = prior ? [
    ["button", `Add ${prefix} original prior return election`],
    ...originalActions(`${prefix} prior original`, prior),
  ] : [];
  return [
    ["button", `Add ${account.accountHolder} actual payment account`],
    ["select", `${prefix} actual owner`, account.accountHolder],
    ["input", `${prefix} original source reference`, account.sourceReference],
    ...originalActions(`${prefix} printed`, { accountName, accountSsn, returnType, filingStatus, accountKind, asOfDate, availablePriorCredit }),
    ["input", `${prefix} printed taxYear`, "2025"],
    ["input", `${prefix} prior credit applied date or no date`, account.originalAccount.priorCreditAppliedOn ?? ""],
    ["select", `${prefix} complete account checked`, "true"],
    ["select", `${prefix} no transfers offsets refunds or adjustments checked`, "true"],
    ...account.originalAccount.receipts.flatMap((row, index): Action[] => [
      ["button", `Add ${prefix} posted original receipt row`],
      ...originalActions(`${prefix} posted row ${index + 1}`, row),
    ]),
    ...account.receipts.flatMap((row, index): Action[] => {
      const receipt = `${prefix} receipt ${index + 1}`;
      return [
        ["button", `Add ${prefix} actual payment receipt`],
        ["input", `${receipt} source reference`, row.sourceReference],
        ["input", `${receipt} intended installment`, row.intendedInstallment === null ? "" : String(row.intendedInstallment)],
        ...originalActions(`${receipt} original`, row.original),
      ];
    }),
    ["select", `${prefix} prior credit status`, account.priorCredit.status],
    ["input", `${prefix} prior credit source reference`, account.priorCredit.sourceReference],
    ...priorActions,
    ["input", `${tag} PA account original source reference`, owner.sourceReference],
    ["select", `${tag} all current PA payments reviewed`, "true"],
    ["select", `${tag} actual estimated payment history`, owner.estimatedPaymentsStatus],
    ["select", `${tag} actual extension payment history`, owner.extensionPaymentsStatus],
    ["select", `${tag} actual prior credit history`, owner.priorCreditStatus],
    ["select", `${tag} actual prior return history`, owner.priorReturnStatus],
    ["input", `${tag} prior return original source reference`, owner.priorReturnSourceReference],
    ["button", `Capture ${prefix} reviewed original receipts`],
  ];
}

it("keeps all 139 payment field entries on their rendered native controls", async () => {
  const fixture = paMarriedPaymentNativeBrowserFixture();
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <PAMarriedOrdinaryDetails originalInput={fixture.input} data={fixture.expected} onChange={() => {}} />,
  );
  const labels = [...root.querySelectorAll("label > span")];
  const actions: Action[] = [];
  const known = async (_page: unknown, label: string, value: string, kind: "input" | "select") => {
    expect(["input", "select"], label).toContain(kind);
    const matches = labels.filter(node => node.textContent === label);
    expect(matches, label).toHaveLength(1);
    const nativeLabel = matches[0]?.parentElement as HTMLLabelElement;
    expect(nativeLabel, label).toBeInstanceOf(HTMLLabelElement);
    const fields = nativeLabel.querySelectorAll("input,select");
    expect(fields, label).toHaveLength(1);
    expect(nativeLabel.control, label).toBe(fields[0]);
    if (kind === "select") {
      const select = nativeLabel.control as HTMLSelectElement;
      expect(select, label).toBeInstanceOf(HTMLSelectElement);
      expect(select.type, label).toBe("select-one");
      expect([...select.options].map(option => option.value), label).toContain(value);
    } else {
      expect(nativeLabel.control, label).toBeInstanceOf(HTMLInputElement);
      expect(nativeLabel.control, label).toHaveProperty("type", "text");
    }
    actions.push([kind, label, value]);
  };
  const panel = {
    getByRole(role: string, options: { name: string; exact: boolean }) {
      expect(role).toBe("button");
      expect(options.exact).toBe(true);
      return { async click() { actions.push(["button", options.name]); } };
    },
  };

  // Run the browser entry statements against the rendered controls. Playwright
  // itself checks the live saved snapshots and edits during the two journeys.
  const source = await readFile("apps/web/tests/pa-married-payment-native.spec.ts", "utf8");
  const start = source.indexOf("await expect(control(page,'Separate PA payment source tax year'))");
  const end = source.indexOf("expect(source(await saved(page,id)).paymentSources).toEqual({...f.target,", start);
  const editStart = source.indexOf("await enter(page,'Payment account 1 receipt 1 source reference',editReference", end);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  expect(editStart).toBeGreaterThan(end);
  const body = ts.transpileModule(
    `async function enterFields(f, panel, required, expect, enter) {
      const page = {}, id = "", control = () => {}, saved = async () => f.expected, source = state => state;
      ${source.slice(start, end)}
      ${source.slice(editStart, source.indexOf("\n", editStart))}
    }`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const editReference = "fictional-browser-payment-private-same-cash-new-receipt-reference";
  const enterFields = Function("editReference", body + "\nreturn enterFields;")(editReference);
  const snapshotAssertions = () => ({ toHaveValue() {}, toMatchObject() {}, toEqual() {}, toBeNull() {} });
  await enterFields(fixture, panel, (value: unknown) => value, snapshotAssertions, known);

  expect(actions.filter(([kind]) => kind === "input")).toHaveLength(118);
  expect(actions.filter(([kind]) => kind === "select")).toHaveLength(21);
  expect(actions).toEqual([
    ["input", "Separate PA payment source tax year", "2025"],
    ["input", "Separate PA payment collection source reference", fixture.target.sourceReference],
    ...fixture.target.accounts.flatMap((account, index) => expectedAccountActions(account, `Payment account ${index + 1}`, fixture)),
    ["input", "Married PA timing original source reference", fixture.expected.timing.sourceReference],
    ["input", "Married PA actual as of date", "2026-04-15"],
    ["select", "Married PA actual filing extension", "actual_extension"],
    ...fixture.expected.dispositions.flatMap((row): Action[] => {
      const tag = row.accountHolder === "primary" ? "Primary" : "Spouse";
      return [
        ["input", `${tag} election original source reference`, row.sourceReference],
        ["input", `${tag} actual requested refund`, row.refundRequested],
        ["input", `${tag} actual requested next year credit`, "0"],
        ["select", `${tag} actual remaining payment source`, "no_remaining_tax"],
        ["input", `${tag} remaining payment original source reference`, row.remainingPayment.sourceReference],
      ];
    }),
    ["input", "Payment account 1 receipt 1 source reference", editReference],
  ] satisfies Action[]);
});
