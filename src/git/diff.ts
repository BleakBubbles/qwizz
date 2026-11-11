import { spawnSync } from 'node:child_process';
import { runGit } from './repo.js';

export function hasStagedChanges(): boolean {
	return spawnSync('git', ['diff', '--cached', '--quiet'], { stdio: 'ignore' }).status === 1;
}

export function getStagedDiff(): string {
	return runGit(['diff', '--cached']);
}
