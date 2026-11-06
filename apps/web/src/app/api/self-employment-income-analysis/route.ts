import { createDocumentAnalysisRoute } from "@/lib/document-analysis-route";
import { analyzeSelfEmploymentIncomeDocumentWithGemini } from "@/lib/gemini-document-analysis-server";

export const runtime = "nodejs";
export const POST = createDocumentAnalysisRoute("self-employment-income-analysis", analyzeSelfEmploymentIncomeDocumentWithGemini);
