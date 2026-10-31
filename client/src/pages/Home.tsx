import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Code2,
  ExternalLink,
  FileCode2,
  Files,
  Github,
  GitPullRequest,
  KeyRound,
  LockKeyhole,
  Menu,
  Play,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  TerminalSquare,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Severity = "critical" | "high" | "medium" | "low";
type Finding = {
  id: string;
  fileName: string;
  line: number;
  type: string;
  severity: Severity;
  maskedValue: string;
  remediation: string;
};
type ScanResult = {
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
  findings: Finding[];
};
type Sample = {
  name: string;
  language: string;
  content: string;
  state: "blocked" | "clean";
};

type NavItem = { label: string; icon: typeof ScanLine; target: string };

const samples: Sample[] = [
  {
    name: "config.ts",
    language: "TypeScript",
    state: "blocked",
    content: `export const cloud = {
  region: "us-east-1",
  accessKeyId: "AKIAZZZZZZZZZZZZZZZZ",
  apiKey: "sk_test_COMMIT_SINS_DEMO_123456789",
  endpoint: "https://api.internal.local",
};

export default cloud;`,
  },
  {
    name: "deploy.yml",
    language: "YAML",
    state: "blocked",
    content: `name: release
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      GITHUB_TOKEN: "ghp_SYNTHETIC_NOT_A_REAL_TOKEN_1234567890"
      password: "demo-only-password-rotate-me"
    steps:
      - uses: actions/checkout@v4`,
  },
  {
    name: "healthcheck.ts",
    language: "TypeScript",
    state: "clean",
    content: `export async function healthcheck() {
  const response = await fetch(process.env.HEALTH_URL!);
  return { ok: response.ok, checkedAt: Date.now() };
}

export const runtime = {
  region: process.env.RUNTIME_REGION,
};`,
  },
];

const demoFindings: Finding[] = [
  {
    id: "demo-1",
    fileName: "config.ts",
    line: 3,
    type: "AWS access key",
    severity: "critical",
    maskedValue: "AKI••••••••••••ZZ",
    remediation:
      "Revoke the key, rotate the credential, and load it from the runtime secret store.",
  },
  {
    id: "demo-2",
    fileName: "config.ts",
    line: 4,
    type: "Generic API key",
    severity: "medium",
    maskedValue: "sk_••••••••••••••••89",
    remediation:
      "Move the value to an environment variable and keep the secret out of Git history.",
  },
];

const cleanResult = (durationMs = 11): ScanResult => ({
  status: "clean",
  summary: {
    filesScanned: 1,
    findings: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    durationMs,
  },
  findings: [],
});

const demoResult: ScanResult = {
  status: "blocked",
  summary: {
    filesScanned: 1,
    findings: 2,
    critical: 1,
    high: 0,
    medium: 1,
    low: 0,
    durationMs: 18,
  },
  findings: demoFindings,
};

const navItems: NavItem[] = [
  { label: "Scan workspace", icon: ScanLine, target: "scan-workspace" },
  { label: "Detection rules", icon: KeyRound, target: "detection-rules" },
  { label: "Git protection", icon: GitPullRequest, target: "git-protection" },
  {
    label: "Secure by default",
    icon: ShieldCheck,
    target: "secure-by-default",
  },
];

function severityLabel(severity: Severity) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function statusCopy(result: ScanResult) {
  return result.status === "blocked" ? "Commit blocked" : "Commit allowed";
}

