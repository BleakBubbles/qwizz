import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getGitDir, getRepoRoot, isGitRepo } from '../git/repo.js';
import { MARKER_BEGIN, huskyCorePath, huskyHookPath, nativeHookPath, readText } from '../hooks.js';

type Check = {
	label: string;
	ok: boolean;
	details: string;
};

function report(checks: Check[]): never {
	for (const { label, ok, details } of checks) {
		console.log(`${ok ? 'OK  ' : 'WARN'} ${label} — ${details}`);
	}
	process.exit(checks.every((c) => c.ok) ? 0 : 1);
}

function hookCheck(label: string, hookPath: string): Check {
	const ok = readText(hookPath).includes(MARKER_BEGIN);
	return { label, ok, details: ok ? 'qwizz installed' : 'qwizz block missing' };
}

function detectHooks(repoRoot: string, gitDir: string): Check[] {
	const huskyHook = huskyHookPath(repoRoot);
	const nativeHook = nativeHookPath(gitDir);
	const checks: Check[] = [];

	if (fs.existsSync(huskyHook)) {
		checks.push(hookCheck('.husky/pre-commit', huskyHook));
		const coreOk = fs.existsSync(huskyCorePath(repoRoot));
		checks.push({
			label: '.husky/_/husky.sh',
			ok: coreOk,
			details: coreOk ? 'present' : 'missing (husky init may not have run)',
		});
	}

	if (fs.existsSync(nativeHook)) {
		checks.push(hookCheck('.git/hooks/pre-commit', nativeHook));
	}

	if (checks.length === 0) {
		checks.push({ label: 'pre-commit hook', ok: false, details: 'not found (run `npx qwizz install`)' });
	}

	return checks;
}

function detectWebBuild(): Check {
	const indexHtml = fileURLToPath(new URL('../../dist-web/index.html', import.meta.url));
	const ok = fs.existsSync(indexHtml);
	return {
		label: 'quiz UI build (dist-web)',
		ok,
		details: ok ? 'present' : 'missing (run `npm run build:web` before publishing)',
	};
}

export function doctor(): never {
	const checks: Check[] = [{ label: 'node', ok: true, details: process.versions.node }];

	if (!isGitRepo()) {
		report([...checks, { label: 'git repository', ok: false, details: 'run from inside a git repo' }]);
	}

	const repoRoot = getRepoRoot();
	const gitDir = getGitDir();

	report([
		...checks,
		{ label: 'git repository', ok: true, details: repoRoot },
		{ label: 'git dir', ok: true, details: gitDir },
		...detectHooks(repoRoot, gitDir),
		detectWebBuild(),
	]);
}
