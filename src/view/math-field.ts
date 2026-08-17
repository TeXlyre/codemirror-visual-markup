export type MathSyntax = 'latex' | 'typst';

type Mathfield = HTMLElement & {
  value: string;
  readOnly: boolean;
  setValue?(value: string): void;
  getValue?(format?: string): string;
};

let constructor: (new () => Mathfield) | null = null;
let asciiToLatex: ((value: string) => string) | null = null;
let pending: Promise<void> | null = null;

function load(): Promise<void> {
  if (!pending) {
    pending = import('mathlive')
      .then(module => {
        const element = module?.MathfieldElement as unknown as (new () => Mathfield) | undefined;
        if (!element) return;
        (element as unknown as { soundsDirectory: string | null }).soundsDirectory = null;
        constructor = element;
        asciiToLatex = module?.convertAsciiMathToLatex ?? null;
      })
      .catch(() => undefined);
  }
  return pending;
}

// MathLive exports Typst but mathfields import LaTeX. Normalize the small
// syntax differences before converting the Typst expression through ASCIIMath.
function typstInput(value: string): string {
  return value
    .replace(/\binfinity(?![A-Za-z0-9])/g, 'oo')
    .replace(/\bintegral(?![A-Za-z0-9])/g, 'int')
    .replace(/\bproduct(?![A-Za-z0-9])/g, 'prod')
    .replace(/\bdif\s+([A-Za-z])\b/g, 'd$1');
}

function configure(field: Mathfield, value: string, displayMode: boolean, syntax: MathSyntax): void {
  const options = field as unknown as Record<string, unknown>;

  if (syntax === 'typst' && asciiToLatex) {
    const latex = asciiToLatex(typstInput(value));
    if (field.setValue) field.setValue(latex);
    else field.value = latex;
  } else {
    field.value = value;
  }
  field.readOnly = false;
  options.mathVirtualKeyboardPolicy = 'auto';
  options.smartMode = true;
  options.smartFence = true;
  options.smartSuperscript = true;
  options.letterShapeStyle = 'tex';

  field.classList.add(displayMode ? 'math-display-field' : 'math-inline-field');
  field.addEventListener('focusin', () => field.classList.add('focused'));
  field.addEventListener('focusout', () => field.classList.remove('focused'));
}

export function readEditableMath(field: HTMLElement, syntax: MathSyntax): string | undefined {
  const mathfield = field as Mathfield;
  if (syntax === 'typst' && mathfield.getValue) return mathfield.getValue('typst');
  return mathfield.value;
}

export function createEditableMath(value: string, displayMode = false, syntax: MathSyntax = 'latex'): HTMLElement {
  if (constructor) {
    const field = new constructor();
    configure(field, value, displayMode, syntax);
    return field;
  }

  const placeholder = document.createElement('span');
  placeholder.className = 'cm-lv-math-placeholder';
  placeholder.textContent = value;

  load().then(() => {
    if (!constructor || !placeholder.isConnected) return;
    const field = new constructor();
    configure(field, value, displayMode, syntax);
    placeholder.replaceWith(field);
  });

  return placeholder;
}

export function preloadMath(): Promise<void> {
  return load();
}
