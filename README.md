# CodeMirror 6 LaTeX Visual Editor

![Status: Experimental](https://img.shields.io/badge/status-experimental-red)

> [!WARNING]
> This repository is experimental.
> Expect breaking changes and unstable APIs.

**WIP** This package provides WYSIWYM visual editing for LaTeX documents in [CodeMirror 6](https://codemirror.net/6/), designed to work with academic writing workflows and document preparation.

## Features

- Visual editing - LaTeX source remains authoritative
- Real-time bidirectional synchronization between source and visual editors
- Visual representation of LaTeX structures (sections, math blocks, environments)
- Mathlive rendering and editing for math content
- Mode switching between source and visual editing
- Works with any existing CodeMirror 6 setup
- Preserves LaTeX formatting and commands exactly as written
- Keyboard shortcut (Ctrl+E / Cmd+E) to toggle editing modes
- Support for:
  - Sections (`\section{}`, `\subsection{}`, `\subsubsection{}`)
  - Math environments (inline `$...$` and display `$$...$$`)
  - LaTeX environments (`\begin{env}...\end{env}`)
  - LaTeX commands with parameters
  - Mixed content paragraphs with multiple commands

## Installation

```bash
npm install codemirror-latex-visual
```

## Usage

```javascript
import { EditorState, EditorView } from '@codemirror/state';
import { DualLatexEditor } from 'codemirror-latex-visual';
import 'codemirror-latex-visual/dist/styles.css';

// Create your CodeMirror editor as usual
const cmEditor = new EditorView({
  state: EditorState.create({
    doc: `\\section{Introduction}
This is a sample document with $E = mc^2$ inline math.

$$\\int_{0}^{1} x^2 dx = \\frac{1}{3}$$

\\begin{theorem}
This is a theorem environment.
\\end{theorem}`,
    extensions: [
      // ... your existing extensions
    ]
  }),
  parent: document.querySelector('#cm-container')
});

// Add visual editing capability
const dualEditor = new DualLatexEditor(
  document.querySelector('#editor-wrapper'),
  cmEditor,
  {
    initialMode: 'source',
    onModeChange: (mode) => console.log('Switched to:', mode)
  }
);
```

### Configuration Options

You can configure the dual editor by passing options:

```javascript
import { DualLatexEditor } from 'codemirror-latex-visual';

// With all options explicitly set
const dualEditor = new DualLatexEditor(container, cmEditor, {
  initialMode: 'source',           // Start in source mode
  onModeChange: (mode) => {},      // Mode change callback
  className: 'my-custom-class'     // Additional CSS class
});
```

## API

### DualLatexEditor

The main class that creates a dual editing interface for LaTeX.

```javascript
import { DualLatexEditor } from 'codemirror-latex-visual';

const dualEditor = new DualLatexEditor(container, cmEditor, options);
```

**Parameters:**
- `container`: HTMLElement to contain the dual editor interface
- `cmEditor`: Existing CodeMirror EditorView instance
- `options`: Configuration object (optional)

**Options:**
- `initialMode`: 'source' | 'visual' - Initial editing mode (default: 'source')
- `onModeChange`: Function called when mode changes
- `className`: Additional CSS class for styling

**Methods:**
```javascript
// Switch editing mode programmatically
dualEditor.setMode('visual');
dualEditor.setMode('source');

// Toggle between modes
dualEditor.toggleMode();

// Clean up resources
dualEditor.destroy();
```

### latexVisualKeymap

An extension that adds keyboard shortcuts for mode switching when used in CodeMirror.

```javascript
import { latexVisualKeymap } from 'codemirror-latex-visual';

const extensions = [
  // ... other extensions
  latexVisualKeymap(dualEditor)
];
```

### Parsing Functions

Convert between LaTeX and ProseMirror document formats.

```javascript
import { parseLatexToProseMirror, renderProseMirrorToLatex } from 'codemirror-latex-visual';

const pmDoc = parseLatexToProseMirror(latexString);
const latexString = renderProseMirrorToLatex(pmDoc);
```

### latexVisualSchema

The ProseMirror schema used for visual editing. Can be extended for custom LaTeX constructs.

```javascript
import { latexVisualSchema } from 'codemirror-latex-visual';
```

### Styling

The package includes CSS styles for the visual editor in `dist/styles.css`. Import these styles to get the default visual editing interface:

```javascript
import 'codemirror-latex-visual/dist/styles.css';
```

You can also customize styles in your own CSS by targeting the specific classes.

## Advanced Usage

### Extending the Schema

You can extend the ProseMirror schema to support additional LaTeX constructs:

```javascript
import { Schema } from 'prosemirror-model';
import { latexVisualSchema } from 'codemirror-latex-visual';

const customSchema = new Schema({
  nodes: {
    ...latexVisualSchema.spec.nodes,
    custom_environment: {
      group: 'block',
      content: 'block*',
      attrs: { name: { default: '' }, latex: { default: '' } },
      parseDOM: [{ tag: 'div.custom-env' }],
      toDOM: node => ['div', { class: 'custom-env' }, 0]
    }
  },
  marks: latexVisualSchema.spec.marks
});
```

### Custom Sync Manager

For advanced use cases, you can use the SyncManager directly:

```javascript
import { SyncManager } from 'codemirror-latex-visual';

const syncManager = new SyncManager(cmEditor, pmEditor);

// Manual synchronization
syncManager.syncToVisual();  // Update ProseMirror from CodeMirror
syncManager.syncToSource();  // Update CodeMirror from ProseMirror

// Handle ProseMirror changes
syncManager.handleProseMirrorChange(transaction);
```

## Supported LaTeX Constructs

The package recognizes and provides visual editing for:

- **Sections**: `\section{}`, `\subsection{}`, `\subsubsection{}`
- **Mathematics**: Inline `$...$` and display `$$...$$` blocks
- **Environments**: `\begin{env}...\end{env}` structures
- **Commands**: LaTeX commands with braced parameters
- **Mixed content**: Paragraphs containing text, math, and commands

### Visual Representation

- Sections appear as HTML headings (h1, h2, h3)
- Math blocks are displayed with distinctive styling
- Environments are shown as bordered containers
- Commands are highlighted inline elements
- All elements preserve their original LaTeX source

## Keyboard Shortcuts

- **Ctrl+E** (Windows/Linux) / **Cmd+E** (Mac): Toggle between source and visual editing modes

## Building from Source

```bash
git clone https://github.com/texlyre/codemirror-latex-visual.git
cd codemirror-latex-visual
npm install
npm run build
```

Run the demo:
```bash
npm run pages-example
```

## Architecture

The package uses a dual-editor approach:

1. **CodeMirror** remains the source of truth for LaTeX content
2. **ProseMirror** provides visual representation and editing
3. **SyncManager** handles bidirectional synchronization
4. **Parser** converts between LaTeX and ProseMirror formats
5. **Schema** defines the visual document structure

Changes in either editor are immediately reflected in the other while preserving the exact LaTeX source formatting.

## License

MIT License. See [LICENSE](LICENSE) file for details.
