import type { NextConfig } from 'next';
import path from 'path';

const monorepoRoot = path.resolve(__dirname, '../..');

const nextConfig: NextConfig = {
  transpilePackages: [
    '@stratuscode/core',
    '@stratuscode/shared',
    '@stratuscode/tools',
    '@willebrew/sage-core',
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config, { isServer }) => {
    // Resolve workspace packages from monorepo root node_modules
    config.resolve.modules = [
      ...(config.resolve.modules || []),
      path.resolve(monorepoRoot, 'node_modules'),
    ];

    // Point workspace packages to their source for transpilation
    config.resolve.alias = {
      ...config.resolve.alias,
      '@stratuscode/shared': path.resolve(monorepoRoot, 'packages/shared/src'),
      '@stratuscode/tools': path.resolve(monorepoRoot, 'packages/tools/src'),
      '@stratuscode/core': path.resolve(monorepoRoot, 'packages/core/src'),
    };

    if (isServer) {
      // Alias @stratuscode/storage to our mock implementation
      config.resolve.alias['@stratuscode/storage'] = path.resolve(__dirname, 'lib/storage-mock.ts');
    }

    return config;
  },
};

export default nextConfig;
