import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const unreleasedDir = path.join(repoRoot, 'changes', 'unreleased');
const rootPkgPath = path.join(repoRoot, 'package.json');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

async function listUnreleasedEntries() {
  try {
    const entries = await fs.readdir(unreleasedDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((n) => n !== '.gitkeep')
      .filter((n) => n.endsWith('.md'))
      .sort();
  } catch {
    return [];
  }
}

async function main() {
  const tagRef = process.env.GITHUB_REF ?? '';
  const tag = tagRef.startsWith('refs/tags/') ? tagRef.slice('refs/tags/'.length) : tagRef;
  const version = tag.startsWith('v') ? tag.slice(1) : tag;

  const pkg = JSON.parse(await fs.readFile(rootPkgPath, 'utf8'));
  if (pkg.version !== version) {
    console.error(`Tag version (${version}) must match root package.json version (${pkg.version}).`);
    process.exit(1);
  }

  const changelog = await fs.readFile(changelogPath, 'utf8');
  if (!changelog.includes(`## [${version}]`)) {
    console.error(`CHANGELOG.md must contain a section header: ## [${version}]`);
    process.exit(1);
  }

  const pending = await listUnreleasedEntries();
  if (pending.length > 0) {
    console.error(`changes/unreleased must be empty for releases. Pending:\n- ${pending.join('\n- ')}`);
    process.exit(1);
  }
}

await main();
