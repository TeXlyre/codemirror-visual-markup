import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { lintGutter, linter } from '@codemirror/lint';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

import { DualVisualEditor, createImageResolver, imageResolver, listLanguages } from '../../..';

import '../../../dist/styles.css';
import './styles.css';

const SAMPLES = {
  latex: `\\section{Introduction}

Text with \\textbf{bold \\textit{and nested \\underline{emphasis}}} plus inline math $E = mc^2$.

\\subsection{Equations}

$$\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}$$

\\begin{itemize}
  \\item First item with $\\alpha + \\beta$
  \\item Second item
  \\begin{enumerate}
    \\item Nested list entry
  \\end{enumerate}
\\end{itemize}

\\begin{tabular}{lll}
  Symbol & Value & Note \\\\
  $\\alpha$ & 1.24 & \\textbf{bold cell} \\\\
  $\\beta$ & $$\\frac{1}{2}$$ & plain \\\\
\\end{tabular}

\\begin{figure}
  \\includegraphics{https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/120px-React-icon.svg.png}
  \\caption{A caption stays editable}
\\end{figure}

\\begin{lstlisting}
int main() { return 0; }
\\end{lstlisting}

% comments stay dimmed
\\textcolor{red}{Coloured text} and \\unknowncommand{raw}.`,

  typst: `= Introduction

Text with *bold _and nested_* plus inline math $E = m c^2$.

== Equations

$ integral_(-oo)^oo e^(-x^2) dif x = sqrt(pi) $

- First item with $alpha + beta$
- Second item
- Nested entries work too

#figure(
  image("https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/120px-React-icon.svg.png"),
  caption: [A caption stays editable],
)

#emph[Call with content] and #text(fill: red)[coloured].

// comments stay dimmed
\`inline raw\` stays monospaced.`
};

const LANGUAGE_SUPPORT = {
  latex: async () => {
    const { latex, latexLinter } = await import('codemirror-lang-latex');
    return [latex({ autoCloseTags: true }), linter(latexLinter()), lintGutter()];
  },
  typst: async () => {
    const { typst } = await import('codemirror-lang-typst');
    return [typst()];
  }
};

const resolver = createImageResolver(
  () => '/main.tex',
  async resolvedPath => resolvedPath
);

let editor;
let generation = 0;

async function mount(language) {
  const token = ++generation;
  const host = document.getElementById('editor');

  host.innerHTML = '';
  host.textContent = `Loading ${language} support...`;

  const support = await LANGUAGE_SUPPORT[language]();
  if (token !== generation) return;

  host.textContent = '';

  const view = new EditorView({
    state: EditorState.create({
      doc: SAMPLES[language],
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        support,
        imageResolver.of(resolver)
      ]
    })
  });

  editor = new DualVisualEditor(host, view, {
    language,
    initialMode: 'visual',
    theme: document.body.classList.contains('theme-dark') ? 'dark' : 'light',
    onModeChange: mode => {
      document.getElementById('mode').textContent = mode;
    }
  });
}

function setupControls() {
  const picker = document.getElementById('language');

  for (const language of listLanguages()) {
    const option = document.createElement('option');
    option.value = language.id;
    option.textContent = language.name;
    picker.appendChild(option);
  }

  picker.addEventListener('change', () => {
    editor?.destroy();
    editor = undefined;
    mount(picker.value);
  });

  document.getElementById('theme').addEventListener('click', () => {
    const dark = document.body.classList.toggle('theme-dark');
    editor?.setTheme(dark ? 'dark' : 'light');
  });
}

function start() {
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    document.body.classList.add('theme-dark');
  }
  setupControls();
  mount('latex');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
