# Liechtenstein Law MCP Server

<!-- ANSVAR-CTA-BEGIN -->
> ### ▶ Try this MCP instantly via Ansvar Gateway
> **50 free queries/day · no card required · OAuth signup at [ansvar.eu/gateway](https://ansvar.eu/gateway)**
>
> One endpoint, one OAuth signup, access from any MCP-compatible client.

### Connect

**Claude Code** (one line):

```bash
claude mcp add ansvar --transport http https://gateway.ansvar.eu/mcp
```

**Claude Desktop / Cursor** — add to `claude_desktop_config.json` (or `mcp.json`):

```json
{
  "mcpServers": {
    "ansvar": {
      "type": "url",
      "url": "https://gateway.ansvar.eu/mcp"
    }
  }
}
```

**Claude.ai** — Settings → Connectors → Add custom connector → paste `https://gateway.ansvar.eu/mcp`

First request opens an OAuth flow at [ansvar.eu/gateway](https://ansvar.eu/gateway). After signup, your client is bound to your account; tier (free / premium / team / company) determines fan-out, quota, and which downstream MCPs are reachable.

---

## Self-host this MCP

You can also clone this repo and build the corpus yourself. The schema,
fetcher, and tool implementations all live here. What is not in the repo is
the pre-built database — TDM and standards-licensing constraints on the
upstream sources mean we host the corpus on Ansvar infrastructure rather
than redistribute it as a public artifact.

Build your own: run this repo's ingestion script (entry-point varies per
repo — typically `scripts/ingest.sh`, `npm run ingest`, or `make ingest`;
check the repo root).
<!-- ANSVAR-CTA-END -->


**The liechtensteinisches-landesgesetzblatt.li alternative for the AI age.**

[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Liechtenstein-law-mcp?style=social)](https://github.com/Ansvar-Systems/Liechtenstein-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Liechtenstein-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Liechtenstein-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/Liechtenstein-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/Liechtenstein-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/EU_INTEGRATION_GUIDE.md)
[![Provisions](https://img.shields.io/badge/provisions-73%2C213-blue)](docs/EU_INTEGRATION_GUIDE.md)

Query **3,614 Liechtenstein statutes** -- from the Datenschutzgesetz and Personen- und Gesellschaftsrecht to the Strafgesetzbuch, E-Commerce-Gesetz, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Liechtenstein legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Liechtenstein legal research means navigating [gesetze.li](https://www.gesetze.li/konso), the LLGBl (Liechtensteinisches Landesgesetzblatt) publications, and cross-referencing EEA Agreement annexes. Whether you're:
- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking EEA-derived obligations under Liechtenstein law
- A **legal tech developer** building tools on Liechtenstein law
- A **researcher** tracing EEA implementation across Liechtenstein statutes

...you shouldn't need dozens of browser tabs and manual cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Liechtenstein law **searchable, cross-referenceable, and AI-readable**.

---

## Example Queries

Once connected, just ask naturally (queries in German):

- *"Was sagt das Datenschutzgesetz (DSG) über die Einwilligung zur Datenverarbeitung?"*
- *"Ist das Personen- und Gesellschaftsrecht (PGR) noch in Kraft?"*
- *"Suche nach Bestimmungen über 'Datenschutz' im liechtensteinischen Recht"*
- *"Welche EU-Richtlinien setzt Liechtenstein über das EWR-Abkommen um?"*
- *"Was regelt das Strafgesetzbuch zum Thema Cyberkriminalität?"*
- *"Suche nach 'Gesellschaft' im PGR"*
- *"Welche liechtensteinischen Gesetze setzen die DSGVO um?"*
- *"Zitierformat für Art. 5 Abs. 1 DSG prüfen"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Statutes** | 3,614 statutes | Comprehensive Liechtenstein legislation from gesetze.li |
| **Provisions** | 73,213 sections | Full-text searchable with FTS5 |
| **Database Size** | Available after ingestion | Optimized SQLite, portable |
| **Daily Updates** | Automated | Freshness checks against gesetze.li |

**Verified data only** -- every citation is validated against official sources (gesetze.li / LLGBl). Zero LLM-generated content.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from gesetze.li (official Liechtenstein legal database)
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains statute text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by statute identifier and article number
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
gesetze.li / LLGBl --> Parse --> SQLite --> FTS5 snippet() --> MCP response
                         ^                        ^
                  Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search gesetze.li by statute name | Search by plain German: *"Datenschutz Einwilligung"* |
| Navigate multi-article statutes manually | Get the exact provision with context |
| Manual cross-referencing between statutes | `build_legal_stance` aggregates across sources |
| "Ist dieses Gesetz noch in Kraft?" -- manuell prüfen | `check_currency` tool -- answer in seconds |
| Find EEA basis -- dig through EEA Agreement annexes | `get_eu_basis` -- linked EU directives instantly |
| No API, no integration | MCP protocol -- AI-native |

**Traditional:** gesetze.li suchen --> PDF herunterladen --> Strg+F --> EWR-Anhänge prüfen --> Wiederholen

**This MCP:** *"Welche DSGVO-Anforderungen setzt das liechtensteinische DSG um?"* --> Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 search on 73,213 provisions with BM25 ranking |
| `get_provision` | Retrieve specific provision by statute identifier and article number |
| `validate_citation` | Validate citation against database (zero-hallucination check) |
| `build_legal_stance` | Aggregate citations from statutes and cross-references |
| `format_citation` | Format citations per Liechtenstein conventions (full/short/pinpoint) |
| `check_currency` | Check if statute is in force, amended, or repealed |
| `list_sources` | List all available statutes with metadata and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### EU/EEA Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get EU directives/regulations implemented by Liechtenstein statute via EEA Agreement |
| `get_liechtenstein_implementations` | Find Liechtenstein laws implementing a specific EU/EEA act |
| `search_eu_implementations` | Search EU documents with Liechtenstein implementation counts |
| `get_provision_eu_basis` | Get EU/EEA law references for a specific provision |
| `validate_eu_compliance` | Check EEA implementation status of Liechtenstein statutes |

---

## EU/EEA Law Integration

Liechtenstein is a member of the **European Economic Area (EEA)** via the EEA Agreement, which means it implements the core EU Single Market legislation without being an EU member state.

| Topic | Status |
|-------|--------|
| **EEA Membership** | Full EEA member since 1995 |
| **GDPR Equivalent** | Liechtenstein implemented GDPR via Datenschutzgesetz (DSG) -- full EEA-equivalent data protection |
| **EU Single Market Directives** | Implemented via EEA Joint Committee Decisions (Annex IX and others) |
| **Schengen Area** | Liechtenstein is part of Schengen -- border-free travel and associated legislation |

Liechtenstein implements EU law via the EEA Agreement, including the GDPR equivalent, product liability directives, financial services regulations, and consumer protection rules. The EU bridge tools let you trace which Liechtenstein statutes implement which EU acts, and verify EEA compliance.

> **Note:** Not all EU law applies to Liechtenstein. EEA coverage excludes Common Foreign and Security Policy, justice and home affairs (with exceptions), and other non-Single Market areas. The EU tools reflect EEA-relevant instruments.

---

## Data Sources & Freshness

All content is sourced from authoritative Liechtenstein legal databases:

- **[gesetze.li](https://www.gesetze.li/konso)** -- Official consolidated Liechtenstein statutes (Liechtensteinisches Landesgesetzblatt)

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Stabsstelle für Landesrecht, Liechtenstein |
| **Retrieval method** | gesetze.li consolidated statute database |
| **Language** | German |
| **License** | Open access (gesetze.li public domain) |
| **Coverage** | 3,614 consolidated statutes |

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors gesetze.li for changes:

| Check | Method |
|-------|--------|
| **Statute amendments** | Drift detection against known provision anchors |
| **New statutes** | Comparison against gesetze.li index |
| **Repealed statutes** | Status change detection |

**Verified data only** -- every citation is validated against official sources. Zero LLM-generated content.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from gesetze.li (official Liechtenstein legal database). However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** -- do not rely solely on this for case law research
> - **Verify critical citations** against primary sources (LLGBl) for court filings
> - **EEA cross-references** reflect implementation relationships, not direct EU law applicability

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. See [PRIVACY.md](PRIVACY.md) for bar association compliance guidance.

> For guidance from your bar association: **Liechtensteinische Rechtsanwaltskammer**

---

## Documentation

- **[EU Integration Guide](docs/EU_INTEGRATION_GUIDE.md)** -- Detailed EEA cross-reference documentation
- **[EU Usage Examples](docs/EU_USAGE_EXAMPLES.md)** -- Practical EEA lookup examples
- **[Security Policy](SECURITY.md)** -- Vulnerability reporting and scanning details
- **[Disclaimer](DISCLAIMER.md)** -- Legal disclaimers and professional use notices
- **[Privacy](PRIVACY.md)** -- Client confidentiality and data handling

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Liechtenstein-law-mcp
cd Liechtenstein-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest                    # Ingest statutes from gesetze.li
npm run ingest:full               # Full ingestion with discovery
npm run build:db                  # Rebuild SQLite database
npm run drift:detect              # Run drift detection against anchors
npm run check-updates             # Check for amendments and new statutes
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** Optimized SQLite (efficient, portable)
- **Reliability:** 100% ingestion success rate across 3,614 statutes

---

## More Ansvar MCPs

Full fleet at [ansvar.eu/gateway](https://ansvar.eu/gateway).
## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Court case law from Liechtenstein's Oberste Gerichtshof
- EEA cross-reference expansion
- Historical statute versions and LLGBl amendment tracking
- English translations for key statutes

---

## Roadmap

- [x] Core statute database with FTS5 search
- [x] Full corpus ingestion (3,614 statutes, 73,213 provisions)
- [x] EEA/EU law integration tools
- [x] Vercel Streamable HTTP deployment

- [x] Daily freshness checks against gesetze.li
- [ ] Court case law (Liechtensteinisches Landesgericht and Oberste Gerichtshof)
- [ ] Historical statute versions (LLGBl amendment tracking)
- [ ] English translations for key statutes
- [ ] Expanded EEA cross-reference database

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{liechtenstein_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Liechtenstein Law MCP Server: Production-Grade Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Liechtenstein-law-mcp},
  note = {3,614 Liechtenstein statutes with 73,213 provisions sourced from gesetze.li}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes:** Stabsstelle für Landesrecht, Liechtenstein (public access)
- **EU/EEA Metadata:** EUR-Lex (EU public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. This MCP server makes 3,614 Liechtenstein statutes searchable from any AI client -- no browser tabs, no PDFs, no manual cross-referencing.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
