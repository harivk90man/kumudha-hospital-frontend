import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, '..', 'dist');
const dest = resolve(__dirname, '..', '..', 'backend', 'src', 'main', 'resources', 'static');

if (!existsSync(src)) {
  console.error(`Source dir not found: ${src}. Run 'vite build' first.`);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true, force: true });
console.log(`Copied ${src} -> ${dest}`);
