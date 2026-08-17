export const EDITABLE_COMMANDS = new Set([
  'textbf', 'textit', 'emph', 'underline', 'textsc', 'textsf', 'texttt',
  'section', 'subsection', 'subsubsection', 'title', 'author', 'date',
  'footnote', 'cite', 'citeyear', 'citep', 'citey', 'ref', 'label', 'url', 'href',
  'textcolor', 'color', 'colorbox'
]);

export const FORMATTING_COMMANDS = new Map([
  ['textbf', 'strong'],
  ['textit', 'em'],
  ['emph', 'em']
]);

export const COMMAND_CLASSES = new Map([
  ['textbf', 'cm-lv-bold'],
  ['textit', 'cm-lv-italic'],
  ['emph', 'cm-lv-italic'],
  ['underline', 'cm-lv-underline'],
  ['textsc', 'cm-lv-smallcaps'],
  ['textsf', 'cm-lv-sans'],
  ['texttt', 'cm-lv-mono'],
  ['textcolor', 'cm-lv-colored'],
  ['colorbox', 'cm-lv-colorbox']
]);

export const HEADING_LEVELS = new Map([
  ['part', 1],
  ['chapter', 1],
  ['section', 1],
  ['subsection', 2],
  ['subsubsection', 3],
  ['paragraph', 4],
  ['subparagraph', 5]
]);

export const LIST_ENVIRONMENTS = new Set(['itemize', 'enumerate', 'description']);

export const VERBATIM_ENVIRONMENTS = new Set(['verbatim', 'lstlisting', 'minted', 'Verbatim']);

export const MATH_ENVIRONMENTS = new Set([
  'equation', 'equation*', 'align', 'align*', 'gather', 'gather*',
  'multline', 'multline*', 'eqnarray', 'eqnarray*'
]);

export const ESCAPABLE = new Set(['\\', '%', '&', '_', '$', '#', '{', '}', '~', '^', ' ']);

export const ARGUMENT_COUNT = new Map([
  ['textcolor', 2],
  ['colorbox', 2],
  ['href', 2],
  ['fcolorbox', 3]
]);
