import fs from 'node:fs';
import path from 'node:path';

export const MARKER_BEGIN = '# qwizz begin';
export const MARKER_END = '# qwizz end';

export function huskyHookPath(repoRoot: string): string {
	return path.join(repoRoot, '.husky', 'pre-commit');
}

export function huskyCorePath(repoRoot: string): string {
	return path.join(repoRoot, '.husky', '_', 'husky.sh');
}

export function nativeHookPath(gitDir: string): string {
	return path.join(gitDir, 'hooks', 'pre-commit');
}

/** Returns the file's contents, or '' if it can't be read. */
export function readText(filePath: string): string {
	try {
		return fs.readFileSync(filePath, 'utf8');
	} catch {
		return '';
	}
}
