import { afterAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { getAbout } from '../../src/tools/about.js';
import { listSources } from '../../src/tools/list-sources.js';
import { formatCitationTool } from '../../src/tools/format-citation.js';
import { validateCitationTool } from '../../src/tools/validate-citation.js';
import { getProvision } from '../../src/tools/get-provision.js';
import { searchLegislation } from '../../src/tools/search-legislation.js';
import { buildLegalStance } from '../../src/tools/build-legal-stance.js';
import { checkCurrency } from '../../src/tools/check-currency.js';
import { getEUBasis } from '../../src/tools/get-eu-basis.js';
import { getLiechtensteinImplementations } from '../../src/tools/get-liechtenstein-implementations.js';
import { searchEUImplementations } from '../../src/tools/search-eu-implementations.js';
import { getProvisionEUBasis } from '../../src/tools/get-provision-eu-basis.js';
import { validateEUCompliance } from '../../src/tools/validate-eu-compliance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REAL_DB_PATH = path.resolve(__dirname, '../../data/database.db');
const HAS_DB = fs.existsSync(REAL_DB_PATH);

let realDb: InstanceType<typeof Database>;

if (HAS_DB) {
  realDb = new Database(REAL_DB_PATH, { readonly: true });
}

afterAll(() => {
  if (HAS_DB) realDb.close();
});

function makeDb(sql?: string): Database.Database {
  const db = new Database(':memory:');
  if (sql) db.exec(sql);
  return db;
}

function makeCoreDb(status = 'in_force'): Database.Database {
  return makeDb(`
    CREATE TABLE legal_documents (
      id TEXT PRIMARY KEY,
      title TEXT,
      short_name TEXT,
      title_en TEXT,
      status TEXT,
      issued_date TEXT,
      in_force_date TEXT,
      url TEXT
    );
    CREATE TABLE legal_provisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT,
      provision_ref TEXT,
      chapter TEXT,
      section TEXT,
      title TEXT,
      content TEXT
    );

    INSERT INTO legal_documents(id, title, short_name, title_en, status, issued_date, in_force_date, url)
    VALUES ('doc-a', 'Example Act', 'EA', 'Example Act', '${status}', '2020-01-01', '2020-01-02', 'https://example.com/a');

    INSERT INTO legal_provisions(document_id, provision_ref, chapter, section, title, content)
    VALUES
      ('doc-a', 'art1', 'I. General', '1', 'Art. 1 Scope', 'This is section one about data.'),
      ('doc-a', 's2', 'I. General', '2', 'Art. 2 Terms', 'This is section two about processing.');
  `);
}

function makeEuDb(): Database.Database {
  return makeDb(`
    CREATE TABLE legal_documents (
      id TEXT PRIMARY KEY,
      title TEXT,
      short_name TEXT,
      title_en TEXT,
      status TEXT,
      issued_date TEXT,
      in_force_date TEXT,
      url TEXT
    );
    CREATE TABLE legal_provisions (
      id INTEGER PRIMARY KEY,
      document_id TEXT,
      provision_ref TEXT,
      chapter TEXT,
      section TEXT,
      title TEXT,
      content TEXT
    );
    CREATE TABLE eu_documents (
      id TEXT PRIMARY KEY,
      type TEXT,
      year INTEGER,
      number INTEGER,
      title TEXT,
      short_name TEXT,
      description TEXT
    );
    CREATE TABLE eu_references (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT,
      source_id TEXT,
      document_id TEXT,
      provision_id INTEGER,
      eu_document_id TEXT,
      eu_article TEXT,
      reference_type TEXT,
      reference_context TEXT,
      full_citation TEXT,
      is_primary_implementation INTEGER,
      implementation_status TEXT
    );

    INSERT INTO legal_documents(id, title, short_name, title_en, status, issued_date, in_force_date, url)
    VALUES
      ('doc-a', 'Example Act', 'EA', 'Example Act', 'in_force', '2020-01-01', '2020-01-02', 'https://example.com/a'),
      ('doc-b', 'Repealed Act', 'RA', 'Repealed Act', 'repealed', '2018-01-01', '2018-01-02', 'https://example.com/b');

    INSERT INTO legal_provisions(id, document_id, provision_ref, chapter, section, title, content)
    VALUES
      (1, 'doc-a', 'art1', 'I', '1', 'Art. 1', 'Implementation clause'),
      (2, 'doc-a', 'art2', 'I', '2', 'Art. 2', 'Reference clause'),
      (3, 'doc-b', 'art1', 'I', '1', 'Art. 1', 'Repealed compliance clause');

    INSERT INTO eu_documents(id, type, year, number, title, short_name, description)
    VALUES
      ('regulation:2016/679', 'regulation', 2016, 679, 'General Data Protection Regulation', 'GDPR', 'privacy'),
      ('directive:2022/2555', 'directive', 2022, 2555, 'NIS2', 'NIS2', 'cybersecurity');

    INSERT INTO eu_references(source_type, source_id, document_id, provision_id, eu_document_id, eu_article, reference_type, reference_context, full_citation, is_primary_implementation, implementation_status)
    VALUES
      ('provision', 'doc-a:art1', 'doc-a', 1, 'regulation:2016/679', '6', 'implements', 'implements GDPR', 'Regulation (EU) 2016/679', 1, 'complete'),
      ('provision', 'doc-a:art2', 'doc-a', 2, 'regulation:2016/679', NULL, 'references', 'references GDPR', 'Regulation (EU) 2016/679', 0, 'partial'),
      ('provision', 'doc-b:art1', 'doc-b', 3, 'directive:2022/2555', NULL, 'implements', 'unknown alignment', 'Directive (EU) 2022/2555', 1, 'unknown');
  `);
}

describe.skipIf(!HAS_DB)('about and list_sources', () => {
  it('returns populated about information from real database', () => {
    const about = getAbout(realDb as never, {
      version: '1.0.0',
      fingerprint: 'abc123',
      dbBuilt: '2026-02-21T00:00:00.000Z',
    });

    expect(about.server).toBe('liechtenstein-law-mcp');
    expect(about.statistics.documents).toBeGreaterThan(0);
    expect(about.statistics.provisions).toBeGreaterThan(0);
  });

  it('handles missing tables in about/list_sources safe counters', async () => {
    const db = makeDb();
    const about = getAbout(db as never, { version: '1', fingerprint: 'x', dbBuilt: 'y' });
    expect(about.statistics.documents).toBe(0);

    const sources = await listSources(db as never);
    expect(sources.results.database.document_count).toBe(0);
    expect(sources.results.database.provision_count).toBe(0);
    db.close();
  });
});

describe('format citation', () => {
  it('formats citations in all supported styles', async () => {
    const full = await formatCitationTool({ citation: 'Privacy Act 1988 s 13', format: 'full' });
    const short = await formatCitationTool({ citation: 'Section 13, Privacy Act 1988', format: 'short' });
    const pinpoint = await formatCitationTool({ citation: 'Section 13 Privacy Act 1988', format: 'pinpoint' });
    const fallback = await formatCitationTool({ citation: 'Privacy Act 1988' });
    const shortNoSection = await formatCitationTool({ citation: 'Privacy Act 1988', format: 'short' });
    const pinpointNoSection = await formatCitationTool({ citation: 'Privacy Act 1988', format: 'pinpoint' });

    expect(full.formatted).toContain('Section 13');
    expect(short.formatted).toContain('s 13');
    expect(pinpoint.formatted).toBe('s 13');
    expect(fallback.format).toBe('full');
    expect(shortNoSection.formatted).toBe('Privacy Act 1988');
    expect(pinpointNoSection.formatted).toBe('Privacy Act 1988');
  });
});

describe('validate citation', () => {
  it('returns parse error for empty citation', async () => {
    const db = makeCoreDb();
    const result = await validateCitationTool(db as never, { citation: '   ' });
    expect(result.results.valid).toBe(false);
    expect(result.results.warnings[0]).toContain('Could not parse citation');
    db.close();
  });

  it('handles document lookup failures and successful lookups', async () => {
    const db = makeCoreDb();

    const missing = await validateCitationTool(db as never, { citation: 'Missing Act s 1' });
    expect(missing.results.valid).toBe(false);
    expect(missing.results.warnings[0]).toContain('Document not found');

    const ok = await validateCitationTool(db as never, { citation: 'Section 1 Example Act' });
    expect(ok.results.valid).toBe(true);
    expect(ok.results.provision_ref).toBe('art1');

    const noSection = await validateCitationTool(db as never, { citation: 'Example Act' });
    expect(noSection.results.valid).toBe(true);
    expect(noSection.results.document_id).toBe('doc-a');

    const sectionWordLast = await validateCitationTool(db as never, { citation: 'Example Act Section 1' });
    expect(sectionWordLast.results.valid).toBe(true);
    expect(sectionWordLast.results.provision_ref).toBe('art1');

    const unknownSection = await validateCitationTool(db as never, { citation: 'Example Act s 999' });
    expect(unknownSection.results.valid).toBe(false);
    expect(unknownSection.results.warnings.join(' ')).toContain('not found');

    db.close();
  });

  it('adds warnings for repealed and amended statutes', async () => {
    const amendedDb = makeCoreDb('amended');
    const amended = await validateCitationTool(amendedDb as never, { citation: 'Example Act s 1' });
    expect(amended.results.warnings.join(' ')).toContain('amended');
    amendedDb.close();

    const repealedDb = makeCoreDb('repealed');
    const repealed = await validateCitationTool(repealedDb as never, { citation: 'Example Act s 1' });
    expect(repealed.results.warnings.join(' ')).toContain('repealed');
    repealedDb.close();
  });
});

describe.skipIf(!HAS_DB)('get provision', () => {
  it('returns no results for unknown documents', async () => {
    const result = await getProvision(realDb as never, { document_id: 'definitely-not-real' });
    expect(result.results).toEqual([]);
    expect('note' in result._metadata).toBe(true);
  });

  it('retrieves single provision by section/provision_ref and list all provisions', async () => {
    const bySection = await getProvision(realDb as never, {
      document_id: 'li-datenschutzgesetz',
      section: '1',
    });
    expect(bySection.results.length).toBe(1);

    const byProvisionRef = await getProvision(realDb as never, {
      document_id: 'li-datenschutzgesetz',
      provision_ref: 'art1',
    });
    expect(byProvisionRef.results.length).toBe(1);

    const notFound = await getProvision(realDb as never, {
      document_id: 'li-datenschutzgesetz',
      section: '9999',
    });
    expect(notFound.results).toEqual([]);
    expect('note' in notFound._metadata).toBe(true);

    const all = await getProvision(realDb as never, { document_id: 'li-e-commerce-gesetz' });
    expect(all.results.length).toBeGreaterThan(1);
  });

  it('returns undefined url when a document has null url', async () => {
    const db = makeCoreDb();
    db.exec("UPDATE legal_documents SET url = NULL WHERE id = 'doc-a';");

    const single = await getProvision(db as never, { document_id: 'doc-a', section: '1' });
    expect(single.results[0].url).toBeUndefined();

    const all = await getProvision(db as never, { document_id: 'doc-a' });
    expect(all.results[0].url).toBeUndefined();

    db.close();
  });
});

describe.skipIf(!HAS_DB)('search and legal stance tools', () => {
  it('handles empty queries', async () => {
    const s = await searchLegislation(realDb as never, { query: '   ' });
    const b = await buildLegalStance(realDb as never, { query: '' });
    expect(s.results).toEqual([]);
    expect(b.results).toEqual([]);
  });

  it('returns search results and applies filters/limits', async () => {
    const s = await searchLegislation(realDb as never, {
      query: 'personenbezogene Daten',
      document_id: 'li-datenschutzgesetz',
      status: 'in_force',
      limit: 2,
    });
    expect(s.results.length).toBeGreaterThan(0);
    expect(s.results.length).toBeLessThanOrEqual(2);

    const b = await buildLegalStance(realDb as never, {
      query: 'Cybersicherheit',
      document_id: 'li-cybersicherheitsgesetz',
      limit: 3,
    });
    expect(b.results.length).toBeGreaterThan(0);
    expect(b.results.length).toBeLessThanOrEqual(3);
  });

  it('swallows FTS errors and returns empty results when tables are missing', async () => {
    const db = makeCoreDb();
    const s = await searchLegislation(db as never, { query: 'data' });
    const b = await buildLegalStance(db as never, { query: 'data' });
    expect(s.results).toEqual([]);
    expect(b.results).toEqual([]);
    db.close();
  });
});

describe.skipIf(!HAS_DB)('check currency', () => {
  it('returns not_found for missing doc', async () => {
    const r = await checkCurrency(realDb as never, { document_id: 'missing' });
    expect(r.results.status).toBe('not_found');
  });

  it('returns warnings for repealed and not-yet-in-force statuses', async () => {
    const repealedDb = makeCoreDb('repealed');
    const repealed = await checkCurrency(repealedDb as never, { document_id: 'doc-a' });
    expect(repealed.results.warnings.join(' ')).toContain('repealed');
    repealedDb.close();

    const futureDb = makeCoreDb('not_yet_in_force');
    const future = await checkCurrency(futureDb as never, { document_id: 'doc-a' });
    expect(future.results.warnings.join(' ')).toContain('not yet entered');
    futureDb.close();
  });
});

describe('EU basis and implementation tools', () => {
  it('handles missing EU tables gracefully', async () => {
    const db = makeCoreDb();

    const basis = await getEUBasis(db as never, { document_id: 'doc-a' });
    expect('note' in basis._metadata).toBe(true);

    const impl = await getLiechtensteinImplementations(db as never, { eu_document_id: 'regulation:2016/679' });
    expect('note' in impl._metadata).toBe(true);

    const search = await searchEUImplementations(db as never, { query: 'GDPR' });
    expect('note' in search._metadata).toBe(true);

    const provBasis = await getProvisionEUBasis(db as never, {
      document_id: 'doc-a',
      provision_ref: '1',
    });
    expect('note' in provBasis._metadata).toBe(true);

    const compliance = await validateEUCompliance(db as never, { document_id: 'doc-a' });
    expect(compliance.results.compliance_status).toBe('not_applicable');
    expect(compliance.results.warnings.join(' ')).toContain('not available');

    db.close();
  });

  it('returns expected eu basis search and implementation data', async () => {
    const db = makeEuDb();

    const missingDoc = await getEUBasis(db as never, { document_id: 'missing-doc' });
    expect(missingDoc.results).toEqual([]);

    const basis = await getEUBasis(db as never, {
      document_id: 'doc-a',
      include_articles: true,
      reference_types: ['implements', 'references'],
    });
    expect(basis.results.length).toBeGreaterThan(0);
    expect(basis.results[0].eu_document_id).toBe('regulation:2016/679');

    const implAll = await getLiechtensteinImplementations(db as never, {
      eu_document_id: 'regulation:2016/679',
    });
    expect(implAll.results.length).toBeGreaterThan(0);

    const implPrimary = await getLiechtensteinImplementations(db as never, {
      eu_document_id: 'regulation:2016/679',
      primary_only: true,
      in_force_only: true,
    });
    expect(implPrimary.results.length).toBeGreaterThan(0);

    const euSearch = await searchEUImplementations(db as never, {
      query: 'Data Protection',
      type: 'regulation',
      year_from: 2015,
      year_to: 2020,
      has_liechtenstein_implementation: true,
      limit: 1,
    });
    expect(euSearch.results.length).toBe(1);

    const euSearchDefaultLimit = await searchEUImplementations(db as never, {
      query: 'NIS2',
      type: 'directive',
      has_liechtenstein_implementation: true,
    });
    expect(euSearchDefaultLimit.results.length).toBeGreaterThan(0);

    const provBasisMissingDoc = await getProvisionEUBasis(db as never, {
      document_id: 'missing',
      provision_ref: '1',
    });
    expect(provBasisMissingDoc.results).toEqual([]);

    const provBasisMissingProvision = await getProvisionEUBasis(db as never, {
      document_id: 'doc-a',
      provision_ref: '999',
    });
    expect(provBasisMissingProvision.results).toEqual([]);

    const provBasis = await getProvisionEUBasis(db as never, {
      document_id: 'doc-a',
      provision_ref: '1',
    });
    expect(provBasis.results.length).toBeGreaterThan(0);

    db.close();
  });
});

describe('validate eu compliance', () => {
  it('handles document not found', async () => {
    const db = makeEuDb();
    const missing = await validateEUCompliance(db as never, { document_id: 'nope' });
    expect(missing.results.compliance_status).toBe('not_applicable');
    expect(missing.results.warnings.join(' ')).toContain('Document not found');
    db.close();
  });

  it('returns not_applicable when eu references count is zero', async () => {
    const db = makeEuDb();
    db.exec("DELETE FROM eu_references WHERE document_id = 'doc-a';");

    const result = await validateEUCompliance(db as never, { document_id: 'doc-a' });
    expect(result.results.compliance_status).toBe('not_applicable');
    expect(result.results.recommendations.join(' ')).toContain('No EU cross-references');

    db.close();
  });

  it('returns compliant, partial, and unclear statuses from implementation stats', async () => {
    const compliantDb = makeDb(`
      CREATE TABLE legal_documents (id TEXT PRIMARY KEY, title TEXT, short_name TEXT, title_en TEXT, status TEXT);
      CREATE TABLE eu_references (document_id TEXT, eu_document_id TEXT, implementation_status TEXT, reference_type TEXT);
      INSERT INTO legal_documents VALUES ('doc-c','Compliant Act','CA','Compliant Act','in_force');
      INSERT INTO eu_references VALUES ('doc-c','regulation:2016/679','complete','implements');
    `);
    const compliant = await validateEUCompliance(compliantDb as never, { document_id: 'doc-c' });
    expect(compliant.results.compliance_status).toBe('compliant');
    compliantDb.close();

    const partialDb = makeEuDb();
    const partial = await validateEUCompliance(partialDb as never, { document_id: 'doc-a' });
    expect(partial.results.compliance_status).toBe('partial');
    expect(partial.results.warnings.join(' ')).toContain('partial');

    const filtered = await validateEUCompliance(partialDb as never, {
      document_id: 'doc-a',
      eu_document_id: 'regulation:2016/679',
    });
    expect(filtered.results.eu_references_found).toBeGreaterThan(0);
    partialDb.close();

    const unclearDb = makeEuDb();
    unclearDb.exec("DELETE FROM eu_references WHERE document_id = 'doc-b' AND implementation_status != 'unknown';");
    const unclear = await validateEUCompliance(unclearDb as never, { document_id: 'doc-b' });
    expect(unclear.results.compliance_status).toBe('unclear');
    expect(unclear.results.warnings.join(' ')).toContain('repealed');
    expect(unclear.results.recommendations.join(' ')).toContain('unknown');
    unclearDb.close();
  });
});
