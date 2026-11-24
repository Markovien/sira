// @ts-check
/**
 * Embarque les glyphes et le sprite de la carte dans les assets Android
 * (decisions.md, 24/11/2026). MapLibre les lit en `asset://glyphs/...` et
 * `asset://sprites/...` : aucune requete reseau a l'affichage de la carte.
 * Le projet android/ etant regenere a chaque build, la copie se refait a
 * chaque `expo prebuild`.
 */
const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * Fichier de glyphes vide (message protobuf `glyphs` sans glyphe) : sert
 * toute plage Unicode non embarquee. Sans lui, la requete d'une plage absente
 * echoue et le moteur peut renoncer a dessiner toute la tuile.
 */
function emptyGlyphs(fontName, range) {
  const text = (field, value) => {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([Buffer.from([(field << 3) | 2, bytes.length]), bytes]);
  };
  const stack = Buffer.concat([text(1, fontName), text(2, range)]);
  return Buffer.concat([Buffer.from([(1 << 3) | 2, stack.length]), stack]);
}

/** Complete chaque police avec des plages vides, de 0 a 65535. */
function fillMissingRanges(glyphsDir) {
  for (const font of fs.readdirSync(glyphsDir)) {
    const dir = path.join(glyphsDir, font);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (let start = 0; start < 65536; start += 256) {
      const range = `${start}-${start + 255}`;
      const file = path.join(dir, `${range}.pbf`);
      if (!fs.existsSync(file)) fs.writeFileSync(file, emptyGlyphs(font, range));
    }
  }
}

/** @param {import('expo/config-plugins').ExpoConfig} config */
module.exports = function withMapAssets(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const source = path.join(modConfig.modRequest.projectRoot, 'assets', 'map');
      const target = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets',
      );
      for (const dir of ['glyphs', 'sprites']) {
        fs.cpSync(path.join(source, dir), path.join(target, dir), { recursive: true });
      }
      fillMissingRanges(path.join(target, 'glyphs'));
      return modConfig;
    },
  ]);
};

// Expose pour les tests et le harnais de verification du style.
module.exports.fillMissingRanges = fillMissingRanges;
module.exports.emptyGlyphs = emptyGlyphs;
