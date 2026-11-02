export type Severity = "critical" | "high" | "medium" | "low";

export type ScanFinding = {
  id: string;
  fileName: string;
  line: number;
  column: number;
  type: string;
  severity: Severity;
  maskedValue: string;
  valueLength: number;
  remediation: string;
};

export type ScanSummary = {
  filesScanned: number;
  findings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  highestSeverity: Severity | null;
  durationMs: number;
};

export type ScanResult = {
  status: "clean" | "blocked";
  summary: ScanSummary;
  findings: ScanFinding[];
};

export type ScanFileInput = {
  fileName: string;
  content: string;
};

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

const FINDING_TYPE_LABELS: Record<string, string> = {
  "aws-access-key-id": "AWS access key",
  "github-token": "GitHub token",
  "slack-token": "Slack token",
  "generic-api-key": "Generic API key",
  "password-assignment": "Hardcoded password",
  "private-key-header": "Private key",
  "high-entropy-string": "High-entropy string",
};

/** Friendly label for a stable detector id, falling back to the id itself. */
export function findingTypeLabel(type: string): string {
  return FINDING_TYPE_LABELS[type] ?? type;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function isSeverity(value: unknown): value is Severity {
  return (
    typeof value === "string" &&
    (SEVERITY_ORDER as string[]).includes(value)
  );
}

function highestOf(findings: ScanFinding[]): Severity | null {
  return (
    SEVERITY_ORDER.find(severity =>
      findings.some(finding => finding.severity === severity)
    ) ?? null
  );
}

function messageFromError(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error)) {
    const message = payload.error.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return "The scan could not complete.";
}

/**
 * Convert the backend's `{ files, summary }` contract into the dashboard's
 * flatter shape.
 *
 * The backend is the source of truth for every count. This adapter only
 * reshapes records and derives the verdict; it never invents findings or
 * exposes a value that the scanner did not already mask.
 */
export function normalizeScanResponse(
  payload: unknown,
  durationMs = 0
): ScanResult {
  if (!isRecord(payload) || !Array.isArray(payload.files)) {
    throw new Error("The scan service returned an unexpected response.");
  }

  const findings: ScanFinding[] = [];

  for (const fileResult of payload.files) {
    if (!isRecord(fileResult) || !Array.isArray(fileResult.findings)) {
      throw new Error("The scan service returned an unexpected response.");
    }

    const fallbackFile = asString(fileResult.file, "<unknown>");

    for (const rawFinding of fileResult.findings) {
      if (!isRecord(rawFinding)) {
        throw new Error("The scan service returned an unexpected response.");
      }

      findings.push({
        id: asString(
          rawFinding.id,
          `${fallbackFile}:${asCount(rawFinding.line)}:${findings.length}`
        ),
        fileName: asString(rawFinding.file, fallbackFile),
        line: asCount(rawFinding.line),
        column: asCount(rawFinding.column),
        type: asString(rawFinding.type, "unknown"),
        severity: isSeverity(rawFinding.severity)
          ? rawFinding.severity
          : "medium",
        maskedValue: asString(rawFinding.maskedValue),
        valueLength: asCount(rawFinding.valueLength),
        remediation: asString(rawFinding.remediation),
      });
    }
  }

  const apiSummary = isRecord(payload.summary) ? payload.summary : {};
  const bySeverity = isRecord(apiSummary.bySeverity)
    ? apiSummary.bySeverity
    : {};

  const countFor = (severity: Severity) => {
    const reported = asCount(bySeverity[severity]);
    return reported || findings.filter(item => item.severity === severity).length;
  };

  const highestSeverity = isSeverity(apiSummary.highestSeverity)
    ? apiSummary.highestSeverity
    : highestOf(findings);

  return {
    status: findings.length > 0 ? "blocked" : "clean",
    summary: {
      filesScanned: asCount(apiSummary.filesScanned) || payload.files.length,
      findings: findings.length,
      critical: countFor("critical"),
      high: countFor("high"),
      medium: countFor("medium"),
      low: countFor("low"),
      highestSeverity,
      durationMs: Math.max(0, Math.round(durationMs)),
    },
    findings,
  };
}

/**
 * Send one scan request for any number of files and normalize the response.
 *
 * Errors use short, safe messages. Response bodies are never echoed into the
 * UI, so an unexpected server failure cannot surface submitted content.
 */
export async function requestScan(
  files: ScanFileInput[],
  fetchImpl: typeof fetch = fetch
): Promise<ScanResult> {
  if (files.length === 0) {
    throw new Error("Add at least one file before scanning.");
  }

  const startedAt = performance.now();
  const payloadFiles = files.map(file => ({
    filename: file.fileName,
    content: file.content,
  }));
  let response: Response;

  try {
    response = await fetchImpl("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: payloadFiles }),
    });
  } catch {
    throw new Error(
      "The scan service is unreachable. Start it with pnpm dev:api and try again."
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The scan service returned an unreadable response.");
  }

  if (!response.ok) {
    throw new Error(messageFromError(payload));
  }

  return normalizeScanResponse(payload, performance.now() - startedAt);
}
