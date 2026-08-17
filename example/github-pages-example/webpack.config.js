const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const single = name => path.resolve(__dirname, 'node_modules', name);

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: 'auto',
    clean: true
  },
  devServer: {
    static: './dist',
    hot: true,
    port: 3000
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html'
    })
  ],
  experiments: {
    asyncWebAssembly: true
  },
  performance: {
    hints: false
  },
  resolve: {
    alias: {
      '@codemirror/state': single('@codemirror/state'),
      '@codemirror/view': single('@codemirror/view'),
      '@codemirror/language': single('@codemirror/language'),
      '@codemirror/commands': single('@codemirror/commands'),
      '@codemirror/autocomplete': single('@codemirror/autocomplete'),
      '@codemirror/lint': single('@codemirror/lint'),
      mathlive: single('mathlive')
    }
  }
};
