import { afterAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { buildTools, registerTools } from '../../src/tools/registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REAL_DB_PATH = path.resolve(__dirname, '../../data/database.db');

const realDb = new Database(REAL_DB_PATH, { readonly: true });

afterAll(() => {
  realDb.close();
});

class FakeServer {
  handlers = new Map<unknown, (request?: any) => Promise<any>>();

  setRequestHandler(schema: unknown, handler: (request?: any) => Promise<any>) {
    this.handlers.set(schema, handler);
  }
}

describe('registry buildTools', () => {
  it('includes base tools and conditionally includes about', () => {
    const toolsWithoutAbout = buildTools(realDb as never);
    expect(toolsWithoutAbout.find(t => t.name === 'about')).toBeUndefined();
    expect(toolsWithoutAbout.find(t => t.name === 'list_sources')).toBeDefined();

    const toolsWithAbout = buildTools(realDb as never, {
      version: '1.0.0',
      fingerprint: 'abc',
      dbBuilt: '2026-02-21T00:00:00.000Z',
    });
    expect(toolsWithAbout.find(t => t.name === 'about')).toBeDefined();
  });

  it('handles definitions-table probe failure', () => {
    const db = new Database(':memory:');
    const tools = buildTools(db as never);
    expect(tools.find(t => t.name === 'list_sources')).toBeDefined();
    db.close();
  });
});

describe('registry handlers', () => {
  it('registers list and call handlers and routes all tools', async () => {
    const server = new FakeServer();

    registerTools(server as never, realDb as never, {
      version: '1.0.0',
      fingerprint: 'abc',
      dbBuilt: '2026-02-21T00:00:00.000Z',
    });

    const listHandler = server.handlers.get(ListToolsRequestSchema);
    const callHandler = server.handlers.get(CallToolRequestSchema);

    expect(listHandler).toBeDefined();
    expect(callHandler).toBeDefined();

    const listed = await listHandler!();
    expect(listed.tools.length).toBeGreaterThan(0);

    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [
      { name: 'search_legislation', args: { query: 'Datenschutz', limit: 1 } },
      { name: 'get_provision', args: { document_id: 'li-datenschutzgesetz', section: '1' } },
      { name: 'validate_citation', args: { citation: 'Section 1 Datenschutzgesetz' } },
      { name: 'build_legal_stance', args: { query: 'Cybersicherheit', limit: 1 } },
      { name: 'format_citation', args: { citation: 'Section 1 Datenschutzgesetz', format: 'short' } },
      { name: 'check_currency', args: { document_id: 'li-datenschutzgesetz' } },
      { name: 'get_eu_basis', args: { document_id: 'li-datenschutzgesetz' } },
      { name: 'get_liechtenstein_implementations', args: { eu_document_id: 'regulation:2016/679' } },
      { name: 'search_eu_implementations', args: { query: 'Regulation', limit: 1 } },
      { name: 'get_provision_eu_basis', args: { document_id: 'li-datenschutzgesetz', provision_ref: '1' } },
      { name: 'validate_eu_compliance', args: { document_id: 'li-datenschutzgesetz' } },
      { name: 'list_sources', args: {} },
      { name: 'about', args: {} },
    ];

    for (const item of calls) {
      const res = await callHandler!({ params: { name: item.name, arguments: item.args } });
      expect(res.isError).not.toBe(true);
      expect(res.content[0].type).toBe('text');
      expect(typeof res.content[0].text).toBe('string');
      expect(res.content[0].text.length).toBeGreaterThan(0);
    }
  });

  it('returns explicit errors for about without context, unknown tools, and thrown handlers', async () => {
    const server = new FakeServer();
    registerTools(server as never, realDb as never);

    const callHandler = server.handlers.get(CallToolRequestSchema)!;

    const aboutWithoutContext = await callHandler({ params: { name: 'about', arguments: {} } });
    expect(aboutWithoutContext.isError).toBe(true);
    expect(aboutWithoutContext.content[0].text).toContain('not configured');

    const unknown = await callHandler({ params: { name: 'no_such_tool', arguments: {} } });
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0].text).toContain('Unknown tool');

    const thrown = await callHandler({ params: { name: 'format_citation', arguments: undefined } });
    expect(thrown.isError).toBe(true);
    expect(thrown.content[0].text).toContain('Error:');

    const thrownString = await callHandler({
      params: {
        name: 'format_citation',
        arguments: {
          get citation() {
            throw 'string failure';
          },
        },
      },
    });
    expect(thrownString.isError).toBe(true);
    expect(thrownString.content[0].text).toContain('string failure');
  });
});
