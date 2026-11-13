import { PDFAcroSignature, PDFArray, PDFDict, PDFName, PDFRef, PDFStream, type PDFDocument, type PDFObject } from "pdf-lib";

const xfaKey = PDFName.of("XFA");
const permissionsKey = PDFName.of("Perms");
const readerRightsKey = PDFName.of("UR3");
const signatureFlagsKey = PDFName.of("SigFlags");

/** Call only on a registered source before exposing its AcroForm to pdf-lib. */
export function removeTrustedTemplateLegacyFormData(doc: PDFDocument): void {
  const { catalog, context } = doc;
  const form = catalog.getAcroForm();
  const detached = new Set<PDFRef>();

  const xfa = form?.dict.get(xfaKey);
  if (form && xfa) {
    form.dict.delete(xfaKey);
    if (xfa instanceof PDFRef) detached.add(xfa);
    const packets = context.lookup(xfa);
    if (packets instanceof PDFArray) {
      for (const packet of packets.asArray()) {
        if (packet instanceof PDFRef && context.lookup(packet) instanceof PDFStream) detached.add(packet);
      }
    }
  }

  const permissionsRef = catalog.get(permissionsKey);
  const permissions = context.lookup(permissionsRef);
  if (permissions instanceof PDFDict && permissions.has(readerRightsKey)) {
    const rights = permissions.get(readerRightsKey);
    permissions.delete(readerRightsKey);
    if (rights instanceof PDFRef) detached.add(rights);
    if (permissions.keys().length === 0) {
      catalog.delete(permissionsKey);
      if (permissionsRef instanceof PDFRef) detached.add(permissionsRef);
      if (form && !form.getAllFields().some(([field]) => field instanceof PDFAcroSignature)) {
        form.dict.delete(signatureFlagsKey);
      }
    }
  }

  if (detached.size === 0) return;
  // pdf-lib serializes even unreachable indirect objects. Preserve every
  // detached object still referenced by any retained object or the trailer.
  const retained = new Set<PDFRef>();
  const visited = new Set<PDFObject>();
  const keepReferences = (value: PDFObject): void => {
    if (value instanceof PDFRef) {
      if (!detached.has(value) || retained.has(value)) return;
      retained.add(value);
      const object = context.lookup(value);
      if (object) keepReferences(object);
      return;
    }
    if (visited.has(value)) return;
    visited.add(value);
    if (value instanceof PDFStream) keepReferences(value.dict);
    else if (value instanceof PDFArray) value.asArray().forEach(keepReferences);
    else if (value instanceof PDFDict) value.values().forEach(keepReferences);
  };
  for (const value of Object.values(context.trailerInfo)) if (value) keepReferences(value);
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!detached.has(ref)) keepReferences(object);
  }
  for (const ref of detached) if (!retained.has(ref)) context.delete(ref);
}
