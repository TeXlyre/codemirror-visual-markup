import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { EditorConfig } from '../core/config';

export function cssVariables(config: EditorConfig): Record<string, string> {
  const { colors, spacing } = config.styles;

  return {
    '--lv-primary': colors.primary,
    '--lv-secondary': colors.secondary,
    '--lv-success': colors.success,
    '--lv-warning': colors.warning,
    '--lv-danger': colors.danger,
    '--lv-math': colors.math,
    '--lv-environment': colors.environment,
    '--lv-command': colors.command,
    '--lv-table': colors.table,
    '--lv-bg': colors.background,
    '--lv-fg': colors.foreground,
    '--lv-surface': colors.surface,
    '--lv-border': colors.border,
    '--lv-spacing-widget': spacing.widget,
    '--lv-spacing-container': spacing.container,
    '--lv-spacing-cell': spacing.cell
  };
}

export function createTheme(config: EditorConfig): Extension {
  return EditorView.theme(
    {
      '&': { ...cssVariables(config), backgroundColor: 'var(--lv-bg)', color: 'var(--lv-fg)' },
      '.cm-content': { caretColor: 'var(--lv-fg)' },
      '.cm-cursor': { borderLeftColor: 'var(--lv-fg)' }
    },
    { dark: config.theme === 'dark' }
  );
}

export function applyVariables(element: HTMLElement, config: EditorConfig): void {
  const variables = cssVariables(config);
  for (const name of Object.keys(variables)) element.style.setProperty(name, variables[name]);
}
