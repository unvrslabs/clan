export const PLUGIN_ID = "paperclip-linkedin";
export const PLUGIN_VERSION = "0.1.0";
export const PAGE_ROUTE = "linkedin";

export const SLOT_IDS = {
  page: "linkedin-page",
  settingsPage: "linkedin-settings-page",
  oauthCallback: "linkedin-oauth-callback",
} as const;

export const EXPORT_NAMES = {
  page: "LinkedInPage",
  settingsPage: "LinkedInSettingsPage",
  oauthCallback: "LinkedInOAuthCallback",
} as const;

export const TOOL_NAMES = {
  publishLinkedin: "publish-linkedin",
  listConnections: "list-connections",
} as const;

export const ACTION_KEYS = {
  startLinkedinOAuth: "start-linkedin-oauth",
  completeLinkedinOAuth: "complete-linkedin-oauth",
  disconnectPlatform: "disconnect-platform",
  listConnections: "list-connections",
} as const;

export const STATE_KEYS = {
  linkedinToken: "linkedin-token",
} as const;

export const LINKEDIN_API_URL = "https://api.linkedin.com";

export const DEFAULT_CONFIG = {
  linkedinClientId: "",
  linkedinClientSecret: "",
  oauthRedirectBaseUrl: "",
} as const;
