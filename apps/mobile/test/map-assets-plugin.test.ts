import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const plugin = createRequire(import.meta.url)('../plugins/with-map-assets.js') as {
  fillMissingRanges: (dir: string) => void;
  emptyGlyphs: (font: string, range: string) => Buffer;
};

let dir = '';
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('plugin with-map-assets', () => {
  it('complete chaque police avec les 256 plages, sans toucher aux plages embarquees', () => {
    dir = mkdtempSync(join(tmpdir(), 'sira-glyphs-'));
    mkdirSync(join(dir, 'NotoSansRegular'));
    writeFileSync(join(dir, 'NotoSansRegular', '0-255.pbf'), 'vrais glyphes');
    plugin.fillMissingRanges(dir);
    const files = readdirSync(join(dir, 'NotoSansRegular'));
    expect(files).toHaveLength(256);
    expect(files).toContain('65280-65535.pbf');
    expect(readFileSync(join(dir, 'NotoSansRegular', '0-255.pbf'), 'utf8')).toBe(
      'vrais glyphes',
    );
  });

  it('ecrit un message protobuf de glyphes valide, sans glyphe', () => {
    const bytes = plugin.emptyGlyphs('NotoSansRegular', '7424-7679');
    // glyphs.stacks (champ 1) > fontstack.name (champ 1), fontstack.range (champ 2)
    expect(bytes[0]).toBe(0x0a);
    expect(bytes[1]).toBe(bytes.length - 2);
    expect(bytes.subarray(2).toString('latin1')).toBe('\n\x0fNotoSansRegular\x12\t7424-7679');
  });
});
