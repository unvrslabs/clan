import { useState } from "react";
import { usePluginAction, usePluginData, useHostContext } from "@paperclipai/plugin-sdk/ui";

// ── Settings Page ───────────────────────────────────────────────────

export function AiMediaSettingsPage() {
  const { companyId } = useHostContext();
  const { data: config } = usePluginData<{ configured: boolean }>("plugin-config", { companyId: companyId ?? "" });
  const { data: modelsData } = usePluginData<{
    models: Array<{ id: string; name: string; capability: string; provider: string; outputType: string }>;
  }>("models", { companyId: companyId ?? "" });

  const testConnection = usePluginAction("test-connection");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = (await testConnection({})) as { ok: boolean; message: string };
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    }
    setTesting(false);
  };

  const models = modelsData?.models ?? [];
  const imageModels = models.filter((m) => m.outputType === "image");
  const videoModels = models.filter((m) => m.outputType === "video");

  return (
    <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 700 }}>
      <div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>AI Media Generator</h2>
        <p style={{ fontSize: "0.8rem", opacity: 0.5, margin: "0.5rem 0 0", lineHeight: 1.5 }}>
          Generate images and videos using fal.ai AI models. Agents can use these tools to create visual content.
        </p>
      </div>

      {/* Connection Status */}
      <div className="glass-card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.8rem", color: "#fff", fontWeight: 700,
            }}>
              AI
            </div>
            <div>
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>fal.ai</span>
              <div style={{ fontSize: "0.75rem", opacity: 0.5, marginTop: 2 }}>
                {config?.configured ? "API key configured" : "API key not set"}
              </div>
            </div>
          </div>
          <button
            onClick={handleTest}
            disabled={testing || !config?.configured}
            className="glass-button"
            style={{
              fontSize: "0.75rem", padding: "0.375rem 1rem", cursor: "pointer",
              color: config?.configured ? "#a5b4fc" : "#6b7280", fontWeight: 500,
              opacity: testing ? 0.5 : 1,
            }}
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
        </div>

        {testResult && (
          <div style={{ marginTop: "0.75rem" }}>
            <span
              className="glass-badge"
              style={{
                fontSize: "0.7rem", padding: "0.3rem 0.625rem",
                color: testResult.ok ? "#34d399" : "#f87171",
              }}
            >
              {testResult.ok ? "Connected" : testResult.message}
            </span>
          </div>
        )}
      </div>

      {/* Image Models */}
      <div className="glass-card" style={{ padding: "1.25rem" }}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.75rem" }}>Image Models</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          {imageModels.map((m) => (
            <div
              key={m.id}
              className="glass-badge"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.5rem 0.75rem", borderRadius: 12,
              }}
            >
              <div>
                <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>{m.name}</span>
                <span style={{ fontSize: "0.65rem", opacity: 0.5, marginLeft: "0.5rem" }}>{m.provider}</span>
              </div>
              <span className="glass-badge" style={{ fontSize: "0.6rem", opacity: 0.6, padding: "0.15rem 0.4rem" }}>
                {m.capability}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Video Models */}
      <div className="glass-card" style={{ padding: "1.25rem" }}>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.75rem" }}>Video Models</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          {videoModels.map((m) => (
            <div
              key={m.id}
              className="glass-badge"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.5rem 0.75rem", borderRadius: 12,
              }}
            >
              <div>
                <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>{m.name}</span>
                <span style={{ fontSize: "0.65rem", opacity: 0.5, marginLeft: "0.5rem" }}>{m.provider}</span>
              </div>
              <span className="glass-badge" style={{ fontSize: "0.6rem", opacity: 0.6, padding: "0.15rem 0.4rem" }}>
                {m.capability}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export function AiMediaPage() {
  return <AiMediaSettingsPage />;
}
