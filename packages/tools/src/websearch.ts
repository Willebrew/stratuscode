/**
 * Web Search Tool
 *
 * Performs web searches using DuckDuckGo.
 */

import { defineTool } from './sage-adapter';

export interface WebSearchArgs extends Record<string, unknown> {
  query: string;
  maxResults?: number;
}

export const websearchTool = defineTool<WebSearchArgs>({
  name: 'websearch',
  description: `Search the web for information.

Returns a list of search results with titles, URLs, and snippets.
Use this to find current information, documentation, or answers to questions.`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query.',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5, max: 10).',
      },
    },
    required: ['query'],
  },
  timeout: 30000,

  async execute(args, context) {
    const { query, maxResults = 5 } = args;
    const limit = Math.min(maxResults, 10);

    try {
      // Use DuckDuckGo HTML search (no API key required)
      const results = await searchDuckDuckGo(query, limit);

      return JSON.stringify({
        success: true,
        query,
        results,
        message: `Found ${results.length} result(s) for "${query}"`,
      });
    } catch (error) {
      return JSON.stringify({
        error: true,
        message: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
});

// ============================================
// DuckDuckGo Search
// ============================================

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  // Use DuckDuckGo Lite for simpler HTML parsing
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; StratusCode/0.1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status}`);
  }

  const html = await response.text();
  return parseSearchResults(html, limit);
}

function parseSearchResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Simple regex-based parsing for DuckDuckGo Lite results
  // Look for result links and their descriptions
  const linkRegex = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  const snippetRegex = /<td[^>]+class="result-snippet"[^>]*>([^<]+)<\/td>/gi;

  const links: Array<{ url: string; title: string }> = [];
  const snippets: string[] = [];

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    links.push({
      url: match[1]!,
      title: decodeHtmlEntities(match[2]!.trim()),
    });
  }

  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(decodeHtmlEntities(match[1]!.trim()));
  }

  // Combine links with snippets
  for (let i = 0; i < Math.min(links.length, snippets.length, limit); i++) {
    const link = links[i];
    const snippet = snippets[i];
    if (link && snippet) {
      results.push({
        title: link.title,
        url: link.url,
        snippet: snippet,
      });
    }
  }

  // Fallback: try alternative parsing if no results found
  if (results.length === 0) {
    // Try parsing regular anchor tags with URLs
    const hrefRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    while ((match = hrefRegex.exec(html)) !== null && results.length < limit) {
      const url = match[1]!;
      const title = decodeHtmlEntities(match[2]!.trim());
      
      // Filter out DuckDuckGo internal links
      if (!url.includes('duckduckgo.com') && title.length > 0) {
        results.push({
          title,
          url,
          snippet: '',
        });
      }
    }
  }

  return results;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
