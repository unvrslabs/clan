import type { PluginContext } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG } from "../constants.js";

export interface WebResearchResult {
  query: string;
  results: { title: string; url: string; text: string }[];
  summary: string;
}

/**
 * Runs the Apify RAG Web Browser actor to search the web for information
 * relevant to a prediction market question.
 */
export async function webResearch(
  ctx: PluginContext,
  query: string,
  maxResults = 5,
): Promise<WebResearchResult> {
  const config = { ...DEFAULT_CONFIG, ...(await ctx.config.get()) } as typeof DEFAULT_CONFIG;

  let apiKey: string;
  if (config.apifyApiKeyRef) {
    apiKey = await ctx.secrets.resolve(config.apifyApiKeyRef);
  } else {
    throw new Error("Apify API key is not configured. Set apifyApiKeyRef in plugin settings.");
  }

  // Run the RAG Web Browser actor synchronously (waits for results)
  const resp = await ctx.http.fetch(
    "https://api.apify.com/v2/acts/apify~rag-web-browser/run-sync-get-dataset-items?token=" + apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        maxResults,
        outputFormats: ["text"],
        requestTimeoutSecs: 30,
      }),
    },
  );

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Apify API error: ${resp.status} — ${errorText}`);
  }

  const items = (await resp.json()) as {
    metadata?: { title?: string; url?: string };
    text?: string;
    markdown?: string;
  }[];

  const results = (items ?? [])
    .filter((item) => item.text || item.markdown)
    .map((item) => ({
      title: item.metadata?.title || "Untitled",
      url: item.metadata?.url || "",
      text: (item.text || item.markdown || "").slice(0, 2000), // Limit text length
    }));

  // Build a summary of all sources
  const summary = results.length > 0
    ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.text.slice(0, 500)}`).join("\n\n---\n\n")
    : "No relevant results found.";

  return { query, results, summary };
}

/**
 * Performs multiple searches to gather comprehensive research on a market question.
 * Returns combined results from different search angles.
 */
export async function deepResearch(
  ctx: PluginContext,
  question: string,
  description?: string,
): Promise<{ searches: WebResearchResult[]; combinedContext: string }> {
  // Search 1: Direct question
  const search1 = webResearch(ctx, question, 3);

  // Search 2: Recent news about the topic
  const topicKeywords = question
    .replace(/will|by|before|after|in|the|a|an|be|is|are|has|have|does|do|\?/gi, "")
    .trim();
  const search2 = webResearch(ctx, `latest news ${topicKeywords} 2026`, 3);

  // Search 3: If there's a description, search for specific context
  const search3 = description
    ? webResearch(ctx, description.slice(0, 200), 2)
    : Promise.resolve<WebResearchResult>({ query: "", results: [], summary: "" });

  const [result1, result2, result3] = await Promise.all([search1, search2, search3]);

  const searches = [result1, result2];
  if (result3.results.length > 0) searches.push(result3);

  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const allResults: { title: string; url: string; text: string }[] = [];
  for (const search of searches) {
    for (const r of search.results) {
      if (r.url && !seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        allResults.push(r);
      }
    }
  }

  const combinedContext = allResults.length > 0
    ? allResults
        .map((r, i) => `SOURCE ${i + 1}: ${r.title} (${r.url})\n${r.text.slice(0, 800)}`)
        .join("\n\n---\n\n")
    : "No research results available. Rely on general knowledge only.";

  return { searches, combinedContext };
}
