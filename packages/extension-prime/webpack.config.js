const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const pkg = require('./package.json');

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: {
    'background/service-worker': './src/background/service-worker.ts',
    'content/content-script': './src/content/content-script.ts',
    'popup/popup': './src/popup/popup.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'manifest.json',
          to: 'manifest.json',
          transform(content) {
            const manifest = JSON.parse(content.toString());
            manifest.version = pkg.version;
            return JSON.stringify(manifest, null, 2);
          },
        },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'src/popup/popup.css', to: 'popup/popup.css' },
        { from: 'src/icons', to: 'icons' },
      ],
    }),
  ],
  devtool: 'cheap-module-source-map',
  optimization: {
    minimize: false,
  },
};
