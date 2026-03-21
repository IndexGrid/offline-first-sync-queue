import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const changesDir = path.join(repoRoot, 'changes');
const unreleasedDir = path.join(changesDir, 'unreleased');
const releasedDir = path.join(changesDir, 'released');

function usage() {
  console.error('Usage: npm run changes:release -- <X.Y.Z>');
  process.exit(1);
}

async function listUnreleasedEntries() {
  const entries = await fs.readdir(unreleasedDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => n !== '.gitkeep')
    .filter((n) => n.endsWith('.md'))
    .sort();
}

async function main() {
  const version = process.argv[2];
  if (!version) usage();

  await fs.mkdir(unreleasedDir, { recursive: true });
  await fs.mkdir(releasedDir, { recursive: true });

  const entries = await listUnreleasedEntries();
  if (entries.length === 0) {
    console.error('No changes/unreleased entries to release.');
    process.exit(1);
  }

  const target = path.join(releasedDir, version);
  await fs.mkdir(target, { recursive: true });

  for (const name of entries) {
    await fs.rename(path.join(unreleasedDir, name), path.join(target, name));
  }
}

await main();
