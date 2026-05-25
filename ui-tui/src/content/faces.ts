// Operation-glyph indicator used by the `kaomoji` indicator style in the
// Hermes TUI.  The classic 顔文字 (kaomoji) set has been replaced with a
// single mech-style status glyph that reads the same in every frame —
// keeping the rotation loop API-compatible (length >= 1) while making
// the indicator feel like a steady operational readout instead of an
// animated face.
//
// Two entries so any modulo arithmetic stays well-defined; the visible
// glyph is identical between them.
export const FACES = [
  '_◢🔘◤‾‾',
  '_◢🔘◤‾‾'
]
