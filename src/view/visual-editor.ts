import { Compartment, EditorState, Extension, RangeSet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { ConfigService, DEFAULT_CONFIG, EditorConfig } from '../core/config';
import { getLanguage } from '../core/language';
import { buildDecorations, revealRanges } from './decorations';
import { createTheme } from './theme';
import './widgets';

export interface VisualEditorOptions {
  language?: string;
  showCommands?: boolean;
  onModeChange?: (mode: 'source' | 'visual') => void;
  config?: Partial<EditorConfig>;
}

interface VisualState {
  enabled: boolean;
  showCommands: boolean;
  language: string;
  maxDepth: number;
}

export const setVisualState = StateEffect.define<Partial<VisualState>>();

const visualState = StateField.define<VisualState>({
  create: () => ({
    enabled: false,
    showCommands: DEFAULT_CONFIG.showCommands,
    language: DEFAULT_CONFIG.language,
    maxDepth: DEFAULT_CONFIG.maxDepth
  }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setVisualState)) value = { ...value, ...effect.value };
    }
    return value;
  }
});

const decorationField = StateField.define<{ decorations: DecorationSet; atomic: RangeSet<Decoration> }>({
  create: state => compute(state),
  update(value, tr) {
    const state = tr.state.field(visualState);
    if (!state.enabled) return { decorations: Decoration.none, atomic: RangeSet.empty };

    const dirty =
      tr.docChanged ||
      tr.selection ||
      tr.effects.some(effect => effect.is(setVisualState)) ||
      tr.startState.facet(revealRanges) !== tr.state.facet(revealRanges);
    return dirty ? compute(tr.state) : value;
  },
  provide: field => [
    EditorView.decorations.from(field, value => value.decorations),
    EditorView.atomicRanges.of(view => view.state.field(field).atomic)
  ]
});

function compute(state: EditorState) {
  const options = state.field(visualState, false);
  if (!options?.enabled) return { decorations: Decoration.none, atomic: RangeSet.empty };

  const result = buildDecorations(state, {
    language: getLanguage(options.language),
    showCommands: options.showCommands,
    maxDepth: options.maxDepth
  });

  return { decorations: result.decorations, atomic: result.atomic };
}

export function visualExtension(): Extension {
  return [visualState, decorationField];
}

export class VisualCodeMirrorEditor {
  private view: EditorView;
  private options: VisualEditorOptions;
  private configService: ConfigService;
  private enabled = false;
  private themeCompartment = new Compartment();
  private unsubscribe: () => void;

  constructor(view: EditorView, options: VisualEditorOptions = {}) {
    this.view = view;
    this.options = options;
    this.configService = new ConfigService({
      ...options.config,
      showCommands: options.showCommands ?? options.config?.showCommands,
      language: options.language ?? options.config?.language
    });

    this.view.dispatch({
      effects: StateEffect.appendConfig.of([
        visualExtension(),
        this.themeCompartment.of(createTheme(this.configService.get()))
      ])
    });

    this.unsubscribe = this.configService.subscribe(config => this.sync(config));
    this.sync(this.configService.get());
  }

  setVisualMode(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.view.dispatch({ effects: setVisualState.of({ enabled }) });
    this.options.onModeChange?.(enabled ? 'visual' : 'source');
  }

  toggleMode(): void {
    this.setVisualMode(!this.enabled);
  }

  setLanguage(language: string): void {
    this.configService.update({ language });
  }

  updateOptions(options: VisualEditorOptions): void {
    this.options = { ...this.options, ...options };
    this.configService.update({
      ...options.config,
      ...(options.showCommands === undefined ? {} : { showCommands: options.showCommands }),
      ...(options.language === undefined ? {} : { language: options.language })
    });
  }

  getConfig(): EditorConfig {
    return this.configService.get();
  }

  destroy(): void {
    this.unsubscribe();
  }

  private sync(config: EditorConfig): void {
    this.view.dispatch({
      effects: [
        setVisualState.of({
          enabled: this.enabled,
          showCommands: config.showCommands,
          language: config.language,
          maxDepth: config.maxDepth
        }),
        this.themeCompartment.reconfigure(createTheme(config))
      ]
    });
  }
}
