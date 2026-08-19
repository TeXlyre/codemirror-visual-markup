# CodeMirror 6 Visual Markup Support

![Status: Experimental](https://img.shields.io/badge/status-experimental-red)

> [!WARNING]
> This repository is experimental.
> Expect breaking changes and unstable APIs.

This package provides visual (WYSIWYM) editing for LaTeX and Typst in the [CodeMirror 6](https://codemirror.net/6/) editor.

Visual mode decorates the live CodeMirror document instead of maintaining a separate editable DOM tree. The source remains authoritative, and edits are applied as normal CodeMirror transactions.

## Features

- Source and visual editing modes over the same CodeMirror document
- Built-in visual adapters for LaTeX and Typst
- Visual headings, emphasis, lists, colors, tables, figures, and captions
- Interactive equations with optional [MathLive](https://mathlive.io/)
- Table layouts with editable cells and row/column controls
- Single and compound figure layouts, including subfigures and captions
- Inline source reveal when the cursor enters visually concealed markup
- Image resolution for external URLs and project-relative files
- Light and dark themes with configurable colors and spacing
- Built-in formatting toolbar with APIs for replacing it with custom UI
- Extensible language, widget, table, and figure adapters

CodeMirror language support can be used alongside the visual layer for syntax highlighting, completion, folding, linting, and other editor services.

## Installation

```bash
npm install codemirror-visual-markup
```

Import the bundled visual styles:

```javascript
import 'codemirror-visual-markup/dist/styles.css';
```

`mathlive` is an optional peer dependency. Install it when interactive equation editing is required:

```bash
npm install mathlive
```

## Usage

```javascript
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { latex } from 'codemirror-lang-latex';
import { DualVisualEditor } from 'codemirror-visual-markup';
import 'codemirror-visual-markup/dist/styles.css';

const view = new EditorView({
  state: EditorState.create({
    doc: '\\section{Introduction}\n\nText with \\textbf{visual formatting} and $E = mc^2$.',
    extensions: [latex()]
  })
});

const editor = new DualVisualEditor(
  document.querySelector('#editor'),
  view,
  {
    language: 'latex',
    initialMode: 'visual'
  }
);
```

For Typst, use your normal Typst CodeMirror language extension and set `language: 'typst'`.

## API

### DualVisualEditor

`DualVisualEditor` adds source/visual mode controls, the formatting toolbar, theme support, and math hover support around an existing `EditorView`.

```javascript
const editor = new DualVisualEditor(container, view, {
  language: 'latex',             // 'latex', 'typst', or a registered language
  initialMode: 'visual',         // 'source' or 'visual'
  showCommands: false,           // show concealed source syntax in visual mode
  showToolbar: true,             // show the bundled formatting toolbar
  enableMathHover: true,         // source-mode math preview
  theme: 'light'                 // 'light' or 'dark'
});
```

Useful methods include:

```javascript
editor.setMode('source');
editor.toggleMode();
editor.setLanguage('typst');
editor.toggleCommandVisibility();
editor.toggleToolbar();
editor.setTheme('dark');
editor.updateConfig({ showToolbar: false });
editor.destroy();
```

`DualLatexEditor` is a convenience subclass with the language fixed to LaTeX.

### Using the visual layer without the bundled UI

If you already provide your own editor chrome, use the visual extension directly:

```javascript
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  setVisualState,
  visualExtension
} from 'codemirror-visual-markup';

const view = new EditorView({
  state: EditorState.create({
    doc: '\\section{Title}',
    extensions: [visualExtension()]
  }),
  parent: document.querySelector('#editor')
});

view.dispatch({
  effects: setVisualState.of({
    enabled: true,
    language: 'latex',
    showCommands: false,
    maxDepth: 12
  })
});
```

## Images

External image URLs using `http:`, `https:`, `data:`, or `blob:` are displayed directly.

For project-relative image paths, provide an image resolver. The resolver receives a normalized path relative to the current document and returns a browser-readable URL.

```javascript
import {
  createImageResolver,
  imageResolver
} from 'codemirror-visual-markup';

const resolver = createImageResolver(
  () => currentDocumentPath,
  async resolvedPath => {
    const file = await loadProjectFile(resolvedPath);
    if (!file) return null;

    return URL.createObjectURL(file);
  }
);

const view = new EditorView({
  state: EditorState.create({
    doc: '\\includegraphics{figures/result.png}',
    extensions: [
      imageResolver.of(resolver)
    ]
  })
});

// When the editor is no longer used:
resolver.dispose?.();
```

`resolveImagePath(currentPath, src)` is also exported when only path normalization is needed.

## Toolbar Customization

### Hide the bundled toolbar

```javascript
const editor = new DualVisualEditor(container, view, {
  language: 'latex',
  showToolbar: false
});
```

The toolbar can also be shown or hidden later:

```javascript
editor.toggleToolbar();
// or
editor.updateConfig({ showToolbar: false });
```

### Replace the toolbar

The toolbar commands are exposed independently of the bundled DOM toolbar. This makes it possible to render them with any UI framework or component system.

```javascript
import {
  getLanguage,
  isToolbarButton,
  scopeAt,
  toolbarEntries
} from 'codemirror-visual-markup';

function renderToolbar(host, view, languageId) {
  const language = getLanguage(languageId);
  const scope = scopeAt(
    view.state,
    view.state.selection.main.head,
    language
  );

  host.replaceChildren();

  for (const entry of toolbarEntries(language, scope)) {
    if (!isToolbarButton(entry)) continue;

    const button = document.createElement('button');
    button.textContent = entry.label;
    button.addEventListener('click', () => entry.command(view));
    host.appendChild(button);
  }
}
```

Recompute the entries when the selection changes so context-sensitive table controls appear only when relevant.

The exported helpers `wrapSelection`, `insertText`, `insertBlock`, `createWrapItem`, `createHeadingItem`, `createListItem`, `createTableItem`, and `createColorItem` can also be used to build a toolbar from scratch.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl`/`Cmd` + `E` | Toggle source and visual mode |
| `Ctrl`/`Cmd` + `Shift` + `C` | Show or conceal source syntax in visual mode |
| `Ctrl`/`Cmd` + `Shift` + `M` | Toggle source-mode math hover |
| `Ctrl`/`Cmd` + `Shift` + `T` | Toggle the bundled toolbar |

Placing the cursor inside a visual construct reveals its source syntax, so the underlying document remains directly editable without leaving visual mode.

## Custom Languages

Languages can be registered with a tokenizer rule set, style mapping, and command definitions:

```typescript
import {
  registerLanguage,
  type Language
} from 'codemirror-visual-markup';

const language: Language = {
  id: 'example',
  name: 'Example',
  rules: [headingRule, emphasisRule],
  style(token) {
    if (token.kind === 'heading') {
      return {
        class: `cm-lv-h${token.level}`,
        block: true
      };
    }
    return null;
  },
  commands: {
    wrap: {
      bold: ['**', '**']
    },
    heading(level, text) {
      return `${'#'.repeat(level)} ${text}`;
    },
    list(_kind, items) {
      return items.map(item => `- ${item}`).join('\n');
    },
    table(rows, cols) {
      return `${rows} x ${cols}`;
    },
    color(_kind, _color, text) {
      return text;
    }
  }
};

registerLanguage(language);
```

Optional table and figure adapters can provide richer visual structure for languages that support them.

## Building from Source

```bash
git clone https://github.com/TeXlyre/codemirror-visual-markup.git
cd codemirror-visual-markup
npm install
npm run build
```

Run the tests with:

```bash
npm test
```

Run the GitHub Pages example locally with:

```bash
npm run pages-example
```

## License

MIT License. See [LICENSE](LICENSE) for details.
