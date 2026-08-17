import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { lintGutter } from '@codemirror/lint';
import { defaultHighlightStyle, foldGutter, syntaxHighlighting } from '@codemirror/language';

import { DualVisualEditor, listLanguages } from '../../..';

import '../../../dist/styles.css';
import './styles.css';

const IMAGE = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/120px-React-icon.svg.png';

const SAMPLES = {
  latex: `\\section{Introduction}

Text with \\textbf{bold}, \\textit{italic}, \\underline{underlined}, and \\textcolor{red}{coloured text}.

Inline math $E = mc^2$ and a display equation:

$$\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}$$

\\subsection{Table}

\\begin{tabular}{lll}
  Symbol & Value & Note \\\\
  $\\alpha$ & 1.24 & \\textbf{bold cell} \\\\
  $\\beta$ & $$\\frac{1}{2}$$ & plain \\\\
\\end{tabular}

\\subsection{Figure}

\\begin{figure}
  \\begin{subfigure}{0.46\\textwidth}
    \\includegraphics[width=\\linewidth]{${IMAGE}}
    \\caption{First panel}
  \\end{subfigure}\\hfill
  \\begin{subfigure}{0.46\\textwidth}
    \\includegraphics[width=\\linewidth]{${IMAGE}}
    \\caption{Second panel}
  \\end{subfigure}
  \\caption{Two editable subfigures}
\\end{figure}

\\begin{itemize}
  \\item First item
  \\item Second item with $\\alpha + \\beta$
\\end{itemize}`,

  typst: `= Introduction

Text with *bold*, _italic_, and #text(fill: red)[coloured text].

Inline math $E = m c^2$ and a display equation:

$ integral_(-oo)^oo e^(-x^2) dif x = sqrt(pi) $

== Table

#table(
  columns: 3,
  table.header([Symbol], [Value], [Note]),
  [$alpha$], [1.24], [bold cell],
  [$beta$], [$ 1/2 $], [plain],
)

== Figure

#figure(
  grid(
    columns: 2,
    figure(image("${IMAGE}", width: 80%), caption: [First panel]),
    figure(image("${IMAGE}", width: 80%), caption: [Second panel]),
  ),
  caption: [Two editable subfigures],
)

- First item
- Second item with $alpha + beta$`
};

const LANGUAGE_SUPPORT = {
  latex: async () => {
    const { latex } = await import('codemirror-lang-latex');
    return [latex({ autoCloseTags: true }), lintGutter()];
  },
  typst: async () => {
    const { typst } = await import('codemirror-lang-typst');
    return [typst()];
  }
};

let editor;
let generation = 0;
let theme = 'light';

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
        foldGutter(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        support
      ]
    })
  });

  editor = new DualVisualEditor(host, view, {
    language,
    initialMode: 'visual',
    theme,
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
    document.getElementById('mode').textContent = 'visual';
    mount(picker.value);
  });

  document.getElementById('theme').addEventListener('click', () => {
    theme = theme === 'light' ? 'dark' : 'light';
    editor?.setTheme(theme);
  });
}

function start() {
  setupControls();
  mount('latex');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
