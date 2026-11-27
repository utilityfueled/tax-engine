import {prepareOhioBusinessOfficialReview,stageOhioBusinessOfficialReview,writeOhioBusinessOfficialReview} from './fill-oh-business-official-review.js';
import { prepareOhioResidentCreditOfficialReview, fillOhioResidentCreditOfficialReview } from './fill-oh-resident-credit-official-review.js';
import { fillOhioSchoolDistrictOfficialReview } from './fill-oh-school-district-official-review.js';
import {resolveOhioResidencyReview,type PreparedOhioResidencyReview} from "../../../engine/state/oh-residency-source.js";
import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFTextField,
  PDFCheckBox,
  PDFButton,
  PDFDropdown,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine, TaxReturnResult } from "@/models/outputs.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";
import { calculateW2StateLocalSources } from "@/engine/forms/w2-state-local.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { resolveReviewTemplateDirectory } from "@/pdf/template-registry.js";
import { calculateDigitalAssetStateSources } from "../../../engine/state/digital-asset-sources.js";
import {
  buildOhioResidentReturnInput,
  extractQualifyingBusinessIncome,
  type OhioOverlayInput,
} from "@/engine/state/oh-input-adapter.js";
import {
  calculateOhioResidentReturn,
  type OhioResidentReturnInput,
  type OhioResidentReturnResult,
} from "@/engine/state/oh-return.js";
import {
  calculateOhioLumpSumDistributionCredit,
} from "@/engine/state/oh-lump-sum-distribution-credit.js";
import {
  calculateOhioScheduleOfWithholding,
} from "@/engine/state/oh-schedule-of-withholding.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export interface OhioReferencePacketResult {
  filledForms: string[];
  /** Generated summaries keyed by their packet path for this invocation. */
  referenceDocuments?: ReadonlyMap<string, PDFDocument>;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = words[0] ?? "";

  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  lines.push(current);
  return lines;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  {
    font,
    size,
    x,
    y,
    maxWidth,
    lineHeight = size * 1.25,
    color = HEADER_COLOR,
  }: {
    font: PDFFont;
    size: number;
    x: number;
    y: number;
    maxWidth: number;
    lineHeight?: number;
    color?: ReturnType<typeof rgb>;
  },
) {
  const lines = wrapText(text, font, size, maxWidth);
  let cursorY = y;

  for (const line of lines) {
    page.drawText(line, { x, y: cursorY, font, size, color });
    cursorY -= lineHeight;
  }

  return cursorY;
}

function formatValue(line: CalculatedLine) {
  return line.value.toString();
}

