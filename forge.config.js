const path = require('node:path');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');

module.exports = {
  outDir: 'electron_out',
  packagerConfig: {
    asar: true,
    ignore: [
      /^\/docs($|\/)/,
      /^\/client($|\/)/,
      /^\/scripts($|\/)/,
      /^\/\.git($|\/)/,
      /^\/data/,
      /^\/\.github($|\/)/,
      /^\/\.vscode($|\/)/,
      /^\/generated($|\/)/,
      /^\/venv($|\/)/,
      /^\/node_modules($|\/)/,
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'darwin', 'linux'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
  hooks: {
    postPackage: async (_forgeConfig, packageResult) => {
      const clientDist = path.resolve(__dirname, 'client', 'dist');
      if (!existsSync(clientDist)) {
        throw new Error(`Frontend build missing at ${clientDist}; run "npm run build:web" first.`);
      }
      for (const outputPath of packageResult.outputPaths) {
        await fs.cp(clientDist, path.join(outputPath, 'yozakura_client'), { recursive: true });
      }
    },
  },
};
