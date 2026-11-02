import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clipboard,
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

import {
  findingTypeLabel,
  requestScan,
  type ScanResult,
  type Severity,
} from "@/lib/scanApi";

type Sample = {
  name: string;
  language: string;
  content: string;
  state: "blocked" | "clean";
};

type FileEntry = {
  id: string;
  name: string;
  language: string;
  content: string;
};

type ScanState = "idle" | "scanning" | "complete" | "error";

type NavItem = { label: string; icon: typeof ScanLine; target: string };

const MAX_FILES = 100;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 5_000_000;

/**
 * Sample credentials are assembled at runtime.
 *
 * Keeping the fragments separate means this dashboard file itself can be
 * scanned by the pre-commit hook without reporting its own demo fixtures.
 */
const sampleAwsKey = ["AKIA", "ZZZZ", "ZZZZ", "ZZZZ", "ZZZZ"].join("");
const sampleGenericKey = [
  "sk_",
  "test_",
  "commit_",
  "sins_demo_",
  "123456789",
].join("");
const sampleGithubToken = [
  "ghp_",
  "Ab3Kx9",
  "Qm2Wp7",
  "Zt4Nv8",
  "Rc5Hd1",
  "Ls6Jy3",
  "Bf0Gu4",
].join("");
const samplePassword = ["Relay", "_", "rotate", "_", "this", "_", "now"].join(
  ""
);

