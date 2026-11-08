const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(value: string): Rgb | null {
  if (!HEX_PATTERN.test(value)) return null;
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function mix(source: string, target: string, ratio: number): string {
  const from = parseHex(source);
  const to = parseHex(target);
  if (!from || !to) return source;
  return `#${toHex(from.r + (to.r - from.r) * ratio)}${toHex(from.g + (to.g - from.g) * ratio)}${toHex(from.b + (to.b - from.b) * ratio)}`;
}

export function applyPrimaryColor(color: string): void {
  if (!parseHex(color)) return;
  const root = document.documentElement;
  root.style.setProperty("--color-primary", color);
  root.style.setProperty("--color-primary-deep", mix(color, "#000000", 0.45));
  root.style.setProperty("--color-primary-bright", mix(color, "#ffffff", 0.18));
  root.style.setProperty("--color-primary-strong", mix(color, "#ffffff", 0.58));
  root.style.setProperty("--color-brand-burgundy", color);
  const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (theme) theme.content = color;
}
