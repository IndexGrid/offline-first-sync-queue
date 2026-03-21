import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();
const changesDir = path.join(repoRoot, 'changes');
const unreleasedDir = path.join(changesDir, 'unreleased');

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
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

function parseEntry(text) {
  const lines = text.split(/\r?\n/);
  const fields = new Map();
  for (const line of lines) {
    const m = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!m) continue;
    fields.set(m[1].toLowerCase(), m[2].trim());
  }
  return fields;
}

function includesAnyChanged(changed, prefixes) {
  return changed.some((p) => prefixes.some((prefix) => p.startsWith(prefix)));
}

async function main() {
  await fs.mkdir(unreleasedDir, { recursive: true });

  const baseRef = process.env.GITHUB_BASE_REF;
  const isPR = process.env.GITHUB_EVENT_NAME === 'pull_request';
  const base = baseRef ? `origin/${baseRef}` : 'origin/main';

  if (isPR) {
    try {
      if (baseRef) runGit(['fetch', 'origin', baseRef, '--depth=1']);
    } catch {
    }
  }

  const changedRaw = runGit(['diff', '--name-only', `${base}...HEAD`]);
  const changed = changedRaw.length ? changedRaw.split(/\r?\n/) : [];

  const changeControlRelevant =
    includesAnyChanged(changed, ['apps/', 'packages/', 'infra/', 'tools/']) &&
    !changed.every((p) => p.startsWith('docs/'));

  if (!changeControlRelevant) return;

  const entries = await listUnreleasedEntries();
  if (entries.length !== 1) {
    console.error(
      `Change control requires exactly one changes/unreleased/*.md entry (found ${entries.length}).`,
    );
    process.exit(1);
  }

  const entryPath = path.join(unreleasedDir, entries[0]);
  const content = await fs.readFile(entryPath, 'utf8');
  const fields = parseEntry(content);

  const required = ['type', 'scope', 'breaking', 'migration', 'rollback', 'compatibility'];
  const missing = required.filter((k) => !fields.get(k));
  if (missing.length > 0) {
    console.error(`Missing required fields in ${entries[0]}: ${missing.join(', ')}`);
    process.exit(1);
  }

  const type = fields.get('type');
  if (!['patch', 'minor', 'major'].includes(type)) {
    console.error(`Invalid Type in ${entries[0]}: ${type}`);
    process.exit(1);
  }

  const breaking = fields.get('breaking');
  if (!['yes', 'no'].includes(breaking)) {
    console.error(`Invalid Breaking in ${entries[0]}: ${breaking}`);
    process.exit(1);
  }

  const touchedMigrations = includesAnyChanged(changed, ['apps/api/prisma/migrations/']);
  const needsMigrationDetail = breaking === 'yes' || touchedMigrations;
  if (needsMigrationDetail) {
    for (const k of ['migration', 'rollback', 'compatibility']) {
      const v = fields.get(k);
      if (!v || v.toLowerCase() === 'none') {
        console.error(`Field ${k} must not be 'none' in ${entries[0]}`);
        process.exit(1);
      }
    }
  }
}

await main();