const samples: Sample[] = [
  {
    name: "config.ts",
    language: "TypeScript",
    state: "blocked",
    content: `export const cloud = {
  region: "us-east-1",
  accessKeyId: "${sampleAwsKey}",
  apiKey: "${sampleGenericKey}",
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
      GITHUB_TOKEN: "${sampleGithubToken}"
      password: "${samplePassword}"
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

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  cjs: "JavaScript",
  css: "CSS",
  env: "Environment",
  go: "Go",
  html: "HTML",
  js: "JavaScript",
  json: "JSON",
  jsx: "JavaScript",
  md: "Markdown",
  py: "Python",
  rb: "Ruby",
  rs: "Rust",
  sh: "Shell",
  sql: "SQL",
  toml: "TOML",
  ts: "TypeScript",
  tsx: "TypeScript",
  txt: "Text",
  yaml: "YAML",
  yml: "YAML",
};

function languageFor(name: string): string {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  return LANGUAGE_BY_EXTENSION[extension] ?? "Text";
}

function newFileId(name: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${name}:${suffix}`;
}

function fileFromSample(sample: Sample): FileEntry {
  return {
    id: `sample:${sample.name}`,
    name: sample.name,
    language: sample.language,
    content: sample.content,
  };
}

const initialFile = fileFromSample(samples[0]);


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
  const [files, setFiles] = useState<FileEntry[]>([initialFile]);
  const [activeFileId, setActiveFileId] = useState(initialFile.id);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [error, setError] = useState("");
  const [activeNav, setActiveNav] = useState("Scan workspace");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [lastScan, setLastScan] = useState("not yet");
  const fileInput = useRef<HTMLInputElement>(null);
  const scanRequestId = useRef(0);

  const activeFile =
    files.find(file => file.id === activeFileId) ?? files[0] ?? null;
  const lines = useMemo(
    () => activeFile?.content.split("\n") ?? [""],
    [activeFile?.content]
  );
  const findingLines = useMemo(() => {
    if (!scanResult || !activeFile) return new Set<number>();
    return new Set(
      scanResult.findings
        .filter(finding => finding.fileName === activeFile.name)
        .map(finding => finding.line)
    );
  }, [scanResult, activeFile]);

  const invalidateScan = () => {
    scanRequestId.current += 1;
    setScanResult(null);
    setScanState("idle");
    setError("");
  };

  const jumpTo = (item: NavItem) => {
    setActiveNav(item.label);
    setMobileNavOpen(false);
    document
      .getElementById(item.target)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const chooseSample = (sample: Sample) => {
    const sampleFile = fileFromSample(sample);
    setFiles(current =>
      current.some(file => file.id === sampleFile.id)
        ? current
        : [...current, sampleFile]
    );
    setActiveFileId(sampleFile.id);
    invalidateScan();
  };

  const updateActiveContent = (value: string) => {
    if (!activeFile) return;
    setFiles(current =>
      current.map(file =>
        file.id === activeFile.id ? { ...file, content: value } : file
      )
    );
    invalidateScan();
  };

  const runScan = async () => {
    if (files.length === 0) {
      setError("Add at least one file before scanning.");
      setScanState("error");
      return;
    }

    if (files.length > MAX_FILES) {
      setError(`The workspace supports at most ${MAX_FILES} files per scan.`);
      setScanState("error");
      return;
    }

    const oversized = files.find(
      file => new TextEncoder().encode(file.content).length > MAX_FILE_BYTES
    );
    if (oversized) {
      setError(`${oversized.name} is larger than the 1 MB per-file limit.`);
      setScanState("error");
      return;
    }

    const totalBytes = files.reduce(
      (total, file) => total + new TextEncoder().encode(file.content).length,
      0
    );
    if (totalBytes > MAX_TOTAL_BYTES) {
      setError("The selection is larger than the 5 MB per-scan limit.");
      setScanState("error");
      return;
    }

    const requestId = ++scanRequestId.current;
    setScanState("scanning");
    setError("");

    try {
      const result = await requestScan(
        files.map(file => ({ fileName: file.name, content: file.content }))
      );
      if (requestId !== scanRequestId.current) return;

      setScanResult(result);
      setScanState("complete");
      setLastScan("just now");
      toast.success(
        result.status === "blocked"
          ? "Scan complete — commit blocked"
          : "Scan complete — safe to commit"
      );
    } catch (scanError) {
      if (requestId !== scanRequestId.current) return;

      setScanState("error");
      setError(
        scanError instanceof Error
          ? scanError.message
          : "The scan could not complete."
      );
      toast.error("Scan failed. Nothing was changed.");
    }
  };

  const handleFileUpload = async (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;

    const incoming = Array.from(selected);
    const oversized = incoming.filter(file => file.size > MAX_FILE_BYTES);
    const readable = incoming.filter(file => file.size <= MAX_FILE_BYTES);

    if (readable.length === 0) {
      setError(
        `Every selected file is larger than the 1 MB per-file limit (${oversized.length}).`
      );
      setScanState("error");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }

    const settled = await Promise.allSettled(
      readable.map(async file => ({ file, content: await file.text() }))
    );
    const loaded = settled
      .filter(
        (
          item
        ): item is PromiseFulfilledResult<{ file: File; content: string }> =>
          item.status === "fulfilled"
      )
      .map(item => item.value);
    const failed = settled.length - loaded.length;

    if (loaded.length === 0) {
      setError("The selected files could not be read in the browser.");
      setScanState("error");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }

    const nextFiles = [...files];
    let focusId = "";
    let skipped = 0;

    for (const item of loaded) {
      const index = nextFiles.findIndex(file => file.name === item.file.name);

      if (index >= 0) {
        nextFiles[index] = {
          ...nextFiles[index],
          language: languageFor(item.file.name),
          content: item.content,
        };
        focusId = focusId || nextFiles[index].id;
        continue;
      }

      if (nextFiles.length >= MAX_FILES) {
        skipped += 1;
        continue;
      }

      const entry: FileEntry = {
        id: newFileId(item.file.name),
        name: item.file.name,
        language: languageFor(item.file.name),
        content: item.content,
      };
      nextFiles.push(entry);
      focusId = focusId || entry.id;
    }

    const notes: string[] = [];
    if (oversized.length > 0) {
      notes.push(
        `${oversized.length} file${oversized.length === 1 ? "" : "s"} exceeded the 1 MB per-file limit.`
      );
    }
    if (failed > 0) {
      notes.push(
        `${failed} file${failed === 1 ? "" : "s"} could not be read.`
      );
    }
    if (skipped > 0) {
      notes.push(
        `${skipped} file${skipped === 1 ? "" : "s"} skipped at the ${MAX_FILES}-file workspace limit.`
      );
    }

    scanRequestId.current += 1;
    setFiles(nextFiles);
    setActiveFileId(focusId);
    setScanResult(null);
    setScanState("idle");
    setError(notes.join(" "));

    if (notes.length > 0) {
      toast.warning("Some files were not added. Check the note below.");
    } else {
      toast.success(
        `${loaded.length} file${loaded.length === 1 ? "" : "s"} loaded. Run a scan when ready.`
      );
    }

    if (fileInput.current) fileInput.current.value = "";
  };

  const removeFile = (id: string) => {
    const remaining = files.filter(file => file.id !== id);
    setFiles(remaining);
    if (activeFileId === id) setActiveFileId(remaining[0]?.id ?? "");
    scanRequestId.current += 1;
    setScanResult(null);
    setScanState("idle");
    setError("");
  };

  const badgeTone =
    scanState === "complete" && scanResult ? scanResult.status : scanState;
  const badgeLabel =
    scanState === "complete" && scanResult
      ? statusCopy(scanResult)
      : scanState === "scanning"
        ? "Scanning"
        : scanState === "error"
          ? "Scan failed"
          : "Awaiting scan";

  let verdictIcon = <ScanLine size={22} />;
  let verdictTitle = "No scan yet";
  let verdictBody = "Scan the workspace to see whether this commit would be allowed.";

  if (scanState === "scanning") {
    verdictIcon = <span className="button-spinner dark" />;
    verdictTitle = `Scanning ${files.length} ${files.length === 1 ? "file" : "files"}`;
    verdictBody = "Checking every staged file against the detection rules.";
  } else if (scanState === "error") {
    verdictIcon = <AlertTriangle size={22} />;
    verdictTitle = "Scan could not complete";
    verdictBody = "Nothing was changed. Review the message and try again.";
  } else if (scanState === "complete" && scanResult) {
    if (scanResult.status === "blocked") {
      verdictIcon = <X size={22} />;
      verdictTitle = "Unsafe code detected";
      verdictBody = "Fix the findings below before committing.";
    } else {
      verdictIcon = <Check size={22} />;
      verdictTitle = "No secrets detected";
      verdictBody = `${scanResult.summary.filesScanned} ${scanResult.summary.filesScanned === 1 ? "file is" : "files are"} clear to commit.`;
    }
  }

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
                <Files size={15} /> {files.length}{" "}
                {files.length === 1 ? "file" : "files"}
              </div>
            </div>
            <div className="sample-tabs">
              <div className="sample-tabs-label">
                <span className="eyebrow">SAMPLE FILES</span>
                <span className="sample-hint">
                  safe synthetic fixtures · add as many as you need
                </span>
              </div>
              <div className="sample-buttons">
                {samples.map(sample => (
                  <button
                    type="button"
                    key={sample.name}
                    className={`sample-button ${activeFile?.id === `sample:${sample.name}` ? "active" : ""}`}
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
                  <Upload size={14} /> upload files
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  multiple
                  accept=".cjs,.js,.mjs,.ts,.tsx,.jsx,.json,.yml,.yaml,.env,.txt,.md,.py,.go,.rb,.rs,.sh,.sql,.toml"
                  onChange={event => {
                    void handleFileUpload(event.target.files);
                  }}
                />
              </div>
            </div>
            {files.length > 0 && (
              <div className="workspace-files">
                <span className="eyebrow">WORKSPACE FILES</span>
                <div className="file-chips">
                  {files.map(file => {
                    const isActive = activeFile?.id === file.id;
                    return (
                      <span
                        className={`file-chip ${isActive ? "active" : ""}`}
                        key={file.id}
                      >
                        <button
                          type="button"
                          className="file-chip-select"
                          aria-pressed={isActive}
                          onClick={() => setActiveFileId(file.id)}
                        >
                          <FileCode2 size={13} />
                          {file.name}
                        </button>
                        <button
                          type="button"
                          className="file-chip-remove"
                          aria-label={`Remove ${file.name}`}
                          title={`Remove ${file.name}`}
                          onClick={() => removeFile(file.id)}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="editor-wrap">
              <div className="editor-toolbar">
                <div className="editor-file">
                  <span className="file-status-dot" />
                  {activeFile?.name ?? "No file selected"}
                  {activeFile && (
                    <span className="editor-language">
                      {activeFile.language}
                    </span>
                  )}
                </div>
                <span className="editor-meta">
                  {activeFile
                    ? `${lines.length} lines · staged`
                    : "nothing staged"}
                </span>
              </div>
              {activeFile ? (
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
                    value={activeFile.content}
                    onChange={event => updateActiveContent(event.target.value)}
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
              ) : (
                <div className="editor-empty">
                  <FileCode2 size={22} />
                  <strong>No files in the workspace</strong>
                  <span>Add a sample or upload files to start a scan.</span>
                </div>
              )}
            </div>
            <div className="editor-footer">
              <span>
                <span className="footer-dot" /> {files.length} staged{" "}
                {files.length === 1 ? "file" : "files"}
              </span>
              <span className="shortcut">
                <kbd>⌘</kbd>
                <kbd>↵</kbd> to scan
              </span>
              <button
                type="button"
                className="scan-button"
                onClick={() => void runScan()}
                disabled={scanState === "scanning" || files.length === 0}
              >
                {scanState === "scanning" ? (
                  <>
                    <span className="button-spinner" /> scanning…
                  </>
                ) : (
                  <>
                    <Play size={15} fill="currentColor" /> scan staged files
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
              <span className={`verdict-badge ${badgeTone}`}>
                <span /> {badgeLabel}
              </span>
            </div>
            <div className={`verdict-card ${badgeTone}`}>
              <div className="verdict-icon">{verdictIcon}</div>
              <div>
                <strong>{verdictTitle}</strong>
                <span>{verdictBody}</span>
              </div>
              <span className="verdict-arrow">
                <ArrowUpRight size={18} />
              </span>
            </div>
            {scanState === "complete" && scanResult ? (
              <>
                <div className="result-stats">
                  <div>
                    <strong>{scanResult.summary.filesScanned}</strong>
                    <span>files</span>
                  </div>
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
                    <strong className="high-text">
                      {scanResult.summary.high}
                    </strong>
                    <span>high</span>
                  </div>
                  <div>
                    <strong
                      className={
                        scanResult.summary.highestSeverity
                          ? `${scanResult.summary.highestSeverity}-text`
                          : "ok-text"
                      }
                    >
                      {scanResult.summary.highestSeverity
                        ? severityLabel(scanResult.summary.highestSeverity)
                        : "None"}
                    </strong>
                    <span>risk</span>
                  </div>
                </div>
                <div className="findings-header">
                  <span>
                    FINDINGS <b>{scanResult.summary.findings}</b>
                  </span>
                  <span>
                    {scanResult.summary.durationMs}ms ·{" "}
                    {scanResult.summary.filesScanned}{" "}
                    {scanResult.summary.filesScanned === 1 ? "file" : "files"}
                  </span>
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
                            <span
                              className={`severity-pill ${finding.severity}`}
                            >
                              {severityLabel(finding.severity)}
                            </span>
                            <span className="finding-type">
                              {findingTypeLabel(finding.type)}
                            </span>
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
              </>
            ) : (
              <div className="result-placeholder">
                {scanState === "scanning" ? (
                  <span className="button-spinner dark" />
                ) : scanState === "error" ? (
                  <AlertTriangle size={20} />
                ) : (
                  <ScanLine size={20} />
                )}
                <strong>
                  {scanState === "scanning"
                    ? "Checking staged files"
                    : scanState === "error"
                      ? "No verdict was produced"
                      : "Findings will appear here"}
                </strong>
                <span>
                  {scanState === "scanning"
                    ? "Findings will appear when the scan finishes."
                    : scanState === "error"
                      ? "The scan failed safely without changing anything."
                      : "Run a scan to populate the verdict and totals."}
                </span>
              </div>
            )}
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
              Choose a safe fixture or upload one or more source files, review
              the masked findings, then fix and scan again. Your content is
              sent only to the local scan endpoint for the duration of the
              request.
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
