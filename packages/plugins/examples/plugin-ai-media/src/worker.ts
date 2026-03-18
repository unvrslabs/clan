import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type PluginHealthDiagnostics,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG, MODELS, PLUGIN_ID, TOOL_NAMES, ACTION_KEYS } from "./constants.js";
import {
  buildEditImageInput,
  buildImageInput,
  buildVideoInput,
  getModel,
  getModelsByCapability,
  runFalModel,
  type FalOutput,
} from "./fal-client.js";

type AiMediaConfig = typeof DEFAULT_CONFIG;

let currentContext: PluginContext | null = null;

async function getConfig(ctx: PluginContext): Promise<AiMediaConfig> {
  const config = await ctx.config.get();
  return { ...DEFAULT_CONFIG, ...(config as AiMediaConfig) };
}

function requireApiKey(config: AiMediaConfig): string {
  if (!config.falApiKey) {
    throw new Error("fal.ai API key is not configured. Go to AI Media settings to set it up.");
  }
  return config.falApiKey;
}

// ── Data Handlers ───────────────────────────────────────────────────

async function registerDataHandlers(ctx: PluginContext): Promise<void> {
  ctx.data.register("plugin-config", async () => {
    const config = await getConfig(ctx);
    return { configured: !!config.falApiKey };
  });

  ctx.data.register("models", async () => {
    return { models: MODELS };
  });
}

// ── Action Handlers ─────────────────────────────────────────────────

