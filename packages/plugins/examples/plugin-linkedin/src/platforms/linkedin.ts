/**
 * LinkedIn API v2 integration.
 * Ported and adapted from unvrsmagic-dev — standalone, no external deps.
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";
import { LINKEDIN_API_URL } from "../constants.js";

// ── OAuth ───────────────────────────────────────────────────────────

const LINKEDIN_SCOPES = "openid profile email w_member_social";

export function buildLinkedInAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: LINKEDIN_SCOPES,
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

export interface LinkedInCredentials {
  accessToken: string;
  expiresAt: string;
  memberUrn: string;
  name: string;
  email: string;
  picture?: string;
  connectedAt: string;
}

export async function exchangeLinkedInCode(
  ctx: PluginContext,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<LinkedInCredentials> {
  // 1. Exchange code for access token
  const tokenRes = await ctx.http.fetch(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    },
  );

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`LinkedIn token exchange failed: ${err}`);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    expires_in: number;
  };

  // 2. Fetch user profile via OpenID Connect
  const profileRes = await ctx.http.fetch(
    `${LINKEDIN_API_URL}/v2/userinfo`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    },
  );

  if (!profileRes.ok) {
    const err = await profileRes.text();
    throw new Error(`LinkedIn profile fetch failed: ${err}`);
  }

  const profile = (await profileRes.json()) as {
    sub: string;
    name: string;
    email: string;
    picture?: string;
  };

  return {
    accessToken: tokenData.access_token,
    expiresAt: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    memberUrn: profile.sub,
    name: profile.name,
    email: profile.email,
    picture: profile.picture,
    connectedAt: new Date().toISOString(),
  };
}

// ── Publishing ──────────────────────────────────────────────────────

export interface PublishResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

/** Publish a text-only or text+image post to LinkedIn */
export async function publishToLinkedIn(
  ctx: PluginContext,
  creds: LinkedInCredentials,
  text: string,
  imageUrl?: string,
  videoUrl?: string,
): Promise<PublishResult> {
  try {
    const personUrn = `urn:li:person:${creds.memberUrn}`;

    if (videoUrl) {
      return await publishVideoToLinkedIn(ctx, creds, personUrn, text, videoUrl);
    }
    if (imageUrl) {
      return await publishImageToLinkedIn(ctx, creds, personUrn, text, imageUrl);
    }
    return await publishTextToLinkedIn(ctx, creds, personUrn, text);
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function publishTextToLinkedIn(
  ctx: PluginContext,
  creds: LinkedInCredentials,
  personUrn: string,
  text: string,
): Promise<PublishResult> {
  const body = {
    author: personUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const res = await ctx.http.fetch(`${LINKEDIN_API_URL}/v2/ugcPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `LinkedIn post failed: ${err}` };
  }

  const data = (await res.json()) as { id?: string };
  return {
    success: true,
    postId: data.id,
    postUrl: data.id ? `https://www.linkedin.com/feed/update/${data.id}` : undefined,
  };
}

async function publishImageToLinkedIn(
  ctx: PluginContext,
  creds: LinkedInCredentials,
  personUrn: string,
  text: string,
  imageUrl: string,
): Promise<PublishResult> {
  const registerRes = await ctx.http.fetch(
    `${LINKEDIN_API_URL}/v2/assets?action=registerUpload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: personUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    },
  );

  if (!registerRes.ok) {
    const err = await registerRes.text();
    return { success: false, error: `LinkedIn image register failed: ${err}` };
  }

  const registerData = (await registerRes.json()) as {
    value: {
      uploadMechanism: {
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
          uploadUrl: string;
        };
      };
      asset: string;
    };
  };

  const uploadUrl =
    registerData.value.uploadMechanism[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ].uploadUrl;
  const asset = registerData.value.asset;

  const imageRes = await ctx.http.fetch(imageUrl, { method: "GET" });
  if (!imageRes.ok) {
    return { success: false, error: "Failed to download image" };
  }
  const imageBuffer = await imageRes.arrayBuffer();

  const uploadRes = await ctx.http.fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/octet-stream",
    },
    body: imageBuffer as unknown as string,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return { success: false, error: `LinkedIn image upload failed: ${err}` };
  }

  const postBody = {
    author: personUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "IMAGE",
        media: [
          {
            status: "READY",
            media: asset,
          },
        ],
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const postRes = await ctx.http.fetch(`${LINKEDIN_API_URL}/v2/ugcPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(postBody),
  });

  if (!postRes.ok) {
    const err = await postRes.text();
    return { success: false, error: `LinkedIn image post failed: ${err}` };
  }

  const postData = (await postRes.json()) as { id?: string };
  return {
    success: true,
    postId: postData.id,
    postUrl: postData.id
      ? `https://www.linkedin.com/feed/update/${postData.id}`
      : undefined,
  };
}

async function publishVideoToLinkedIn(
  ctx: PluginContext,
  creds: LinkedInCredentials,
  personUrn: string,
  text: string,
  videoUrl: string,
): Promise<PublishResult> {
  const initRes = await ctx.http.fetch(
    `${LINKEDIN_API_URL}/v2/videos?action=initializeUpload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: personUrn,
          fileSizeBytes: 0,
        },
      }),
    },
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    return { success: false, error: `LinkedIn video init failed: ${err}` };
  }

  const initData = (await initRes.json()) as {
    value: {
      uploadUrl: string;
      video: string;
    };
  };

  const videoRes = await ctx.http.fetch(videoUrl, { method: "GET" });
  if (!videoRes.ok) {
    return { success: false, error: "Failed to download video" };
  }
  const videoBuffer = await videoRes.arrayBuffer();

  const uploadRes = await ctx.http.fetch(initData.value.uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/octet-stream",
    },
    body: videoBuffer as unknown as string,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return { success: false, error: `LinkedIn video upload failed: ${err}` };
  }

  const finalizeRes = await ctx.http.fetch(
    `${LINKEDIN_API_URL}/v2/videos?action=finalizeUpload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: initData.value.video,
        },
      }),
    },
  );

  if (!finalizeRes.ok) {
    const err = await finalizeRes.text();
    return { success: false, error: `LinkedIn video finalize failed: ${err}` };
  }

  const postBody = {
    author: personUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "VIDEO",
        media: [
          {
            status: "READY",
            media: initData.value.video,
          },
        ],
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const postRes = await ctx.http.fetch(`${LINKEDIN_API_URL}/v2/ugcPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(postBody),
  });

  if (!postRes.ok) {
    const err = await postRes.text();
    return { success: false, error: `LinkedIn video post failed: ${err}` };
  }

  const postData = (await postRes.json()) as { id?: string };
  return {
    success: true,
    postId: postData.id,
    postUrl: postData.id
      ? `https://www.linkedin.com/feed/update/${postData.id}`
      : undefined,
  };
}
