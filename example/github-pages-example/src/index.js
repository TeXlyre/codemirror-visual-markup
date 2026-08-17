import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

import { DualVisualEditor, listLanguages } from '../../..';

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

\\begin{tabular}{ll}
  Name & Value \\\\
  Alpha & 1 \\\\
\\end{tabular}

% comments stay dimmed
\\textcolor{red}{Coloured text} and \\unknowncommand{raw}.`,

  typst: `= Introduction

Text with *bold _and nested_* plus inline math $E = m c^2$.

== Equations

$ integral_(-oo)^oo e^(-x^2) dif x = sqrt(pi) $

- First item with $alpha + beta$
- Second item
- Nested entries work too

#emph[Call with content] and #text(fill: red)[coloured].

// comments stay dimmed
\`inline raw\` stays monospaced.`
};

let editor;
let view;

function mount(language) {
  const host = document.getElementById('editor');
  host.innerHTML = '';

  view = new EditorView({
    state: EditorState.create({
      doc: SAMPLES[language],
      extensions: [lineNumbers(), history(), keymap.of([...defaultKeymap, ...historyKeymap])]
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
    editor.destroy();
    mount(picker.value);
  });

  document.getElementById('theme').addEventListener('click', () => {
    const dark = document.body.classList.toggle('theme-dark');
    editor.setTheme(dark ? 'dark' : 'light');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    document.body.classList.add('theme-dark');
  }
  setupControls();
  mount('latex');
});
