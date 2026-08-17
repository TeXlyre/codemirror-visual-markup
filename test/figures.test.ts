import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { setVisualState, visualExtension } from '../src/view/visual-editor';
import '../src/view/widgets';

const mount = (doc: string, language: 'latex' | 'typst' = 'latex') => {
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: 0 }, extensions: [visualExtension()] }),
    parent: document.body
  });
  view.dispatch({ effects: setVisualState.of({ enabled: true, language, showCommands: false, maxDepth: 16 }) });
  return view;
};

const panels = (view: EditorView) => view.contentDOM.querySelectorAll('.cm-lv-figure-panel');
const images = (view: EditorView) => view.contentDOM.querySelectorAll('.cm-lv-figure-preview img');

describe('figure layouts', () => {
  it('keeps a simple LaTeX figure lightweight and respects includegraphics width', () => {
    const doc = ['intro', '\\begin{figure}', '  \\includegraphics[width=0.5\\textwidth]{https://example.com/a.png}', '  \\caption{A caption}', '\\end{figure}'].join('\n');
    const view = mount(doc);

    expect(view.contentDOM.querySelector('.cm-lv-figure-preview')).toBeNull();
    const image = view.contentDOM.querySelector('.cm-lv-image img') as HTMLImageElement;
    expect(image.style.width).toBe('50%');
    expect(view.contentDOM.querySelector('.cm-lv-caption')?.textContent).toContain('A caption');
  });

  it('renders LaTeX subcaption subfigures side by side with subcaptions', () => {
    const doc = [
      'intro',
      '\\begin{figure}',
      '  \\begin{subfigure}{0.48\\textwidth}',
      '    \\includegraphics[width=\\linewidth]{https://example.com/a.png}',
      '    \\caption{Alpha}',
      '  \\end{subfigure}\\hfill',
      '  \\begin{subfigure}{0.48\\textwidth}',
      '    \\includegraphics[width=\\linewidth]{https://example.com/b.png}',
      '    \\caption{Beta}',
      '  \\end{subfigure}',
      '  \\caption{Both panels}',
      '\\end{figure}'
    ].join('\n');
    const view = mount(doc);
    const figure = view.contentDOM.querySelector('.cm-lv-figure-preview') as HTMLElement;

    expect(figure).not.toBeNull();
    expect(panels(view)).toHaveLength(2);
    expect(images(view)).toHaveLength(2);
    expect(Array.from(view.contentDOM.querySelectorAll('.cm-lv-subcaption'), node => node.textContent)).toEqual(['Alpha', 'Beta']);
    expect(view.contentDOM.querySelector('.cm-lv-figure-caption')?.textContent).toBe('Both panels');
    expect(figure.style.getPropertyValue('--lv-figure-columns')).toBe('2');

    view.dispatch({ selection: { anchor: doc.indexOf('subfigure') } });
    expect(view.contentDOM.querySelector('.cm-lv-figure-preview')).toBeNull();
    expect(view.contentDOM.textContent).toContain('subfigure');
  });

  it('supports legacy LaTeX subfloat syntax and wide figure variants', () => {
    const doc = [
      'intro',
      '\\begin{figure*}',
      '  \\subfloat[One]{\\includegraphics{https://example.com/a.png}}\\hfill',
      '  \\subfloat[Two]{\\includegraphics{https://example.com/b.png}}',
      '  \\caption{Wide}',
      '\\end{figure*}'
    ].join('\n');
    const view = mount(doc);
    const figure = view.contentDOM.querySelector('.cm-lv-figure-preview')!;

    expect(figure.classList.contains('cm-lv-figure-wide')).toBe(true);
    expect(Array.from(view.contentDOM.querySelectorAll('.cm-lv-subcaption'), node => node.textContent)).toEqual(['One', 'Two']);
  });

  it('renders side-caption LaTeX figures without changing their source', () => {
    const doc = ['intro', '\\begin{SCfigure}', '\\includegraphics{https://example.com/a.png}', '\\caption{Beside the image}', '\\end{SCfigure}'].join('\n');
    const view = mount(doc);

    expect(view.contentDOM.querySelector('.cm-lv-figure-caption-side')).not.toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('keeps images inside visual tables as table cells', () => {
    const doc = ['intro', '\\begin{tabular}{ll}', 'Name & Preview \\\\', 'A & \\includegraphics[width=2cm]{https://example.com/a.png} \\\\', '\\end{tabular}'].join('\n');
    const view = mount(doc);
    const imageCell = view.contentDOM.querySelector('.cm-lv-cell.cm-lv-image');

    expect(imageCell).not.toBeNull();
    expect((imageCell!.querySelector('img') as HTMLImageElement).style.width).toBe('2cm');
  });
});

describe('Typst figure layouts', () => {
  it('keeps a normal figure editable and respects image sizing', () => {
    const doc = 'intro\n\n#figure(image("https://example.com/a.png", width: 50%), caption: [A caption])';
    const view = mount(doc, 'typst');

    expect(view.contentDOM.querySelector('.cm-lv-figure-preview')).toBeNull();
    expect((view.contentDOM.querySelector('.cm-lv-image img') as HTMLImageElement).style.width).toBe('50%');
    expect(view.contentDOM.querySelector('.cm-lv-caption')?.textContent).toContain('A caption');
  });

  it('renders a grid of nested figures as panels with captions', () => {
    const doc = [
      'intro',
      '',
      '#figure(',
      '  grid(',
      '    columns: 2,',
      '    figure(image("https://example.com/a.png"), caption: [Alpha]),',
      '    figure(image("https://example.com/b.png"), caption: [Beta]),',
      '  ),',
      '  caption: [Both panels],',
      ')'
    ].join('\n');
    const view = mount(doc, 'typst');
    const figure = view.contentDOM.querySelector('.cm-lv-figure-preview') as HTMLElement;

    expect(panels(view)).toHaveLength(2);
    expect(images(view)).toHaveLength(2);
    expect(Array.from(view.contentDOM.querySelectorAll('.cm-lv-subcaption'), node => node.textContent)).toEqual(['Alpha', 'Beta']);
    expect(figure.style.getPropertyValue('--lv-figure-columns')).toBe('2');
  });

  it('supports subpar.grid subfigures', () => {
    const doc = [
      'intro',
      '',
      '#subpar.grid(',
      '  figure(image("https://example.com/a.png"), caption: [Alpha]), <a>,',
      '  figure(image("https://example.com/b.png"), caption: [Beta]), <b>,',
      '  columns: (1fr, 1fr),',
      '  caption: [Both panels],',
      ')'
    ].join('\n');
    const view = mount(doc, 'typst');

    expect(panels(view)).toHaveLength(2);
    expect(view.contentDOM.querySelector('.cm-lv-figure-caption')?.textContent).toBe('Both panels');
  });

  it('keeps Typst images inside table cells', () => {
    const doc = 'intro\n\n#table(columns: 2, [Name], [#image("https://example.com/a.png", width: 70%)])';
    const view = mount(doc, 'typst');
    const imageCell = view.contentDOM.querySelector('.cm-lv-cell.cm-lv-image');

    expect(imageCell).not.toBeNull();
    expect((imageCell!.querySelector('img') as HTMLImageElement).style.width).toBe('70%');
  });

  it('keeps captioned Typst tables on the existing visual-table path', () => {
    const doc = 'intro\n\n#figure(table(columns: 2, [A], [B]), caption: [Results])';
    const view = mount(doc, 'typst');

    expect(view.contentDOM.querySelector('.cm-lv-figure-preview')).toBeNull();
    expect(view.contentDOM.querySelectorAll('.cm-lv-cell')).toHaveLength(2);
    expect(view.contentDOM.querySelector('.cm-lv-caption')?.textContent).toContain('Results');
  });

  it('supports parent-scoped wide figures and top captions', () => {
    const doc = 'intro\n\n#figure(image("https://example.com/a.png"), scope: "parent", caption: figure.caption(position: top, [Above]))';
    const view = mount(doc, 'typst');
    const line = Array.from(view.contentDOM.querySelectorAll('.cm-line')).find(node => node.classList.contains('cm-lv-figure-simple'))!;

    expect(line.classList.contains('cm-lv-figure-wide')).toBe(true);
    expect(line.classList.contains('cm-lv-figure-caption-top')).toBe(true);
  });
});
