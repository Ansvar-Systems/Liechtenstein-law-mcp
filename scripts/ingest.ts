#!/usr/bin/env tsx
/**
 * Liechtenstein Law MCP -- Real ingestion from https://www.gesetze.li/konso
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchLegislation } from './lib/fetcher.js';
import {
  TARGET_LAWS,
  parseLiechtensteinFrameHtml,
  type ParsedAct,
  type TargetLaw,
} from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

interface IngestArgs {
  limit: number | null;
  skipFetch: boolean;
}

interface IngestResult {
  id: string;
  title: string;
  url: string;
  seedFile: string;
  provisions: number;
  definitions: number;
  status: 'ok' | 'cached' | 'failed';
  error?: string;
}

function parseArgs(): IngestArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit' && args[i + 1]) {
      const parsed = Number.parseInt(args[i + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = parsed;
      }
      i++;
      continue;
    }

    if (arg === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, skipFetch };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function toAbsoluteGesetzeUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  return `https://www.gesetze.li${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

function extractIframeUrl(outerHtml: string): string {
  const iframeMatch = outerHtml.match(/<iframe[^>]*src="([^"]+)"/i);
  if (!iframeMatch) {
    throw new Error('No iframe src found in law page');
  }

  return toAbsoluteGesetzeUrl(decodeHtmlEntities(iframeMatch[1]));
}

function ensureDirectories(): void {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function cleanSeedDirectory(): void {
  const expected = new Set(TARGET_LAWS.map(law => law.seedFile));
  for (const file of fs.readdirSync(SEED_DIR)) {
    if (!file.endsWith('.json')) continue;
    if (expected.has(file)) continue;
    fs.unlinkSync(path.join(SEED_DIR, file));
  }
}

function writeSeedFile(seedFile: string, act: ParsedAct): void {
  const outputPath = path.join(SEED_DIR, seedFile);
  fs.writeFileSync(outputPath, `${JSON.stringify(act, null, 2)}\n`, 'utf-8');
}

async function fetchLawSourceFiles(law: TargetLaw, skipFetch: boolean): Promise<{ outerHtml: string; frameHtml: string }> {
  const outerPath = path.join(SOURCE_DIR, `${law.id}.outer.html`);
  const framePath = path.join(SOURCE_DIR, `${law.id}.frame.html`);

  let outerHtml: string;
  if (skipFetch && fs.existsSync(outerPath)) {
    outerHtml = fs.readFileSync(outerPath, 'utf-8');
  } else {
    outerHtml = await fetchLegislation(law.lawUrl);
    fs.writeFileSync(outerPath, outerHtml, 'utf-8');
  }

  const iframeUrl = extractIframeUrl(outerHtml);

  let frameHtml: string;
  if (skipFetch && fs.existsSync(framePath)) {
    frameHtml = fs.readFileSync(framePath, 'utf-8');
  } else {
    frameHtml = await fetchLegislation(iframeUrl);
    fs.writeFileSync(framePath, frameHtml, 'utf-8');
  }

  return { outerHtml, frameHtml };
}

async function ingestLaw(law: TargetLaw, skipFetch: boolean): Promise<IngestResult> {
  const { frameHtml } = await fetchLawSourceFiles(law, skipFetch);
  const parsed = parseLiechtensteinFrameHtml(frameHtml, law);

  if (parsed.provisions.length === 0) {
    throw new Error(`No provisions parsed for ${law.id}`);
  }

  writeSeedFile(law.seedFile, parsed);

  return {
    id: law.id,
    title: parsed.title,
    url: law.lawUrl,
    seedFile: law.seedFile,
    provisions: parsed.provisions.length,
    definitions: parsed.definitions.length,
    status: skipFetch ? 'cached' : 'ok',
  };
}

async function main(): Promise<void> {
  const { limit, skipFetch } = parseArgs();
  const laws = limit ? TARGET_LAWS.slice(0, limit) : TARGET_LAWS;

  ensureDirectories();
  cleanSeedDirectory();

  console.log('Liechtenstein Law MCP -- Real data ingestion');
  console.log('Source: https://www.gesetze.li/konso (official portal)');
  console.log(`Laws selected: ${laws.length}`);
  if (limit) console.log(`--limit ${limit}`);
  if (skipFetch) console.log('--skip-fetch');
  console.log('');

  const results: IngestResult[] = [];

  for (const law of laws) {
    process.stdout.write(`Fetching and parsing ${law.id} ... `);
    try {
      const result = await ingestLaw(law, skipFetch);
      results.push(result);
      console.log(`OK (${result.provisions} provisions, ${result.definitions} definitions)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: law.id,
        title: law.shortName,
        url: law.lawUrl,
        seedFile: law.seedFile,
        provisions: 0,
        definitions: 0,
        status: 'failed',
        error: message,
      });
      console.log(`FAILED (${message})`);
    }
  }

  const okCount = results.filter(r => r.status === 'ok' || r.status === 'cached').length;
  const failed = results.filter(r => r.status === 'failed');
  const totalProvisions = results.reduce((sum, r) => sum + r.provisions, 0);
  const totalDefinitions = results.reduce((sum, r) => sum + r.definitions, 0);

  console.log('\nIngestion summary');
  console.log('-----------------');
  console.log(`Succeeded: ${okCount}/${results.length}`);
  console.log(`Total provisions: ${totalProvisions}`);
  console.log(`Total definitions: ${totalDefinitions}`);
  console.log('');

  for (const result of results) {
    const status = result.status.toUpperCase();
    console.log(`${status.padEnd(7)} ${result.id.padEnd(28)} ${String(result.provisions).padStart(4)} provisions  ${result.seedFile}`);
  }

  if (failed.length > 0) {
    console.log('\nFailed laws:');
    for (const item of failed) {
      console.log(`- ${item.id}: ${item.error}`);
    }
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});