export default function Home() {
  const [selectedSample, setSelectedSample] = useState<Sample>(samples[0]);
  const [content, setContent] = useState(samples[0].content);
  const [scanResult, setScanResult] = useState<ScanResult>(demoResult);
  const [scanState, setScanState] = useState<
    "idle" | "scanning" | "complete" | "error"
  >("complete");
  const [error, setError] = useState("");
  const [activeNav, setActiveNav] = useState("Scan workspace");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [lastScan, setLastScan] = useState("2m ago");
  const fileInput = useRef<HTMLInputElement>(null);

  const lines = useMemo(() => content.split("\n"), [content]);
  const findingLines = useMemo(
    () => new Set(scanResult.findings.map(finding => finding.line)),
    [scanResult.findings]
  );

  const jumpTo = (item: NavItem) => {
    setActiveNav(item.label);
    setMobileNavOpen(false);
    document
      .getElementById(item.target)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const chooseSample = (sample: Sample) => {
    setSelectedSample(sample);
    setContent(sample.content);
    setScanResult(sample.state === "blocked" ? demoResult : cleanResult());
    setScanState("complete");
    setError("");
  };

  const runScan = async () => {
    if (!content.trim()) {
      setError("Add some code before scanning.");
      setScanState("error");
      return;
    }
    setScanState("scanning");
    setError("");
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ fileName: selectedSample.name, content }],
        }),
      });
      const payload = (await response.json()) as ScanResult & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "The scan could not complete.");
      setScanResult(payload);
      setScanState("complete");
      setLastScan("just now");
      toast.success(
        payload.status === "blocked"
          ? "Scan complete — commit blocked"
          : "Scan complete — safe to commit"
      );
    } catch (scanError) {
      setScanState("error");
      setError(
        scanError instanceof Error
          ? scanError.message
          : "The scan could not complete."
      );
      toast.error("Scan failed. Nothing was changed.");
    }
  };

  const handleFileUpload = async (file?: File) => {
    if (!file) return;
    if (file.size > 250_000) {
      setError("That file is larger than the 250 KB scan limit.");
      setScanState("error");
      return;
    }
    try {
      const text = await file.text();
      const uploaded: Sample = {
        name: file.name,
        language: "Uploaded file",
        content: text,
        state: "blocked",
      };
      setSelectedSample(uploaded);
      setContent(text);
      setScanResult(cleanResult(0));
      setScanState("idle");
      setError("");
      toast.success(`${file.name} loaded. Run a scan when ready.`);
    } catch {
      setError("This file could not be read in the browser.");
      setScanState("error");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void runScan();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span>S</span>
          </div>
          <div>
            <strong>COMMIT SINS</strong>
            <span>DEVELOPER SECURITY</span>
          </div>
          <button
            type="button"
            className="mobile-menu-button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switcher">
          <span className="eyebrow">WORKSPACE</span>
          <button
            type="button"
            className="workspace-button"
            aria-expanded={workspaceOpen}
            onClick={() => setWorkspaceOpen(open => !open)}
          >
            <span className="workspace-dot" /> main{" "}
            <ChevronDown
              size={14}
              className={workspaceOpen ? "rotate-icon" : ""}
            />
          </button>
          {workspaceOpen && (
            <div className="workspace-menu">
              <button
                type="button"
                className="workspace-option active"
                onClick={() => setWorkspaceOpen(false)}
              >
                <span className="workspace-dot" /> main <Check size={13} />
              </button>
              <button
                type="button"
                className="workspace-option"
                onClick={() => {
                  setWorkspaceOpen(false);
                  toast.info(
                    "A new workspace can be connected from project settings."
                  );
                }}
              >
                <span className="workspace-dot muted-dot" /> connect workspace{" "}
                <ExternalLink size={12} />
              </button>
            </div>
          )}
        </div>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeNav === item.label;
            return (
              <button
                key={item.label}
                type="button"
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => jumpTo(item)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {isActive && <span className="nav-active-dot" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="engine-status">
            <span className="status-pulse" />
            <div>
              <span>ENGINE ONLINE</span>
              <small>Ruleset 0.8.4 · local</small>
            </div>
          </div>
          <div className="sidebar-links">
            <button
              type="button"
              onClick={() => {
                jumpTo(navItems[1]);
                toast.info(
                  "Detection rules are listed below the protection loop."
                );
              }}
            >
              <CircleHelp size={15} /> Docs <ArrowUpRight size={13} />
            </button>
            <button
              type="button"
              onClick={() =>
                toast.info(
                  "Connect your repository from the Git protection checkpoint."
                )
              }
            >
              <Github size={15} /> GitHub <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="profile-chip">
            <div className="avatar">JD</div>
            <div>
              <strong>Jordan Dev</strong>
              <span>Security owner</span>
            </div>
            <ChevronRight size={14} />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              type="button"
              className="mobile-menu-button top-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu size={19} />
            </button>
            <span>REPOSITORIES</span>
            <ChevronRight size={13} />
            <strong>COMMIT-SINS-APP</strong>
          </div>
          <div className="topbar-actions">
            <span className="last-scan">
              <span className="mini-dot" /> Last scan {lastScan}
            </span>
            <button
              type="button"
              className={`icon-button ${scanState === "scanning" ? "spinning" : ""}`}
              aria-label="Run scan again"
              title="Run scan again"
              onClick={() => void runScan()}
              disabled={scanState === "scanning"}
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              className="help-button"
              onClick={() => setShowHelp(true)}
            >
              <CircleHelp size={16} /> Help
            </button>
          </div>
        </header>

        <section className="page-intro">
          <div>
            <span className="section-kicker">
              <span className="kicker-line" /> PRE-COMMIT SECURITY
            </span>
            <h1>
              Catch secrets before
              <br />
              <em>they become incidents.</em>
            </h1>
            <p>
              Scan staged code, stop exposed credentials, and keep the commit
              history clean.
            </p>
          </div>
          <div className="intro-note">
            <LockKeyhole size={16} />
            <span>
              Raw secrets never leave
              <br />
              your scan boundary.
            </span>
          </div>
        </section>

        <section className="metrics-strip" aria-label="Security posture">
          <div className="metric">
            <span className="metric-icon lime">
              <ShieldCheck size={16} />
            </span>
            <div>
              <strong>0</strong>
              <span>raw secrets returned</span>
            </div>
          </div>
          <div className="metric">
            <span className="metric-icon blue">
              <Zap size={16} />
            </span>
            <div>
              <strong>7</strong>
              <span>detector classes</span>
            </div>
          </div>
          <div className="metric">
            <span className="metric-icon amber">
              <TerminalSquare size={16} />
            </span>
            <div>
              <strong>fail closed</strong>
              <span>when scanning breaks</span>
            </div>
          </div>
          <div className="metrics-rule" />
          <span className="metrics-caption">
            PROTECTION IS ACTIVE
            <br />
            <strong>FOR EVERY COMMIT</strong>
          </span>
        </section>

        <section className="scan-layout" id="scan-workspace">
          <div className="panel editor-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-index">01</span>
                <div>
                  <h2>Scan workspace</h2>
                  <p>Inspect the code that is about to be committed.</p>
                </div>
              </div>
              <div className="file-count">
                <Files size={15} /> 1 file
              </div>
            </div>
            <div className="sample-tabs">
              <div className="sample-tabs-label">
                <span className="eyebrow">SAMPLE FILES</span>
                <span className="sample-hint">safe synthetic fixtures</span>
              </div>
              <div className="sample-buttons">
                {samples.map(sample => (
                  <button
                    type="button"
                    key={sample.name}
                    className={`sample-button ${selectedSample.name === sample.name ? "active" : ""}`}
                    onClick={() => chooseSample(sample)}
                  >
                    <FileCode2 size={14} />
                    {sample.name}
                    {sample.state === "blocked" && (
                      <span className="sample-alert" />
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  className="upload-button"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={14} /> upload
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept=".js,.ts,.tsx,.jsx,.json,.yml,.yaml,.env,.txt"
                  onChange={event =>
                    void handleFileUpload(event.target.files?.[0])
                  }
                />
              </div>
            </div>
            <div className="editor-wrap">
              <div className="editor-toolbar">
                <div className="editor-file">
                  <span className="file-status-dot" />
                  {selectedSample.name}
                  <span className="editor-language">
                    {selectedSample.language}
                  </span>
                </div>
                <span className="editor-meta">
                  {lines.length} lines · staged
                </span>
              </div>
              <div className="code-editor">
                <div className="line-numbers" aria-hidden="true">
                  {lines.map((_, index) => (
                    <span
                      key={index}
                      className={findingLines.has(index + 1) ? "flagged" : ""}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  ))}
                </div>
                <textarea
                  aria-label="Code to scan"
                  value={content}
                  onChange={event => {
                    setContent(event.target.value);
                    setScanState("idle");
                  }}
                  onKeyDown={event => {
                    if (
                      (event.metaKey || event.ctrlKey) &&
                      event.key === "Enter"
                    ) {
                      event.preventDefault();
                      void runScan();
                    }
                  }}
                  spellCheck={false}
                />
              </div>
            </div>
            <div className="editor-footer">
              <span>
                <span className="footer-dot" /> staged content only
              </span>
              <span className="shortcut">
                <kbd>⌘</kbd>
                <kbd>↵</kbd> to scan
              </span>
              <button
                type="button"
                className="scan-button"
                onClick={() => void runScan()}
                disabled={scanState === "scanning"}
              >
                {scanState === "scanning" ? (
                  <>
                    <span className="button-spinner" /> scanning…
                  </>
                ) : (
                  <>
                    <Play size={15} fill="currentColor" /> scan staged content
                  </>
                )}
              </button>
            </div>
            {error && (
              <div className="inline-error">
                <AlertTriangle size={15} />
                {error}
              </div>
            )}
          </div>

          <div
            className={`panel result-panel ${scanState === "scanning" ? "is-scanning" : ""}`}
          >
            <div className="panel-heading result-heading">
              <div>
                <span className="panel-index">02</span>
                <div>
                  <h2>Scan verdict</h2>
                  <p>Would this commit be allowed?</p>
                </div>
              </div>
              <span className={`verdict-badge ${scanResult.status}`}>
                <span /> {statusCopy(scanResult)}
              </span>
            </div>
            <div className={`verdict-card ${scanResult.status}`}>
              <div className="verdict-icon">
                {scanResult.status === "blocked" ? (
                  <X size={22} />
                ) : (
                  <Check size={22} />
                )}
              </div>
              <div>
                <strong>
                  {scanResult.status === "blocked"
                    ? "Unsafe code detected"
                    : "No secrets detected"}
                </strong>
                <span>
                  {scanResult.status === "blocked"
                    ? "Fix the findings below before committing."
                    : "This staged content is clear to commit."}
                </span>
              </div>
              <span className="verdict-arrow">
                <ArrowUpRight size={18} />
              </span>
            </div>
            <div className="result-stats">
              <div>
                <strong>{scanResult.summary.findings}</strong>
                <span>findings</span>
              </div>
              <div>
                <strong className="critical-text">
                  {scanResult.summary.critical}
                </strong>
                <span>critical</span>
              </div>
              <div>
                <strong className="high-text">{scanResult.summary.high}</strong>
                <span>high</span>
              </div>
              <div>
                <strong className="medium-text">
                  {scanResult.summary.medium}
                </strong>
                <span>medium</span>
              </div>
            </div>
            <div className="findings-header">
              <span>
                FINDINGS <b>{scanResult.summary.findings}</b>
              </span>
              <span>{scanResult.summary.durationMs}ms</span>
            </div>
            <div className="findings-list">
              {scanResult.findings.length === 0 ? (
                <div className="empty-findings">
                  <ShieldCheck size={20} />
                  <strong>Clean surface</strong>
                  <span>
                    No credential patterns or suspicious strings were found.
                  </span>
                </div>
              ) : (
                scanResult.findings.map(finding => (
                  <article className="finding" key={finding.id}>
                    <div className={`severity-bar ${finding.severity}`} />
                    <div className="finding-main">
                      <div className="finding-top">
                        <span className={`severity-pill ${finding.severity}`}>
                          {severityLabel(finding.severity)}
                        </span>
                        <span className="finding-type">{finding.type}</span>
                        <span className="finding-location">
                          {finding.fileName}:{finding.line}
                        </span>
                      </div>
                      <div className="masked-value">
                        <span>masked</span>
                        <code>{finding.maskedValue}</code>
                        <button
                          type="button"
                          aria-label="Copy masked value"
                          title="Copy masked value"
                          onClick={() => {
                            void navigator.clipboard?.writeText(
                              finding.maskedValue
                            );
                            toast.success("Masked value copied");
                          }}
                        >
                          <Clipboard size={13} />
                        </button>
                      </div>
                      <p>{finding.remediation}</p>
                    </div>
                  </article>
                ))
              )}
            </div>
            <div className="result-note">
              <LockKeyhole size={14} />
              <span>Values are masked at detection. Nothing is stored.</span>
            </div>
          </div>
        </section>

        <section className="workflow-section" id="git-protection">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker">
                <span className="kicker-line" /> THE PROTECTION LOOP
              </span>
              <h2>One engine. Three checkpoints.</h2>
            </div>
            <span className="section-side-note">
              same rules · same verdict · every surface
            </span>
          </div>
          <div className="workflow-grid">
            <article className="workflow-card active-card">
              <div className="workflow-number">01</div>
              <div className="workflow-icon">
                <TerminalSquare size={19} />
              </div>
              <h3>Pre-commit hook</h3>
              <p>
                Scan the staged version of every file before Git writes history.
                Unsafe commits stop locally.
              </p>
              <div className="command-snippet">
                <span>$</span> git commit <b>→ blocked</b>
              </div>
              <span className="card-status">
                <span /> active checkpoint
              </span>
            </article>
            <article className="workflow-card">
              <div className="workflow-number">02</div>
              <div className="workflow-icon">
                <GitPullRequest size={19} />
              </div>
              <h3>Pull request CI</h3>
              <p>
                Reuse the detection engine in GitHub Actions. Findings fail the
                check before review.
              </p>
              <div className="command-snippet">
                <span>CI</span> secrets-scan.yml <b>→ fail</b>
              </div>
              <span className="card-status muted">
                <span /> ready to connect
              </span>
            </article>
            <article className="workflow-card">
              <div className="workflow-number">03</div>
              <div className="workflow-icon">
                <ShieldCheck size={19} />
              </div>
              <h3>Developer feedback</h3>
              <p>
                Show the exact line, masked value, severity, and the safest next
                move.
              </p>
              <div className="command-snippet">
                <span>↳</span> rotate + retry <b>→ pass</b>
              </div>
              <span className="card-status muted">
                <span /> always actionable
              </span>
            </article>
          </div>
        </section>

        <section className="rules-section" id="detection-rules">
          <div className="rules-copy">
            <span className="section-kicker">
              <span className="kicker-line" /> DETECTION SURFACE
            </span>
            <h2>Not just a regex demo.</h2>
            <p>
              Known credential patterns catch the obvious. Entropy analysis
              catches what does not have a name yet. Together, they make the gap
              between “looks fine” and “is safe” visible.
            </p>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setActiveNav("Detection rules");
                toast.info(
                  "Rules are active for every scan in this workspace."
                );
              }}
            >
              view detection rules <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="rules-list">
            <div>
              <span className="rule-key">01</span>
              <strong>Credentials</strong>
              <span>AWS · GitHub · Slack · API keys</span>
            </div>
            <div>
              <span className="rule-key">02</span>
              <strong>Identity material</strong>
              <span>private keys · passwords · tokens</span>
            </div>
            <div>
              <span className="rule-key">03</span>
              <strong>Unknown unknowns</strong>
              <span>high-entropy strings · false-positive control</span>
            </div>
          </div>
        </section>
        <section className="secure-default-section" id="secure-by-default">
          <div className="secure-default-copy">
            <span className="section-kicker">
              <span className="kicker-line" /> SECURE BY DEFAULT
            </span>
            <h2>Safe feedback, not scary alerts.</h2>
            <p>
              Every result is actionable: a precise location, a masked preview,
              and a rotation-first next step. The engine never returns raw
              secret values.
            </p>
          </div>
          <div className="secure-points">
            <span>
              <Check size={14} /> mask at detection
            </span>
            <span>
              <Check size={14} /> fail closed on errors
            </span>
            <span>
              <Check size={14} /> keep scans in memory
            </span>
          </div>
        </section>
        <footer className="footer">
          <span>
            COMMIT SINS <i>·</i> security that stops the mistake
          </span>
          <span>
            v0.8.4 <i>·</i> built for developers
          </span>
        </footer>
      </main>

      {showHelp && (
        <div
          className="help-overlay"
          role="presentation"
          onClick={() => setShowHelp(false)}
        >
          <section
            className="help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              className="dialog-close"
              aria-label="Close help"
              onClick={() => setShowHelp(false)}
            >
              <X size={17} />
            </button>
            <span className="section-kicker">
              <span className="kicker-line" /> QUICK GUIDE
            </span>
            <h2 id="help-title">Scan with confidence.</h2>
            <p>
              Choose a safe fixture or upload a source file, review the masked
              findings, then fix and scan again. Your content is sent only to
              the local scan endpoint for the duration of the request.
            </p>
            <div className="help-steps">
              <span>
                <b>01</b> Pick a file
              </span>
              <span>
                <b>02</b> Scan staged content
              </span>
              <span>
                <b>03</b> Resolve and retry
              </span>
            </div>
            <button
              type="button"
              className="scan-button dialog-action"
              onClick={() => {
                setShowHelp(false);
                jumpTo(navItems[0]);
              }}
            >
              open scan workspace <ArrowUpRight size={14} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
