import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';

import { detectCapabilities, readDbMetadata, upgradeMessage } from '../../src/capabilities.js';
import { normalizeAsOfDate } from '../../src/utils/as-of-date.js';
import { sanitizeFtsInput, buildFtsQueryVariants } from '../../src/utils/fts-query.js';
import { generateResponseMetadata } from '../../src/utils/metadata.js';
import { resolveDocumentId } from '../../src/utils/statute-id.js';
import {
  SERVER_NAME,
  SERVER_VERSION,
  SERVER_LABEL,
  PACKAGE_NAME,
  REPOSITORY_URL,
  DB_ENV_VAR,
} from '../../src/constants.js';

function makeDb(sql?: string): Database.Database {
  const db = new Database(':memory:');
  if (sql) {
    db.exec(sql);
  }
  return db;
}

describe('constants', () => {
  it('exports expected constant values', () => {
    expect(SERVER_NAME).toBe('liechtenstein-law-mcp');
    expect(SERVER_VERSION).toBe('1.0.0');
    expect(SERVER_LABEL).toContain('Liechtenstein');
    expect(PACKAGE_NAME).toBe('@ansvar/liechtenstein-law-mcp');
    expect(REPOSITORY_URL).toContain('Liechtenstein-law-mcp');
    expect(DB_ENV_VAR).toBe('LIECHTENSTEIN_LAW_DB_PATH');
  });
});

describe('capabilities', () => {
  it('detects all capabilities from available tables', () => {
    const db = makeDb(`
      CREATE TABLE legal_documents (id TEXT);
      CREATE TABLE legal_provisions (id INTEGER);
      CREATE VIRTUAL TABLE provisions_fts USING fts5(content);
      CREATE TABLE eu_documents (id TEXT);
      CREATE TABLE eu_references (id INTEGER);
      CREATE TABLE case_law (id TEXT);
      CREATE TABLE preparatory_works (id TEXT);
    `);

    const caps = detectCapabilities(db as never);
    expect(caps.has('core_legislation')).toBe(true);
    expect(caps.has('eu_references')).toBe(true);
    expect(caps.has('case_law')).toBe(true);
    expect(caps.has('preparatory_works')).toBe(true);
    db.close();
  });

  it('returns defaults when db_metadata table is missing', () => {
    const db = makeDb();
    const meta = readDbMetadata(db as never);
    expect(meta.tier).toBe('free');
    expect(meta.schema_version).toBe('1.0');
    expect(meta.built_at).toBeUndefined();
    db.close();
  });

  it('reads db metadata values', () => {
    const db = makeDb(`
      CREATE TABLE db_metadata (key TEXT, value TEXT);
      INSERT INTO db_metadata(key, value) VALUES
        ('tier', 'pro'),
        ('schema_version', '2.1'),
        ('built_at', '2026-02-21T00:00:00.000Z'),
        ('builder', 'test-suite');
    `);

    const meta = readDbMetadata(db as never);
    expect(meta.tier).toBe('pro');
    expect(meta.schema_version).toBe('2.1');
    expect(meta.built_at).toContain('2026');
    expect(meta.builder).toBe('test-suite');
    db.close();
  });

  it('formats upgrade message', () => {
    expect(upgradeMessage('eu references')).toContain('eu references');
  });
});

describe('as-of-date utils', () => {
  it('normalizes date formats and handles invalid input', () => {
    expect(normalizeAsOfDate(undefined)).toBeNull();
    expect(normalizeAsOfDate('')).toBeNull();
    expect(normalizeAsOfDate('2026-02-21')).toBe('2026-02-21');
    expect(normalizeAsOfDate('2026-02-21T12:34:56Z')).toBe('2026-02-21');
    expect(normalizeAsOfDate('not-a-date')).toBeNull();
  });
});

describe('fts utils', () => {
  it('sanitizes and builds query variants', () => {
    expect(sanitizeFtsInput('  "privacy" (law)*  ')).toBe('privacy law');
    expect(buildFtsQueryVariants('')).toEqual([]);
    expect(buildFtsQueryVariants('privacy')).toEqual(['privacy', 'privacy*']);
    expect(buildFtsQueryVariants('privacy law')).toEqual([
      '"privacy law"',
      'privacy AND law',
      'privacy AND law*',
    ]);
  });
});

describe('metadata utils', () => {
  it('generates metadata with freshness when built_at exists', () => {
    const db = makeDb(`
      CREATE TABLE db_metadata (key TEXT, value TEXT);
      INSERT INTO db_metadata(key, value) VALUES ('built_at', '2026-02-21T00:00:00.000Z');
    `);

    const meta = generateResponseMetadata(db as never);
    expect(meta.data_source).toContain('gesetze.li');
    expect(meta.jurisdiction).toBe('EE');
    expect(meta.freshness).toContain('2026');
    db.close();
  });

  it('handles missing metadata table', () => {
    const db = makeDb();
    const meta = generateResponseMetadata(db as never);
    expect(meta.freshness).toBeUndefined();
    db.close();
  });
});

describe('statute id resolver', () => {
  it('resolves by id, title, short_name, case-insensitive fallback, and returns null', () => {
    const db = makeDb(`
      CREATE TABLE legal_documents (
        id TEXT PRIMARY KEY,
        title TEXT,
        short_name TEXT,
        title_en TEXT,
        status TEXT
      );
      INSERT INTO legal_documents(id, title, short_name, title_en, status)
      VALUES
        ('doc-1', 'Datenschutzgesetz (DSG)', 'DSG', 'Data Protection Act', 'in_force'),
        ('doc-2', 'Kommunikationsgesetz', 'KomG', 'Communications Act', 'in_force');
    `);

    expect(resolveDocumentId(db as never, 'doc-1')).toBe('doc-1');
    expect(resolveDocumentId(db as never, 'Data Protection')).toBe('doc-1');
    expect(resolveDocumentId(db as never, 'KomG')).toBe('doc-2');
    expect(resolveDocumentId(db as never, 'kommunikationsgesetz')).toBe('doc-2');
    expect(resolveDocumentId(db as never, '   ')).toBeNull();
    expect(resolveDocumentId(db as never, 'non-existent')).toBeNull();

    db.close();
  });

  it('uses LOWER(...) fallback when LIKE is case-sensitive', () => {
    const db = makeDb(`
      PRAGMA case_sensitive_like = ON;
      CREATE TABLE legal_documents (
        id TEXT PRIMARY KEY,
        title TEXT,
        short_name TEXT,
        title_en TEXT,
        status TEXT
      );
      INSERT INTO legal_documents(id, title, short_name, title_en, status)
      VALUES ('doc-3', 'MIXED Title', 'MT', 'Mixed Title EN', 'in_force');
    `);

    expect(resolveDocumentId(db as never, 'mixed title')).toBe('doc-3');
    db.close();
  });
});
