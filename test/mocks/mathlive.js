class MathfieldElement extends HTMLElement {
  constructor() {
    super();
    this.value = '';
    this.readOnly = false;
    this.lastSetValue = undefined;
    this.lastSetValueFormat = undefined;
    this.lastGetValueFormat = undefined;
  }

  setValue(value, options = {}) {
    this.value = value;
    this.lastSetValue = value;
    this.lastSetValueFormat = options.format;
  }

  getValue(format) {
    this.lastGetValueFormat = format;
    return this.value;
  }
}

MathfieldElement.soundsDirectory = null;

if (!customElements.get('math-field')) {
  customElements.define('math-field', MathfieldElement);
}

const convertAsciiMathToLatex = value => `latex(${value})`;

module.exports = { MathfieldElement, convertAsciiMathToLatex, __esModule: true };
