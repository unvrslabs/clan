import { useState, useEffect } from "react";
import { usePluginAction, usePluginData, useHostContext } from "@paperclipai/plugin-sdk/ui";

// ── Settings Page ───────────────────────────────────────────────────

export function LinkedInSettingsPage() {
  const { companyId, companyPrefix } = useHostContext();
  const { data: connections, refresh } = usePluginData<{
    linkedin: { connected: boolean; name?: string; email?: string; connectedAt?: string };
  }>("connections", { companyId: companyId ?? "" });

  const startLinkedinOAuth = usePluginAction("start-linkedin-oauth");
  const disconnectPlatform = usePluginAction("disconnect-platform");

  const handleConnect = async () => {
    const result = (await startLinkedinOAuth({ companyId: companyId ?? "", companyPrefix: companyPrefix ?? "" })) as { authUrl: string };
    if (result.authUrl) {
      window.open(result.authUrl, "_blank", "width=600,height=700");
    }
  };

  const handleDisconnect = async () => {
    await disconnectPlatform({ companyId: companyId ?? "" });
    refresh();
  };

  const li = connections?.linkedin;

  return (
    <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 600 }}>
      <div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>LinkedIn Personal</h2>
        <p style={{ fontSize: "0.8rem", opacity: 0.5, margin: "0.5rem 0 0", lineHeight: 1.5 }}>
          Connect your LinkedIn personal profile so agents can publish posts on your behalf.
        </p>
      </div>

      <div className="glass-card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #0A66C2, #0077B5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.8rem", color: "#fff", fontWeight: 700,
            }}>
              in
            </div>
            <div>
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>LinkedIn</span>
              {li?.connected && li.name && (
                <div style={{ fontSize: "0.75rem", opacity: 0.5, marginTop: 2 }}>{li.name}</div>
              )}
            </div>
          </div>
          {li?.connected ? (
            <button
              onClick={handleDisconnect}
              className="glass-button"
              style={{ fontSize: "0.75rem", padding: "0.375rem 1rem", cursor: "pointer", color: "#f87171", fontWeight: 500 }}
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              className="glass-button"
              style={{ fontSize: "0.75rem", padding: "0.375rem 1rem", cursor: "pointer", color: "#a5b4fc", fontWeight: 500 }}
            >
              Connect
            </button>
          )}
        </div>

        {li?.connected && li.connectedAt && (
          <div style={{ marginTop: "0.75rem" }}>
            <span className="glass-badge" style={{ fontSize: "0.7rem", padding: "0.3rem 0.625rem", opacity: 0.6 }}>
              Connected {new Date(li.connectedAt).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export function LinkedInPage() {
  return <LinkedInSettingsPage />;
}

// ── OAuth Callback Page ─────────────────────────────────────────────

export function LinkedInOAuthCallback() {
  const { companyId, companyPrefix } = useHostContext();
  const completeLinkedin = usePluginAction("complete-linkedin-oauth");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const stateRaw = params.get("state");
    const error = params.get("error");

    if (error) {
      setStatus("error");
      setErrorMsg(error);
      return;
    }

    if (!code || !stateRaw) {
      setStatus("error");
      setErrorMsg("Missing authorization data.");
      return;
    }

    let stateCompanyId = companyId ?? "";
    let stateCompanyPrefix = companyPrefix ?? "";
    try {
      const state = JSON.parse(atob(stateRaw)) as { platform: string; companyId: string; companyPrefix?: string };
      stateCompanyId = state.companyId || stateCompanyId;
      stateCompanyPrefix = state.companyPrefix || stateCompanyPrefix;
    } catch {
      // fallback
    }

    (async () => {
      try {
        await completeLinkedin({ companyId: stateCompanyId, companyPrefix: stateCompanyPrefix, code });
        setStatus("success");
        setTimeout(() => window.close(), 1500);
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : typeof err === "object" ? JSON.stringify(err) : String(err));
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "loading") {
    return (
      <div style={{ padding: "3rem", textAlign: "center" }}>
        <div className="glass-card" style={{ padding: "2rem", display: "inline-block", maxWidth: 360 }}>
          <p style={{ opacity: 0.7 }}>Completing connection...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ padding: "3rem", textAlign: "center" }}>
        <div className="glass-card" style={{ padding: "2rem", display: "inline-block", maxWidth: 420 }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 0.75rem" }}>Connection Failed</h2>
          <p style={{ color: "#f87171", fontSize: "0.85rem", margin: "0 0 1rem", lineHeight: 1.5 }}>{errorMsg}</p>
          <button onClick={() => window.close()} className="glass-button" style={{ padding: "0.375rem 1.25rem", cursor: "pointer", fontSize: "0.8rem" }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "3rem", textAlign: "center" }}>
      <div className="glass-card" style={{ padding: "2rem", display: "inline-block", maxWidth: 360 }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 0.5rem" }}>Connected!</h2>
        <p style={{ opacity: 0.6, fontSize: "0.85rem", margin: 0 }}>This window will close automatically.</p>
      </div>
    </div>
  );
}
