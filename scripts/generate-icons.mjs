import path from 'node:path';
import { promises as fs } from 'node:fs';
import sharp from 'sharp';

const root = process.cwd();
const source = path.join(root, 'src/assets/bloodcraft-logo.svg');
const buildDir = path.join(root, 'build');

await fs.mkdir(buildDir, { recursive: true });
await sharp(source).resize(1024, 1024).png().toFile(path.join(buildDir, 'icon.png'));
