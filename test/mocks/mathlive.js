class MathfieldElement extends HTMLElement {
  constructor() {
    super();
    this.value = '';
    this.readOnly = false;
  }
}

MathfieldElement.soundsDirectory = null;

if (!customElements.get('math-field')) {
  customElements.define('math-field', MathfieldElement);
}

module.exports = { MathfieldElement, __esModule: true };
