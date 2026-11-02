import { describe, expect, it, vi } from "vitest";

import {
  findingTypeLabel,
  normalizeScanResponse,
  requestScan,
} from "./scanApi";

function apiFinding(overrides: Record<string, unknown> = {}) {
  return {
    id: "finding-1",
    file: "src/config.ts",
    line: 3,
    column: 22,
    type: "aws-access-key-id",
    severity: "critical",
    maskedValue: "********",
    valueLength: 20,
    remediation: "Rotate the key and move it to a secrets manager.",
    ...overrides,
  };
}

describe("scan API adapter", () => {
  it("normalizes the backend contract without inventing data", () => {
    const result = normalizeScanResponse(
      {
        files: [
          {
            file: "src/config.ts",
            summary: { findingsCount: 1 },
            findings: [apiFinding()],
          },
          {
            file: "src/clean.ts",
            summary: { findingsCount: 0 },
            findings: [],
          },
        ],
        summary: {
          filesScanned: 2,
          findingsCount: 1,
          bySeverity: { critical: 1, high: 0, medium: 0, low: 0 },
          highestSeverity: "critical",
        },
      },
      18.4
    );

    expect(result.status).toBe("blocked");
    expect(result.summary).toEqual({
      filesScanned: 2,
      findings: 1,
      critical: 1,
      high: 0,
      medium: 0,
      low: 0,
      highestSeverity: "critical",
      durationMs: 18,
    });
    expect(result.findings[0]).toMatchObject({
      id: "finding-1",
      fileName: "src/config.ts",
      line: 3,
      type: "aws-access-key-id",
      severity: "critical",
      maskedValue: "********",
    });
  });

  it("maps a clean response to an allowed commit", () => {
    const result = normalizeScanResponse(
      {
        files: [{ file: "src/clean.ts", findings: [] }],
        summary: {
          filesScanned: 1,
          findingsCount: 0,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
          highestSeverity: null,
        },
      },
      4
    );

    expect(result.status).toBe("clean");
    expect(result.summary.findings).toBe(0);
    expect(result.summary.highestSeverity).toBeNull();
    expect(result.findings).toEqual([]);
  });

  it("rejects an unexpected response instead of showing fake success", () => {
    expect(() => normalizeScanResponse({ files: "nope" })).toThrow(
      "unexpected response"
    );
    expect(() =>
      normalizeScanResponse({ files: [{ file: "x.ts", findings: "nope" }] })
    ).toThrow("unexpected response");
  });

  it("sends every file and uses a safe error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "SCAN_FAILED", message: "The scan could not be completed." },
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      )
    );

    await expect(
      requestScan(
        [
          { fileName: "a.ts", content: "const a = 1;" },
          { fileName: "b.ts", content: "const b = 2;" },
        ],
        fetchMock as unknown as typeof fetch
      )
    ).rejects.toThrow("The scan could not be completed.");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      files: [
        { filename: "a.ts", content: "const a = 1;" },
        { filename: "b.ts", content: "const b = 2;" },
      ],
    });
  });

  it("labels known detector ids and leaves unknown ids intact", () => {
    expect(findingTypeLabel("aws-access-key-id")).toBe("AWS access key");
    expect(findingTypeLabel("custom-rule")).toBe("custom-rule");
  });
});
