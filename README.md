# Liechtenstein Law MCP

Liechtenstein law database for cybersecurity compliance via Model Context Protocol (MCP).

## Features

- **Full-text search** across legislation provisions (FTS5 with BM25 ranking)
- **Article-level retrieval** for specific legal provisions
- **Citation validation** to prevent hallucinated references
- **Currency checks** to verify if laws are still in force

## Quick Start

### Claude Code (Remote)
```bash
claude mcp add liechtenstein-law --transport http https://liechtenstein-law-mcp.vercel.app/mcp
```

### Local (npm)
```bash
npx @ansvar/liechtenstein-law-mcp
```

## Data Sources

Official consolidated law texts from Lilex (`https://www.gesetze.li/konso`), ingested from
the Gebietssystematik corpus and parsed into provision-level JSON seeds.

- Seed files: `data/seed/*.json`
- Full-corpus discovery script: `npm run ingest:discover`
- Full-corpus ingestion script: `npm run ingest:full`

## License

Apache-2.0
