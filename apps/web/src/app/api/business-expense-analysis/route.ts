import { createDocumentAnalysisRoute } from "@/lib/document-analysis-route";
import { analyzeBusinessExpenseStatementWithGemini } from "@/lib/gemini-document-analysis-server";

export const runtime = "nodejs";
export const POST = createDocumentAnalysisRoute("business-expense-analysis", analyzeBusinessExpenseStatementWithGemini);
