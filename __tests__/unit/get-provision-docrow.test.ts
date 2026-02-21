import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../src/utils/statute-id.js', () => ({
  resolveDocumentId: () => 'ghost-id',
}));

import { getProvision } from '../../src/tools/get-provision.js';

describe('get_provision doc row guard', () => {
  it('returns empty results when resolved id has no matching legal_documents row', async () => {
    const db = new Database(':memory:');
    db.exec(`
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
    `);

    const result = await getProvision(db as never, { document_id: 'anything' });
    expect(result.results).toEqual([]);

    db.close();
  });
});
