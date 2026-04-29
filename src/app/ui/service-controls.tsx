"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ServiceMode, ServiceStatus } from "../types";
import styles from "./service-card.module.css";
import AnsiToHtml from "ansi-to-html";

interface ProjectConfig {
  name: string;
  root: string;
  command: string;
  mode: ServiceMode;
}

interface ServiceControlsProps {
  serviceId: string;
  serviceName: string;
  initialStatus: ServiceStatus;
  projectConfig: ProjectConfig;
}

interface ToggleResponse {
  status: ServiceStatus;
  message: string;
  error?: string;
}

interface LogResponse {
  log: string[];
  error?: string;
}

interface StdinResponse {
  message?: string;
  error?: string;
}

const LOG_REFRESH_INTERVAL_MS = 3000;

export default function ServiceControls({
  serviceId,
  serviceName,
  initialStatus,
  projectConfig,
}: ServiceControlsProps) {
  const router = useRouter();
  const logBodyRef = useRef<HTMLDivElement | null>(null);
  const terminalInputRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const previousLogCountRef = useRef(0);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const logDialogTitleId = useId();
  const configDialogTitleId = useId();
  const [status, setStatus] = useState<ServiceStatus>(initialStatus);
  const [actionMessage, setActionMessage] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [logError, setLogError] = useState<string>("");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalInputSending, setTerminalInputSending] = useState(false);
  const [terminalInputError, setTerminalInputError] = useState("");
  const [terminalInputMessage, setTerminalInputMessage] = useState("");
  const [configCopyMessage, setConfigCopyMessage] = useState("");
  const ansiConverter = useMemo(
    () =>
      new AnsiToHtml({
        escapeXML: true,
        newline: true,
      }),
    [],
  );
  const renderedLogHtml = useMemo(() => {
    if (!logLines.length) {
      return "";
    }
    return logLines.map((line) => ansiConverter.toHtml(line)).join("\n");
  }, [logLines, ansiConverter]);

  const configFields = useMemo(
    () => [
      { label: "Name", value: projectConfig.name },
      { label: "Root", value: projectConfig.root },
      { label: "Command", value: projectConfig.command },
    ],
    [projectConfig],
  );

  const isNearLogBottom = useCallback((node: HTMLDivElement) => {
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    return distance <= 32;
  }, []);

  const scrollLogToBottom = useCallback(() => {
    const logBody = logBodyRef.current;
    if (!logBody) {
      return;
    }
    requestAnimationFrame(() => {
      logBody.scrollTop = logBody.scrollHeight;
    });
  }, []);

  const clearFeedbackTimer = useCallback(() => {
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
  }, []);

  const flashTerminalMessage = useCallback(
    (message: string) => {
      setTerminalInputMessage(message);
      clearFeedbackTimer();
      feedbackTimeoutRef.current = window.setTimeout(() => {
        setTerminalInputMessage("");
        feedbackTimeoutRef.current = null;
      }, 2000);
    },
    [clearFeedbackTimer],
  );

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(
    () => () => {
      clearFeedbackTimer();
    },
    [clearFeedbackTimer],
  );

  useEffect(() => {
    if (!logDialogOpen && !configDialogOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (logDialogOpen) {
        closeLogDialog();
      }
      if (configDialogOpen) {
        closeConfigDialog();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [logDialogOpen, configDialogOpen]);

  const handleToggle = async () => {
    if (status === ServiceStatus.RUNNING) {
      const confirmed = window.confirm(`Stop ${serviceName}?`);
      if (!confirmed) {
        return;
      }
    }

    setLoading(true);
    setActionError("");
    setActionMessage("");

    try {
      const response = await fetch(`/api/services/${serviceId}/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
      const data = (await response.json()) as ToggleResponse;
      if (!response.ok) {
        throw new Error(data.error || "Unable to update service");
      }
      setStatus(data.status);
      setActionMessage(data.message);
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to update service",
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = useCallback(
    async (showSpinner = false) => {
      if (!logDialogOpen) {
        return;
      }

      if (showSpinner) {
        setLogLoading(true);
      }

      try {
        const response = await fetch(`/api/services/${serviceId}/log`, {
          cache: "no-store",
        });
        const data = (await response.json()) as LogResponse;
        if (!response.ok) {
          throw new Error(data.error || "Unable to load logs");
        }
        setLogLines(Array.isArray(data.log) ? data.log : []);
        setLogError("");
      } catch (error) {
        setLogError(
          error instanceof Error ? error.message : "Unable to load logs",
        );
      } finally {
        if (showSpinner) {
          setLogLoading(false);
        }
      }
    },
    [serviceId, logDialogOpen],
  );

  useEffect(() => {
    if (!logDialogOpen) {
      return;
    }

    fetchLogs(true);
    const interval = setInterval(() => {
      fetchLogs();
    }, LOG_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [logDialogOpen, fetchLogs]);

  useEffect(() => {
    if (!logDialogOpen) {
      return;
    }

    const hasNewLogItem = logLines.length > previousLogCountRef.current;
    previousLogCountRef.current = logLines.length;

    if (!hasNewLogItem || !shouldAutoScrollRef.current) {
      return;
    }

    scrollLogToBottom();
  }, [logDialogOpen, logLines.length, scrollLogToBottom]);

  useEffect(() => {
    if (!logDialogOpen || !terminalInputRef.current) {
      return;
    }
    terminalInputRef.current.focus();
  }, [logDialogOpen]);

  const handleLogBodyScroll = (event: React.UIEvent<HTMLDivElement>) => {
    shouldAutoScrollRef.current = isNearLogBottom(event.currentTarget);
  };

  const sendTerminalInput = async () => {
    const trimmed = terminalInput.trim();
    if (!trimmed || terminalInputSending) {
      return;
    }

    setTerminalInputSending(true);
    setTerminalInputError("");

    try {
      const payload = terminalInput.endsWith("\n")
        ? terminalInput
        : `${terminalInput}\n`;
      const response = await fetch(`/api/services/${serviceId}/stdin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: payload }),
        cache: "no-store",
      });
      const data = (await response.json()) as StdinResponse;
      if (!response.ok) {
        throw new Error(data.error || "Unable to send input");
      }

      setTerminalInput("");
      flashTerminalMessage(data.message || "Input sent");
      await fetchLogs();
      terminalInputRef.current?.focus();
    } catch (error) {
      setTerminalInputError(
        error instanceof Error ? error.message : "Unable to send input",
      );
    } finally {
      setTerminalInputSending(false);
    }
  };

  const handleTerminalKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendTerminalInput();
    }
  };

  const copyConfigValue = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setConfigCopyMessage(`${label} copied`);
    } catch {
      setConfigCopyMessage("Clipboard is unavailable");
    }
  };

  const openLogDialog = () => {
    setLogDialogOpen(true);
    setLogError("");
    setLogLines([]);
    setTerminalInputError("");
    setTerminalInputMessage("");
    previousLogCountRef.current = 0;
    shouldAutoScrollRef.current = true;
  };

  const closeLogDialog = () => {
    setLogDialogOpen(false);
    setLogError("");
    setLogLoading(false);
    setTerminalInput("");
    setTerminalInputError("");
    setTerminalInputMessage("");
  };

  const openLogInNewTab = () => {
    window.open(
      `/api/services/${serviceId}/log?format=plain`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const openConfigDialog = () => {
    setConfigCopyMessage("");
    setConfigDialogOpen(true);
  };

  const closeConfigDialog = () => {
    setConfigDialogOpen(false);
  };

  return (
    <div className={styles.controlsWrapper}>
      <div className={styles.controls}>
        <button
          type="button"
          onClick={handleToggle}
          className={`${styles.controlButton} ${styles.primaryButton}`}
          disabled={loading}
        >
          {loading
            ? "Working..."
            : status === ServiceStatus.RUNNING
              ? "Stop"
              : "Start"}
        </button>
        <button
          type="button"
          onClick={openLogDialog}
          className={`${styles.controlButton} ${styles.secondaryButton}`}
          disabled={logLoading}
        >
          {logLoading ? "Loading..." : "Show Log"}
        </button>
        <button
          type="button"
          onClick={openConfigDialog}
          className={`${styles.controlButton} ${styles.secondaryButton}`}
        >
          Project Config
        </button>
      </div>
      {actionMessage && <p className={styles.statusMessage}>{actionMessage}</p>}
      {actionError && <p className={styles.errorMessage}>{actionError}</p>}

      {configDialogOpen && (
        <div className={styles.logOverlay} onClick={closeConfigDialog}>
          <div
            className={styles.logDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={configDialogTitleId}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.logHeader}>
              <div>
                <p className={styles.logTitle} id={configDialogTitleId}>
                  {serviceName} Configuration
                </p>
                <p className={styles.logSubtitle}>Source: data/settings.json</p>
              </div>
              <div className={styles.dialogActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={closeConfigDialog}
                  aria-label="Close configuration dialog"
                >
                  Close
                </button>
              </div>
            </header>
            <div className={styles.logBody}>
              <div className={styles.configGrid}>
                {configFields.map((field) => (
                  <div className={styles.configField} key={field.label}>
                    <p className={styles.configLabel}>{field.label}</p>
                    <div className={styles.configValueRow}>
                      <p className={styles.configValue} title={field.value}>
                        {field.value}
                      </p>
                      <button
                        type="button"
                        className={styles.copyButton}
                        onClick={() =>
                          copyConfigValue(field.label, field.value)
                        }
                        aria-label={`Copy ${field.label}`}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                ))}

                <div className={styles.configField}>
                  <p className={styles.configLabel}>Mode</p>
                  <div className={styles.configValueRow}>
                    <span
                      className={`${styles.configModeBadge} ${
                        projectConfig.mode === "PRODUCTION"
                          ? styles.configModeProduction
                          : styles.configModeDevelopment
                      }`}
                    >
                      {projectConfig.mode}
                    </span>
                  </div>
                </div>
              </div>
              {configCopyMessage && (
                <p className={styles.statusMessage} aria-live="polite">
                  {configCopyMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {logDialogOpen && (
        <div className={styles.logOverlay} onClick={closeLogDialog}>
          <div
            className={styles.logDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={logDialogTitleId}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.logHeader}>
              <div>
                <p className={styles.logTitle} id={logDialogTitleId}>
                  {serviceName} Terminal
                </p>
                <p className={styles.logSubtitle}>
                  Latest {logLines.length} entries
                </p>
              </div>
              <div className={styles.dialogActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={openLogInNewTab}
                >
                  Open Tab
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={closeLogDialog}
                  aria-label="Close terminal dialog"
                >
                  Close
                </button>
              </div>
            </header>
            <div
              ref={logBodyRef}
              className={styles.logBody}
              onScroll={handleLogBodyScroll}
            >
              {logLoading ? (
                <p>Loading logs...</p>
              ) : logError ? (
                <p className={styles.errorMessage}>{logError}</p>
              ) : logLines.length ? (
                <pre
                  className={styles.logContent}
                  dangerouslySetInnerHTML={{ __html: renderedLogHtml }}
                />
              ) : (
                <p>No log output captured yet.</p>
              )}
            </div>

            <div className={styles.terminalComposer}>
              <textarea
                ref={terminalInputRef}
                value={terminalInput}
                onChange={(event) => setTerminalInput(event.target.value)}
                onKeyDown={handleTerminalKeyDown}
                className={styles.terminalInput}
                placeholder="Enter sends input, Shift+Enter adds a new line"
                disabled={
                  status !== ServiceStatus.RUNNING || terminalInputSending
                }
                rows={3}
                aria-label="Terminal standard input"
              />
              <div className={styles.terminalComposerFooter}>
                <p className={styles.logSubtitle}>
                  {status === ServiceStatus.RUNNING
                    ? "Enter to send, Shift+Enter for newline"
                    : "Service is stopped. Start it to send input."}
                </p>
                <button
                  type="button"
                  className={`${styles.controlButton} ${styles.secondaryButton}`}
                  onClick={() => {
                    void sendTerminalInput();
                  }}
                  disabled={
                    status !== ServiceStatus.RUNNING ||
                    terminalInputSending ||
                    !terminalInput.trim().length
                  }
                >
                  {terminalInputSending ? "Sending..." : "Send"}
                </button>
              </div>
              {terminalInputError && (
                <p className={styles.errorMessage} aria-live="polite">
                  {terminalInputError}
                </p>
              )}
              {terminalInputMessage && (
                <p className={styles.statusMessage} aria-live="polite">
                  {terminalInputMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
