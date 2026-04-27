"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const LOG_REFRESH_INTERVAL_MS = 3000;

export default function ServiceControls({
  serviceId,
  serviceName,
  initialStatus,
  projectConfig,
}: ServiceControlsProps) {
  const router = useRouter();
  const logBodyRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<ServiceStatus>(initialStatus);
  const [actionMessage, setActionMessage] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [logError, setLogError] = useState<string>("");
  const [logLines, setLogLines] = useState<string[]>([]);
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
  const renderedProjectConfig = useMemo(
    () => JSON.stringify(projectConfig, null, 2),
    [projectConfig],
  );

  const scrollLogToBottom = useCallback(() => {
    const logBody = logBodyRef.current;
    if (!logBody) {
      return;
    }
    requestAnimationFrame(() => {
      logBody.scrollTop = logBody.scrollHeight;
    });
  }, []);

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

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
    if (!logDialogOpen || logLoading) {
      return;
    }
    scrollLogToBottom();
  }, [logDialogOpen, logLines, logLoading, scrollLogToBottom]);

  const openLogDialog = () => {
    setLogDialogOpen(true);
    setLogError("");
    setLogLines([]);
  };

  const closeLogDialog = () => {
    setLogDialogOpen(false);
    setLogError("");
    setLogLoading(false);
  };

  const openLogInNewTab = () => {
    window.open(
      `/api/services/${serviceId}/log?format=plain`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const openConfigDialog = () => {
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
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.logHeader}>
              <div>
                <p className={styles.logTitle}>{serviceName} Configuration</p>
                <p className={styles.logSubtitle}>Source: data/settings.json</p>
              </div>
              <div className={styles.dialogActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={closeConfigDialog}
                >
                  Close
                </button>
              </div>
            </header>
            <div className={styles.logBody}>
              <pre className={styles.logContent}>{renderedProjectConfig}</pre>
            </div>
          </div>
        </div>
      )}

      {logDialogOpen && (
        <div className={styles.logOverlay} onClick={closeLogDialog}>
          <div
            className={styles.logDialog}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.logHeader}>
              <div>
                <p className={styles.logTitle}>{serviceName} Log</p>
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
                >
                  Close
                </button>
              </div>
            </header>
            <div ref={logBodyRef} className={styles.logBody}>
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
          </div>
        </div>
      )}
    </div>
  );
}
