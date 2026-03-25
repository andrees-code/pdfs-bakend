const { webpack } = require('@nestjs/cli/lib/compiler/webpack');

module.exports = (config, options) => {
  // Excluir dependencias problemáticas
  config.externals = config.externals || [];
  config.externals.push({
    'bcrypt': 'commonjs bcrypt',
    'typeorm': 'commonjs typeorm',
    '@nestjs/typeorm': 'commonjs @nestjs/typeorm'
  });

  // Optimizar el bundle
  config.optimization = {
    ...config.optimization,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
  };

  return config;
};