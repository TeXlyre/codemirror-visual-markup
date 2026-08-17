import { EditorScope } from './scope';
import { ToolbarEntry } from './toolbar';
import { Range, Token } from './tokens';

export type ParseMode = 'markup' | 'code';

export interface RuleContext {
  source: string;
  depth: number;
  mode: ParseMode;
  parse(from: number, to: number, mode?: ParseMode): Token[];
}

export type Rule = (source: string, pos: number, ctx: RuleContext) => Token | null;

export type WidgetKind = 'math' | 'image';

export interface TokenStyle {
  class?: string;
  attributes?: Record<string, string>;
  hidden?: boolean;
  block?: boolean;
  widget?: WidgetKind;
  granular?: boolean;
  keepSyntax?: boolean;
  replaceWith?: string;
}

export interface LanguageCommands {
  wrap: Record<string, [string, string]>;
  heading(level: number, text: string): string;
  list(kind: 'bullet' | 'number', items: string[]): string;
  table(rows: number, cols: number): string;
  color(kind: 'text' | 'background', color: string, text: string): string;
}

export interface CellPosition {
  row: number;
  col: number;
}

export interface TableCellRange extends Range {
  colspan?: number;
  rowspan?: number;
  header?: boolean;
  column?: number;
  row?: number;
}

export interface TableAdapter {
  parse(source: string, token: Token): string[][];
  serialize(cells: string[][], token: Token, source: string): string;
  ranges?(source: string, token: Token): TableCellRange[][];
  locate?(source: string, token: Token, pos: number): CellPosition | null;
  editable?(source: string, token: Token): boolean;
}

export interface Language {
  id: string;
  name: string;
  rules: Rule[];
  style(token: Token): TokenStyle | null;
  commands: LanguageCommands;
  table?: TableAdapter;
  colorCommands?: string[];
  imageSrc?(source: string, token: Token): string | null;
  toolbar?(scope: EditorScope): ToolbarEntry[];
}

const registry = new Map<string, Language>();

export function registerLanguage(language: Language): void {
  registry.set(language.id, language);
}

export function getLanguage(id: string): Language {
  const language = registry.get(id);
  if (!language) throw new Error(`Unknown visual editor language: ${id}`);
  return language;
}

export function listLanguages(): Language[] {
  return [...registry.values()];
}
