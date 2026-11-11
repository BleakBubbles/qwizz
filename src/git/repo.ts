import { spawnSync } from 'node:child_process';

export function runGit(args: string[]): string {
	const result = spawnSync('git', args, { encoding: 'utf8' });
	if (result.status !== 0) {
		throw new Error(result.stderr?.trim() || `git ${args.join(' ')} failed`);
	}
	return result.stdout.trim();
}

export function isGitRepo(): boolean {
	return spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).stdout?.trim() === 'true';
}

export function getRepoRoot(): string {
	return runGit(['rev-parse', '--show-toplevel']);
}

export function getGitDir(): string {
	return runGit(['rev-parse', '--absolute-git-dir']);
}
