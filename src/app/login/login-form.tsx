"use client";

import { useEffect, useState } from "react";
import styles from "./login.module.css";

const MIN_PASSWORD_LENGTH = 12;

function isStrongPassword(value: string) {
  return (
    value.length >= MIN_PASSWORD_LENGTH &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaPrompt, setCaptchaPrompt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginSessionReady, setLoginSessionReady] = useState(false);

  const initLoginSession = async () => {
    try {
      const sessionResponse = await fetch("/api/auth/login/session", {
        method: "POST",
      });
      const sessionData = await sessionResponse.json();
      if (sessionData?.captchaPrompt) {
        setCaptchaPrompt(sessionData.captchaPrompt);
      }
      if (sessionData?.blockedMessage) {
        setError(sessionData.blockedMessage);
      } else if (sessionData?.cooldownMessage) {
        setError(sessionData.cooldownMessage);
      }
      setLoginSessionReady(sessionResponse.ok);
      return sessionResponse.ok;
    } catch {
      setError("Unable to initialize login session. Please refresh and try again.");
      setLoginSessionReady(false);
      return false;
    }
  };

  useEffect(() => {
    void initLoginSession();
  }, []);

  const sha512Hex = async (value: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const hashBuffer = await crypto.subtle.digest("SHA-512", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!loginSessionReady) {
      const ready = await initLoginSession();
      if (!ready) {
        return;
      }
    }

    if (!isStrongPassword(password)) {
      setError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters and include uppercase, lowercase, number, and symbol.`
      );
      setPassword("");
      return;
    }

    if (captchaPrompt && !captchaAnswer.trim()) {
      setError("CAPTCHA answer is required.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hashedPassword: await sha512Hex(password),
          captchaAnswer,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Success - redirect to home with full page reload to ensure cookies are set
        window.location.href = "/";
      } else {
        // Show error message
        setError(data.error || "Authentication failed");
        if (typeof data.captchaPrompt === "string") {
          setCaptchaPrompt(data.captchaPrompt);
          setCaptchaAnswer("");
        }
        if (data.requiresLoginSession) {
          setLoginSessionReady(false);
          await initLoginSession();
        }
        setPassword("");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginBox}>
        <h1 className={styles.title}>Integrated Services Manager</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder="Enter password"
              required
              autoFocus
              disabled={loading}
            />
          </div>
          {captchaPrompt && (
            <div className={styles.formGroup}>
              <label htmlFor="captchaAnswer" className={styles.label}>
                {captchaPrompt}
              </label>
              <input
                type="text"
                id="captchaAnswer"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                className={styles.input}
                placeholder="Enter CAPTCHA answer"
                required
                disabled={loading}
              />
            </div>
          )}
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Authenticating..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
