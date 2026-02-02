/**
 * Web Fetch Tool
 *
 * Fetches and extracts content from web pages.
 */

import { defineTool } from './sage-adapter';

export interface WebFetchArgs extends Record<string, unknown> {
  url: string;
  maxLength?: number;
}

export const webfetchTool = defineTool<WebFetchArgs>({
  name: 'webfetch',
  description: `Fetch content from a web URL.

Retrieves the page content and extracts readable text.
Useful for reading documentation, articles, or any web page content.`,
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch.',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum characters to return (default: 50000).',
      },
    },
    required: ['url'],
  },
  timeout: 30000,

  async execute(args, context) {
    const { url, maxLength = 50000 } = args;

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; StratusCode/0.1.0)',
          'Accept': 'text/html,application/xhtml+xml,text/plain,application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      let content: string;
      if (contentType.includes('application/json')) {
        // Return JSON as-is (formatted)
        try {
          content = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          content = text;
        }
      } else if (contentType.includes('text/html')) {
        // Extract text from HTML
        content = extractTextFromHtml(text);
      } else {
        // Return plain text
        content = text;
      }

      // Truncate if needed
      const truncated = content.length > maxLength;
      if (truncated) {
        content = content.slice(0, maxLength) + '\n\n... [truncated]';
      }

      return JSON.stringify({
        success: true,
        url,
        contentType,
        length: content.length,
        truncated,
        content,
      });
    } catch (error) {
      return JSON.stringify({
        error: true,
        url,
        message: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
});

// ============================================
// HTML Text Extraction
// ============================================

function extractTextFromHtml(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Convert common block elements to newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br)[^>]*>/gi, '\n');
  text = text.replace(/<(br|hr)[^>]*\/?>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Clean up whitespace
  text = text
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n');

  // Remove excessive newlines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&bull;': '•',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  };

  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }

  // Handle numeric entities
  result = result.replace(/&#(\d+);/g, (_, code) => {
    return String.fromCharCode(parseInt(code, 10));
  });

  result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) => {
    return String.fromCharCode(parseInt(code, 16));
  });

  return result;
}
