import { StateEffect } from '@codemirror/state';
import { EditorView, keymap, ViewUpdate } from '@codemirror/view';
import { ConfigService, EditorConfig, DARK_THEME_COLORS, LIGHT_THEME_COLORS } from '../core/config';
import { getLanguage } from '../core/language';
import { createMathHoverExtension, MathHoverManager } from '../view/math-hover';
import { applyVariables } from '../view/theme';
import { VisualCodeMirrorEditor } from '../view/visual-editor';
import { Toolbar } from './toolbar';

export interface DualEditorOptions {
  initialMode?: 'source' | 'visual';
  onModeChange?: (mode: 'source' | 'visual') => void;
  className?: string;
  language?: string;
  showCommands?: boolean;
  showToolbar?: boolean;
  enableMathHover?: boolean;
  theme?: 'light' | 'dark';
  config?: Partial<EditorConfig>;
}

const MODE_BUTTONS: Array<{ mode: 'source' | 'visual'; label: string }> = [
  { mode: 'source', label: 'Source' },
  { mode: 'visual', label: 'Visual' }
];

export class DualVisualEditor {
  private container: HTMLElement;
  private view: EditorView;
  private options: DualEditorOptions;
  private configService: ConfigService;
  private visualEditor: VisualCodeMirrorEditor;
  private mathHover: MathHoverManager;
  private toolbar: Toolbar;
  private mode: 'source' | 'visual';
  private root!: HTMLElement;
  private modeBar!: HTMLElement;
  private toolbarHost!: HTMLElement;
  private unsubscribe: () => void;

  constructor(container: HTMLElement, view: EditorView, options: DualEditorOptions = {}) {
    this.container = container;
    this.view = view;
    this.options = options;
    this.mode = options.initialMode ?? 'source';

    const theme = options.theme ?? options.config?.theme ?? 'light';
    this.configService = new ConfigService({
      ...options.config,
      theme,
      language: options.language ?? options.config?.language,
      showCommands: options.showCommands ?? options.config?.showCommands,
      showToolbar: options.showToolbar ?? options.config?.showToolbar,
      styles: {
        ...options.config?.styles,
        colors: {
          ...(theme === 'dark' ? DARK_THEME_COLORS : LIGHT_THEME_COLORS),
          ...options.config?.styles?.colors
        }
      } as EditorConfig['styles']
    });

    this.buildLayout();

    const config = this.configService.get();

    this.view.dispatch({
      effects: StateEffect.appendConfig.of([
        createMathHoverExtension(config.language),
        this.keymap(),
        EditorView.updateListener.of((update: ViewUpdate) => this.toolbar?.update(update))
      ])
    });

    this.visualEditor = new VisualCodeMirrorEditor(this.view, {
      config,
      onModeChange: mode => this.options.onModeChange?.(mode)
    });

    this.mathHover = new MathHoverManager(this.view);
    this.toolbar = new Toolbar(this.toolbarHost, this.view, {
      currentMode: this.mode,
      theme: config.theme,
      language: config.language
    });

    this.unsubscribe = this.configService.subscribe(next => this.sync(next));
    this.applyMode(this.mode);
    this.sync(config);
  }

  setMode(mode: 'source' | 'visual'): void {
    if (mode === this.mode) return;
    this.applyMode(mode);
  }

  toggleMode(): void {
    this.setMode(this.mode === 'source' ? 'visual' : 'source');
  }

  setLanguage(language: string): void {
    getLanguage(language);
    this.configService.update({ language });
  }

  getLanguage(): string {
    return this.configService.get().language;
  }

  toggleCommandVisibility(): void {
    this.configService.update({ showCommands: !this.configService.get().showCommands });
  }

  toggleToolbar(): void {
    this.configService.update({ showToolbar: !this.configService.get().showToolbar });
  }

  toggleMathHover(): void {
    this.mathHover.setEnabled(!this.mathHover.getEnabled());
    this.updateButtons();
  }

  isMathHoverEnabled(): boolean {
    return this.mathHover.getEnabled();
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.configService.setTheme(theme);
  }

  getConfig(): EditorConfig {
    return this.configService.get();
  }

  updateConfig(updates: Partial<EditorConfig>): void {
    this.configService.update(updates);
  }

  destroy(): void {
    this.unsubscribe();
    this.toolbar.destroy();
    this.visualEditor.destroy();
    this.mathHover.destroy();
    this.root.remove();
  }

