import { execFileSync } from 'node:child_process';

/** Read a bounded group of completed files with the independent pinned parser. */
export function readCompletedPdfPages(paths: readonly string[], timeout: number): string[][] {
  if (paths.length === 0) return [];
  const result: unknown = JSON.parse(execFileSync(
    process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3',
    ['-c',
      'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([[p.extract_text() or "" for p in PdfReader(path).pages] for path in sys.argv[1:]]))',
      ...paths],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout },
  ));
  if (!Array.isArray(result) || result.length !== paths.length
    || !result.every(pages => Array.isArray(pages) && pages.every(page => typeof page === 'string'))) {
    throw new Error('Independent completed-PDF reader returned an invalid page group');
  }
  return result as string[][];
}
