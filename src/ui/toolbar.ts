import { EditorView, ViewUpdate } from '@codemirror/view';
import { getLanguage, Language } from '../core/language';
import { EditorScope, EMPTY_SCOPE, scopeAt } from '../core/scope';
import { createColorItem, createTableItem, isToolbarButton, ToolbarEntry, toolbarEntries } from '../core/toolbar';
import { TableDimensions, TableSelector } from './table-selector';

export interface ToolbarOptions {
  currentMode?: 'source' | 'visual';
  theme?: 'light' | 'dark';
  language?: string;
}

export class Toolbar {
  private container: HTMLElement;
  private view: EditorView;
  private language: Language;
  private mode: 'source' | 'visual';
  private theme: 'light' | 'dark';
  private scope: EditorScope = EMPTY_SCOPE;
  private entries: ToolbarEntry[] = [];
  private items!: HTMLElement;
  private tableSelector!: TableSelector;

  private onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest('[data-item]') as HTMLElement | null;
    if (!button) return;

    event.preventDefault();

    if (button.dataset.item === 'table-picker') {
      this.tableSelector.toggle();
      return;
    }

    this.run(button.dataset.item!);
  };

  private onColorChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.color) return;
    createColorItem(this.language, input.dataset.color as 'text' | 'background', input.value).command(this.view);
  };

  constructor(container: HTMLElement, view: EditorView, options: ToolbarOptions = {}) {
    this.container = container;
    this.view = view;
    this.language = getLanguage(options.language ?? 'latex');
    this.mode = options.currentMode ?? 'source';
    this.theme = options.theme ?? 'light';

    this.container.addEventListener('click', this.onClick);
    this.container.addEventListener('change', this.onColorChange);
    this.build();
  }

  getEntries(): ToolbarEntry[] {
    return this.entries;
  }

  run(key: string): boolean {
    const item = this.entries.find(entry => isToolbarButton(entry) && entry.key === key);
    return item && isToolbarButton(item) ? item.command(this.view) : false;
  }

  update(update: ViewUpdate): void {
    if (!update.selectionSet && !update.docChanged) return;
    this.refreshScope();
  }

  updateMode(mode: 'source' | 'visual'): void {
    this.mode = mode;
    this.container.dataset.mode = mode;
  }

  updateTheme(theme: 'light' | 'dark'): void {
    this.theme = theme;
    this.container.classList.toggle('theme-dark', theme === 'dark');
  }

  setLanguage(language: string): void {
    const next = getLanguage(language);
    if (next === this.language) return;
    this.language = next;
    this.refreshScope(true);
  }

  destroy(): void {
    this.container.removeEventListener('click', this.onClick);
    this.container.removeEventListener('change', this.onColorChange);
    this.container.innerHTML = '';
  }

  private refreshScope(force = false): void {
    const next = scopeAt(this.view.state, this.view.state.selection.main.head, this.language);
    if (
      !force &&
      next.inTable === this.scope.inTable &&
      next.tableEditable === this.scope.tableEditable &&
      next.inColor === this.scope.inColor
    ) {
      this.scope = next;
      return;
    }
    this.scope = next;
    this.render();
  }

  private build(): void {
    this.container.className = `lv-toolbar${this.theme === 'dark' ? ' theme-dark' : ''}`;
    this.container.dataset.mode = this.mode;
    this.container.innerHTML = '';

    this.items = document.createElement('div');
    this.items.className = 'lv-toolbar-items';

    const dropdown = document.createElement('div');
    this.tableSelector = new TableSelector(dropdown, dimensions => this.insertTable(dimensions));

    this.container.append(this.items, dropdown);
    this.render();
  }

  private render(): void {
    this.entries = toolbarEntries(this.language, this.scope);
    this.items.innerHTML = '';

    let group = this.createGroup();

    for (const entry of this.entries) {
      if ('type' in entry) {
        if (group.childElementCount > 0) this.items.appendChild(group);
        group = this.createGroup();
        continue;
      }
      group.appendChild(this.createButton(entry.key, entry.label, entry.label));
    }

    if (group.childElementCount > 0) this.items.appendChild(group);

    const extras = this.createGroup();
    extras.append(
      this.createButton('table-picker', '▤', 'Insert table of a chosen size'),
      this.createColorInput('text', 'Text colour'),
      this.createColorInput('background', 'Highlight')
    );
    this.items.appendChild(extras);
  }

  private createGroup(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'lv-toolbar-group';
    return group;
  }

  private createButton(key: string, label: string, title: string): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.item = key;
    button.title = title;
    button.textContent = label;
    return button;
  }

  private createColorInput(kind: 'text' | 'background', title: string): HTMLElement {
    const input = document.createElement('input');
    input.type = 'color';
    input.dataset.color = kind;
    input.title = title;
    input.value = kind === 'text' ? '#c0392b' : '#f1c40f';
    return input;
  }

  private insertTable(dimensions: TableDimensions): void {
    createTableItem(this.language, dimensions.rows, dimensions.cols).command(this.view);
  }
}
