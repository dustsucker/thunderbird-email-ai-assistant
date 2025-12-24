const path = require('path');

module.exports = (env, argv) => {
  const mode = argv.mode || 'development';
  const isProduction = mode === 'production';

  return {
    entry: {
      background: './background.ts',
      options: './options.ts',
    },
    output: {
      filename: '[name]-bundle.js',
      path: path.resolve(__dirname),
    },
    mode: mode,
    devtool: isProduction ? 'source-map' : 'inline-source-map',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
  };
};
