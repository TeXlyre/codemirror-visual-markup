import { EditorView, WidgetType } from '@codemirror/view';
import { textOf } from '../core/tokens';
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

    const field = () => container.firstElementChild as (HTMLElement & { value: string }) | null;

    const commit = () => {
      const element = field();
      if (!element || element.value === undefined) return;
      replaceRange(view, container, this.text, `${this.open}${element.value}${this.close}`);
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

    container.appendChild(createEditableMath(this.content.trim(), this.display));
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