  private buildLayout(): void {
    this.root = element('div', `lv-dual-editor theme-${this.configService.get().theme} ${this.options.className ?? ''}`);
    this.modeBar = element('div', 'lv-mode-bar');
    this.toolbarHost = element('div', 'lv-toolbar-host');

    const editorHost = element('div', 'lv-editor-host');

    for (const spec of MODE_BUTTONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lv-mode-btn';
      button.dataset.mode = spec.mode;
      button.textContent = spec.label;
      button.addEventListener('click', () => this.setMode(spec.mode));
      this.modeBar.appendChild(button);
    }

    this.modeBar.append(
      this.createToggle('commands', 'Show source', () => this.toggleCommandVisibility()),
      this.createToggle('math-hover', 'Math hover', () => this.toggleMathHover()),
      this.createToggle('toolbar', 'Toolbar', () => this.toggleToolbar())
    );

    editorHost.appendChild(this.view.dom);
    this.root.append(this.modeBar, this.toolbarHost, editorHost);
    this.container.appendChild(this.root);
  }

  private createToggle(name: string, label: string, action: () => void): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lv-toggle-btn';
    button.dataset.toggle = name;
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }

  private keymap() {
    return keymap.of([
      { key: 'Ctrl-e', mac: 'Cmd-e', run: () => (this.toggleMode(), true) },
      { key: 'Ctrl-Shift-c', mac: 'Cmd-Shift-c', run: () => (this.toggleCommandVisibility(), true) },
      { key: 'Ctrl-Shift-m', mac: 'Cmd-Shift-m', run: () => (this.toggleMathHover(), true) },
      { key: 'Ctrl-Shift-t', mac: 'Cmd-Shift-t', run: () => (this.toggleToolbar(), true) }
    ]);
  }

  private applyMode(mode: 'source' | 'visual'): void {
    this.mode = mode;
    this.visualEditor.setVisualMode(mode === 'visual');
    this.mathHover.setEnabled((this.options.enableMathHover ?? true) && mode === 'source');
    this.toolbar?.updateMode(mode);
    this.updateButtons();
    this.view.focus();
  }

  private sync(config: EditorConfig): void {
    this.root.className = `lv-dual-editor theme-${config.theme} ${this.options.className ?? ''}`;
    applyVariables(this.root, config);

    this.visualEditor.updateOptions({ config });
    this.toolbar.setLanguage(config.language);
    this.toolbar.updateTheme(config.theme);
    this.toolbarHost.style.display = config.showToolbar ? 'block' : 'none';
    this.updateButtons();
  }

  private updateButtons(): void {
    const config = this.configService.get();

    for (const button of Array.from(this.modeBar.querySelectorAll('.lv-mode-btn')) as HTMLElement[]) {
      button.classList.toggle('active', button.dataset.mode === this.mode);
    }

    const states: Record<string, boolean> = {
      commands: config.showCommands,
      'math-hover': this.mathHover?.getEnabled() ?? false,
      toolbar: config.showToolbar
    };

    for (const button of Array.from(this.modeBar.querySelectorAll('.lv-toggle-btn')) as HTMLElement[]) {
      button.classList.toggle('active', states[button.dataset.toggle!] === true);
      if (button.dataset.toggle === 'math-hover') {
        (button as HTMLButtonElement).disabled = this.mode === 'visual';
      }
    }
  }
}

export class DualLatexEditor extends DualVisualEditor {
  constructor(container: HTMLElement, view: EditorView, options: DualEditorOptions = {}) {
    super(container, view, { language: 'latex', ...options });
  }
}

export function latexVisualKeymap(editor: DualVisualEditor) {
  return keymap.of([
    { key: 'Ctrl-e', mac: 'Cmd-e', run: () => (editor.toggleMode(), true) },
    { key: 'Ctrl-Shift-c', mac: 'Cmd-Shift-c', run: () => (editor.toggleCommandVisibility(), true) },
    { key: 'Ctrl-Shift-m', mac: 'Cmd-Shift-m', run: () => (editor.toggleMathHover(), true) },
    { key: 'Ctrl-Shift-t', mac: 'Cmd-Shift-t', run: () => (editor.toggleToolbar(), true) }
  ]);
}

function element(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className.trim();
  return node;
}
