import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { getGitDir, getRepoRoot, isGitRepo } from '../git/repo.js';
import { getOrCreateClientId } from '../git/clientIdentity.js';
import { MARKER_BEGIN, MARKER_END, huskyCorePath, huskyHookPath, nativeHookPath, readText } from '../hooks.js';

const SHEBANG = '#!/usr/bin/env sh\n';
const QWIZZ_BLOCK = `${MARKER_BEGIN}\nnpx qwizz gate\n${MARKER_END}\n`;

function requireRepoRoot(): string {
	if (!isGitRepo()) {
		console.error('Not a git repository (run from inside a repo).');
		process.exit(1);
	}
	return getRepoRoot();
}

function stripQwizzBlock(content: string): string {
	const start = content.indexOf(MARKER_BEGIN);
	const end = content.indexOf(MARKER_END);
	if (start === -1 || end < start) {
		return content;
	}
	const afterEnd = content.indexOf('\n', end);
	return content.slice(0, start) + (afterEnd === -1 ? '' : content.slice(afterEnd + 1));
}

function writeHook(filePath: string, content: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, { mode: 0o755 });
}

export function install({ native = false }: { native?: boolean } = {}): void {
	const repoRoot = requireRepoRoot();
	getOrCreateClientId();

	const huskyDir = path.join(repoRoot, '.husky');
	if (!native && !fs.existsSync(huskyDir) && fs.existsSync(path.join(repoRoot, 'package.json'))) {
		console.log('Setting up Husky so hooks live in the repo (one-time)…');
		const result = spawnSync('npx', ['--yes', 'husky', 'init'], { cwd: repoRoot, stdio: 'inherit', shell: true });
		if (result.status !== 0) {
			console.warn('Husky setup failed — using .git/hooks only. Fix npm/network and run npx qwizz install again.');
		}
	}

	const useHusky = fs.existsSync(huskyDir);
	const hookPath = useHusky ? huskyHookPath(repoRoot) : nativeHookPath(getGitDir());

	let existing = stripQwizzBlock(readText(hookPath)).trimEnd();
	if (!existing) {
		// Husky 9+ loads husky.sh before hook commands.
		existing = useHusky && fs.existsSync(huskyCorePath(repoRoot)) ? `${SHEBANG}. "$(dirname "$0")/_/husky.sh"` : SHEBANG;
	} else if (!useHusky && !existing.startsWith('#!')) {
		existing = SHEBANG + existing;
	}

	writeHook(hookPath, `${existing.trimEnd()}\n\n${QWIZZ_BLOCK}`);
	console.log(`Updated ${path.relative(repoRoot, hookPath)}`);
}

export function uninstall(): void {
	const repoRoot = requireRepoRoot();

	let removed = false;
	for (const hookPath of [huskyHookPath(repoRoot), nativeHookPath(getGitDir())]) {
		const raw = readText(hookPath);
		if (!raw.includes(MARKER_BEGIN)) continue;

		const next = stripQwizzBlock(raw).replace(/\n{3,}/g, '\n\n').trimEnd();
		if (next) {
			writeHook(hookPath, next + '\n');
		} else {
			fs.unlinkSync(hookPath);
		}
		console.log(`Removed qwizz from ${path.relative(repoRoot, hookPath)}`);
		removed = true;
	}

	if (!removed) {
		console.log('No qwizz hook block found.');
	}
}
