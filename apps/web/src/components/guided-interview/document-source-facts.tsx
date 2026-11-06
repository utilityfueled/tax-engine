import type { AiSourceFact } from "@tax-engine/engine/src/ai-application-schemas";

export function DocumentSourceFacts({ facts, label }: { facts?: AiSourceFact[]; label: string }) {
  if (!facts?.length) return null;
  return <details className="guided-w2-card">
    <summary>Unconfirmed source details — {label}</summary>
    <p className="guided-hint">Check these details against the original document. They have not been added to income or expenses. Enter confirmed facts in the matching interview section.</p>
    <dl>{facts.map(fact => <div key={fact.name} className="guided-bank-analysis-item">
      <dt>{fact.name}</dt>
      <dd>{fact.value ?? "Unknown"}{fact.sourceQuote && <blockquote className="guided-hint">{fact.sourceQuote}</blockquote>}</dd>
    </div>)}</dl>
  </details>;
}
