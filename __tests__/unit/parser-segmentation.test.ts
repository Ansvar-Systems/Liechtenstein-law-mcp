import { describe, it, expect } from 'vitest';
import { parseLiechtensteinFrameHtml } from '../../scripts/lib/parser';

const LAW = {
  id: 'li-test',
  seedFile: 'test.json',
  shortName: 'TEST',
  titleEn: 'Test Act',
  lawUrl: 'https://www.gesetze.li/konso/0000.000',
  description: 'fixture',
} as never;

// Fixture mirrors the three real gesetze.li segmentation hazards found 2026-06-20
// in the LI corpus (Hochschulgesetz art50a, PGR Treuunternehmen §-code):
//  1. a sub-article whose <div class="art"> carries an inline style attribute
//  2. a section heading (tit) that introduces that sub-article
//  3. two §-sub-codes that BOTH restart numbering at "§ 1" (ref collision)
const FRAME = `
<html><head><meta name="description" content="Test Act"></head><body>
<div class="art"><a name="art:1"></a>Art. 1<div class="sacht">Erster Artikel</div><div class="abs">1) Inhalt von Artikel eins genau hier.</div></div>
<div class="tit2">II. Datenschutz</div>
<div class="art" style="margin-top:6.5pt"><a name="art:1a"></a>Art. 1a<div class="sacht">Eingefuegter Artikel</div><div class="abs">1) Inhalt des Sub-Artikels eins-a separat.</div></div>
<div class="art"><a name="par:1"></a>&sect; 1<div class="sacht">Stiftung</div><div class="abs">1) Stiftungsrechtlicher Inhalt der Bestimmung.</div></div>
<div class="art"><a name="par:1"></a>&sect; 1<div class="sacht">Treuunternehmen</div><div class="abs">1) Treuunternehmensrechtlicher Inhalt der Bestimmung.</div></div>
</body></html>`;

describe('LI parser segmentation (2026-06-20 heading-bleed root-cause fixes)', () => {
  const provs = parseLiechtensteinFrameHtml(FRAME, LAW).provisions;
  const byRef = new Map(provs.map(p => [p.provision_ref, p]));

  it('splits a sub-article whose <div class="art"> carries an attribute (was swallowed)', () => {
    expect(byRef.has('art1')).toBe(true);
    expect(byRef.has('art1a')).toBe(true);
    expect(byRef.get('art1a')!.content).toContain('Sub-Artikels eins-a');
  });

  it('does not bleed the sub-article body into the preceding article', () => {
    expect(byRef.get('art1')!.content).not.toContain('Sub-Artikels eins-a');
    expect(byRef.get('art1')!.content).toContain('Artikel eins genau hier');
  });

  it('keeps BOTH colliding §-sub-codes instead of dropping the second (no data loss)', () => {
    const par1 = byRef.get('par1')!;
    const par1b = byRef.get('par1~2')!;
    expect(par1).toBeDefined();
    expect(par1b).toBeDefined();
    expect(par1.content).toContain('Stiftungsrechtlicher');
    expect(par1b.content).toContain('Treuunternehmensrechtlicher');
  });

  it('conserves every provision body (no text silently dropped)', () => {
    const all = provs.map(p => p.content).join(' ');
    for (const needle of [
      'Inhalt von Artikel eins',
      'Inhalt des Sub-Artikels eins-a',
      'Stiftungsrechtlicher Inhalt',
      'Treuunternehmensrechtlicher Inhalt',
    ]) {
      expect(all).toContain(needle);
    }
  });
});
