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
  displayName: "LinkedIn Personal",
  description:
    "Connect your LinkedIn personal profile and let agents publish posts on your behalf.",
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
      linkedinClientId: {
        type: "string",
        title: "LinkedIn Client ID",
        description: "LinkedIn OAuth Client ID",
        default: DEFAULT_CONFIG.linkedinClientId,
      },
      linkedinClientSecret: {
        type: "string",
        title: "LinkedIn Client Secret",
        description: "LinkedIn OAuth Client Secret",
        default: DEFAULT_CONFIG.linkedinClientSecret,
      },
      oauthRedirectBaseUrl: {
        type: "string",
        title: "OAuth Redirect Base URL",
        description:
          "Base URL for OAuth redirects (e.g. https://aicompany.unvrslabs.dev). Must be registered with LinkedIn.",
        default: DEFAULT_CONFIG.oauthRedirectBaseUrl,
      },
    },
  },
  tools: [
    {
      name: TOOL_NAMES.publishLinkedin,
      displayName: "Publish to LinkedIn",
      description:
        "Publishes a post with optional image or video to the connected LinkedIn profile.",
      parametersSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Post text content",
          },
          imageUrl: {
            type: "string",
            description: "Public URL of an image to attach",
          },
          videoUrl: {
            type: "string",
            description: "Public URL of a video to attach",
          },
        },
        required: ["text"],
      },
    },
    {
      name: TOOL_NAMES.listConnections,
      displayName: "List LinkedIn Connection",
      description: "Shows whether LinkedIn is connected for this company.",
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
        displayName: "LinkedIn Personal",
        exportName: EXPORT_NAMES.page,
        routePath: PAGE_ROUTE,
      },
      {
        type: "settingsPage",
        id: SLOT_IDS.settingsPage,
        displayName: "LinkedIn Personal Settings",
        exportName: EXPORT_NAMES.settingsPage,
      },
      {
        type: "page",
        id: SLOT_IDS.oauthCallback,
        displayName: "OAuth Callback",
        exportName: EXPORT_NAMES.oauthCallback,
        routePath: "linkedin-oauth-callback",
      },
    ],
  },
};

export default manifest;
