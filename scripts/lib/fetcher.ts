/**
 * Rate-limited fetcher for Liechtenstein legislation pages on gesetze.li.
 *
 * Strategy:
 * - Fetch consolidated law pages under /konso/{LGBl}
 * - Fetch statute text frames under /konso/html/{id}?version={n}
 * - Respectful delay between requests (1.5 seconds)
 * - Retry on transient 429/5xx responses
 */

const USER_AGENT = 'Ansvar-Law-MCP/1.0 (legal-data-ingestion; contact: hello@ansvar.ai)';
const parsedDelay = Number.parseInt(process.env.GESETZE_MIN_DELAY_MS ?? '1500', 10);
const MIN_DELAY_MS = Number.isFinite(parsedDelay) && parsedDelay >= 1000 ? parsedDelay : 1500;

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function applyRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

/**
 * Fetches legislation text from gesetze.li.
 */
export async function fetchLegislation(url: string, maxRetries = 3): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await applyRateLimit();

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-CH,de;q=0.9,en;q=0.6',
      },
    });

    if (response.ok) {
      return response.text();
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxRetries) {
        const backoffMs = Math.min(8000, 1000 * Math.pow(2, attempt + 1));
        console.warn(`  HTTP ${response.status} for ${url}, retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
        continue;
      }
    }

    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  throw new Error(`Failed to fetch ${url} after ${maxRetries + 1} attempts`);
}
