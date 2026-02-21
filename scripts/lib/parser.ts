export interface TargetLaw {
  id: string;
  seedFile: string;
  shortName: string;
  titleEn: string;
  lawUrl: string;
  description: string;
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date: string;
  in_force_date: string;
  url: string;
  description: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

interface Heading {
  index: number;
  text: string;
}

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '',
  sect: '§',
  ndash: '-',
  mdash: '-',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  eacute: 'é',
  agrave: 'à',
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
};

const GERMAN_MONTHS: Record<string, string> = {
  januar: '01',
  februar: '02',
  maerz: '03',
  märz: '03',
  april: '04',
  mai: '05',
  juni: '06',
  juli: '07',
  august: '08',
  september: '09',
  oktober: '10',
  november: '11',
  dezember: '12',
};

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const cp = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    }
    if (entity.startsWith('#')) {
      const cp = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
    }
    return ENTITY_MAP[entity] ?? _;
  });
}

function stripTags(input: string): string {
  return input
    .replace(/<a[^>]*href="#fn\d+"[^>]*>[\s\S]*?<\/a>/gi, ' ')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|tr|table|li|ul|ol|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeText(input: string): string {
  return decodeHtmlEntities(stripTags(input))
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function cleanInlineText(input: string): string {
  return decodeHtmlEntities(stripTags(input))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSection(raw: string): string {
  return raw
    .trim()
    .replace(/^0+([1-9])/, '$1')
    .replace(/[^0-9A-Za-z]+/g, '');
}

function parseGermanDate(raw: string | undefined): string {
  if (!raw) return '';
  const cleaned = decodeHtmlEntities(raw).replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/);
  if (!match) return '';

  const day = match[1].padStart(2, '0');
  const monthKey = match[2].toLowerCase();
  const month = GERMAN_MONTHS[monthKey] ?? GERMAN_MONTHS[monthKey.replace('ä', 'ae')];
  if (!month) return '';

  return `${match[3]}-${month}-${day}`;
}

function extractFrameTitle(frameHtml: string): string {
  const meta = frameHtml.match(/<meta\s+name="description"\s+content="([^"]+)"\s*\/?>/i);
  if (!meta) return '';
  return cleanInlineText(meta[1]);
}

function extractHeadings(frameHtml: string): Heading[] {
  const headings: Heading[] = [];
  const headingRegex = /<div class="(tit1m|tit1|tit2|tit3)"[^>]*>([\s\S]*?)<\/div>/gi;

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(frameHtml)) !== null) {
    const text = cleanInlineText(match[2]);
    if (!text || /Inhaltsverzeichnis/i.test(text)) {
      continue;
    }
    headings.push({ index: match.index, text });
  }

  return headings;
}

function extractArticleTitle(block: string, headingPrefix: string): string {
  const titleMatch = block.match(/<div class="sacht">([\s\S]*?)<\/div>/i);
  if (!titleMatch) {
    return headingPrefix;
  }

  const titleText = cleanInlineText(titleMatch[1]);
  if (!titleText) {
    return headingPrefix;
  }

  return `${headingPrefix} ${titleText}`;
}

function extractArticleContent(block: string): string {
  const firstContentIdx = block.search(/<div class="(?:abs|bst1|ziff)"[^>]*>/i);
  const base = firstContentIdx >= 0
    ? block.slice(firstContentIdx)
    : block
      .replace(/<a name="(?:art|par):[^"]+"><\/a>\s*(?:Art\.|&sect;)\s*[0-9A-Za-z]+/i, '')
      .replace(/<div class="sacht">[\s\S]*?<\/div>/i, '');

  return normalizeText(base);
}

function extractDefinitions(provisions: ParsedProvision[]): ParsedDefinition[] {
  const definitions: ParsedDefinition[] = [];
  const seen = new Set<string>();

  for (const provision of provisions) {
    const scanSource = `${provision.title}\n${provision.content}`;
    if (!/(Begriffsbestimmungen|Begriffe|Im Sinne dieses Gesetzes|bedeutet|gelten als)/i.test(scanSource)) {
      continue;
    }

    const regexes = [
      /"([^"\n]{2,120})"\s*:\s*([^\n]{8,600})/g,
      /„([^“\n]{2,120})“\s*:\s*([^\n]{8,600})/g,
    ];

    for (const regex of regexes) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(scanSource)) !== null) {
        const term = match[1].replace(/\s+/g, ' ').trim();
        const definition = match[2].replace(/\s+/g, ' ').trim();

        if (term.length < 2 || definition.length < 8) {
          continue;
        }

        const dedupeKey = `${term.toLowerCase()}::${provision.provision_ref}`;
        if (seen.has(dedupeKey)) {
          continue;
        }

        seen.add(dedupeKey);
        definitions.push({
          term,
          definition,
          source_provision: provision.provision_ref,
        });

        if (definitions.length >= 200) {
          return definitions;
        }
      }
    }
  }

  return definitions;
}

