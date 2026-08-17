export interface TableDimensions {
  rows: number;
  cols: number;
}

const MAX_ROWS = 8;
const MAX_COLS = 8;

export class TableSelector {
  private container: HTMLElement;
  private onSelect: (dimensions: TableDimensions) => void;
  private label!: HTMLElement;

  constructor(container: HTMLElement, onSelect: (dimensions: TableDimensions) => void) {
    this.container = container;
    this.onSelect = onSelect;
    this.render();
    this.hide();
  }

  isVisible(): boolean {
    return this.container.style.display !== 'none';
  }

  show(): void {
    this.container.style.display = 'block';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  toggle(): void {
    if (this.isVisible()) this.hide();
    else this.show();
  }

  private render(): void {
    this.container.className = 'table-selector-dropdown';
    this.container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'table-grid';

    for (let row = 1; row <= MAX_ROWS; row++) {
      for (let col = 1; col <= MAX_COLS; col++) {
        const cell = document.createElement('div');
        cell.className = 'table-grid-cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        grid.appendChild(cell);
      }
    }

    this.label = document.createElement('div');
    this.label.className = 'table-selector-label';
    this.label.textContent = '1 × 1';

    grid.addEventListener('mouseover', event => {
      const cell = (event.target as HTMLElement).closest('.table-grid-cell') as HTMLElement | null;
      if (cell) this.highlight(grid, Number(cell.dataset.row), Number(cell.dataset.col));
    });

    grid.addEventListener('click', event => {
      const cell = (event.target as HTMLElement).closest('.table-grid-cell') as HTMLElement | null;
      if (!cell) return;
      this.onSelect({ rows: Number(cell.dataset.row), cols: Number(cell.dataset.col) });
      this.hide();
    });

    this.container.append(grid, this.label);
  }

  private highlight(grid: HTMLElement, rows: number, cols: number): void {
    for (const node of Array.from(grid.children) as HTMLElement[]) {
      const active = Number(node.dataset.row) <= rows && Number(node.dataset.col) <= cols;
      node.classList.toggle('active', active);
    }
    this.label.textContent = `${rows} × ${cols}`;
  }
}
