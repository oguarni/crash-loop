// Canonical Three-Way Merge palette. These exact hex codes are reused across
// every deliverable (key art, image prompts, UI) — keep them verbatim.
export const palette = {
  navy: '#0B1020',
  green: '#7CFFB2',
  amber: '#E0B265',
  bone: '#F1EEE6',
  charcoal: '#3A3D45',
} as const;

// Derived tints used only by the renderer.
export const tint = {
  panel: '#10162B', // slightly lifted navy for rail / HUD panels
  node: '#141B33', // node fill
  grid: 'rgba(124, 255, 178, 0.05)',
  scanline: 'rgba(124, 255, 178, 0.035)',
  greenDim: 'rgba(124, 255, 178, 0.35)',
  amberDim: 'rgba(224, 178, 101, 0.45)',
  boneDim: 'rgba(241, 238, 230, 0.55)',
  charcoalDim: 'rgba(58, 61, 69, 0.6)',
  red: '#FF6B6B',
} as const;
