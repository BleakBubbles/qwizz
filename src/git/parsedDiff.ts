import { ParsedDiffInputSchema, type DiffFile, type DiffHunk, type DiffLine, type ParsedDiffInput } from 'qwizz-shared';

const MAX_FILES = 100;
const MAX_HUNKS_PER_FILE = 200;
const MAX_LINES_PER_HUNK = 500;
const MAX_HUNK_HEADER_LENGTH = 500;
const MAX_LINE_CONTENT_LENGTH = 2000;
const MAX_SUMMARY_LENGTH = 7800;
const CONTEXT_LINES_BEFORE_CHANGE = 1;
const CONTEXT_LINES_AFTER_CHANGE = 1;
const DIFF_HEADER = 'diff --git ';

function makeLine(type: DiffLine['type'], content: string): DiffLine {
	// The schema rejects empty strings, so keep blank lines as a single space.
	return { type, content: (content || ' ').slice(0, MAX_LINE_CONTENT_LENGTH) };
}

/** Splits on spaces, honoring the double quotes git uses around unusual paths. */
function tokenizeDiffHeader(input: string): string[] {
	const tokens: string[] = [];
	let current = '';
	let inQuotes = false;
	let escaping = false;

	for (const char of input) {
		if (escaping) {
			current += char;
			escaping = false;
		} else if (char === '\\') {
			escaping = true;
		} else if (char === '"') {
			inQuotes = !inQuotes;
		} else if (char === ' ' && !inQuotes) {
			if (current) tokens.push(current);
			current = '';
		} else {
			current += char;
		}
	}
	if (current) tokens.push(current);

	return tokens;
}

function parseDiffGitHeader(line: string): { oldPath: string; newPath: string } | null {
	const [left, right] = tokenizeDiffHeader(line.slice(DIFF_HEADER.length));
	const oldPath = left?.replace(/^a\//, '');
	const newPath = right?.replace(/^b\//, '');
	return oldPath && newPath ? { oldPath, newPath } : null;
}

function parseDiffStatus(fileLines: string[]): DiffFile['status'] {
	for (const line of fileLines) {
		if (line.startsWith('@@')) break;
		if (line.startsWith('new file mode ')) return 'added';
		if (line.startsWith('deleted file mode ')) return 'deleted';
		if (/^(rename|copy) (from|to) /.test(line)) return 'renamed';
	}
	return 'modified';
}

/** Parses hunks, keeping only changed lines plus a little surrounding context. */
function parseHunks(fileLines: string[]): DiffHunk[] {
	const hunks: DiffHunk[] = [];
	let current: DiffHunk | null = null;
	let contextBefore: DiffLine[] = [];
	let contextAfterRemaining = 0;

	const push = (line: DiffLine) => {
		if (current && current.lines.length < MAX_LINES_PER_HUNK) current.lines.push(line);
	};

	for (const line of fileLines) {
		if (line.startsWith('@@')) {
			if (hunks.length >= MAX_HUNKS_PER_FILE) break;
			current = { header: line.slice(0, MAX_HUNK_HEADER_LENGTH), lines: [] };
			hunks.push(current);
			contextBefore = [];
			contextAfterRemaining = 0;
			continue;
		}
		// Skip file headers (before the first hunk) and "\ No newline at end of file".
		if (!current || line.startsWith('\\')) continue;

		const prefix = line.charAt(0);
		if (prefix === '+' || prefix === '-') {
			contextBefore.forEach(push);
			contextBefore = [];
			push(makeLine(prefix === '+' ? 'add' : 'del', line.slice(1)));
			contextAfterRemaining = CONTEXT_LINES_AFTER_CHANGE;
		} else if (prefix === ' ' || line === '') {
			const contextLine = makeLine('context', line.slice(1));
			if (contextAfterRemaining > 0) {
				push(contextLine);
				contextAfterRemaining -= 1;
			} else {
				contextBefore = [...contextBefore, contextLine].slice(-CONTEXT_LINES_BEFORE_CHANGE);
			}
		}
	}

	return hunks.filter((hunk) => hunk.lines.length > 0);
}

/** Splits a unified diff into per-file sections, each starting with its `diff --git` line. */
function splitFileSections(lines: string[]): string[][] {
	const sections: string[][] = [];
	for (const line of lines) {
		if (line.startsWith(DIFF_HEADER)) {
			sections.push([line]);
		} else {
			sections.at(-1)?.push(line);
		}
	}
	return sections;
}

export function parseUnifiedDiffToParsedInput(diff: string): ParsedDiffInput {
	const sections = splitFileSections(diff.replace(/\r\n/g, '\n').split('\n'));
	const files: DiffFile[] = [];

	for (const [header = '', ...fileLines] of sections.slice(0, MAX_FILES)) {
		const paths = parseDiffGitHeader(header);
		if (!paths) continue;

		const hunks = parseHunks(fileLines);
		const changed = hunks.flatMap((hunk) => hunk.lines);
		files.push({
			...paths,
			status: parseDiffStatus(fileLines),
			addedLines: changed.filter((l) => l.type === 'add').length,
			removedLines: changed.filter((l) => l.type === 'del').length,
			hunks,
		});
	}

	if (files.length === 0) {
		files.push({
			oldPath: 'staged-diff.txt',
			newPath: 'staged-diff.txt',
			status: 'modified',
			addedLines: 0,
			removedLines: 0,
			hunks: [{ header: '@@ -0,0 +0,0 @@', lines: [makeLine('context', diff.slice(0, 1800))] }],
		});
	}

	const truncatedNote = sections.length > MAX_FILES ? `\n[truncated files to first ${MAX_FILES} entries]` : '';
	return ParsedDiffInputSchema.parse({
		diffId: 'staged-diff',
		summary: diff.slice(0, MAX_SUMMARY_LENGTH) + truncatedNote || 'No diff summary.',
		files,
	});
}
