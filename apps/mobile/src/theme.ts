/**
 * Theme a fort contraste : la tournee se fait en plein soleil, sur des ecrans
 * d'entree de gamme peu lumineux. Fond blanc, texte noir, une seule couleur
 * d'action ; contrastes AAA (>= 7:1) pour le texte courant.
 */
export const colors = {
  background: '#FFFFFF',
  text: '#000000',
  textMuted: '#333333',
  /** Bleu nuit, 12,6:1 sur blanc. */
  primary: '#0B3D91',
  onPrimary: '#FFFFFF',
  /** Vert et rouge fonces : lisibles au soleil, distincts aussi en niveaux de gris. */
  success: '#0A6B2E',
  danger: '#A30D0D',
  warning: '#7A4B00',
  border: '#000000',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const typography = {
  body: 18,
  title: 26,
  button: 20,
} as const;

/** Cible tactile minimale : 56 dp, pour une main gantee ou un pouce sur un guidon. */
export const touchTarget = 56;
