import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  DEFAULT_CONFIG,
  EXPORT_NAMES,
  PAGE_ROUTE,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS,
  TOOL_NAMES,
} from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "AI Media Generator",
  description:
    "Generate images and videos using fal.ai models (Nano Banana, Veo 3.1, Kling v3, Seedance). Supports text-to-image, image editing, text-to-video, image-to-video, and more.",
  author: "UNVRS Labs",
  categories: ["connector", "automation"],
  capabilities: [
    "http.outbound",
    "plugin.state.read",
    "plugin.state.write",
    "agent.tools.register",
    "metrics.write",
    "instance.settings.register",
    "ui.page.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      falApiKey: {
        type: "string",
        title: "fal.ai API Key",
        description: "Your fal.ai API key for authentication",
        default: DEFAULT_CONFIG.falApiKey,
      },
      defaultImageModel: {
        type: "string",
        title: "Default Image Model",
        description: "Default model for image generation",
        default: DEFAULT_CONFIG.defaultImageModel,
      },
      defaultVideoModel: {
        type: "string",
        title: "Default Video Model",
        description: "Default model for video generation",
        default: DEFAULT_CONFIG.defaultVideoModel,
      },
    },
  },
  tools: [
    {
      name: TOOL_NAMES.generateImage,
      displayName: "Generate Image",
      description:
        "Generates an image from a text prompt using AI models (Nano Banana 2). Returns a public URL of the generated image.",
      parametersSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Text description of the image to generate",
          },
          model: {
            type: "string",
            description: "Model ID (default: nano-banana-2)",
          },
          aspectRatio: {
            type: "string",
            description: "Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4, etc. (default: 1:1)",
          },
          resolution: {
            type: "string",
            description: "Resolution: 0.5K, 1K, 2K, 4K (default: 1K)",
          },
          numImages: {
            type: "number",
            description: "Number of images to generate (1-4, default: 1)",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: TOOL_NAMES.editImage,
      displayName: "Edit Image",
      description:
        "Edits or transforms existing images using AI. Provide source image URLs and a prompt describing the desired edit.",
      parametersSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Text description of the desired edit",
          },
          imageUrls: {
            type: "array",
            items: { type: "string" },
            description: "URLs of source images to edit",
          },
          aspectRatio: {
            type: "string",
            description: "Output aspect ratio (default: auto)",
          },
          resolution: {
            type: "string",
            description: "Resolution: 0.5K, 1K, 2K, 4K (default: 1K)",
          },
        },
        required: ["prompt", "imageUrls"],
      },
    },
    {
      name: TOOL_NAMES.generateVideo,
      displayName: "Generate Video",
      description:
        "Generates a video using AI models. Supports text-to-video, image-to-video, extend-video, first-last-frame-to-video, and reference-to-video modes. Models: Veo 3.1, Kling v3 Pro, Seedance v1.5 Pro.",
      parametersSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Text description of the video to generate",
          },
          mode: {
            type: "string",
            description: "Generation mode: text-to-video, image-to-video, extend-video, first-last-frame-to-video, reference-to-video (default: text-to-video)",
          },
          model: {
            type: "string",
            description: "Model ID. Options per mode: text-to-video (veo3.1-text-to-video, kling-v3-text-to-video, seedance-text-to-video), image-to-video (veo3.1-image-to-video, kling-v3-image-to-video, seedance-image-to-video), etc.",
          },
          imageUrl: {
            type: "string",
            description: "Source image URL (required for image-to-video mode)",
          },
          videoUrl: {
            type: "string",
            description: "Source video URL (required for extend-video mode)",
          },
          imageUrls: {
            type: "array",
            items: { type: "string" },
            description: "Reference image URLs (for reference-to-video mode)",
          },
          firstFrameUrl: {
            type: "string",
            description: "First frame image URL (for first-last-frame-to-video mode)",
          },
          lastFrameUrl: {
            type: "string",
            description: "Last frame image URL (for first-last-frame-to-video mode)",
          },
          aspectRatio: {
            type: "string",
            description: "Aspect ratio: 16:9, 9:16, 1:1 (default: 16:9)",
          },
          duration: {
            type: "string",
            description: "Video duration in seconds (model-dependent, default varies)",
          },
          resolution: {
            type: "string",
            description: "Resolution: 720p, 1080p, 4k (default: 720p)",
          },
          generateAudio: {
            type: "boolean",
            description: "Whether to generate audio (default: true)",
          },
          negativePrompt: {
            type: "string",
            description: "What to avoid in the video",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: TOOL_NAMES.listModels,
      displayName: "List AI Media Models",
      description: "Lists all available AI models for image and video generation with their capabilities.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "page",
        id: SLOT_IDS.page,
        displayName: "AI Media",
        exportName: EXPORT_NAMES.page,
        routePath: PAGE_ROUTE,
      },
      {
        type: "settingsPage",
        id: SLOT_IDS.settingsPage,
        displayName: "AI Media Settings",
        exportName: EXPORT_NAMES.settingsPage,
      },
    ],
  },
};

export default manifest;
