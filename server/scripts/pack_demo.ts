import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverDir = path.resolve(__dirname, '..');
const demoDataDir = path.join(serverDir, 'demo_data');
const outZipPath = path.join(serverDir, 'demo_data.yozakura_export.zip');

if (!fs.existsSync(demoDataDir)) {
  console.error(`Demo data directory does not exist at ${demoDataDir}`);
  process.exit(1);
}

console.log(`Packaging demo data from ${demoDataDir} into ${outZipPath}...`);

async function pack(): Promise<void> {
  const output = fs.createWriteStream(outZipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  await new Promise<void>((resolve, reject) => {
    output.on('close', () => {
      console.log(`Successfully packed demo archive: ${archive.pointer()} total bytes.`);
      resolve();
    });

    output.on('error', (err) => {
      reject(err);
    });

    archive.on('error', (err: unknown) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(demoDataDir, false);
    archive.finalize().catch((err: unknown) => reject(err));
  });
}

pack().catch((err) => {
  console.error('Error packing demo data:', err);
  process.exit(1);
});
