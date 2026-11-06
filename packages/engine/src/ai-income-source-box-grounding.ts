import Decimal from "decimal.js";
const Money = Decimal.clone({ precision: 80 });
// IRS Publication915 Appendix, SSA-1099 boxes3-6. These are source-field
// identities, never expected amounts, model choices or confirmed taxpayer facts.
const ssaBoxes: Readonly<Record<string, string>> = Object.freeze({
  grossBenefits: "3", repaidBenefits: "4", netBenefits: "5", withholding: "6",
});
const printedNumber = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const printedAmount = new RegExp(String.raw`^(?:\s+|[.:=]\s+)(\(\s*\$?\s*${printedNumber}\s*\)|[-+]?\s*\$?\s*${printedNumber})\s*[.;]?\s*$`);
/** Finite explicit numbered-box text only; unsupported SSA layouts fail closed. */
export function validateIncomeSourceBox(sourceText: string, field: string, kind: "money" | "date" | "text", value: string, sourceQuote: string): void {
  if (!/\bSSA-1099\b/i.test(sourceText)) return;
  function fail(): never { throw new Error("Known SSA-1099 fact lacks an unambiguous matching source box."); }
  const wanted = ssaBoxes[field];
  if (kind !== "money") {
    if (wanted) fail();
    return;
  }
  const markers = [...sourceText.matchAll(/\bbox\s+(\d+)\b/gi)];
  if (new Set(markers.map(marker => marker[1])).size !== markers.length) fail();
  const boxes = markers.map((marker, index) => {
    const start = marker.index + marker[0].length;
    const segment = sourceText.slice(start, markers[index + 1]?.index);
    const amount = printedAmount.exec(segment)?.[1];
    const amountStart = amount === undefined ? null : start + segment.indexOf(amount);
    return { segment, amount, amountStart };
  });
  // A literal boxed amount such as1099.50 is not a document identity. Only
  // wholly validated single-amount spans mask marker matches; unrelated or
  // extra form text still participates in the single-form admission check.
  const forms = [...sourceText.matchAll(/\b(?:(?:SSA|RRB)-(?:1099(?:-R)?|1042S)|W-?2(?:C|G)?|109[89](?:-[A-Z0-9]+)?|1042-S|5498(?:-[A-Z0-9]+)?|392[12]|Form\s+[0-9]{3,5}(?:-[A-Z0-9]+)?)\b/gi)]
    .filter(match => !boxes.some(box => box.amount !== undefined && box.amountStart !== null && match.index >= box.amountStart && match.index + match[0].length <= box.amountStart + box.amount.length));
  if (forms.length !== 1 || forms[0][0].toUpperCase() !== "SSA-1099") fail();
  if (!wanted) fail();
  const index = markers.findIndex(marker => marker[1] === wanted);
  if (index < 0) fail();
  const marker = markers[index];
  const { segment, amount } = boxes[index];
  if (!amount) fail();
  const anchor = sourceText.slice(marker.index, marker.index + marker[0].length + segment.indexOf(amount) + amount.length);
  if (!sourceQuote.includes(anchor)) fail();
  const plain = amount.replace(/[$,()\s]/g, "");
  const sourceValue = amount.startsWith("(") ? `-${plain}` : plain;
  if (!new Money(sourceValue).eq(value)) fail();
}
