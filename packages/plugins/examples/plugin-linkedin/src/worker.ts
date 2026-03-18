import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type PluginHealthDiagnostics,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import { ACTION_KEYS, DEFAULT_CONFIG, PLUGIN_ID, STATE_KEYS, TOOL_NAMES } from "./constants.js";
import {
  buildLinkedInAuthUrl,
  exchangeLinkedInCode,
  publishToLinkedIn,
  type LinkedInCredentials,
} from "./platforms/linkedin.js";

type LinkedInConfig = typeof DEFAULT_CONFIG;

let currentContext: PluginContext | null = null;

async function getConfig(ctx: PluginContext): Promise<LinkedInConfig> {
  const config = await ctx.config.get();
  return { ...DEFAULT_CONFIG, ...(config as LinkedInConfig) };
}

function getCompanyId(params: Record<string, unknown>): string {
  const id = typeof params.companyId === "string" ? params.companyId : "";
  if (!id) throw new Error("companyId is required");
  return id;
}

async function getLinkedInCreds(
  ctx: PluginContext,
  companyId: string,
): Promise<LinkedInCredentials | null> {
  return (await ctx.state.get({
    scopeKind: "company",
    scopeId: companyId,
    namespace: "oauth",
    stateKey: STATE_KEYS.linkedinToken,
  })) as LinkedInCredentials | null;
}

// ── Data Handlers ───────────────────────────────────────────────────

async function registerDataHandlers(ctx: PluginContext): Promise<void> {
  ctx.data.register("connections", async (params) => {
    const companyId = getCompanyId(params);
    const liCreds = await getLinkedInCreds(ctx, companyId);

    return {
      linkedin: liCreds
        ? {
            connected: true,
            name: liCreds.name,
            email: liCreds.email,
            expiresAt: liCreds.expiresAt,
            connectedAt: liCreds.connectedAt,
          }
        : { connected: false },
    };
  });

  ctx.data.register("plugin-config", async () => {
    return await getConfig(ctx);
  });
}

// ── Action Handlers ─────────────────────────────────────────────────

async function registerActionHandlers(ctx: PluginContext): Promise<void> {
  ctx.actions.register(ACTION_KEYS.startLinkedinOAuth, async (params) => {
    const config = await getConfig(ctx);
    if (!config.linkedinClientId) {
      throw new Error("LinkedIn Client ID is not configured");
    }
    const companyPrefix = typeof params.companyPrefix === "string" ? params.companyPrefix : "";
    if (!companyPrefix) throw new Error("companyPrefix is required for OAuth redirect");
    const redirectUri = `${config.oauthRedirectBaseUrl}/${companyPrefix}/linkedin-oauth-callback`;
    const state = JSON.stringify({ platform: "linkedin", companyId: getCompanyId(params), companyPrefix });
    const authUrl = buildLinkedInAuthUrl(config.linkedinClientId, redirectUri, btoa(state));
    return { authUrl };
  });

  ctx.actions.register(ACTION_KEYS.completeLinkedinOAuth, async (params) => {
    const companyId = getCompanyId(params);
    const code = typeof params.code === "string" ? params.code : "";
    if (!code) throw new Error("Authorization code is required");

    const config = await getConfig(ctx);
    const companyPrefix = typeof params.companyPrefix === "string" ? params.companyPrefix : "";
    if (!companyPrefix) throw new Error("companyPrefix is required for OAuth redirect");
    const redirectUri = `${config.oauthRedirectBaseUrl}/${companyPrefix}/linkedin-oauth-callback`;

    const creds = await exchangeLinkedInCode(ctx, code, config.linkedinClientId, config.linkedinClientSecret, redirectUri);

    await ctx.state.set(
      { scopeKind: "company", scopeId: companyId, namespace: "oauth", stateKey: STATE_KEYS.linkedinToken },
      creds,
    );

    await ctx.metrics.write("social.linkedin.connected", 1);
    return { ok: true, name: creds.name };
  });

  ctx.actions.register(ACTION_KEYS.disconnectPlatform, async (params) => {
    const companyId = getCompanyId(params);
    await ctx.state.delete({
      scopeKind: "company",
      scopeId: companyId,
      namespace: "oauth",
      stateKey: STATE_KEYS.linkedinToken,
    });

    await ctx.metrics.write("social.linkedin.disconnected", 1);
    return { ok: true };
  });

  ctx.actions.register(ACTION_KEYS.listConnections, async (params) => {
    const companyId = getCompanyId(params);
    const liCreds = await getLinkedInCreds(ctx, companyId);
    return {
      linkedin: liCreds ? { connected: true, name: liCreds.name } : { connected: false },
    };
  });
}

// ── Tool Handlers ───────────────────────────────────────────────────

async function registerToolHandlers(ctx: PluginContext): Promise<void> {
  ctx.tools.register(
    TOOL_NAMES.publishLinkedin,
    {
      displayName: "Publish to LinkedIn",
      description: "Publishes a post with optional image or video to the connected LinkedIn profile.",
      parametersSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          imageUrl: { type: "string" },
          videoUrl: { type: "string" },
        },
        required: ["text"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const p = params as { text: string; imageUrl?: string; videoUrl?: string };
      const creds = await getLinkedInCreds(ctx, runCtx.companyId);
      if (!creds) {
        return { error: "LinkedIn is not connected. Please connect your LinkedIn account in the LinkedIn plugin settings." };
      }

      const result = await publishToLinkedIn(ctx, creds, p.text, p.imageUrl, p.videoUrl);
      await ctx.metrics.write("social.linkedin.published", 1);

      if (!result.success) {
        return { error: result.error ?? "Publishing failed" };
      }

      // Record publication entity for history/gallery
      try {
        await ctx.entities.upsert({
          entityType: "publication",
          scopeKind: "company",
          scopeId: runCtx.companyId,
          externalId: result.postId,
          title: p.text?.slice(0, 200),
          status: "published",
          data: {
            platform: "linkedin",
            mediaType: p.videoUrl ? "video" : p.imageUrl ? "image" : "text",
            mediaUrl: p.videoUrl || p.imageUrl || null,
            postUrl: result.postUrl,
            caption: p.text,
            accountName: creds.name,
            agentId: runCtx.agentId,
            runId: runCtx.runId,
            publishedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.warn("[linkedin] Failed to record publication entity:", err);
      }

      return {
        content: `Published to LinkedIn. Post ID: ${result.postId}`,
        data: result,
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.listConnections,
    {
      displayName: "List LinkedIn Connection",
      description: "Shows whether LinkedIn is connected for this company.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_params, runCtx): Promise<ToolResult> => {
      const liCreds = await getLinkedInCreds(ctx, runCtx.companyId);

      return {
        content: liCreds
          ? `LinkedIn connected: ${liCreds.name}`
          : "LinkedIn is not connected.",
        data: {
          linkedin: liCreds ? { connected: true, name: liCreds.name } : { connected: false },
        },
      };
    },
  );
}

// ── Plugin Definition ───────────────────────────────────────────────

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    currentContext = ctx;
    await registerDataHandlers(ctx);
    await registerActionHandlers(ctx);
    await registerToolHandlers(ctx);
  },

  async onHealth(): Promise<PluginHealthDiagnostics> {
    const ctx = currentContext;
    const config = ctx ? await getConfig(ctx) : DEFAULT_CONFIG;
    return {
      status: "ok",
      message: "LinkedIn Personal plugin ready",
      details: {
        linkedinConfigured: !!config.linkedinClientId,
        oauthRedirectConfigured: !!config.oauthRedirectBaseUrl,
      },
    };
  },

  async onConfigChanged() {
    // no-op
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
