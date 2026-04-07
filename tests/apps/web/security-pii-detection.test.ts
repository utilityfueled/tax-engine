import { describe, expect, it } from "vitest";
import { containsUnsafeDirectIdentifier } from "../../../apps/web/src/lib/provider-request-privacy";

// ---------------------------------------------------------------------------
// 1. SSN detection
// ---------------------------------------------------------------------------

describe("security: PII detection — Social Security Numbers", () => {
  it("detects SSN with dashes (123-45-6789)", () => {
    expect(containsUnsafeDirectIdentifier("Filer SSN is 123-45-6789")).toBe(true);
  });

  it("detects SSN without separators (123456789)", () => {
    expect(containsUnsafeDirectIdentifier("SSN: 123456789")).toBe(true);
  });

  it("detects SSN with spaces (123 45 6789)", () => {
    expect(containsUnsafeDirectIdentifier("Filer SSN: 123 45 6789")).toBe(true);
  });

  it("detects SSN with dots (123.45.6789)", () => {
    expect(containsUnsafeDirectIdentifier("SSN 123.45.6789")).toBe(true);
  });

  it("detects SSN with underscores (123_45_6789)", () => {
    expect(containsUnsafeDirectIdentifier("SSN 123_45_6789")).toBe(true);
  });

  it("detects SSN buried in nested object", () => {
    expect(containsUnsafeDirectIdentifier({
      workspace: {
        documents: [{ notes: "Primary SSN 078-05-1120" }]
      }
    })).toBe(true);
  });

  it("does not flag amounts that resemble SSN format but have leading context", () => {
    // Dollar amounts like $123,456,789 should not match;
    // but bare 9-digit sequences may legitimately match — that's intentional
    expect(containsUnsafeDirectIdentifier("Total income: $123,456,789")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. EIN detection
// ---------------------------------------------------------------------------

describe("security: PII detection — Employer Identification Numbers", () => {
  it("detects EIN with dash (12-3456789)", () => {
    expect(containsUnsafeDirectIdentifier("EIN: 12-3456789")).toBe(true);
  });

  it("detects EIN without separator (123456789 as 2+7)", () => {
    // 9 digits can also match SSN pattern; the important thing is it's caught
    expect(containsUnsafeDirectIdentifier("Employer EIN 123456789")).toBe(true);
  });

  it("detects EIN with space (12 3456789)", () => {
    expect(containsUnsafeDirectIdentifier("Company EIN: 12 3456789")).toBe(true);
  });

  it("detects EIN with dot (12.3456789)", () => {
    expect(containsUnsafeDirectIdentifier("EIN 12.3456789")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Email detection
// ---------------------------------------------------------------------------

describe("security: PII detection — email addresses", () => {
  it("detects standard email address", () => {
    expect(containsUnsafeDirectIdentifier("Contact: user@example.com")).toBe(true);
  });

  it("detects email with plus addressing", () => {
    expect(containsUnsafeDirectIdentifier("Email: john+tax@gmail.com")).toBe(true);
  });

  it("detects email with subdomain", () => {
    expect(containsUnsafeDirectIdentifier("admin@mail.company.co.uk")).toBe(true);
  });

  it("detects email with dots in local part", () => {
    expect(containsUnsafeDirectIdentifier("first.last@domain.org")).toBe(true);
  });

  it("detects email embedded in object", () => {
    expect(containsUnsafeDirectIdentifier({
      contact: { email: "taxpayer@example.com" }
    })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Phone number detection
// ---------------------------------------------------------------------------

describe("security: PII detection — phone numbers", () => {
  it("detects phone with dashes (555-123-4567)", () => {
    expect(containsUnsafeDirectIdentifier("Phone: 555-123-4567")).toBe(true);
  });

  it("detects phone with parens ((555) 123-4567)", () => {
    expect(containsUnsafeDirectIdentifier("Call (555) 123-4567")).toBe(true);
  });

  it("detects phone with dots (555.123.4567)", () => {
    expect(containsUnsafeDirectIdentifier("Phone: 555.123.4567")).toBe(true);
  });

  it("detects phone with country code (+1 555-123-4567)", () => {
    expect(containsUnsafeDirectIdentifier("Phone +1 555-123-4567")).toBe(true);
  });

  it("detects phone with spaces (555 123 4567)", () => {
    expect(containsUnsafeDirectIdentifier("Cell: 555 123 4567")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Street address detection
// ---------------------------------------------------------------------------

describe("security: PII detection — street addresses", () => {
  it("detects street address with Street", () => {
    expect(containsUnsafeDirectIdentifier("123 Main Street")).toBe(true);
  });

  it("detects street address with abbreviated St", () => {
    expect(containsUnsafeDirectIdentifier("456 Oak St")).toBe(true);
  });

  it("detects street address with Avenue", () => {
    expect(containsUnsafeDirectIdentifier("789 Park Avenue")).toBe(true);
  });

  it("detects street address with Ave", () => {
    expect(containsUnsafeDirectIdentifier("100 Broadway Ave")).toBe(true);
  });

  it("detects street address with apartment unit", () => {
    expect(containsUnsafeDirectIdentifier("321 Elm Drive Apt 4B")).toBe(true);
  });

  it("detects Boulevard addresses", () => {
    expect(containsUnsafeDirectIdentifier("555 Sunset Boulevard")).toBe(true);
  });

  it("detects Lane addresses", () => {
    expect(containsUnsafeDirectIdentifier("10 Maple Lane")).toBe(true);
  });

  it("detects Court addresses", () => {
    expect(containsUnsafeDirectIdentifier("42 Pine Court")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. ZIP code detection
// ---------------------------------------------------------------------------

describe("security: PII detection — ZIP codes with state context", () => {
  it("detects state abbreviation followed by ZIP (CA 90210)", () => {
    expect(containsUnsafeDirectIdentifier("CA 90210")).toBe(true);
  });

  it("detects ZIP+4 format with state (NY 10001-1234)", () => {
    expect(containsUnsafeDirectIdentifier("NY 10001-1234")).toBe(true);
  });

  it("detects ZIP keyword format (ZIP: 94105)", () => {
    expect(containsUnsafeDirectIdentifier("ZIP: 94105")).toBe(true);
  });

  it("does not flag bare 5-digit number without context", () => {
    // Bare numbers like "10001" without state/ZIP context should not match
    expect(containsUnsafeDirectIdentifier("Form 10001 is required")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Date of birth detection
// ---------------------------------------------------------------------------

describe("security: PII detection — dates of birth", () => {
  it("detects DOB keyword with ISO date (DOB: 1990-01-15)", () => {
    expect(containsUnsafeDirectIdentifier("DOB: 1990-01-15")).toBe(true);
  });

  it("detects date of birth phrase with MM/DD/YYYY", () => {
    expect(containsUnsafeDirectIdentifier("date of birth: 01/15/1990")).toBe(true);
  });

  it("detects birth date phrase with date", () => {
    expect(containsUnsafeDirectIdentifier("birth date: 3-25-1985")).toBe(true);
  });

  it("does not flag generic dates without DOB context", () => {
    // A date without "DOB" or "date of birth" context is fine
    expect(containsUnsafeDirectIdentifier("Filed on 2025-01-15")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Routing/ABA number detection
// ---------------------------------------------------------------------------

describe("security: PII detection — bank routing numbers", () => {
  it("detects routing number keyword with 9 digits", () => {
    expect(containsUnsafeDirectIdentifier("routing: 021000021")).toBe(true);
  });

  it("detects ABA keyword with 9 digits", () => {
    expect(containsUnsafeDirectIdentifier("ABA 021000021")).toBe(true);
  });

  it("detects RTN keyword with 9 digits", () => {
    expect(containsUnsafeDirectIdentifier("RTN: 021000021")).toBe(true);
  });

  it("flags 9 digits even without routing context — SSN/EIN patterns catch them", () => {
    // A bare 9-digit number matches the SSN pattern (security-conservative).
    // This is correct: any 9-digit sequence in a tax context is suspicious.
    expect(containsUnsafeDirectIdentifier("Reference 000000001")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Bank account number detection
// ---------------------------------------------------------------------------

describe("security: PII detection — bank account numbers", () => {
  it("detects account keyword with 10-digit number", () => {
    expect(containsUnsafeDirectIdentifier("account: 1234567890")).toBe(true);
  });

  it("detects acct keyword with 12-digit number", () => {
    expect(containsUnsafeDirectIdentifier("acct# 123456789012")).toBe(true);
  });

  it("detects account with 17-digit number (max)", () => {
    expect(containsUnsafeDirectIdentifier("account 12345678901234567")).toBe(true);
  });

  it("detects account with 6-digit number (min)", () => {
    expect(containsUnsafeDirectIdentifier("account: 123456")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. Person name context detection
// ---------------------------------------------------------------------------

describe("security: PII detection — person names in context", () => {
  it("detects 'Contact John Smith' pattern", () => {
    expect(containsUnsafeDirectIdentifier("Contact John Smith for details")).toBe(true);
  });

  it("detects 'Uploaded by Jane Doe' pattern", () => {
    expect(containsUnsafeDirectIdentifier("Uploaded by Jane Doe")).toBe(true);
  });

  it("detects 'Call Maria Garcia' pattern", () => {
    expect(containsUnsafeDirectIdentifier("Call Maria Garcia")).toBe(true);
  });

  it("detects 'dependent Emily Johnson' pattern", () => {
    expect(containsUnsafeDirectIdentifier("dependent Emily Johnson")).toBe(true);
  });

  it("detects 'Mail to Robert Wilson' pattern", () => {
    expect(containsUnsafeDirectIdentifier("Mail to Robert Wilson")).toBe(true);
  });

  it("detects 'confirmed' verb with name", () => {
    expect(containsUnsafeDirectIdentifier("Alice Cooper confirmed the amount")).toBe(true);
  });

  it("does not flag common tax terms that look like names", () => {
    // "Tax Return" should not be flagged as a person name
    expect(containsUnsafeDirectIdentifier("Tax Return for 2025")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. Workspace slug person name detection
// ---------------------------------------------------------------------------

describe("security: PII detection — person names in workspace slugs", () => {
  it("detects person name in workspace slug (workspace-john-smith)", () => {
    expect(containsUnsafeDirectIdentifier("workspace-john-smith")).toBe(true);
  });

  it("detects person name in return slug (return-jane.doe)", () => {
    expect(containsUnsafeDirectIdentifier("return-jane.doe")).toBe(true);
  });

  it("does not flag workspace slugs with ignored tokens (workspace-tax-return)", () => {
    expect(containsUnsafeDirectIdentifier("workspace-tax-return")).toBe(false);
  });

  it("does not flag workspace slugs with ignored tokens (workspace-draft-review)", () => {
    expect(containsUnsafeDirectIdentifier("workspace-draft-review")).toBe(false);
  });

  it("detects multi-part person name slug (return-maria-garcia-lopez)", () => {
    expect(containsUnsafeDirectIdentifier("return-maria-garcia-lopez")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 12. Deep nested object traversal
// ---------------------------------------------------------------------------

describe("security: PII detection — deep nested object traversal", () => {
  it("detects PII in deeply nested object", () => {
    expect(containsUnsafeDirectIdentifier({
      level1: {
        level2: {
          level3: {
            level4: {
              note: "SSN is 999-88-7777"
            }
          }
        }
      }
    })).toBe(true);
  });

  it("detects PII in array items", () => {
    expect(containsUnsafeDirectIdentifier({
      documents: [
        { content: "safe content" },
        { content: "Contact: user@example.com" },
        { content: "more safe content" }
      ]
    })).toBe(true);
  });

  it("detects PII scattered across multiple string fields", () => {
    expect(containsUnsafeDirectIdentifier({
      field1: "no PII here",
      field2: "also safe",
      field3: "but this has 123 Main Street"
    })).toBe(true);
  });

  it("returns false for objects with no string values containing PII", () => {
    expect(containsUnsafeDirectIdentifier({
      count: 42,
      active: true,
      label: "safe text",
      nested: { value: "also safe" },
      items: ["plain", "text", "values"]
    })).toBe(false);
  });

  it("handles null and undefined values gracefully", () => {
    expect(containsUnsafeDirectIdentifier(null)).toBe(false);
    expect(containsUnsafeDirectIdentifier(undefined)).toBe(false);
    expect(containsUnsafeDirectIdentifier({
      a: null,
      b: undefined,
      c: "safe"
    })).toBe(false);
  });

  it("handles empty objects and arrays", () => {
    expect(containsUnsafeDirectIdentifier({})).toBe(false);
    expect(containsUnsafeDirectIdentifier([])).toBe(false);
    expect(containsUnsafeDirectIdentifier({ items: [] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 13. Credit/debit card number detection
// ---------------------------------------------------------------------------

describe("security: PII detection — credit card numbers", () => {
  it("detects Visa card number with spaces (4111 1111 1111 1111)", () => {
    expect(containsUnsafeDirectIdentifier("card 4111 1111 1111 1111")).toBe(true);
  });

  it("detects Visa card number with dashes (4111-1111-1111-1111)", () => {
    expect(containsUnsafeDirectIdentifier("4111-1111-1111-1111")).toBe(true);
  });

  it("detects Visa card number without separators (4111111111111111)", () => {
    expect(containsUnsafeDirectIdentifier("card: 4111111111111111")).toBe(true);
  });

  it("detects Mastercard number (5500 0000 0000 0004)", () => {
    expect(containsUnsafeDirectIdentifier("5500 0000 0000 0004")).toBe(true);
  });

  it("detects Amex number with keyword (card 3782 822463 10005)", () => {
    expect(containsUnsafeDirectIdentifier("card 378282246310005")).toBe(true);
  });

  it("detects Discover number (6011 0000 0000 0004)", () => {
    expect(containsUnsafeDirectIdentifier("6011 0000 0000 0004")).toBe(true);
  });

  it("detects card number with 'credit' keyword context", () => {
    expect(containsUnsafeDirectIdentifier("credit 4111111111111111")).toBe(true);
  });

  it("detects card number with 'debit' keyword context", () => {
    expect(containsUnsafeDirectIdentifier("debit 4111111111111111")).toBe(true);
  });

  it("detects card number with 'cc' keyword context", () => {
    expect(containsUnsafeDirectIdentifier("cc# 4111111111111111")).toBe(true);
  });

  it("detects card number with 'visa' keyword context", () => {
    expect(containsUnsafeDirectIdentifier("visa 4111111111111111")).toBe(true);
  });

  it("detects card number buried in nested object", () => {
    expect(containsUnsafeDirectIdentifier({
      payment: {
        method: "Card ending 4111 1111 1111 1111"
      }
    })).toBe(true);
  });

  it("does not flag random 16-digit numbers that fail Luhn", () => {
    // 1234567890123456 does not pass Luhn
    expect(containsUnsafeDirectIdentifier("Reference: 1234567890123456")).toBe(false);
  });

  it("does not flag short numeric sequences", () => {
    expect(containsUnsafeDirectIdentifier("Code: 411111")).toBe(false);
  });

  it("does not flag dollar amounts that look like long numbers", () => {
    expect(containsUnsafeDirectIdentifier("Total: $4,111,111,111,111")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 14. False positive resistance — tax-specific terms
// ---------------------------------------------------------------------------

describe("security: PII detection — false positive resistance", () => {
  it("does not flag IRS form numbers (Form 1040)", () => {
    expect(containsUnsafeDirectIdentifier("See Form 1040 instructions")).toBe(false);
  });

  it("does not flag IRS form numbers (Form 8949)", () => {
    expect(containsUnsafeDirectIdentifier("Form 8949 line 7")).toBe(false);
  });

  it("does not flag tax year references", () => {
    expect(containsUnsafeDirectIdentifier("Tax year 2025 filing")).toBe(false);
  });

  it("does not flag dollar amounts", () => {
    expect(containsUnsafeDirectIdentifier("Total income: $85,000")).toBe(false);
  });

  it("does not flag line number references", () => {
    expect(containsUnsafeDirectIdentifier("Line 11 minus Line 24")).toBe(false);
  });

  it("does not flag workspace IDs that are not person names", () => {
    expect(containsUnsafeDirectIdentifier("workspace-2025-federal")).toBe(false);
  });

  it("does not flag safe redacted placeholder text", () => {
    expect(containsUnsafeDirectIdentifier("[REDACTED-SSN]")).toBe(false);
  });

  it("does not flag tokenized replacement markers", () => {
    expect(containsUnsafeDirectIdentifier("SSN: [TOKEN-001]")).toBe(false);
  });

  it("does not flag numeric strings that are too short for SSN", () => {
    expect(containsUnsafeDirectIdentifier("Code 1234")).toBe(false);
  });

  it("does not flag description text about tax topics", () => {
    expect(containsUnsafeDirectIdentifier(
      "Schedule C reports business income and expenses for self-employed individuals."
    )).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 14. Cross-route PII rejection (integration-level tests)
// ---------------------------------------------------------------------------

describe("security: PII detection — interview route rejects unredacted PII", () => {
  it("interview route rejects request containing SSN in questions", async () => {
    const originalDeploymentMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    process.env.TAX_ENGINE_DEPLOYMENT_MODE = "self-host";

    try {
      const { POST } = await import("../../../apps/web/src/app/api/provider/interview/route");

      const response = await POST(new Request("http://localhost/api/provider/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: "interview-assist",
          requestId: "interview:ws-1:2026-03-27T00:00:00.000Z",
          requestedAt: "2026-03-27T00:00:00.000Z",
          replacementCount: 0,
          redactions: [],
          interview: {
            questions: [
              {
                id: "q1",
                prompt: "Confirm SSN 123-45-6789 for primary filer",
                status: "pending"
              }
            ]
          }
        })
      }));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Provider interview request contains unredacted direct identifiers.");
      expect(JSON.stringify(body)).not.toContain("123-45-6789");
    } finally {
      if (originalDeploymentMode === undefined) {
        delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;
      } else {
        process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalDeploymentMode;
      }
    }
  });

  it("interview route rejects request containing email address", async () => {
    const originalDeploymentMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    process.env.TAX_ENGINE_DEPLOYMENT_MODE = "self-host";

    try {
      const { POST } = await import("../../../apps/web/src/app/api/provider/interview/route");

      const response = await POST(new Request("http://localhost/api/provider/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: "interview-assist",
          requestId: "interview:ws-2:2026-03-27T00:00:00.000Z",
          requestedAt: "2026-03-27T00:00:00.000Z",
          replacementCount: 0,
          redactions: [],
          interview: {
            questions: [
              {
                id: "q1",
                prompt: "Verify contact email taxpayer@example.com",
                status: "pending"
              }
            ]
          }
        })
      }));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Provider interview request contains unredacted direct identifiers.");
    } finally {
      if (originalDeploymentMode === undefined) {
        delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;
      } else {
        process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalDeploymentMode;
      }
    }
  });
});

describe("security: PII detection — export-draft route rejects unredacted PII", () => {
  it("export-draft route rejects request containing phone number in checklist", async () => {
    const originalDeploymentMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    process.env.TAX_ENGINE_DEPLOYMENT_MODE = "self-host";

    try {
      const { POST } = await import("../../../apps/web/src/app/api/provider/export-draft/route");

      const response = await POST(new Request("http://localhost/api/provider/export-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: "export-draft",
          requestId: "export:ws-1:2026-03-27T00:00:00.000Z",
          requestedAt: "2026-03-27T00:00:00.000Z",
          replacementCount: 0,
          redactions: [],
          exportDraft: {
            checklist: [
              {
                label: "Call accountant at (555) 867-5309",
                status: "pending"
              }
            ],
            enginePreview: null
          }
        })
      }));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Provider export draft request contains unredacted direct identifiers.");
    } finally {
      if (originalDeploymentMode === undefined) {
        delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;
      } else {
        process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalDeploymentMode;
      }
    }
  });

  it("export-draft route rejects request containing street address", async () => {
    const originalDeploymentMode = process.env.TAX_ENGINE_DEPLOYMENT_MODE;
    process.env.TAX_ENGINE_DEPLOYMENT_MODE = "self-host";

    try {
      const { POST } = await import("../../../apps/web/src/app/api/provider/export-draft/route");

      const response = await POST(new Request("http://localhost/api/provider/export-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: "export-draft",
          requestId: "export:ws-2:2026-03-27T00:00:00.000Z",
          requestedAt: "2026-03-27T00:00:00.000Z",
          replacementCount: 0,
          redactions: [],
          exportDraft: {
            checklist: [
              {
                label: "Verify business at 123 Main Street Suite 400",
                status: "pending"
              }
            ],
            enginePreview: null
          }
        })
      }));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Provider export draft request contains unredacted direct identifiers.");
    } finally {
      if (originalDeploymentMode === undefined) {
        delete process.env.TAX_ENGINE_DEPLOYMENT_MODE;
      } else {
        process.env.TAX_ENGINE_DEPLOYMENT_MODE = originalDeploymentMode;
      }
    }
  });
});
