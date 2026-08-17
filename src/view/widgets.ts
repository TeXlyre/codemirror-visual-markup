import { EditorView, WidgetType } from '@codemirror/view';
import { Language } from '../core/language';
import { Token, textOf } from '../core/tokens';
import { createEditableMath } from './math-field';
import { ImageResolver, imageResolver, isExternal, resolveImagePath } from './images';
import { registerWidget, replaceRange, WidgetContext } from './widget-registry';

export class MathWidget extends WidgetType {
  private text: string;
  private content: string;
  private display: boolean;
  private open: string;
  private close: string;

  constructor(context: WidgetContext) {
    super();
    const { token, source } = context;
    this.text = textOf(source, token);
    this.content = token.body ? textOf(source, token.body) : this.text;
    this.display = Boolean(token.display);
    this.open = token.meta?.open ?? '$';
    this.close = token.meta?.close ?? '$';
  }

  eq(other: WidgetType): boolean {
    return other instanceof MathWidget && other.text === this.text;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement(this.display ? 'div' : 'span');
    container.className = `cm-lv-widget cm-lv-math ${this.display ? 'cm-lv-math-display' : 'cm-lv-math-inline'}`;

    const field = () => container.firstElementChild as (HTMLElement & { value: string; readOnly: boolean }) | null;

    container.addEventListener('click', event => {
      const element = field();
      if (!element || element.value === undefined) return;
      event.stopPropagation();
      element.readOnly = false;
      element.focus();
    });

    container.addEventListener('focusout', () => {
      const element = field();
      if (!element || element.value === undefined) return;
      element.readOnly = true;
      replaceRange(view, container, this.text, `${this.open}${element.value}${this.close}`);
    });

    container.appendChild(createEditableMath(this.content.trim(), this.display));
    return container;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export class TableWidget extends WidgetType {
  private text: string;
  private cells: string[][];
  private active: Map<string, string | undefined>;
  private token: Token;
  private language: Language;

  constructor(context: WidgetContext) {
    super();
    this.token = context.token;
    this.language = context.language;
    this.text = textOf(context.source, context.token);
    this.cells = context.language.table!.parse(context.source, context.token);
    this.active = activeCells(context);
  }

  eq(other: WidgetType): boolean {
    return other instanceof TableWidget && other.text === this.text && sameCells(other.active, this.active);
  }

  updateDOM(dom: HTMLElement): boolean {
    for (const cell of Array.from(dom.querySelectorAll('td')) as HTMLElement[]) {
      this.mark(cell, cell.dataset.cell!);
    }
    return true;
  }

  private mark(cell: HTMLElement, key: string): void {
    cell.classList.toggle('cm-lv-cell-active', this.active.has(key));
    cell.style.setProperty('--lv-cell-color', this.active.get(key) ?? 'var(--lv-primary)');
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.className = 'cm-lv-widget cm-lv-table';

    const table = document.createElement('table');

    this.cells.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');

      row.forEach((cell, cellIndex) => {
        const key = `${rowIndex}:${cellIndex}`;
        const td = document.createElement('td');
        td.contentEditable = 'true';
        td.dataset.cell = key;
        td.textContent = cell;
        this.mark(td, key);
        td.addEventListener('keydown', event => event.stopPropagation());
        td.addEventListener('blur', () => {
          const next = this.cells.map(entry => [...entry]);
          next[rowIndex][cellIndex] = td.textContent ?? '';
          replaceRange(view, container, this.text, this.language.table!.serialize(next, this.token, this.text));
        });
        tr.appendChild(td);
      });

      table.appendChild(tr);
    });

    container.appendChild(table);
    return container;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function activeCells(context: WidgetContext): Map<string, string | undefined> {
  const ranges = context.language.table?.ranges?.(context.source, context.token);
  const active = new Map<string, string | undefined>();

  if (!ranges || context.reveal.length === 0) return active;

  ranges.forEach((row, rowIndex) => {
    row.forEach((cell, cellIndex) => {
      const hit = context.reveal.find(range => cell.from <= range.to && cell.to >= range.from);
      if (hit) active.set(`${rowIndex}:${cellIndex}`, hit.color);
    });
  });

  return active;
}

function sameCells(a: Map<string, string | undefined>, b: Map<string, string | undefined>): boolean {
  return a.size === b.size && [...a].every(([key, color]) => b.has(key) && b.get(key) === color);
}

registerWidget('math', context => new MathWidget(context));
registerWidget('table', context => (context.language.table ? new TableWidget(context) : null));

export class ImageWidget extends WidgetType {
  private src: string;
  private alt: string;
  private destroyed = false;

  constructor(context: WidgetContext) {
    super();
    this.src = context.language.imageSrc?.(context.source, context.token) ?? '';
    this.alt = this.src.slice(this.src.lastIndexOf('/') + 1);
    this.resolver = context.state.facet(imageResolver);
  }

  private resolver: ImageResolver | null;

  eq(other: WidgetType): boolean {
    return other instanceof ImageWidget && other.src === this.src;
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span');
    container.className = 'cm-lv-widget cm-lv-image';

    const image = document.createElement('img');
    image.decoding = 'async';
    image.loading = 'lazy';
    image.alt = this.alt;
    image.title = this.src;
    container.appendChild(image);

    if (!this.src) {
      container.classList.add('cm-lv-image-missing');
      return container;
    }

    if (isExternal(this.src) || !this.resolver) {
      image.src = this.src;
      return container;
    }

    const path = resolveImagePath(this.resolver.currentPath(), this.src);

    Promise.resolve(this.resolver.resolve(path, this.src)).then(url => {
      if (this.destroyed) return;
      if (url) image.src = url;
      else container.classList.add('cm-lv-image-missing');
    });

    return container;
  }

  destroy(): void {
    this.destroyed = true;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

registerWidget('image', context => new ImageWidget(context));
