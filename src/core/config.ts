export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
  math: string;
  environment: string;
  command: string;
  table: string;
  background: string;
  foreground: string;
  surface: string;
  border: string;
}

export interface EditorConfig {
  language: string;
  showCommands: boolean;
  showToolbar: boolean;
  maxDepth: number;
  theme: 'light' | 'dark';
  styles: {
    colors: ThemeColors;
    spacing: { widget: string; container: string; cell: string };
  };
}

export type LatexEditorConfig = EditorConfig;

export const DARK_THEME_COLORS: ThemeColors = {
  primary: '#4da6ff',
  secondary: '#9ca3af',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  math: '#a78bfa',
  environment: '#10b981',
  command: '#4da6ff',
  table: '#a78bfa',
  background: '#1f2937',
  foreground: '#f9fafb',
  surface: '#374151',
  border: '#4b5563'
};

export const LIGHT_THEME_COLORS: ThemeColors = {
  primary: '#007acc',
  secondary: '#6c757d',
  success: '#28a745',
  warning: '#fd7e14',
  danger: '#dc3545',
  math: '#6f42c1',
  environment: '#28a745',
  command: '#007acc',
  table: '#6f42c1',
  background: '#ffffff',
  foreground: '#000000',
  surface: '#f8f9fa',
  border: '#dddddd'
};

export const DEFAULT_CONFIG: EditorConfig = {
  language: 'latex',
  showCommands: false,
  showToolbar: true,
  maxDepth: 12,
  theme: 'light',
  styles: {
    colors: LIGHT_THEME_COLORS,
    spacing: { widget: '10px 0', container: '8px 12px', cell: '8px 12px' }
  }
};

export class ConfigService {
  private config: EditorConfig;
  private listeners = new Set<(config: EditorConfig) => void>();

  constructor(initial: Partial<EditorConfig> = {}) {
    this.config = merge(DEFAULT_CONFIG, initial);
  }

  get(): EditorConfig {
    return this.config;
  }

  update(updates: Partial<EditorConfig>): void {
    this.config = merge(this.config, updates);
    this.listeners.forEach(listener => listener(this.config));
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.update({
      theme,
      styles: { ...this.config.styles, colors: theme === 'dark' ? DARK_THEME_COLORS : LIGHT_THEME_COLORS }
    });
  }

  subscribe(listener: (config: EditorConfig) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

function merge(base: EditorConfig, updates: Partial<EditorConfig>): EditorConfig {
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined)
  ) as Partial<EditorConfig>;

  return {
    ...base,
    ...defined,
    styles: {
      colors: { ...base.styles.colors, ...updates.styles?.colors },
      spacing: { ...base.styles.spacing, ...updates.styles?.spacing }
    }
  };
}
