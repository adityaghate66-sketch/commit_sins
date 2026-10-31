export type Severity = "critical" | "high" | "medium" | "low";

export type ScanFinding = {
  id: string;
  fileName: string;
  line: number;
  type: string;
  severity: Severity;
  maskedValue: string;
  remediation: string;
};

export type ScanResult = {
  status: "clean" | "blocked";
  summary: {
    filesScanned: number;
    findings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    durationMs: number;
  };
  findings: ScanFinding[];
};

type Detector = {
  type: string;
  severity: Severity;
  pattern: RegExp;
  remediation: string;
};

const detectors: Detector[] = [
  {
    type: "AWS access key",
    severity: "critical",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    remediation: "Revoke the key, rotate the credential, and load it from the runtime secret store.",
  },
  {
    type: "GitHub token",
    severity: "high",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
    remediation: "Revoke the token in GitHub settings and replace it with an environment reference.",
  },
  {
    type: "Slack token",
    severity: "high",
    pattern: /\bxox[baprs]-[0-9]{6,}-[0-9]{6,}-[A-Za-z0-9-]{12,}\b/g,
    remediation: "Rotate the Slack token and move it to a protected CI or deployment secret.",
  },
  {
    type: "Private key header",
    severity: "critical",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    remediation: "Remove the private key from source control and rotate the associated identity.",
  },
  {
    type: "Hardcoded password",
    severity: "high",
    pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*["']([^"']{8,})["']/gi,
    remediation: "Replace the literal with a secret-manager lookup and invalidate the exposed password.",
  },
  {
    type: "Generic API key",
    severity: "medium",
    pattern: /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*["']([A-Za-z0-9_\-/+=]{12,})["']/gi,
    remediation: "Move the value to an environment variable and keep the secret out of Git history.",
  },
];

function shannonEntropy(value: string): number {
  if (!value) return 0;
  const frequencies = new Map<string, number>();
  for (const character of value) {
    frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  }

  return Array.from(frequencies.values()).reduce((entropy, count) => {
    const probability = count / value.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

function mask(value: string): string {
  if (value.length <= 7) return "••••••";
  const visibleStart = value.slice(0, 3);
  const visibleEnd = value.slice(-2);
  const hiddenLength = Math.min(10, Math.max(5, value.length - 5));
  return `${visibleStart}${"•".repeat(hiddenLength)}${visibleEnd}`;
}

function lineForIndex(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function entropyCandidates(content: string): Array<{ value: string; index: number }> {
  const candidates: Array<{ value: string; index: number }> = [];
  const candidatePattern = /\b[A-Za-z0-9_\-/+=]{24,}\b/g;
  let match: RegExpExecArray | null;

  while ((match = candidatePattern.exec(content)) !== null) {
    const value = match[0];
    const diversity = new Set(value).size;
    const entropy = shannonEntropy(value);
    if (diversity >= 12 && entropy >= 4.2) {
      candidates.push({ value, index: match.index });
    }
  }

  return candidates;
}

export function scanFiles(files: Array<{ fileName: string; content: string }>): ScanResult {
  const startedAt = Date.now();
  const findings: ScanFinding[] = [];

  files.forEach(file => {
    const seen = new Set<string>();

    detectors.forEach(detector => {
      detector.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = detector.pattern.exec(file.content)) !== null) {
        const value = match[1] ?? match[0];
        const index = match.index + (match[1] ? match[0].indexOf(value) : 0);
        const key = `${index}:${detector.type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          id: `${file.fileName}-${index}-${detector.type}`,
          fileName: file.fileName,
          line: lineForIndex(file.content, index),
          type: detector.type,
          severity: detector.severity,
          maskedValue: mask(value),
          remediation: detector.remediation,
        });
      }
    });

    entropyCandidates(file.content).forEach(candidate => {
      const overlapping = findings.some(
        finding => finding.fileName === file.fileName && finding.line === lineForIndex(file.content, candidate.index) && finding.maskedValue.includes(candidate.value.slice(0, 3)),
      );
      if (overlapping) return;
      findings.push({
        id: `${file.fileName}-${candidate.index}-entropy`,
        fileName: file.fileName,
        line: lineForIndex(file.content, candidate.index),
        type: "High-entropy string",
        severity: "medium",
        maskedValue: mask(candidate.value),
        remediation: "Verify the value is not a credential. If it is, rotate it and load it from a secret store.",
      });
    });
  });

  const counts = findings.reduce(
    (total, finding) => {
      total[finding.severity] += 1;
      return total;
    },
    { critical: 0, high: 0, medium: 0, low: 0 } as Record<Severity, number>,
  );

  return {
    status: findings.length > 0 ? "blocked" : "clean",
    summary: {
      filesScanned: files.length,
      findings: findings.length,
      ...counts,
      durationMs: Math.max(8, Date.now() - startedAt),
    },
    findings: findings.sort((a, b) => a.line - b.line),
  };
}