function extractProvisions(frameHtml: string): ParsedProvision[] {
  const provisions: ParsedProvision[] = [];
  const seenRefs = new Set<string>();
  const headings = extractHeadings(frameHtml);

  const articleStartRegex = /<div class="art">/gi;
  const starts: number[] = [];
  let startMatch: RegExpExecArray | null;

  while ((startMatch = articleStartRegex.exec(frameHtml)) !== null) {
    starts.push(startMatch.index);
  }

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : frameHtml.length;
    const block = frameHtml.slice(start, end);

    const anchor = block.match(/<a name="(art|par):([^"]+)"><\/a>/i);
    if (!anchor) {
      continue;
    }

    const anchorType = anchor[1].toLowerCase();
    let section = cleanSection(anchor[2]);
    if (!section) {
      const fallback = decodeHtmlEntities(block).match(/(?:Art\.|§)\s*([0-9A-Za-z]+)/);
      section = fallback ? cleanSection(fallback[1]) : '';
    }

    if (!section) {
      continue;
    }

    const provisionRef = `${anchorType}${section.toLowerCase()}`;
    if (seenRefs.has(provisionRef)) {
      continue;
    }

    const headingPrefix = anchorType === 'par' ? `§ ${section}` : `Art. ${section}`;
    const title = extractArticleTitle(block, headingPrefix);
    const content = extractArticleContent(block);

    if (!content) {
      continue;
    }

    let chapter: string | undefined;
    for (let h = headings.length - 1; h >= 0; h--) {
      if (headings[h].index < start) {
        chapter = headings[h].text;
        break;
      }
    }

    provisions.push({
      provision_ref: provisionRef,
      chapter,
      section,
      title,
      content,
    });

    seenRefs.add(provisionRef);
  }

  return provisions;
}

export function parseLiechtensteinFrameHtml(frameHtml: string, law: TargetLaw): ParsedAct {
  const title = extractFrameTitle(frameHtml) || law.shortName;
  const dateMatch = frameHtml.match(/<div class="vom">\s*vom\s+([^<]+)<\/div>/i);
  const issuedDate = parseGermanDate(dateMatch?.[1]);
  const provisions = extractProvisions(frameHtml);
  const definitions = extractDefinitions(provisions);

  return {
    id: law.id,
    type: 'statute',
    title,
    title_en: law.titleEn,
    short_name: law.shortName,
    status: 'in_force',
    issued_date: issuedDate,
    in_force_date: issuedDate,
    url: law.lawUrl,
    description: law.description,
    provisions,
    definitions,
  };
}

export const TARGET_LAWS: TargetLaw[] = [
  {
    id: 'li-datenschutzgesetz',
    seedFile: '01-datenschutzgesetz.json',
    shortName: 'DSG',
    titleEn: 'Data Protection Act (DSG)',
    lawUrl: 'https://www.gesetze.li/konso/2018.272',
    description: 'General data protection framework for public and private processing of personal data in Liechtenstein.',
  },
  {
    id: 'li-cybersicherheitsgesetz',
    seedFile: '02-cybersicherheitsgesetz.json',
    shortName: 'CSG',
    titleEn: 'Cybersecurity Act (CSG)',
    lawUrl: 'https://www.gesetze.li/konso/2025.111',
    description: 'Cybersecurity framework for risk management, incident reporting, and supervision of critical and important entities.',
  },
  {
    id: 'li-kommunikationsgesetz',
    seedFile: '03-kommunikationsgesetz.json',
    shortName: 'KomG',
    titleEn: 'Electronic Communications Act (KomG)',
    lawUrl: 'https://www.gesetze.li/konso/2023.216',
    description: 'Core statute for electronic communications networks, services, market regulation, and user protection.',
  },
  {
    id: 'li-e-commerce-gesetz',
    seedFile: '04-e-commerce-gesetz.json',
    shortName: 'ECG',
    titleEn: 'Electronic Commerce Act (ECG)',
    lawUrl: 'https://www.gesetze.li/konso/2003.133',
    description: 'Regulates legal aspects of information society services and electronic commerce, including provider duties and liability.',
  },
  {
    id: 'li-e-government-gesetz',
    seedFile: '05-e-government-gesetz.json',
    shortName: 'E-GovG',
    titleEn: 'E-Government Act (E-GovG)',
    lawUrl: 'https://www.gesetze.li/konso/2011.575',
    description: 'Legal basis for electronic transactions with public authorities, including identity, trust services, and digital procedures.',
  },
  {
    id: 'li-signaturgesetz',
    seedFile: '06-signaturgesetz.json',
    shortName: 'SigVG',
    titleEn: 'Electronic Signatures and Trust Services Act (SigVG)',
    lawUrl: 'https://www.gesetze.li/konso/2019.114',
    description: 'Implements the legal framework for electronic signatures, seals, and trust services for electronic transactions.',
  },
  {
    id: 'li-stgb-it-provisions',
    seedFile: '07-stgb-it-provisions.json',
    shortName: 'StGB',
    titleEn: 'Criminal Code (StGB)',
    lawUrl: 'https://www.gesetze.li/konso/1988.037',
    description: 'Criminal Code containing offences and sanctions, including provisions relevant to information systems and cyber-enabled crime.',
  },
  {
    id: 'li-tvtg-blockchain',
    seedFile: '08-tvtg-blockchain.json',
    shortName: 'TVTG',
    titleEn: 'Token and TT Service Provider Act (TVTG)',
    lawUrl: 'https://www.gesetze.li/konso/2019.301',
    description: 'Establishes the legal framework for tokens and trusted technology service providers, including supervision and obligations.',
  },
  {
    id: 'li-fmag-financial-market',
    seedFile: '09-fmag-financial-market.json',
    shortName: 'FMAG',
    titleEn: 'Financial Market Supervision Act (FMAG)',
    lawUrl: 'https://www.gesetze.li/konso/2004.175',
    description: 'Defines the organization, powers, and procedures of Liechtenstein’s Financial Market Authority.',
  },
  {
    id: 'li-uwg-trade-secrets',
    seedFile: '10-uwg-trade-secrets.json',
    shortName: 'UWG',
    titleEn: 'Unfair Competition Act (UWG)',
    lawUrl: 'https://www.gesetze.li/konso/1992.121',
    description: 'Governs unfair competition practices, including specific provisions on protection of trade secrets.',
  },
];
