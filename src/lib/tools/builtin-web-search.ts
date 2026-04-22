// ============================================================
// MADO - Web Search / Fetch Utility
// 使用 DuckDuckGo HTML 抓取实现免费搜索（无需 API Key）
// ============================================================

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  maxResults?: number;
}

/**
 * 使用 DuckDuckGo HTML 页面实现无 API Key 搜索
 */
export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const maxResults = options.maxResults ?? 5;
  const encodedQuery = encodeURIComponent(query);

  try {
    const response = await fetch(
      `https://duckduckgo.com/html/?q=${encodedQuery}&kl=zh-cn`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      }
    );

    if (!response.ok) throw new Error(`Search failed: ${response.status}`);

    const html = await response.text();
    return parseDuckDuckGoHTML(html, maxResults);
  } catch {
    // Fallback: try Bing API
    return fallbackSearch(query, maxResults);
  }
}

/**
 * 从 DuckDuckGo HTML 中解析搜索结果
 */
function parseDuckDuckGoHTML(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo HTML 结果卡片正则
  const cardRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null && results.length < maxResults) {
    const url = match[1];
    const title = decodeHTMLEntities(match[2].trim());
    const snippet = decodeHTMLEntities(match[3].trim().replace(/<[^>]+>/g, ''));
    results.push({ title, url, snippet });
  }

  // 如果正则匹配失败，尝试备用解析
  if (results.length === 0) {
    return fallbackParse(html, maxResults);
  }

  return results;
}

function fallbackParse(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
  let match;
  const seen = new Set<string>();

  while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
    const url = match[1];
    const title = decodeHTMLEntities(match[2].trim());

    if (seen.has(url) || url.includes('duckduckgo') || url.includes('yahoo.com') || title.length < 10) {
      continue;
    }
    seen.add(url);
    results.push({ title, url, snippet: title });
  }

  return results;
}

async function fallbackSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  try {
    // 使用 SerpAPI 公开接口（限制）
    const response = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&num=${maxResults}&source=html`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (response.ok) {
      const data = await response.json();
      return (data.organic_results ?? []).slice(0, maxResults).map((r: { title?: string; link?: string; snippet?: string }) => ({
        title: r.title ?? '',
        url: r.link ?? '',
        snippet: r.snippet ?? '',
      }));
    }
  } catch {}
  return [];
}

/**
 * 抓取网页内容（简化版）
 */
export async function fetchPage(url: string, query: string = ''): Promise<string> {
  // 简单实现：通过代理服务抓取
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

    const response = await fetch(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    let html = await response.text();
    html = stripScripts(html);
    html = stripStyles(html);

    // 提取 body 内容
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;

    // 移除标签并清理
    let text = bodyContent
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 如果有查询关键词，找到最相关的段落
    if (query) {
      const lowerText = text.toLowerCase();
      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const scored: { pos: number; score: number; text: string }[] = [];

      const sentences = text.split(/[.。!！?？]/);
      for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i].trim();
        if (s.length < 20) continue;
        const lower = s.toLowerCase();
        const score = keywords.filter(k => lower.includes(k)).length;
        if (score > 0) {
          scored.push({ pos: i, score, text: s });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      if (scored.length > 0) {
        text = scored.slice(0, 5).map(s => s.text).join('。\n');
        if (text.length < 100) {
          text = sentences.slice(0, 10).join('。');
        }
      } else {
        text = sentences.slice(0, 15).join('。');
      }
    } else {
      // 无关键词时截取前 2000 字符
      text = text.substring(0, 2000);
    }

    return decodeHTMLEntities(text);
  } catch (e) {
    throw new Error(`无法获取页面: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// -------------------- HTML 工具 --------------------

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

function stripScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}

function stripStyles(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '');
}

export const WebFetch = { search, fetchPage };
