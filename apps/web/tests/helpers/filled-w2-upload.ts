import { PDFDocument, StandardFonts } from "pdf-lib";

export async function createFilledW2Upload() {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = [
    "2025 Form W-2",
    "Fictional payroll data for browser tests",
    "b Employer identification number (EIN) 12-3456789",
    "c Employer's name, address, and ZIP code",
    "Fictional Payroll Employer",
    "1 Wages, tips, other comp. 52000.00",
    "2 Federal income tax withheld 5000.00",
    "3 Social security wages 52000.00",
    "4 Social security tax withheld 3224.00",
    "5 Medicare wages and tips 52000.00",
    "6 Medicare tax withheld 754.00",
    "15 State TX",
    "16 State wages, tips, etc. 0.00",
    "17 State income tax 0.00",
    "7 Social security tips 0.00",
    "10 Dependent care benefits 0.00",
  ];
  lines.forEach((line, index) => {
    page.drawText(line, { x: 40, y: 780 - index * 20, size: 10, font });
  });

  return {
    name: "fictional-payroll-2025.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  };
}
