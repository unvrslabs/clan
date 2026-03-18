import { MODELS, type ModelDef } from "./constants.js";

const FAL_QUEUE_BASE = "https://queue.fal.run";
const FAL_STATUS_BASE = "https://queue.fal.run";

interface FalQueueResponse {
  request_id: string;
  status: string;
  response_url: string;
  status_url: string;
}

interface FalStatusResponse {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  response_url?: string;
  error?: string;
  logs?: Array<{ message: string }>;
}

interface FalImageOutput {
  images: Array<{
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
    width?: number;
    height?: number;
  }>;
  description?: string;
}

interface FalVideoOutput {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
  seed?: number;
}

export type FalOutput = FalImageOutput | FalVideoOutput;

export function getModel(modelId: string): ModelDef | undefined {
  return MODELS.find((m) => m.id === modelId);
}

export function getModelsByCapability(capability: string): ModelDef[] {
  return MODELS.filter((m) => m.capability === capability);
}

async function submitToQueue(
  apiKey: string,
  falModelId: string,
  input: Record<string, unknown>,
): Promise<FalQueueResponse> {
  const res = await fetch(`${FAL_QUEUE_BASE}/${falModelId}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai queue submit failed (${res.status}): ${text}`);
  }
  return (await res.json()) as FalQueueResponse;
}

async function pollForResult(
  apiKey: string,
  falModelId: string,
  requestId: string,
  maxWaitMs = 300_000,
): Promise<FalOutput> {
  const start = Date.now();
  const statusUrl = `${FAL_STATUS_BASE}/${falModelId}/requests/${requestId}/status`;
  const resultUrl = `${FAL_STATUS_BASE}/${falModelId}/requests/${requestId}`;

  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 3000));

    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!statusRes.ok) {
      const text = await statusRes.text();
      throw new Error(`fal.ai status check failed (${statusRes.status}): ${text}`);
    }

    const status = (await statusRes.json()) as FalStatusResponse;

    if (status.status === "FAILED") {
      throw new Error(`fal.ai generation failed: ${status.error ?? "unknown error"}`);
    }

    if (status.status === "COMPLETED") {
      const resultRes = await fetch(resultUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      });
      if (!resultRes.ok) {
        const text = await resultRes.text();
        throw new Error(`fal.ai result fetch failed (${resultRes.status}): ${text}`);
      }
      return (await resultRes.json()) as FalOutput;
    }
  }

  throw new Error(`fal.ai generation timed out after ${maxWaitMs / 1000}s`);
}

export async function runFalModel(
  apiKey: string,
  falModelId: string,
  input: Record<string, unknown>,
): Promise<FalOutput> {
  const queued = await submitToQueue(apiKey, falModelId, input);
  return await pollForResult(apiKey, falModelId, queued.request_id);
}

// ── Input Builders ──────────────────────────────────────────────────

export function buildImageInput(params: {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  numImages?: number;
  seed?: number;
}): Record<string, unknown> {
  return {
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio ?? "1:1",
    resolution: params.resolution ?? "1K",
    num_images: params.numImages ?? 1,
    output_format: "png",
    safety_tolerance: "4",
    ...(params.seed != null && { seed: params.seed }),
  };
}

export function buildEditImageInput(params: {
  prompt: string;
  imageUrls: string[];
  aspectRatio?: string;
  resolution?: string;
}): Record<string, unknown> {
  return {
    prompt: params.prompt,
    image_urls: params.imageUrls,
    aspect_ratio: params.aspectRatio ?? "auto",
    resolution: params.resolution ?? "1K",
    output_format: "png",
    safety_tolerance: "4",
  };
}

export function buildVideoInput(
  model: ModelDef,
  params: {
    prompt: string;
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
    seed?: number;
  },
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    prompt: params.prompt,
    safety_tolerance: "4",
  };

  if (params.negativePrompt) base.negative_prompt = params.negativePrompt;
  if (params.seed != null) base.seed = params.seed;

  switch (model.capability) {
    case "text-to-video": {
      base.aspect_ratio = params.aspectRatio ?? "16:9";
      base.generate_audio = params.generateAudio ?? true;
      if (model.falModelId.includes("veo3.1")) {
        base.duration = params.duration ?? "8s";
        base.resolution = params.resolution ?? "720p";
        base.auto_fix = true;
      } else if (model.falModelId.includes("kling")) {
        base.duration = params.duration ?? "5";
        base.cfg_scale = 0.5;
        if (!base.negative_prompt) base.negative_prompt = "blur, distort, and low quality";
      } else if (model.falModelId.includes("seedance")) {
        base.duration = params.duration ?? "5";
        base.resolution = params.resolution ?? "720p";
        base.enable_safety_checker = true;
      }
      break;
    }
    case "image-to-video": {
      if (!params.imageUrl) throw new Error("imageUrl is required for image-to-video");
      base.aspect_ratio = params.aspectRatio ?? "auto";
      base.generate_audio = params.generateAudio ?? true;
      if (model.falModelId.includes("veo3.1")) {
        base.image_url = params.imageUrl;
        base.duration = params.duration ?? "8s";
        base.resolution = params.resolution ?? "720p";
        base.auto_fix = true;
      } else if (model.falModelId.includes("kling")) {
        base.start_image_url = params.imageUrl;
        base.duration = params.duration ?? "5";
        base.cfg_scale = 0.5;
        if (!base.negative_prompt) base.negative_prompt = "blur, distort, and low quality";
      } else if (model.falModelId.includes("seedance")) {
        base.image_url = params.imageUrl;
        base.duration = params.duration ?? "5";
        base.resolution = params.resolution ?? "720p";
        base.enable_safety_checker = true;
      }
      break;
    }
    case "extend-video": {
      if (!params.videoUrl) throw new Error("videoUrl is required for extend-video");
      base.video_url = params.videoUrl;
      base.aspect_ratio = params.aspectRatio ?? "auto";
      base.generate_audio = params.generateAudio ?? true;
      base.duration = "7s";
      base.resolution = "720p";
      break;
    }
    case "first-last-frame-to-video": {
      if (!params.firstFrameUrl || !params.lastFrameUrl) {
        throw new Error("firstFrameUrl and lastFrameUrl are required for first-last-frame-to-video");
      }
      base.first_frame_url = params.firstFrameUrl;
      base.last_frame_url = params.lastFrameUrl;
      base.aspect_ratio = params.aspectRatio ?? "auto";
      base.duration = params.duration ?? "8s";
      base.resolution = params.resolution ?? "720p";
      base.generate_audio = params.generateAudio ?? true;
      base.auto_fix = true;
      break;
    }
    case "reference-to-video": {
      if (!params.imageUrls || params.imageUrls.length === 0) {
        throw new Error("imageUrls is required for reference-to-video");
      }
      base.image_urls = params.imageUrls;
      base.aspect_ratio = params.aspectRatio ?? "16:9";
      base.duration = "8s";
      base.resolution = params.resolution ?? "720p";
      base.generate_audio = params.generateAudio ?? true;
      break;
    }
  }

  return base;
}