async function registerActionHandlers(ctx: PluginContext): Promise<void> {
  ctx.actions.register(ACTION_KEYS.testConnection, async () => {
    const config = await getConfig(ctx);
    const apiKey = requireApiKey(config);

    const res = await fetch("https://queue.fal.run/fal-ai/nano-banana-2", {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: "test", num_images: 1, resolution: "0.5K" }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Connection test failed (${res.status}): ${text}`);
    }

    return { ok: true, message: "fal.ai connection successful" };
  });
}

// ── Tool Handlers ───────────────────────────────────────────────────

async function registerToolHandlers(ctx: PluginContext): Promise<void> {
  // ── generate-image ──
  ctx.tools.register(
    TOOL_NAMES.generateImage,
    {
      displayName: "Generate Image",
      description: "Generates an image from a text prompt using AI models.",
      parametersSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          model: { type: "string" },
          aspectRatio: { type: "string" },
          resolution: { type: "string" },
          numImages: { type: "number" },
        },
        required: ["prompt"],
      },
    },
    async (params): Promise<ToolResult> => {
      const p = params as {
        prompt: string;
        model?: string;
        aspectRatio?: string;
        resolution?: string;
        numImages?: number;
      };
      const config = await getConfig(ctx);
      const apiKey = requireApiKey(config);
      const modelId = p.model ?? config.defaultImageModel;
      const model = getModel(modelId);
      if (!model || model.capability !== "text-to-image") {
        return { error: `Unknown image model: ${modelId}. Available: ${getModelsByCapability("text-to-image").map((m) => m.id).join(", ")}` };
      }

      const input = buildImageInput({
        prompt: p.prompt,
        aspectRatio: p.aspectRatio,
        resolution: p.resolution,
        numImages: p.numImages,
      });

      const result = (await runFalModel(apiKey, model.falModelId, input)) as { images: Array<{ url: string; width?: number; height?: number }> };
      await ctx.metrics.write("ai-media.image.generated", result.images.length);

      const urls = result.images.map((img) => img.url);
      return {
        content: `Generated ${urls.length} image(s) with ${model.name}:\n${urls.map((u, i) => `${i + 1}. ${u}`).join("\n")}`,
        data: { model: model.name, images: result.images },
      };
    },
  );

  // ── edit-image ──
  ctx.tools.register(
    TOOL_NAMES.editImage,
    {
      displayName: "Edit Image",
      description: "Edits images using AI. Provide source image URLs and an edit prompt.",
      parametersSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          imageUrls: { type: "array", items: { type: "string" } },
          aspectRatio: { type: "string" },
          resolution: { type: "string" },
        },
        required: ["prompt", "imageUrls"],
      },
    },
    async (params): Promise<ToolResult> => {
      const p = params as {
        prompt: string;
        imageUrls: string[];
        aspectRatio?: string;
        resolution?: string;
      };
      const config = await getConfig(ctx);
      const apiKey = requireApiKey(config);
      const model = getModel("nano-banana-2-edit");
      if (!model) return { error: "Edit model not found" };

      const input = buildEditImageInput({
        prompt: p.prompt,
        imageUrls: p.imageUrls,
        aspectRatio: p.aspectRatio,
        resolution: p.resolution,
      });

      const result = (await runFalModel(apiKey, model.falModelId, input)) as { images: Array<{ url: string }> };
      await ctx.metrics.write("ai-media.image.edited", result.images.length);

      const urls = result.images.map((img) => img.url);
      return {
        content: `Edited ${urls.length} image(s) with ${model.name}:\n${urls.map((u, i) => `${i + 1}. ${u}`).join("\n")}`,
        data: { model: model.name, images: result.images },
      };
    },
  );

  // ── generate-video ──
  ctx.tools.register(
    TOOL_NAMES.generateVideo,
    {
      displayName: "Generate Video",
      description: "Generates a video using AI models. Supports multiple modes.",
      parametersSchema: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          mode: { type: "string" },
          model: { type: "string" },
          imageUrl: { type: "string" },
          videoUrl: { type: "string" },
          imageUrls: { type: "array", items: { type: "string" } },
          firstFrameUrl: { type: "string" },
          lastFrameUrl: { type: "string" },
          aspectRatio: { type: "string" },
          duration: { type: "string" },
          resolution: { type: "string" },
          generateAudio: { type: "boolean" },
          negativePrompt: { type: "string" },
        },
        required: ["prompt"],
      },
    },
    async (params): Promise<ToolResult> => {
      const p = params as {
        prompt: string;
        mode?: string;
        model?: string;
        imageUrl?: string;
        videoUrl?: string;
        imageUrls?: string[];
        firstFrameUrl?: string;
        lastFrameUrl?: string;
        aspectRatio?: string;
        duration?: string;
        resolution?: string;
        generateAudio?: boolean;
        negativePrompt?: string;
      };
      const config = await getConfig(ctx);
      const apiKey = requireApiKey(config);

      // Determine mode from params or explicit mode
      const mode = p.mode
        ?? (p.videoUrl ? "extend-video"
          : p.firstFrameUrl && p.lastFrameUrl ? "first-last-frame-to-video"
            : p.imageUrls && p.imageUrls.length > 0 ? "reference-to-video"
              : p.imageUrl ? "image-to-video"
                : "text-to-video");

      // Find model
      let model: ReturnType<typeof getModel>;
      if (p.model) {
        model = getModel(p.model);
        if (!model) {
          const available = getModelsByCapability(mode).map((m) => m.id);
          return { error: `Unknown model: ${p.model}. Available for ${mode}: ${available.join(", ")}` };
        }
      } else {
        // Pick best default per mode
        const candidates = getModelsByCapability(mode);
        if (candidates.length === 0) {
          return { error: `No models available for mode: ${mode}` };
        }
        // Prefer configured default, fallback to first candidate
        model = candidates.find((m) => m.id === config.defaultVideoModel) ?? candidates[0];
      }

      if (!model) return { error: "No suitable model found" };

      const input = buildVideoInput(model, {
        prompt: p.prompt,
        imageUrl: p.imageUrl,
        videoUrl: p.videoUrl,
        imageUrls: p.imageUrls,
        firstFrameUrl: p.firstFrameUrl,
        lastFrameUrl: p.lastFrameUrl,
        aspectRatio: p.aspectRatio,
        duration: p.duration,
        resolution: p.resolution,
        generateAudio: p.generateAudio,
        negativePrompt: p.negativePrompt,
      });

      const result = (await runFalModel(apiKey, model.falModelId, input)) as { video: { url: string } };
      await ctx.metrics.write("ai-media.video.generated", 1);

      return {
        content: `Generated video with ${model.name} (${mode}):\n${result.video.url}`,
        data: { model: model.name, mode, video: result.video },
      };
    },
  );

  // ── list-models ──
  ctx.tools.register(
    TOOL_NAMES.listModels,
    {
      displayName: "List AI Media Models",
      description: "Lists all available AI models.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (): Promise<ToolResult> => {
      const lines = MODELS.map(
        (m) => `- **${m.name}** (${m.id}): ${m.capability} [${m.provider}]`,
      );
      return {
        content: `Available AI Media Models:\n${lines.join("\n")}`,
        data: { models: MODELS.map((m) => ({ id: m.id, name: m.name, capability: m.capability, provider: m.provider })) },
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
      status: config.falApiKey ? "ok" : "degraded",
      message: config.falApiKey ? "AI Media plugin ready" : "fal.ai API key not configured",
      details: {
        falApiKeyConfigured: !!config.falApiKey,
        modelsAvailable: MODELS.length,
      },
    };
  },

  async onConfigChanged() {
    // no-op
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
