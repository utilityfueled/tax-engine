/**
 * Audit trail builder for tax calculations.
 * Every calculated value records what went into it.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";

export class AuditTrail {
  private lines: CalculatedLine[] = [];

  record(
    form: string,
    line: string,
    description: string,
    value: Decimal,
    formula: string,
    inputs: Record<string, Decimal | string> = {}
  ): Decimal {
    this.lines.push({ form, line, description, value, formula, inputs });
    return value;
  }

  getLines(): CalculatedLine[] {
    return [...this.lines];
  }

  getLinesForForm(form: string): CalculatedLine[] {
    return this.lines.filter((l) => l.form === form);
  }

  getLine(form: string, line: string): CalculatedLine | undefined {
    return this.lines.find((l) => l.form === form && l.line === line);
  }

  /** Merge lines from a sub-calculation into this audit trail */
  merge(lines: CalculatedLine[]): void {
    this.lines.push(...lines);
  }
}
