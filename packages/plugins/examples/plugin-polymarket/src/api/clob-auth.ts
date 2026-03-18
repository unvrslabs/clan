import type { PluginContext } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG } from "../constants.js";

/**
 * CLOB API Authentication
 *
 * Polymarket's CLOB requires L2 credentials for authenticated endpoints:
 * - Place order
 * - Cancel order
 * - Get positions
 * - Get balance
 *
 * Authentication flow:
 * 1. Derive L2 key pair from Polygon wallet private key
 * 2. Use HMAC-SHA256 to sign requests
 * 3. Include signature in headers
 *
 * This module provides the infrastructure for live trading.
 * The actual signing uses the Web Crypto API (available in Node.js 18+).
 */

export interface L2Credentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export interface ClobAuthHeaders {
  "POLY_ADDRESS": string;
  "POLY_SIGNATURE": string;
  "POLY_TIMESTAMP": string;
  "POLY_NONCE": string;
  "POLY_API_KEY"?: string;
  "POLY_PASSPHRASE"?: string;
}

/**
 * Derives L2 credentials from a Polygon wallet.
 * In production, this calls the CLOB /auth/derive-api-key endpoint.
 */
export async function deriveL2Credentials(
  ctx: PluginContext,
  walletAddress: string,
  signature: string,
): Promise<L2Credentials> {
  const config = { ...DEFAULT_CONFIG, ...(await ctx.config.get()) } as typeof DEFAULT_CONFIG;
  const baseUrl = config.polymarketClobApiUrl;

  const resp = await ctx.http.fetch(`${baseUrl}/auth/derive-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: walletAddress,
      signature,
      nonce: Date.now().toString(),
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to derive L2 credentials: ${resp.status} — ${text}`);
  }

  return (await resp.json()) as L2Credentials;
}

/**
 * Creates HMAC-SHA256 signature for CLOB API requests.
 * Uses Web Crypto API for cross-platform compatibility.
 */
export async function createHmacSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string = "",
): Promise<string> {
  const message = `${timestamp}${method.toUpperCase()}${path}${body}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Builds authenticated headers for CLOB API requests.
 */
export async function buildAuthHeaders(
  credentials: L2Credentials,
  method: string,
  path: string,
  body: string = "",
): Promise<Record<string, string>> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await createHmacSignature(
    credentials.secret,
    timestamp,
    method,
    path,
    body,
  );

  return {
    "POLY_API_KEY": credentials.apiKey,
    "POLY_PASSPHRASE": credentials.passphrase,
    "POLY_SIGNATURE": signature,
    "POLY_TIMESTAMP": timestamp,
    "Content-Type": "application/json",
  };
}

// NOTE: placeOrderLive, cancelOrderLive, getOpenOrdersLive, getBalanceLive
// are implemented in clob-live.ts using @polymarket/clob-client SDK
// which handles EIP-712 order signing. The HMAC auth above is only for
// auxiliary authenticated endpoints that don't require EIP-712 signatures.