async function renderReferencePdf(
  {
    title,
    subtitle,
    lines,
  }: {
    title: string;
    subtitle: string;
    lines: CalculatedLine[];
  },
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - PAGE_MARGIN;
  };

  y = drawWrappedText(page, title, {
    font: bold,
    size: 20,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 24,
  });

  y = drawWrappedText(page, "REFERENCE SUMMARY ONLY", {
    font: bold,
    size: 12,
    x: PAGE_MARGIN,
    y: y - 6,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 16,
    color: WARNING_COLOR,
  });

  y = drawWrappedText(page, subtitle, {
    font: regular,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y: y - 8,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  y = drawWrappedText(
    page,
    "This page is a deterministic summary of computed Ohio lines for review. It is not an official filled Ohio filing form.",
    {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 10,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    },
  );

  y -= 16;

  for (const line of lines) {
    if (y < 90) {
      newPage();
    }

    y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Value: ${formatValue(line)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Formula: ${line.formula}`, {
      font: regular,
      size: BODY_FONT_SIZE - 0.5,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
  }

  return doc;
}

function shouldIncludeAdjustments(
  lines: ReturnType<typeof calculateOhioResidentReturn>["scheduleOfAdjustments"],
) {
  return lines.line14_totalAdditions.gt(0) || lines.line47_totalDeductions.gt(0);
}

function shouldIncludeScheduleOfCredits(
  result: ReturnType<typeof calculateOhioResidentReturn>["scheduleOfCredits"],
) {
  return result.line40_totalNonrefundableCredits.gt(0) || result.line47_totalRefundableCredits.gt(0);
}

function getLumpSumDistributionWorksheet(
  ohioInput: ReturnType<typeof buildOhioResidentReturnInput>,
) {
  if (
    ohioInput.lumpSumDistributionCredit !== undefined
    || !ohioInput.lumpSumDistributionRecipientAges
    || ohioInput.lumpSumDistributionRecipientAges.length === 0
  ) {
    return null;
  }

  return calculateOhioLumpSumDistributionCredit({
    taxYear: ohioInput.taxYear,
    recipientAges: ohioInput.lumpSumDistributionRecipientAges,
  });
}

/** Specs: state/oh-ordinary-official-review.yaml and state/oh-reciprocal-official-review.yaml. */
const bundleHash = '4e6432e23df3bf181a8e9d7ee5d5bb7e2e96a6a21dd65fa39c625fb8a7e2f57c';
const nrcHash = '7e2f83559370510e129a6d720e090ae08aeefffcc75083c0b91561df85639c52';
const itFields: Record<string, string> = {
  '1':'L1','2a':'L2A','2b':'L2B','3':'L3','4':'L4','5':'L5','6':'L6','7':'L7',
  '8a':'L8A','8b':'L8B','8c':'L8C','9':'L9','10':'L10','11':'L11','12':'L12','13':'L13',
  '14':'L14','15':'L15','16':'L16','17':'L17','19':'L19','20':'L20',
  '21':'L21','22':'L22','23':'L23','24':'L24','26':'L26',
};
async function loadExact(sourceDirectory: string, filename: string, hash: string, expectedPages: number) {
  const bytes = await readFile(join(sourceDirectory,filename));
  if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('Ohio official review source revision changed.');
  const doc = await PDFDocument.load(bytes);
  if (doc.getPageCount() !== expectedPages) throw new Error('Ohio official review page inventory changed.');
  const form = doc.getForm();
  for (const field of form.getFields()) {
    if(field instanceof PDFButton||field instanceof PDFDropdown){
      // These are authoring buttons and out-of-cohort payment/business selectors,
      // never source facts for the selected ordinary SectionI review pages.
      for(const widget of field.acroField.getWidgets()){
        const ref=doc.context.getObjectRef(widget.dict);if(!ref)throw new Error('Ohio control widget reference missing.');
        for(const page of doc.getPages())page.node.removeAnnot(ref);
      }
      form.acroForm.removeField(field.acroField);continue;
    }
    field.acroField.dict.delete(PDFName.of('AA'));
    field.acroField.dict.delete(PDFName.of('DV'));
    if (field instanceof PDFTextField) field.setText('');
    else if (field instanceof PDFCheckBox) field.uncheck();
    else throw new Error('Unexpected Ohio official review field type.');
    for (const widget of field.acroField.getWidgets()) {
      widget.dict.delete(PDFName.of('A')); widget.dict.delete(PDFName.of('AA'));
    }
  }
  doc.catalog.delete(PDFName.of('OpenAction'));doc.catalog.delete(PDFName.of('AA'));
  return doc;
}
function text(doc: PDFDocument, name: string, value: string) {
  const field = doc.getForm().getTextField(name);field.setText(value);
  if (field.getText() !== value) throw new Error('Ohio canonical review field failed to retain its value.');
}
function group(doc: PDFDocument, name: string, value: string) {
  const field = doc.getForm().getField(name);
  field.acroField.dict.set(PDFName.of('V'),PDFName.of(value));
  let selected = 0;
  for (const widget of field.acroField.getWidgets()) {
    const normal = widget.getAppearances()?.normal;
    if (!(normal instanceof PDFDict)) throw new Error('Ohio grouped status appearance missing.');
    const on = normal.has(PDFName.of(value));
    if(on){
      // pdf-lib flattens from the raw rectangle origin; the exact Single widget
      // reverses its y endpoints. Preserve the same printed bounds and AP.
      const rect=widget.getRectangle();
      if(rect.width<0||rect.height<0)widget.setRectangle({x:Math.min(rect.x,rect.x+rect.width),y:Math.min(rect.y,rect.y+rect.height),width:Math.abs(rect.width),height:Math.abs(rect.height)});
    }
    widget.setAppearanceState(PDFName.of(on ? value : 'Off'));if(on)selected++;
  }
  if(selected!==1)throw new Error('Ohio grouped status source inventory changed.');
}
async function flattenSource(doc: PDFDocument, sourceHasOrphan: boolean) {
  const form=doc.getForm(),pages=new Set(doc.getPages().map(p=>p.ref.toString()));let orphans=0;
  // The exact-hash bundle retains 103 text/check widgets on three non-page templates.
  // None can appear on the selected review pages; clear and remove them before flattening.
  for(const field of form.getFields()) {
    const widgets=field.acroField.getWidgets();
    for(let index=widgets.length-1;index>=0;index--){
      const widget=widgets[index];if(!widget)throw new Error('Missing Ohio widget.');
      const page=widget.P();
      if(page&&!pages.has(page.toString())){
        if(!sourceHasOrphan||!['2436 0 R','2365 0 R','2344 0 R'].includes(page.toString())||
          doc.context.lookup(page,PDFDict).get(PDFName.of('Type'))?.toString()!=='/Template')throw new Error('Unexpected unrendered Ohio source widget.');
        field.acroField.removeWidget(index);orphans++;
      }
    }
  }
  if(orphans!==(sourceHasOrphan?103:0))throw new Error('Ohio source orphan inventory changed.');
  form.flatten({updateFieldAppearances:false});
  doc.catalog.delete(PDFName.of('AcroForm'));doc.catalog.delete(PDFName.of('Names'));
  for(const page of doc.getPages()){page.node.delete(PDFName.of('Annots'));page.node.delete(PDFName.of('AA'));}
}
interface OhioReciprocalPacketCalculation {
  original: TaxYearInput;
  adapted: OhioResidentReturnInput;
  result: OhioResidentReturnResult;
}

/** Fresh private-original replay precedes both source-template and output I/O. */
export function fillOhioOrdinaryOfficialReview(
  input: TaxYearInput, federal: TaxReturnResult, outputDir: string,
  overlay: OhioOverlayInput, context?: PreparedOhioResidencyReview,
  blankFormsDir = join('forms','blank'),
): Promise<string[]> {
  return renderOhioOrdinaryOfficialReview(input, federal, outputDir, overlay, context, blankFormsDir);
}

async function renderOhioOrdinaryOfficialReview(
  input: TaxYearInput, federal: TaxReturnResult, outputDir: string,
  overlay: OhioOverlayInput, context: PreparedOhioResidencyReview | undefined,
  blankFormsDir: string,
  packetCalculation?: OhioReciprocalPacketCalculation,
): Promise<string[]> {
  assertPdfExportAllowed(input.taxpayer.taxYear,federal.taxYear);
  if(!input.ohioResidency||!input.ohioPayments||Object.keys(overlay).length)return [];
  const original=resolveOhioResidencyReview(input,federal,context);
  // Recheck current sources at the same boundary even when the packet has already
  // calculated this exact return. Only the packet can supply its own calculation.
  const verified = packetCalculation && isDeepStrictEqual(packetCalculation.original, original)
    ? packetCalculation
    : undefined;
  const adapted = verified?.adapted ?? buildOhioResidentReturnInput(original, federal);
  const result = verified?.result ?? calculateOhioResidentReturn(adapted);
  // The canonical adapter and return have already replayed this opaque source context.
  // A domicile label or caller deduction never selects the reciprocal physical method.
  const reciprocal=adapted.residencyReciprocalWageSource!==undefined;
  // Retained originals need their own physical companions even when net zero.
  if(Object.entries(original).some(([key,value])=>key!=='scheduleBPartThree'&&/^(?:form|schedule)/.test(key)&&value!==undefined&&value!==null&&(!Array.isArray(value)||value.length>0))||
    original.royaltyPropertySources||(original.rentalProperties?.length??0)>0||original.cryptoIncome||original.netOperatingLoss||original.adjustments||
    original.ohioResidency?.businessSources)return [];
  const owner=original.ohioResidency?.owners[0],w2=original.w2s[0],nrc=result.nonresidentCreditResult;
  if(original.taxpayer.filingStatus!=='single'||original.taxpayer.spouse||original.taxpayer.dependents.length||original.w2s.length!==1||!w2||w2.stateLocalSources===undefined||
    original.ohioResidency?.owners.length!==1||owner?.accountHolder!=='primary'||owner.status!=='nonresident'||owner.periods.length!==1||
    owner.periods[0]?.from!=='2025-01-01'||owner.periods[0]?.to!=='2025-12-31'||owner.periods[0]?.domicileState!==(reciprocal?'PA':'VA')||
    original.ohioSchoolDistrict||!nrc||nrc.fullResidentOnly||!federal.agi.eq(w2.wages)||!federal.adjustmentsToIncome.isZero()||
    !result.scheduleOfAdjustments.line14_totalAdditions.isZero()||
    (reciprocal?(!result.scheduleOfAdjustments.line14_reciprocityWages.eq(adapted.federalAgi)||!result.scheduleOfAdjustments.line47_totalDeductions.eq(adapted.federalAgi)):!result.scheduleOfAdjustments.line47_totalDeductions.isZero())||
    !result.scheduleOfCredits.line40_totalNonrefundableCredits.eq(nrc.line20)||!result.it1040.line16_refundableCredits.isZero()||
    !result.it1040.line11_underpaymentPenalty.isZero()||!result.it1040.line12_useTax.isZero()||!result.it1040.line15_estimatedPayments.isZero()||
    !result.it1040.line18_amendedPriorOverpayment.isZero()||!result.it1040.line21_latePaymentInterest.isZero()||
    !result.it1040.line24_creditCarryforward.isZero()||!result.it1040.line25_donations.isZero()||result.it1040.line3_ohioAgi.isNegative())return [];
  const sources=calculateW2StateLocalSources(original,0,w2.stateLocalSources),oh=sources.stateRows.filter(row=>row.state==='OH');
  if([nrc.line2,nrc.line3,nrc.line4,nrc.line5,nrc.line6,nrc.line7,nrc.line8,nrc.line10,nrc.line11,nrc.line12,nrc.line13,nrc.line14].some(value=>!value.isZero()))return [];
  if(oh.length!==1||sources.localRows.length||!sources.stateRows.every(row=>row.state==='OH'||(reciprocal?row.state==='PA':row.withheld.isZero())))return [];
  const ohioRow=oh[0];if(!ohioRow)throw new Error('Actual Ohio withholding row required.');
  // Schedule W lists only statements with actual Ohio withholding; raw cents
  // remain source facts even when the reported whole-dollar total rounds to zero.
  const includeWithholding=ohioRow.withheld.gt(0);
  // Printed Credits40 sums nominal lines10/36/38/39 and transfers to IT1040L9.
  // Canonical applied credits remain capped by tax; they are never mutated here.
  const printedCreditTotal=reciprocal?result.scheduleOfCredits.line10_totalFirstBatch
    .plus(result.scheduleOfCredits.line36_totalSecondBatch)
    .plus(result.scheduleOfCredits.line38_nonresidentCredit)
    .plus(result.scheduleOfCredits.line39_residentCredit):undefined;
  if(printedCreditTotal!==undefined&&!result.it1040.line10_taxAfterCredits.eq(zeroFloor(result.it1040.line8c_totalTax.minus(printedCreditTotal))))
    throw new Error('Ohio printed review credit arithmetic disagrees with canonical tax.');
  const sourceDirectory=resolveReviewTemplateDirectory(blankFormsDir,input.taxpayer.taxYear);
  const display=redactReviewIdentifiers(original),bundle=await loadExact(sourceDirectory,'oh-it1040-bundle.pdf',bundleHash,13),nrcDoc=await loadExact(sourceDirectory,'oh-it-nrc.pdf',nrcHash,3);
  const primary=display.taxpayer.primary,address=display.taxpayer.address;
  for(const[name,value]of Object.entries({TP_FN:primary.firstName.toUpperCase(),TP_LN:primary.lastName.toUpperCase(),ADDRESS1:address.street.toUpperCase(),CITY:address.city.toUpperCase(),STATE:address.state,ZIP:address.zip,SD_NUM:'9999',PRIM_NON_RES_STATE:reciprocal?'PA':'VA',L4_EXEMPT:'1'}))text(bundle,name,value);
  const skipsAmountDue=result.it1040.line19_netPayments.gt(result.it1040.line13_totalLiability);
  for(const line of result.it1040.lines){const name=itFields[line.line];if(name&&!(skipsAmountDue&&['20','21','22'].includes(line.line)))text(bundle,name,line.value.toFixed(0));}
  text(bundle,'L7a',result.it1040.line7_taxableNonbusinessIncome.toFixed(0));
  for(const name of ['L25A','L25B','L25C','L25D','L25E','L25F','L25G'])text(bundle,name,'0');
  for(const line of result.scheduleOfCredits.lines){if(/^\d+$/.test(line.line))text(bundle,`SchedC_L${line.line}`,line.value.toFixed(0));}
  if(printedCreditTotal!==undefined){
    text(bundle,'SchedC_L40',printedCreditTotal.toFixed(0));
    text(bundle,'L9',printedCreditTotal.toFixed(0));
  }
  if(reciprocal){
    // This validated finite inventory has only the printed line14 reciprocal deduction.
    // Preserve the existing federal-wage NRC column A below; the canonical NRC view
    // already excludes the same deducted compensation from Ohio column B.
    for(let line=1;line<=47;line++)text(bundle,`SchedA_L${line}`,'0');
    text(bundle,'SchedA_L14',result.scheduleOfAdjustments.line14_reciprocityWages.toFixed(0));
    text(bundle,'SchedA_L47',result.scheduleOfAdjustments.line47_totalDeductions.toFixed(0));
  }
  if(includeWithholding)for(const[name,value]of Object.entries({SchedW_A:result.it1040.line14_ohioWithholding.toFixed(0),SchedW_B_L1_PS:'P',SchedW_B_L1_WAGE:roundDollar(d(w2.wages)).toFixed(0),SchedW_B_L1_FITW:roundDollar(d(w2.federalWithheld)).toFixed(0),SchedW_B_L1_OHWAGE:roundDollar(ohioRow.wages).toFixed(0),SchedW_B_L1_OHIT:roundDollar(ohioRow.withheld).toFixed(0)}))text(bundle,name,value);
  for(const[name,value]of Object.entries({'1a':roundDollar(federal.totalWages).toFixed(0),'1b':nrc.line1.toFixed(0),'2a':'0','2b':'0','3a':'0','3b':'0','4a':'0','4b':'0','5b':'0','6b':'0','7b':'0','8b':'0','9b':nrc.line9.toFixed(0),'16b':nrc.line16.toFixed(0),'17b':nrc.line17.toFixed(0),'18b':nrc.line18.toFixed(0),'19':nrc.line19.toFixed(4).replace(/^0\./,'.'),'20':nrc.line20.toFixed(0)}))text(nrcDoc,name,value);
  await bundle.getForm().updateFieldAppearances(await bundle.embedFont(StandardFonts.Helvetica));
  await nrcDoc.getForm().updateFieldAppearances(await nrcDoc.embedFont(StandardFonts.Helvetica));
  group(bundle,'CHK_PRIM_RES','3');group(bundle,'CHK_FILING_STATUS','1');
  await flattenSource(bundle,true);await flattenSource(nrcDoc,false);
  const plans=[{source:bundle,pages:[0,1],name:'oh-it-1040-review.pdf'},{source:nrcDoc,pages:[0],name:'oh-it-nrc-review.pdf'},
    ...(reciprocal?[{source:bundle,pages:[2,3],name:'oh-schedule-adjustments-review.pdf'}]:[]),
    {source:bundle,pages:[6,7],name:'oh-schedule-credits-review.pdf'},
    ...(includeWithholding?[{source:bundle,pages:[10,11],name:'oh-schedule-of-withholding-review.pdf'}]:[])];
  const prepared: Array<{path:string;bytes:Uint8Array}>=[];
  for(const plan of plans){
    const clean=await PDFDocument.create();for(const page of await clean.copyPages(plan.source,plan.pages))clean.addPage(page);
    clean.setTitle('Ohio 2025 redacted review');clean.setAuthor('Tax Engine');clean.setCreator('Tax Engine');clean.setProducer('Tax Engine');
    await markReviewPdf(clean);prepared.push({path:join(outputDir,plan.name),bytes:await clean.save()});
  }
  await mkdir(outputDir,{recursive:true});for(const file of prepared)await writeFile(file.path,file.bytes);
  return prepared.map(file=>file.path);
}

export async function fillOhioReferenceForms(
  taxInput: TaxYearInput,
  federalResult: TaxReturnResult,
  outputDir: string,
  overlay: OhioOverlayInput = {},
  reviewContext?:PreparedOhioResidencyReview,
  blankFormsDir = join('forms','blank'),
  options: { inMemoryReferences?: boolean } = {},
): Promise<OhioReferencePacketResult> {
  assertPdfExportAllowed(taxInput.taxpayer.taxYear, federalResult.taxYear);
  const hasResidency=Boolean((taxInput as TaxYearInput&{ohioResidency?:unknown;ohioPayments?:unknown}).ohioResidency??overlay.residency)||Boolean((taxInput as TaxYearInput&{ohioPayments?:unknown}).ohioPayments??overlay.payments);
  const hasActualW2 = (taxInput.w2s ?? []).some(statement => statement.stateLocalSources !== undefined);
  const original = hasResidency || hasActualW2 || reviewContext !== undefined
    ? resolveOhioResidencyReview(taxInput, federalResult, reviewContext)
    : taxInput;
  const residentCreditOfficialReview = prepareOhioResidentCreditOfficialReview(taxInput, federalResult, overlay, reviewContext);
  const businessOfficialReview = prepareOhioBusinessOfficialReview(taxInput, federalResult, overlay, reviewContext);
  const ohioInput = buildOhioResidentReturnInput(original, federalResult, overlay);
  const ohioResult = calculateOhioResidentReturn(ohioInput);
  const reciprocalPacketCalculation = ohioInput.residencyReciprocalWageSource !== undefined && Object.keys(overlay).length === 0
    ? { original, adapted: ohioInput, result: ohioResult }
    : undefined;
  const digitalCapitalInput = calculateDigitalAssetStateSources(original, "OH");
  const itBusResult = extractQualifyingBusinessIncome(
    federalResult,
    original.scheduleK1 ?? [],
    overlay.otherBusinessIncome,
  );
  const withholdingResult = calculateOhioScheduleOfWithholding({
    w2s: original.w2s,
    w2SourceContext: original,
    formW2Gs: original.formW2G,
    form1099Gs: original.form1099G,
    form1099Ks: original.form1099K,
    form1099Rs: original.form1099R,
    form1099Necs: original.form1099Nec,
    form1099Miscs: original.form1099Misc,
    form1099Ints: original.form1099Int,
    form1099Divs: original.form1099Div,
    form1099Bs: digitalCapitalInput.form1099B,
    form1099OIDs: original.form1099OID,
  });
  const lumpSumDistributionWorksheet = getLumpSumDistributionWorksheet(ohioInput);

  // Complete business source/template staging before any reference output directory exists.
  const stagedBusinessReview = businessOfficialReview ? await stageOhioBusinessOfficialReview(businessOfficialReview,blankFormsDir) : undefined;

  const filledForms: string[] = [];
  const referenceDocuments = options.inMemoryReferences ? new Map<string, PDFDocument>() : undefined;

  async function createReferencePdf(definition: Parameters<typeof renderReferencePdf>[0] & { fileName: string }) {
    const doc = await renderReferencePdf(definition);
    const filePath = join(outputDir, definition.fileName);
    if (referenceDocuments) {
      referenceDocuments.set(filePath, doc);
    } else {
      await mkdir(outputDir, { recursive: true });
      await markReviewPdf(doc);
      await writeFile(filePath, await doc.save());
    }
    return filePath;
  }

  filledForms.push(
    await createReferencePdf(
      {
        title: "Ohio IT 1040",
        subtitle: "Ohio individual income tax return summary",
        fileName: "oh-it-1040-reference.pdf",
        lines: ohioResult.it1040.lines,
      },
    ),
  );

  if (ohioResult.nonresidentCreditResult && !ohioResult.nonresidentCreditResult.fullResidentOnly) {
    const nrcForms = ["OH-IT-NRC", "OH-IT-NRC-II", "OH-IT-NRC-III"];
    const nrcLines = ohioResult.lines.filter(row => nrcForms.includes(row.form));
    filledForms.push(await createReferencePdf({
      title: "Ohio IT NRC",
      subtitle: "Actual owner nonresident and part-year source allocation - reference worksheet",
      fileName: "oh-it-nrc-reference.pdf",
      lines: nrcLines,
    }));
  }

  if (shouldIncludeAdjustments(ohioResult.scheduleOfAdjustments)) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Schedule of Adjustments",
          subtitle: "Additions and deductions to federal AGI",
          fileName: "oh-schedule-adjustments-reference.pdf",
          lines: ohioResult.scheduleOfAdjustments.lines,
        },
      ),
    );
  }

  if (itBusResult.line6_totalQualifyingBusinessIncome.gt(0)) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Schedule of Business Income",
          subtitle: "Qualifying business income breakdown",
          fileName: "oh-it-bus-reference.pdf",
          lines: itBusResult.lines,
        },
      ),
    );
  }

  const totalWithholding = overlay.ohioWithholdingOverride ?? withholdingResult.line6_totalOhioWithholding;
  const reportedWithholding = ohioResult.it1040.lines.find(line => line.line === "14");
  const withholdingLines = hasActualW2 && reportedWithholding
    ? [...withholdingResult.lines, { ...reportedWithholding, description: "Reported Ohio IT1040 line14", formula: "Already calculated return line14; exact source cents remain above and existing qualified-return rounding is unchanged" }]
    : withholdingResult.lines;

  if (withholdingResult.line6_totalOhioWithholding.gt(0) || d(totalWithholding).gt(0)) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Schedule of Withholding",
          subtitle: "Ohio withholding support for IT 1040 line 14",
          fileName: "oh-schedule-of-withholding-reference.pdf",
          lines: withholdingLines,
        },
      ),
    );
  }

  if (shouldIncludeScheduleOfCredits(ohioResult.scheduleOfCredits)) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Schedule of Credits",
          subtitle: "Nonrefundable and refundable Ohio credit summary",
          fileName: "oh-schedule-credits-reference.pdf",
          lines: ohioResult.scheduleOfCredits.lines,
        },
      ),
    );
  }

  if (ohioResult.scheduleOfCredits.lumpSumRetirementWorksheet?.line6_totalCredit.gt(0)) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Lump Sum Retirement Credit Worksheet",
          subtitle: "Ohio Schedule of Credits line 3 worksheet summary",
          fileName: "oh-lump-sum-retirement-credit-reference.pdf",
          lines: ohioResult.scheduleOfCredits.lumpSumRetirementWorksheet.lines,
        },
      ),
    );
  }

  if (lumpSumDistributionWorksheet?.line3_totalCredit.gt(0)) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Lump Sum Distribution Credit Worksheet",
          subtitle: "Ohio Schedule of Credits line 5 worksheet summary",
          fileName: "oh-lump-sum-distribution-credit-reference.pdf",
          lines: lumpSumDistributionWorksheet.lines,
        },
      ),
    );
  }

  if (ohioResult.residentCredit) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Resident Credit",
          subtitle: "Taxes paid to other states",
          fileName: "oh-resident-credit-reference.pdf",
          lines: ohioResult.residentCredit.lines,
        },
      ),
    );
  }

  if (ohioResult.itsd2210) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio IT/SD 2210",
          subtitle: "Underpayment of estimated tax summary",
          fileName: "oh-it-sd-2210-reference.pdf",
          lines: [...ohioResult.itsd2210.lines,...(ohioInput.paymentSourceDigest?[{form:'OH-IT/SD-2210',line:'actual-payment-source',inputs:{},description:ohioInput.paymentTaxCoverage?.status==='expected_payment'?'Expected remaining-tax payment':ohioInput.paymentTaxCoverage?.status==='actual_payment'?'Actual remaining-tax payment':'Actual no remaining tax',value:d(ohioInput.paymentTaxCoverage?.amountAppliedToTax),formula:`${ohioInput.paymentTaxCoverage?.date??'No tax remains'}; ${ohioInput.paymentMethodVersion}; original commitment ${ohioInput.paymentSourceDigest}`}]:[])],
        },
      ),
    );
  }

  if (ohioResult.sd100) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio SD 100",
          subtitle: "School district income tax return summary",
          fileName: "oh-sd-100-reference.pdf",
          lines: ohioResult.sd100.lines,
        },
      ),
    );
  }

  // The ordinary physical review omits school packets. Use the prior canonical
  // calculation to skip its replay when the school renderer will check the input.
  if (!original.ohioSchoolDistrict || !taxInput.ohioSchoolDistrict) {
    filledForms.push(...await renderOhioOrdinaryOfficialReview(
      taxInput, federalResult, outputDir, overlay, reviewContext, blankFormsDir, reciprocalPacketCalculation,
    ));
  }
  filledForms.push(...await fillOhioSchoolDistrictOfficialReview(taxInput,federalResult,outputDir,overlay,reviewContext,blankFormsDir));
  if (residentCreditOfficialReview) filledForms.push(...await fillOhioResidentCreditOfficialReview(residentCreditOfficialReview,outputDir,blankFormsDir));
  if (stagedBusinessReview) filledForms.push(...await writeOhioBusinessOfficialReview(stagedBusinessReview,outputDir));
  return referenceDocuments ? { filledForms, referenceDocuments } : { filledForms };
}
