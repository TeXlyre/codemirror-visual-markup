import { typst2tex } from 'tex2typst';

export type MathSyntax = 'latex' | 'typst';

type Mathfield = HTMLElement & {
  value: string;
  readOnly: boolean;
  getValue?(format?: string): string;
};

let constructor: (new () => Mathfield) | null = null;
let pending: Promise<void> | null = null;

function load(): Promise<void> {
  if (!pending) {
    pending = import('mathlive')
      .then(module => {
        const element = module?.MathfieldElement as unknown as (new () => Mathfield) | undefined;
        if (!element) return;
        (element as unknown as { soundsDirectory: string | null }).soundsDirectory = null;
        constructor = element;
      })
      .catch(() => undefined);
  }
  return pending;
}

function configure(field: Mathfield, value: string, displayMode: boolean, syntax: MathSyntax): void {
  const options = field as unknown as Record<string, unknown>;
  field.value = syntax === 'typst' ? typst2tex(value, { blockMathMode: displayMode }) : value;

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
