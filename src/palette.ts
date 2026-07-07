// Canonical Three-Way Merge palette. These exact hex codes are reused across
// every deliverable (key art, image prompts, UI) — keep them verbatim.
export const palette = {
  navy: '#0B1020',
  green: '#7CFFB2',
  amber: '#E0B265',
  bone: '#F1EEE6',
  charcoal: '#3A3D45',
} as const;

// Derived tints used only by the renderer — the canonical five hues above are
// never recoloured (they anchor the key art, logo, GDD and image prompts). Only
// the *Dim text/edge alphas are tuned here, for LEGIBILITY: they were raised from
// the first pass (green 0.42, amber 0.50, bone 0.62) so secondary text clears
// WCAG AA (>=4.5:1) on the navy background instead of sitting near ~3.5:1 and
// reading as muddy grey on a projector. Measured on `navy` #0B1020:
//   boneDim  ~13:1 (AAA) · greenDim ~7.4:1 (AAA) · amberDim ~6.9:1 (AAA).
// The grid/scanline stay faint on purpose (texture, not text). Pass/fail is never
// signalled by colour alone — it always pairs with a word (PASS/FAIL/GOLD).
export const tint = {
  panel: '#10162B', // slightly lifted navy for rail / HUD panels
  node: '#141B33', // node fill
  grid: 'rgba(124, 255, 178, 0.05)',
  scanline: 'rgba(124, 255, 178, 0.035)',
  greenDim: 'rgba(124, 255, 178, 0.72)',
  amberDim: 'rgba(224, 178, 101, 0.82)',
  boneDim: 'rgba(241, 238, 230, 0.92)',
  charcoalDim: 'rgba(108, 114, 130, 0.82)',
  red: '#FF6B6B',
} as const;
