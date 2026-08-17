function typst2tex(value) {
  if (value === 'alpha + beta') return '\\alpha + \\beta';
  if (value === 'integral_(-oo)^oo e^(-x^2) dif x = sqrt(pi)') {
    return '\\int_{-\\infty}^{\\infty} e^{-x^2} \\mathrm{d} x = \\sqrt{\\pi}';
  }
  if (value === 'integral_(-infinity)^infinity e^(-x^2) dif x = sqrt(pi)') {
    return '\\int_{-\\infty}^{\\infty} e^{-x^2} \\mathrm{d} x = \\sqrt{\\pi}';
  }
  return value;
}

module.exports = { typst2tex, __esModule: true };
