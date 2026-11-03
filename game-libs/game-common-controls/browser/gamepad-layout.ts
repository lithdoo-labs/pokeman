/**
 * Chromium Android may expose canonical button indices with an empty mapping.
 * Only admit the verified Pocket Block / AYANEO controller: arbitrary
 * non-standard layouts must never be interpreted as standard.
 */
export function supportsCanonicalGamepadButtons(pad: Gamepad): boolean {
  if (!pad.connected) return false;
  if (pad.mapping === "standard") return true;
  return pad.mapping === ""
    && /\bVendor:\s*4001\s+Product:\s*0428\b/i.test(pad.id)
    && pad.buttons.length >= 17
    && pad.axes.length >= 4;
}
