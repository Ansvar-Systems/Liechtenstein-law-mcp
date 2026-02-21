#!/usr/bin/env tsx
/**
 * Full-corpus ingestion for Liechtenstein Law MCP from https://www.gesetze.li/konso.
 *
 * Discovers all laws via Gebietssystematik and ingests each /konso/html/{id} page.
 * Unparseable or unreachable laws are skipped and documented in a report.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { discoverFullCorpusLaws, type DiscoveredLaw, type DiscoveryResult } from './lib/discovery.js';
import { fetchLegislation } from './lib/fetcher.js';
import {
  parseLiechtensteinFrameHtml,
  TARGET_LAWS,
  type ParsedAct,
  type TargetLaw,
} from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const DISCOVERY_PATH = path.resolve(SOURCE_DIR, 'full-corpus-discovery.json');
const INGEST_REPORT_PATH = path.resolve(SOURCE_DIR, 'full-corpus-ingestion-report.json');

interface FullIngestArgs {
  limit: number | null;
  resume: boolean;
  discoverOnly: boolean;
  refreshDiscovery: boolean;
}

interface SkipRecord {
  law_id: string;
  document_id: string;
  url: string;
  reason: string;
}

interface FullIngestReport {
  generated_at: string;
  discovery: {
    pages_crawled: number;
    lrstart_nodes: number;
    law_count: number;
  };
  attempted: number;
  ingested: number;
  cached: number;
  skipped: number;
  total_provisions: number;
  total_definitions: number;
  skipped_laws: SkipRecord[];
}

interface IngestionRow {
  lawId: string;
  documentId: string;
  seedFile: string;
  status: 'ingested' | 'cached' | 'skipped';
  provisions: number;
  definitions: number;
  reason?: string;
}

function parseArgs(): FullIngestArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let resume = false;
  let discoverOnly = false;
  let refreshDiscovery = false;

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
    if (arg === '--resume') {
      resume = true;
      continue;
    }
    if (arg === '--discover-only') {
      discoverOnly = true;
      continue;
    }
    if (arg === '--refresh-discovery') {
      refreshDiscovery = true;
    }
  }

  return { limit, resume, discoverOnly, refreshDiscovery };
}

function ensureDirectories(): void {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function cleanSeedDirectory(): void {
  for (const file of fs.readdirSync(SEED_DIR)) {
    if (file.endsWith('.json')) {
      fs.unlinkSync(path.join(SEED_DIR, file));
    }
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function toAbsoluteLawUrl(lawId: string): string {
  return `https://www.gesetze.li/konso/${lawId}`;
}

function toFrameUrl(lawId: string): string {
  return `https://www.gesetze.li/konso/html/${lawId}`;
}

function normalizeKonsoId(segment: string): string | null {
  const cleaned = segment.trim();
  if (/^\d{7,}$/.test(cleaned)) {
    return cleaned;
  }
  const dotted = cleaned.match(/^(\d{4})\.(\d{1,3})$/);
  if (dotted) {
    const year = dotted[1];
    const number = dotted[2].padStart(3, '0');
    return `${year}${number}000`;
  }
  return null;
}

function deriveShortName(title: string, lawId: string): string {
  const parenthetical = title.match(/\(([^)]+)\)\s*$/);
  if (parenthetical) {
    const parts = parenthetical[1].split(/[;,]/).map(p => p.trim()).filter(Boolean);
    const candidate = parts[parts.length - 1];
    if (candidate && candidate.length <= 40) {
      return candidate;
    }
  }

  const year = lawId.slice(0, 4);
  const number = lawId.length >= 7 ? lawId.slice(4, 7) : lawId;
  return `LGBl ${year}.${number}`;
}

function documentIdForLaw(lawId: string): string {
  return `li-konso-${lawId}`;
}

function targetLawFromDiscovery(
  law: DiscoveredLaw,
  knownByKonsoId: Map<string, TargetLaw>,
): TargetLaw {
  const known = knownByKonsoId.get(law.id);
  if (known) {
    return known;
  }

  const generatedId = documentIdForLaw(law.id);
  return {
    id: generatedId,
    seedFile: `${generatedId}.json`,
    shortName: deriveShortName(law.title, law.id),
    titleEn: '',
    lawUrl: toAbsoluteLawUrl(law.id),
    description: law.title || `Liechtenstein consolidated law ${law.id}`,
  };
}

function buildKnownLawMap(): Map<string, TargetLaw> {
  const map = new Map<string, TargetLaw>();
  for (const law of TARGET_LAWS) {
    const segment = law.lawUrl.split('/').pop() ?? '';
    const normalized = normalizeKonsoId(segment);
    if (!normalized) {
      continue;
    }
    map.set(normalized, law);
  }
  return map;
}

function loadOrDiscover(refreshDiscovery: boolean): Promise<DiscoveryResult> {
  if (!refreshDiscovery && fs.existsSync(DISCOVERY_PATH)) {
    return Promise.resolve(readJson<DiscoveryResult>(DISCOVERY_PATH));
  }
  return discoverFullCorpusLaws().then(result => {
    writeJson(DISCOVERY_PATH, result);
    return result;
  });
}

function writeSeed(seedFile: string, act: ParsedAct): void {
  writeJson(path.join(SEED_DIR, seedFile), act);
}

async function main(): Promise<void> {
  const args = parseArgs();
  ensureDirectories();

  console.log('Liechtenstein Law MCP — Full-corpus ingestion');
  console.log('Source: https://www.gesetze.li/konso');
  if (args.limit) console.log(`--limit ${args.limit}`);
  if (args.resume) console.log('--resume');
  if (args.discoverOnly) console.log('--discover-only');
  if (args.refreshDiscovery) console.log('--refresh-discovery');
  console.log('');

  const discovery = await loadOrDiscover(args.refreshDiscovery);
  if (!fs.existsSync(DISCOVERY_PATH)) {
    writeJson(DISCOVERY_PATH, discovery);
  }

  console.log(`Discovery pages crawled: ${discovery.pages_crawled}`);
  console.log(`Discovery lrstart nodes: ${discovery.lrstart_nodes.length}`);
  console.log(`Discovery law links: ${discovery.law_count}`);
  console.log(`Discovery file: ${path.relative(process.cwd(), DISCOVERY_PATH)}`);
  console.log('');

  if (args.discoverOnly) {
    return;
  }

  const selected = args.limit ? discovery.laws.slice(0, args.limit) : discovery.laws;
  const knownByKonsoId = buildKnownLawMap();

  if (!args.resume) {
    cleanSeedDirectory();
  }

  const rows: IngestionRow[] = [];
  const skipped: SkipRecord[] = [];
  let totalProvisions = 0;
  let totalDefinitions = 0;

  for (let i = 0; i < selected.length; i++) {
    const discoveredLaw = selected[i];
    const lawDescriptor = targetLawFromDiscovery(discoveredLaw, knownByKonsoId);
    const seedPath = path.join(SEED_DIR, lawDescriptor.seedFile);

    if (args.resume && fs.existsSync(seedPath)) {
      rows.push({
        lawId: discoveredLaw.id,
        documentId: lawDescriptor.id,
        seedFile: lawDescriptor.seedFile,
        status: 'cached',
        provisions: 0,
        definitions: 0,
      });
      if ((i + 1) % 100 === 0 || i + 1 === selected.length) {
        console.log(`Progress: ${i + 1}/${selected.length}`);
      }
      continue;
    }

    try {
      const frameHtml = await fetchLegislation(toFrameUrl(discoveredLaw.id));
      const parsed = parseLiechtensteinFrameHtml(frameHtml, lawDescriptor);

      if (!parsed.provisions || parsed.provisions.length === 0) {
        const reason = 'No provisions parsed from source HTML';
        skipped.push({
          law_id: discoveredLaw.id,
          document_id: lawDescriptor.id,
          url: lawDescriptor.lawUrl,
          reason,
        });
        rows.push({
          lawId: discoveredLaw.id,
          documentId: lawDescriptor.id,
          seedFile: lawDescriptor.seedFile,
          status: 'skipped',
          provisions: 0,
          definitions: 0,
          reason,
        });
      } else {
        writeSeed(lawDescriptor.seedFile, parsed);
        totalProvisions += parsed.provisions.length;
        totalDefinitions += parsed.definitions.length;
        rows.push({
          lawId: discoveredLaw.id,
          documentId: lawDescriptor.id,
          seedFile: lawDescriptor.seedFile,
          status: 'ingested',
          provisions: parsed.provisions.length,
          definitions: parsed.definitions.length,
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      skipped.push({
        law_id: discoveredLaw.id,
        document_id: lawDescriptor.id,
        url: lawDescriptor.lawUrl,
        reason,
      });
      rows.push({
        lawId: discoveredLaw.id,
        documentId: lawDescriptor.id,
        seedFile: lawDescriptor.seedFile,
        status: 'skipped',
        provisions: 0,
        definitions: 0,
        reason,
      });
    }

    if ((i + 1) % 100 === 0 || i + 1 === selected.length) {
      console.log(`Progress: ${i + 1}/${selected.length}`);
    }
  }

  const ingested = rows.filter(row => row.status === 'ingested').length;
  const cached = rows.filter(row => row.status === 'cached').length;
  const skippedCount = rows.filter(row => row.status === 'skipped').length;

  const report: FullIngestReport = {
    generated_at: new Date().toISOString(),
    discovery: {
      pages_crawled: discovery.pages_crawled,
      lrstart_nodes: discovery.lrstart_nodes.length,
      law_count: discovery.law_count,
    },
    attempted: selected.length,
    ingested,
    cached,
    skipped: skippedCount,
    total_provisions: totalProvisions,
    total_definitions: totalDefinitions,
    skipped_laws: skipped,
  };
  writeJson(INGEST_REPORT_PATH, report);

  console.log('\nIngestion summary');
  console.log('-----------------');
  console.log(`Attempted: ${report.attempted}`);
  console.log(`Ingested: ${report.ingested}`);
  console.log(`Cached: ${report.cached}`);
  console.log(`Skipped: ${report.skipped}`);
  console.log(`Total provisions: ${report.total_provisions}`);
  console.log(`Total definitions: ${report.total_definitions}`);
  console.log(`Report: ${path.relative(process.cwd(), INGEST_REPORT_PATH)}`);

  if (skippedCount > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('Fatal full-corpus ingestion error:', error);
  process.exit(1);
});
