import { spawnSync } from 'node:child_process';
import { runGit } from './repo.js';

export function hasStagedChanges(): boolean {
	const result = spawnSync('git', ['diff', '--cached', '--quiet', '--exit-code'], {
		stdio: 'ignore',
	});

	return result.status === 1;
}

export function getStagedDiff(): string {
	return runGit(['diff', '--cached']);
}

export function getStagedFiles(): string[] {
	const output = runGit(['diff', '--cached', '--name-only']);

	if (!output) {
		return [];
	}

	return output
		.split('\n')
		.map((file) => file.trim())
		.filter(Boolean);
}
