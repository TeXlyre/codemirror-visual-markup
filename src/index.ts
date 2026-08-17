import './languages/latex';
import './languages/typst';

export { latex, setMacroSignatures } from './languages/latex';
export { typst } from './languages/typst';

export {
  ConfigService,
  DEFAULT_CONFIG,
  DARK_THEME_COLORS,
  LIGHT_THEME_COLORS
} from './core/config';
export type { EditorConfig, LatexEditorConfig, ThemeColors } from './core/config';

export { getLanguage, listLanguages, registerLanguage } from './core/language';
export type { FigureAdapter, FigureImage, FigureModel, FigurePanel, Language, LanguageCommands, Rule, RuleContext, TableAdapter, TokenStyle, WidgetKind } from './core/language';

export {
  createColorItem,
  createHeadingItem,
  createListItem,
  createTableItem,
  createWrapItem,
  insertBlock,
  insertText,
  isToolbarButton,
  space,
  split,
  tableScopeEntries,
  toolbarEntries,
  wrapSelection
} from './core/toolbar';
export type { ToolbarEntry, ToolbarItem, ToolbarSpace, ToolbarSplit } from './core/toolbar';

export { EMPTY_SCOPE, scopeAt } from './core/scope';
export type { EditorScope } from './core/scope';

export { Tokenizer } from './core/tokenizer';
export type { TokenizeOptions } from './core/tokenizer';
export { textOf, tokenAt, walk } from './core/tokens';
export type { Range, Token, TokenKind } from './core/tokens';

export { buildDecorations, revealAt, revealFrom, revealRanges } from './view/decorations';
export type { RevealRange } from './view/decorations';
export type { BuildOptions, BuildResult } from './view/decorations';
export { createWidget, registerWidget, replaceRange } from './view/widget-registry';
export type { WidgetContext, WidgetFactory } from './view/widget-registry';
export { FigureWidget, ImageWidget, MathWidget } from './view/widgets';
export { createImageResolver, imageResolver, isExternal, resolveImagePath } from './view/images';
export type { ImageFetcher, ImageResolver } from './view/images';
export { createEditableMath, preloadMath } from './view/math-field';
export { applyVariables, createTheme, cssVariables } from './view/theme';

export { setVisualState, visualExtension, VisualCodeMirrorEditor } from './view/visual-editor';
export type { VisualEditorOptions } from './view/visual-editor';

export { createMathHoverExtension, mathHover, MathHoverManager, setMathHoverEnabled } from './view/math-hover';

export { DualLatexEditor, DualVisualEditor, latexVisualKeymap } from './ui/dual-editor';
export type { DualEditorOptions } from './ui/dual-editor';

export { Toolbar } from './ui/toolbar';
export type { ToolbarOptions } from './ui/toolbar';

export { TableSelector } from './ui/table-selector';
export type { TableDimensions } from './ui/table-selector';
