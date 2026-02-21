/**
 * Discovery helpers for full-corpus ingestion from gesetze.li.
 *
 * Crawls the Gebietssystematik tree and extracts all linked /konso/{id} laws.
 */

import { fetchLegislation } from './fetcher.js';

const BASE_URL = 'https://www.gesetze.li';
const START_URL = `${BASE_URL}/konso/gebietssystematik`;

export interface DiscoveredLaw {
  id: string;
  title: string;
  source_page: string;
}

export interface DiscoveryResult {
  discovered_at: string;
  pages_crawled: number;
  lrstart_nodes: string[];
  law_count: number;
  laws: DiscoveredLaw[];
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanAnchorText(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toGebietssystematikUrl(lrstart: string): string {
  return `${BASE_URL}/konso/gebietssystematik?lrstart=${encodeURIComponent(lrstart)}`;
}

function extractMatches(regex: RegExp, source: string): RegExpExecArray[] {
  const rows: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    rows.push(match);
  }
  return rows;
}

export async function discoverFullCorpusLaws(): Promise<DiscoveryResult> {
  const queue: string[] = [START_URL];
  const seenPages = new Set<string>();
  const lrstarts = new Set<string>();
  const laws = new Map<string, DiscoveredLaw>();

  while (queue.length > 0) {
    const pageUrl = queue.shift()!;
    if (seenPages.has(pageUrl)) {
      continue;
    }
    seenPages.add(pageUrl);

    const html = await fetchLegislation(pageUrl);

    for (const match of extractMatches(/href="\/konso\/gebietssystematik\?lrstart=([^"]+)"/g, html)) {
      const lrstart = match[1];
      if (!lrstarts.has(lrstart)) {
        lrstarts.add(lrstart);
      }
      const childUrl = toGebietssystematikUrl(lrstart);
      if (!seenPages.has(childUrl)) {
        queue.push(childUrl);
      }
    }

    for (const match of extractMatches(/<a\s+href="\/konso\/(\d{7,})"[^>]*>([\s\S]*?)<\/a>/g, html)) {
      const lawId = match[1];
      if (laws.has(lawId)) {
        continue;
      }
      laws.set(lawId, {
        id: lawId,
        title: cleanAnchorText(match[2]),
        source_page: pageUrl,
      });
    }
  }

  const sortedLaws = Array.from(laws.values()).sort((a, b) => a.id.localeCompare(b.id));
  const sortedLrstarts = Array.from(lrstarts).sort((a, b) => a.localeCompare(b));

  return {
    discovered_at: new Date().toISOString(),
    pages_crawled: seenPages.size,
    lrstart_nodes: sortedLrstarts,
    law_count: sortedLaws.length,
    laws: sortedLaws,
  };
}
