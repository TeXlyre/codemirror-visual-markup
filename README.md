# CodeMirror Visual Markup Editor

Visual (WYSIWYM) editing for markup languages in [CodeMirror 6](https://codemirror.net/6/).
LaTeX and Typst ship in the box; other languages plug in without touching the editor core.

The source document is always authoritative. Visual mode is a decoration layer over the real
text, so every edit is an ordinary CodeMirror transaction and nothing is ever re-serialised
from a mirrored DOM tree.

## Install

```
npm install codemirror-latex-visual
```

`mathlive` is an optional peer dependency, loaded on demand the first time a formula renders.

## Usage

```js
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DualVisualEditor } from 'codemirror-latex-visual';
import 'codemirror-latex-visual/dist/styles.css';

const view = new EditorView({
  state: EditorState.create({ doc: '\\section{Title}\n\nMath: $E = mc^2$.' })
});

const editor = new DualVisualEditor(document.querySelector('#app'), view, {
  language: 'latex',
  initialMode: 'visual'
});
```

`DualLatexEditor` is a thin subclass pinned to `language: 'latex'`.

### Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl`/`Cmd` + `E` | Toggle source and visual mode |
| `Ctrl`/`Cmd` + `Shift` + `C` | Reveal markup in visual mode |
| `Ctrl`/`Cmd` + `Shift` + `M` | Toggle math hover preview |
| `Ctrl`/`Cmd` + `Shift` + `T` | Toggle the formatting toolbar |

Placing the cursor inside a construct reveals its markup inline, so hidden syntax is always
reachable without leaving visual mode.

## Architecture

```
src/core/       tokens, scanner, tokenizer, language registry, config
src/languages/  latex/, typst/
src/view/       decorations, widgets, theme, math hover, visual extension
src/ui/         dual editor, toolbar, table selector
```

Parsing produces a token tree carrying **absolute document offsets**. `buildDecorations`
walks that tree and emits:

- `Decoration.mark` on token bodies, which nest natively to any depth
- `Decoration.replace` over delimiter ranges to hide markup
- `Decoration.line` for block constructs such as headings and environments
- atomic widgets only where content is genuinely opaque (math, tables)

Because positions are absolute, widget edits write back with `view.posAtDOM` against an exact
range rather than searching the document for a matching substring.

## Adding a language

A language is a set of rules plus a style mapping:

```ts
import { registerLanguage, Language } from 'codemirror-latex-visual';

const markdown: Language = {
  id: 'markdown',
  name: 'Markdown',
  rules: [heading, emphasis, code],
  style(token) {
    if (token.kind === 'heading') return { class: `cm-lv-h${token.level}`, block: true };
    if (token.kind === 'command') return { class: 'cm-lv-bold' };
    return null;
  },
  commands: { wrap: { bold: ['**', '**'] }, heading, list, table, color }
};

registerLanguage(markdown);
```

A `Rule` receives `(source, position, context)` and returns a token with absolute offsets, or
`null`. Call `context.parse(from, to, mode)` to tokenize a child range; nesting depth is bounded
by `config.maxDepth`. `TokenStyle` selects how a token renders: `class`, `block`, `hidden`,
`keepSyntax`, `replaceWith`, or an atomic `widget`.

Languages with more than one syntactic mode read `context.mode` and recurse with an explicit
one. Typst uses this to parse call arguments as code — where string literals, `name:` labels
and separators are recognised and hidden — while a `[...]` block inside those arguments returns
to markup. LaTeX ignores modes entirely. `keepSyntax` suppresses child decorations as well as
its own, so a construct showing raw source never has children quietly hiding parts of it.

Optional `table` adapter (`parse` / `serialize`) enables the editable grid widget.

## TeXlyre integration

Toolbar items use the same contract as TeXlyre's `PluginToolbar`, so the bundled DOM toolbar
can be swapped for it without touching this package:

```ts
import { toolbarEntries, scopeAt, isToolbarButton, getLanguage } from 'codemirror-latex-visual';

const language = getLanguage('latex');
const scope = scopeAt(view.state, view.state.selection.main.head, language);
const entries = toolbarEntries(language, scope);

<PluginToolbar
  items={entries.map(entry =>
    isToolbarButton(entry) ? { key: entry.key, label: t(entry.label), icon: icons[entry.key] } : entry
  )}
  onRun={key => {
    const item = entries.find(entry => isToolbarButton(entry) && entry.key === key);
    if (item && isToolbarButton(item)) item.command(view);
  }}
/>;
```

`ToolbarItem` is `{ key, label, icon?, command(view): boolean }` with `{ type: 'split' }` and
`{ type: 'space' }` separators; keys are namespaced per language (`latex-bold`, `typst-bold`).
`scopeAt` reports `inTable` / `inColor` so scoped entries appear only where they apply, and
`wrapSelection` / `insertText` match the TeXlyre helper semantics.

## Collaborative editing

Remote carets and selections from `y-codemirror.next` render normally over marks, line
decorations and plain text — that covers headings, emphasis, environments and lists, because
those constructs only hide short delimiter spans. They do **not** render inside a replaced
range, so a remote caret is invisible inside an atomic math or table widget, and inside hidden
markup such as `\\textbf{`.

Feed remote positions into the `revealRanges` facet to suppress the widget wherever a
collaborator is working:

```ts
import { revealAt } from 'codemirror-latex-visual';

const remote = awareness
  .getStates()
  .values()
  .filter(state => state.cursor)
  .map(state => state.cursor.head);

view.dispatch({ effects: StateEffect.appendConfig.of(revealAt(remote)) });
```

Pass a colour to tint the indicator per collaborator: `revealAt(positions, user.color)`.
Reconfigure the facet as awareness changes; the decoration field recomputes whenever its value
changes identity.

Tables are granular for remote presence: a collaborator's caret inside one does not drop the
whole table back to source. The widget stays rendered and only the cell they are in is
outlined, in their colour. The local caret still reveals the table as source, so you keep
direct access to the markup and to language services. The highlight is applied through `updateDOM`, so moving between cells never rebuilds
the table and never steals focus from a cell being edited. A non-empty selection spanning the
table still falls back to source, which is what you want when editing the markup itself.
Granularity comes from `TableAdapter.ranges`, which reports the absolute range of every cell;
any language that implements it gets the same behaviour, and `TokenStyle.granular` opts a
widget into it. Widgets are compared by their source text, so a remote edit elsewhere in the
document does not tear down an open MathLive field or a focused table cell.

Widget commits are guarded: `replaceRange` verifies the widget's original text still occupies
its live range before dispatching, so a concurrent remote edit to the same formula causes the
local widget edit to be rejected rather than overwrite the remote value.

## Inline figures

`\\includegraphics{...}` and `#image("...")` render inline. External URLs (`http:`, `data:`,
`blob:`) load directly; project-relative paths go through a resolver you supply, so this
package never needs to know how your files are stored:

```ts
import { createImageResolver, imageResolver } from 'codemirror-latex-visual';

const resolver = createImageResolver(
  () => currentFilePath,
  async resolvedPath => {
    const file = await fileStorageService.getFileByPath(resolvedPath);
    if (!file?.content) return null;
    return URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
  }
);

// extensions: [imageResolver.of(resolver)]
// on unmount: resolver.dispose()
```

`resolveImagePath(currentPath, src)` normalises `.` and `..` against the containing directory;
absolute paths pass through. `createImageResolver` memoises by resolved path, so the same figure
referenced twice is fetched once, and `dispose()` revokes every object URL it handed out.
Unresolvable sources get a `cm-lv-image-missing` placeholder rather than a broken element.

Captions need no special handling in either language. `\\begin{figure}` is an ordinary container,
so `\\caption{...}` stays editable text beside the rendered image. Typst's
`#figure(image("plot.png"), caption: [A *nice* plot])` renders the same way: argument
separators and the `caption:` label are hidden, the nested `image(...)` call becomes the
figure, and the content block is parsed as markup so its emphasis still works and the text
stays editable.

## Language services (LSP, autocomplete, diagnostics, highlighting)

Visual mode is a decoration layer over the real document, so anything that renders as a
`Decoration.mark` or `Decoration.line` — syntax highlighting, lint underlines, LSP squiggles,
selection matching — composes normally with it. Autocomplete, hover and code actions operate on
the live text and the live selection, so they work unchanged.

The exception is an atomic widget: nothing inside a replaced range is drawn, and MathLive
fields and table cells are foreign DOM outside CodeMirror's text model. Two things keep that
from mattering:

**The widget dissolves under the caret.** The local selection always reveals the construct it
touches, and the widget's boundary is not atomic, so the caret can step onto it and walk into
the raw source. Wherever you are actually working, you are editing real text with every service
attached. Widgets only exist where the caret is not.

**Diagnostics you are not looking at** would otherwise be invisible. Feed their ranges into the
reveal facet so the affected construct renders as source:

```ts
import { revealFrom } from 'codemirror-latex-visual';
import { forEachDiagnostic, lintState } from '@codemirror/lint';

revealFrom([lintState], state => {
  const ranges: { from: number; to: number }[] = [];
  forEachDiagnostic(state, (_diagnostic, from, to) => ranges.push({ from, to }));
  return ranges;
});
```

`revealFrom(deps, compute)` is a thin wrapper over `Facet.compute`, so any state — LSP results,
search matches, a review pane's selection — can force a construct open without this package
depending on it.

## LaTeX macro signatures

The parser is a lossless offset-preserving scanner, not an AST adapter, because
`@unified-latex` drops `position` on every `argument` node and ends a macro node at the command
name — the body range needed for decorations is not recoverable without re-scanning. If you
already depend on unified-latex, feed its CTAN records in to widen argument handling:

```ts
import { setMacroSignatures } from 'codemirror-latex-visual';
import { macros } from '@unified-latex/unified-latex-ctan/package/xcolor';

setMacroSignatures(macros);
```

## Scripts

```
npm run build          # type check, bundle, copy styles
npm test               # jest (ts-jest, jsdom)
npm run test:coverage
npm run pages-example
```

## License

MIT
