import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const migrationsDir = path.join(
  repoRoot,
  'apps',
  'api',
  'prisma',
  'migrations',
);

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await pathExists(migrationsDir))) {
    console.error(`Missing migrations dir: ${migrationsDir}`);
    process.exit(1);
  }

  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const errors = [];

  for (const dir of dirs) {
    const folder = path.join(migrationsDir, dir);
    const migrationSql = path.join(folder, 'migration.sql');
    if (!(await pathExists(migrationSql))) {
      errors.push(`${dir}: missing migration.sql`);
      continue;
    }

    const rollbackSql = path.join(folder, 'rollback.sql');
    const nonReversible = path.join(folder, 'non_reversible.md');
    const hasRollback = await pathExists(rollbackSql);
    const hasMarker = await pathExists(nonReversible);
    if (!hasRollback && !hasMarker) {
      errors.push(`${dir}: add rollback.sql or non_reversible.md`);
    }
  }

  if (errors.length > 0) {
    console.error('Migration reversibility check failed:\n' + errors.map((e) => `- ${e}`).join('\n'));
    process.exit(1);
  }
}

await main();
