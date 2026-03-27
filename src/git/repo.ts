import { spawnSync } from 'node:child_process';
import path from 'node:path';

export function runGit(args: string[]): string {
	const result = spawnSync('git', args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	if (result.status !== 0) {
		const message = result.stderr?.trim() || `git ${args.join(' ')} failed`;
		throw new Error(message);
	}

	return result.stdout.trim();
}

export function isGitRepo(): boolean {
	const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	return result.status === 0 && result.stdout.trim() === 'true';
}

export function getRepoRoot(): string {
	return runGit(['rev-parse', '--show-toplevel']);
}

export function getGitDir(): string {
	const gitDir = runGit(['rev-parse', '--git-dir']);
	const repoRoot = getRepoRoot();

	return path.isAbsolute(gitDir) ? gitDir : path.resolve(repoRoot, gitDir);
}
