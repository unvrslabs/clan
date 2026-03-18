export const PLUGIN_ID = "paperclip-ai-media";
export const PLUGIN_VERSION = "0.1.0";
export const PAGE_ROUTE = "ai-media";

export const SLOT_IDS = {
  page: "ai-media-page",
  settingsPage: "ai-media-settings-page",
} as const;

export const EXPORT_NAMES = {
  page: "AiMediaPage",
  settingsPage: "AiMediaSettingsPage",
} as const;

export const TOOL_NAMES = {
  generateImage: "generate-image",
  editImage: "edit-image",
  generateVideo: "generate-video",
  listModels: "list-models",
} as const;

export const ACTION_KEYS = {
  testConnection: "test-connection",
} as const;

export const FAL_API_BASE = "https://queue.fal.run";

// ── Model Registry ──────────────────────────────────────────────────

export type ModelCapability =
  | "text-to-image"
  | "edit-image"
  | "text-to-video"
  | "image-to-video"
  | "extend-video"
  | "first-last-frame-to-video"
  | "reference-to-video";

export interface ModelDef {
  id: string;
  falModelId: string;
  name: string;
  provider: string;
  capability: ModelCapability;
  outputType: "image" | "video";
}

export const MODELS: ModelDef[] = [
  // ── Nano Banana 2 (Image) ──
  {
    id: "nano-banana-2",
    falModelId: "fal-ai/nano-banana-2",
    name: "Nano Banana 2",
    provider: "fal.ai",
    capability: "text-to-image",
    outputType: "image",
  },
  {
    id: "nano-banana-2-edit",
    falModelId: "fal-ai/nano-banana-2/edit",
    name: "Nano Banana 2 Edit",
    provider: "fal.ai",
    capability: "edit-image",
    outputType: "image",
  },

  // ── Veo 3.1 (Video) ──
  {
    id: "veo3.1-text-to-video",
    falModelId: "fal-ai/veo3.1/fast",
    name: "Veo 3.1 Fast",
    provider: "Google",
    capability: "text-to-video",
    outputType: "video",
  },
  {
    id: "veo3.1-image-to-video",
    falModelId: "fal-ai/veo3.1/fast/image-to-video",
    name: "Veo 3.1 Image to Video",
    provider: "Google",
    capability: "image-to-video",
    outputType: "video",
  },
  {
    id: "veo3.1-extend-video",
    falModelId: "fal-ai/veo3.1/fast/extend-video",
    name: "Veo 3.1 Extend Video",
    provider: "Google",
    capability: "extend-video",
    outputType: "video",
  },
  {
    id: "veo3.1-first-last-frame",
    falModelId: "fal-ai/veo3.1/fast/first-last-frame-to-video",
    name: "Veo 3.1 First/Last Frame",
    provider: "Google",
    capability: "first-last-frame-to-video",
    outputType: "video",
  },
  {
    id: "veo3.1-reference-to-video",
    falModelId: "fal-ai/veo3.1/reference-to-video",
    name: "Veo 3.1 Reference to Video",
    provider: "Google",
    capability: "reference-to-video",
    outputType: "video",
  },

  // ── Kling v3 Pro (Video) ──
  {
    id: "kling-v3-text-to-video",
    falModelId: "fal-ai/kling-video/v3/pro/text-to-video",
    name: "Kling v3 Pro Text to Video",
    provider: "Kuaishou",
    capability: "text-to-video",
    outputType: "video",
  },
  {
    id: "kling-v3-image-to-video",
    falModelId: "fal-ai/kling-video/v3/pro/image-to-video",
    name: "Kling v3 Pro Image to Video",
    provider: "Kuaishou",
    capability: "image-to-video",
    outputType: "video",
  },

  // ── Seedance v1.5 Pro (Video) ──
  {
    id: "seedance-text-to-video",
    falModelId: "fal-ai/bytedance/seedance/v1.5/pro/text-to-video",
    name: "Seedance v1.5 Pro Text to Video",
    provider: "ByteDance",
    capability: "text-to-video",
    outputType: "video",
  },
  {
    id: "seedance-image-to-video",
    falModelId: "fal-ai/bytedance/seedance/v1.5/pro/image-to-video",
    name: "Seedance v1.5 Pro Image to Video",
    provider: "ByteDance",
    capability: "image-to-video",
    outputType: "video",
  },
];

export const DEFAULT_CONFIG = {
  falApiKey: "",
  defaultImageModel: "nano-banana-2",
  defaultVideoModel: "veo3.1-text-to-video",
} as const;
