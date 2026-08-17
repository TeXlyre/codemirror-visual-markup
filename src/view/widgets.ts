import { EditorView, WidgetType } from '@codemirror/view';
import type { FigureModel } from '../core/language';
import { textOf } from '../core/tokens';
import { createEditableMath, readEditableMath, type MathSyntax } from './math-field';
import { ImageResolver, imageResolver, isExternal, resolveImagePath } from './images';
import { registerWidget, replaceRange, WidgetContext } from './widget-registry';

interface TablePresentation {
  className: string;
  style: string;
  column: string;
  colspan: string;
  rowspan: string;
}

export class MathWidget extends WidgetType {
  private text: string;
  private content: string;
  private display: boolean;
  private open: string;
  private close: string;
  private syntax: MathSyntax;
  private table: TablePresentation | null;

  constructor(context: WidgetContext) {
    super();
    const { token, source } = context;
    this.text = textOf(source, token);
    this.content = token.body ? textOf(source, token.body) : this.text;
    this.display = Boolean(token.display);
    this.open = token.meta?.open ?? '$';
    this.close = token.meta?.close ?? '$';
    this.syntax = context.language.id === 'typst' ? 'typst' : 'latex';
    this.table = tablePresentation(token);
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof MathWidget &&
      other.text === this.text &&
      other.syntax === this.syntax &&
      sameTablePresentation(other.table, this.table)
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement(this.display ? 'div' : 'span');
    container.className = `cm-lv-widget cm-lv-math ${this.display ? 'cm-lv-math-display' : 'cm-lv-math-inline'}`;
    applyTablePresentation(container, this.table);

    const field = () => container.firstElementChild as (HTMLElement & { value?: string }) | null;

    const commit = () => {
      const element = field();
      if (!element || element.value === undefined) return;
      const value = readEditableMath(element, this.syntax);
      if (value === undefined) return;
      const content = this.syntax === 'typst' ? (this.display ? ` ${value.trim()} ` : value.trim()) : value;
      replaceRange(view, container, this.text, `${this.open}${content}${this.close}`);
    };

    container.addEventListener('click', event => {
      const element = field();
      if (!element || element.value === undefined) return;
      event.stopPropagation();
      element.focus();
    });

    container.addEventListener('focusout', event => {
      if (keepsFocus(event as FocusEvent, container)) return;
      commit();
    });

    container.addEventListener('change', commit);

    container.appendChild(createEditableMath(this.content.trim(), this.display, this.syntax));
    return container;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export class ImageWidget extends WidgetType {
  private src: string;
  private alt: string;
  private destroyed = false;
  private style: string;

  constructor(context: WidgetContext) {
    super();
    this.src = context.language.imageSrc?.(context.source, context.token) ?? '';
    this.alt = this.src.slice(this.src.lastIndexOf('/') + 1);
    this.style = context.language.imageStyle?.(context.source, context.token) ?? '';
    this.resolver = context.state.facet(imageResolver);
    this.table = tablePresentation(context.token);
  }

  private resolver: ImageResolver | null;
  private table: TablePresentation | null;

  eq(other: WidgetType): boolean {
    return (
      other instanceof ImageWidget &&
      other.src === this.src &&
      other.style === this.style &&
      sameTablePresentation(other.table, this.table)
    );
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span');
    container.className = 'cm-lv-widget cm-lv-image';
    applyTablePresentation(container, this.table);

    const image = document.createElement('img');
    image.decoding = 'async';
    image.loading = 'lazy';
    image.alt = this.alt;
    image.title = this.src;
    if (this.style) image.setAttribute('style', this.style);
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


export class FigureWidget extends WidgetType {
  private model: FigureModel;
  private key: string;
  private resolver: ImageResolver | null;
  private destroyed = false;
  private table: TablePresentation | null;

  constructor(context: WidgetContext) {
    super();
    this.model = context.language.figure?.parse(context.source, context.token) ?? { panels: [] };
    this.key = JSON.stringify(this.model);
    this.resolver = context.state.facet(imageResolver);
    this.table = tablePresentation(context.token);
  }

  eq(other: WidgetType): boolean {
    return other instanceof FigureWidget && other.key === this.key && sameTablePresentation(other.table, this.table);
  }

  toDOM(): HTMLElement {
    const container = document.createElement('span');
    container.className = 'cm-lv-widget cm-lv-figure-preview';
    if (this.model.wide) container.classList.add('cm-lv-figure-wide');
    if (this.model.align) container.classList.add(`cm-lv-figure-${this.model.align}`);
    if (this.model.captionPosition === 'side') container.classList.add('cm-lv-figure-caption-side');
    if (this.model.width) container.style.setProperty('--lv-figure-width', this.model.width);
    container.style.setProperty('--lv-figure-columns', String(Math.max(1, this.model.columns ?? 1)));
    applyTablePresentation(container, this.table);

    const caption = this.model.caption ? figureCaption(this.model.caption, 'cm-lv-figure-caption') : null;
    if (caption && this.model.captionPosition === 'top') container.appendChild(caption);

    const body = document.createElement('span');
    body.className = 'cm-lv-figure-body';
    if (this.model.tracks?.length) body.style.gridTemplateColumns = this.model.tracks.join(' ');

    for (const panel of this.model.panels) {
      const panelDOM = document.createElement('span');
      panelDOM.className = 'cm-lv-figure-panel';

      const media = document.createElement('span');
      media.className = 'cm-lv-figure-media';
      for (const item of panel.images) media.appendChild(this.image(item.src, item.alt, item.style));
      panelDOM.appendChild(media);

      if (panel.caption) panelDOM.appendChild(figureCaption(panel.caption, 'cm-lv-subcaption'));
      body.appendChild(panelDOM);
    }

    container.appendChild(body);
    if (caption && this.model.captionPosition !== 'top') container.appendChild(caption);
    return container;
  }

  private image(src: string, alt = '', style = ''): HTMLImageElement {
    const image = document.createElement('img');
    image.decoding = 'async';
    image.loading = 'lazy';
    image.alt = alt;
    image.title = src;
    if (style) image.setAttribute('style', style);

    if (!src) return image;
    if (isExternal(src) || !this.resolver) {
      image.src = src;
      return image;
    }

    const path = resolveImagePath(this.resolver.currentPath(), src);
    Promise.resolve(this.resolver.resolve(path, src)).then(url => {
      if (!this.destroyed && url) image.src = url;
      else if (!url) image.classList.add('cm-lv-image-missing');
    });
    return image;
  }

  destroy(): void {
    this.destroyed = true;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function figureCaption(text: string, className: string): HTMLElement {
  const caption = document.createElement('span');
  caption.className = className;
  caption.textContent = text;
  return caption;
}


function tablePresentation(token: WidgetContext['token']): TablePresentation | null {
  const meta = token.meta;
  if (!meta?.tableClass || !meta.tableStyle) return null;
  return {
    className: meta.tableClass,
    style: meta.tableStyle,
    column: meta.tableColumn ?? '0',
    colspan: meta.tableColspan ?? '1',
    rowspan: meta.tableRowspan ?? '1'
  };
}

function sameTablePresentation(a: TablePresentation | null, b: TablePresentation | null): boolean {
  return a === b || Boolean(
    a && b &&
    a.className === b.className &&
    a.style === b.style &&
    a.column === b.column &&
    a.colspan === b.colspan &&
    a.rowspan === b.rowspan
  );
}

function applyTablePresentation(element: HTMLElement, table: TablePresentation | null): void {
  if (!table) return;
  element.classList.add(...table.className.split(/\s+/).filter(Boolean));
  element.style.cssText = [element.style.cssText, table.style].filter(Boolean).join(';');
  element.dataset.lvColumn = table.column;
  element.dataset.lvColspan = table.colspan;
  element.dataset.lvRowspan = table.rowspan;
}

function keepsFocus(event: FocusEvent, container: HTMLElement): boolean {
  const target = event.relatedTarget as Node | null;
  if (!target) return false;
  if (container.contains(target)) return true;

  const keyboard = (window as unknown as { mathVirtualKeyboard?: { element?: HTMLElement } }).mathVirtualKeyboard;
  if (keyboard?.element?.contains(target)) return true;

  return Boolean((target as Element).closest?.('.ML__keyboard'));
}

registerWidget('math', context => new MathWidget(context));
registerWidget('image', context => new ImageWidget(context));
registerWidget('figure', context => context.language.figure ? new FigureWidget(context) : null);
