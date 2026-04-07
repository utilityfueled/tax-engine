export const TAX_ENGINE_REPO_URL =
  process.env.NEXT_PUBLIC_TAX_ENGINE_REPO_URL?.trim()
  || process.env.TAX_ENGINE_REPO_URL?.trim()
  || "https://github.com/utilityfueled/tax-engine";
