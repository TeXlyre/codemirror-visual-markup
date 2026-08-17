type Mathfield = HTMLElement & { value: string; readOnly: boolean };

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

function configure(field: Mathfield, latex: string, displayMode: boolean): void {
  const options = field as unknown as Record<string, unknown>;

  field.value = latex;
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

export function createEditableMath(latex: string, displayMode = false): HTMLElement {
  if (constructor) {
    const field = new constructor();
    configure(field, latex, displayMode);
    return field;
  }

  const placeholder = document.createElement('span');
  placeholder.className = 'cm-lv-math-placeholder';
  placeholder.textContent = latex;

  load().then(() => {
    if (!constructor || !placeholder.isConnected) return;
    const field = new constructor();
    configure(field, latex, displayMode);
    placeholder.replaceWith(field);
  });

  return placeholder;
}

export function preloadMath(): Promise<void> {
  return load();
}
