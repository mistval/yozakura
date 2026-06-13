const path = require('node:path');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');

module.exports = {
  outDir: 'electron_out',
  packagerConfig: {
    asar: true,
    icon: './electron/electron_icon',
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
    postMake: async (_forgeConfig, makeResults) => {
      for (const result of makeResults) {
        result.artifacts = await Promise.all(
          result.artifacts.map(async (artifact) => {
            let base = path.basename(artifact).replace('win32', 'windows').replace('darwin', 'macos');
            if (base.includes('macos')) {
              base = base.replace('arm64', 'apple-silicon');
            }
            const renamed = path.join(path.dirname(artifact), base);
            if (renamed !== artifact) {
              await fs.rename(artifact, renamed);
            }
            return renamed;
          })
        );
      }
      return makeResults;
    },
  },
};
