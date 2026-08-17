export function cssColor(value?: string): string | null {
  if (!value) return null;

  const color = value.trim();
  if (!color) return null;

  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color)) return `#${color}`;
  if (/^[a-z]+$/i.test(color)) return color;

  const quotedRgb = /^rgb\(\s*["'](#[0-9a-f]{3,8})["']\s*\)$/i.exec(color);
  if (quotedRgb) return quotedRgb[1];

  const rgb = /^rgb\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)(?:\s*,\s*([\d.]+%?))?\s*\)$/i.exec(color);
  if (rgb) return `rgb(${rgb.slice(1).filter(Boolean).join(', ')})`;

  return null;
}
