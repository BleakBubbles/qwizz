import { ParsedDiffInputSchema, type DiffFile, type DiffHunk, type ParsedDiffInput } from 'qwizz-shared';

const MAX_FILES = 100;
const MAX_HUNKS_PER_FILE = 200;
const MAX_LINES_PER_HUNK = 500;
const MAX_HUNK_HEADER_LENGTH = 500;
const MAX_LINE_CONTENT_LENGTH = 2000;

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength);
}

function normalizeLineContent(content: string): string {
	// Preserve blank-line semantics while staying compatible with validators
	// that reject empty strings.
	const normalized = content.length === 0 ? ' ' : content;
	return truncate(normalized, MAX_LINE_CONTENT_LENGTH);
}

function tokenizeDiffHeader(input: string): string[] {
	const tokens: string[] = [];
	let current = '';
	let inQuotes = false;
	let escaping = false;

	for (const char of input) {
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}

		if (char === '\\') {
			escaping = true;
			continue;
		}

		if (char === '"') {
			inQuotes = !inQuotes;
			continue;
		}

		if (char === ' ' && !inQuotes) {
			if (current.length > 0) {
				tokens.push(current);
				current = '';
			}
			continue;
		}

		current += char;
	}

	if (current.length > 0) {
		tokens.push(current);
	}

	return tokens;
}

function parseDiffGitHeader(line: string): { oldPath: string; newPath: string } | null {
	if (!line.startsWith('diff --git ')) return null;

	const rest = line.slice('diff --git '.length);
	const tokens = tokenizeDiffHeader(rest);
	if (tokens.length < 2) return null;

	const left = tokens[0] ?? '';
	const right = tokens[1] ?? '';

	const oldPath = left.startsWith('a/') ? left.slice(2) : left;
	const newPath = right.startsWith('b/') ? right.slice(2) : right;

	if (!oldPath || !newPath) return null;
	return { oldPath, newPath };
}

function parseDiffStatus(lines: string[], startIndex: number): DiffFile['status'] {
	for (let i = startIndex; i < Math.min(lines.length, startIndex + 12); i += 1) {
		const line = (lines[i] ?? '').replace(/\r$/, '');
		if (line.startsWith('new file mode ')) return 'added';
		if (line.startsWith('deleted file mode ')) return 'deleted';
		if (line.startsWith('rename from ') || line.startsWith('rename to ')) return 'renamed';
		if (line.startsWith('copy from ') || line.startsWith('copy to ')) return 'renamed';
		if (line.startsWith('diff --git ')) break;
	}
	return 'modified';
}

function parseHunks(fileLines: string[]): DiffHunk[] {
	const hunks: DiffHunk[] = [];
	let current: DiffHunk | null = null;

	for (const line of fileLines) {
		const normalizedLine = line.replace(/\r$/, '');

		if (normalizedLine.startsWith('@@')) {
			if (hunks.length >= MAX_HUNKS_PER_FILE) break;
			current = { header: truncate(normalizedLine, MAX_HUNK_HEADER_LENGTH), lines: [] };
			hunks.push(current);
			continue;
		}

		if (!current) continue;
		if (normalizedLine.startsWith('+++ ') || normalizedLine.startsWith('--- ')) continue;
		if (normalizedLine.startsWith('\\ No newline at end of file')) continue;
		if (current.lines.length >= MAX_LINES_PER_HUNK) continue;

		const prefix = normalizedLine.charAt(0);
		if (prefix === '+') {
			current.lines.push({ type: 'add', content: normalizeLineContent(normalizedLine.slice(1)) });
		} else if (prefix === '-') {
			current.lines.push({ type: 'del', content: normalizeLineContent(normalizedLine.slice(1)) });
		} else if (prefix === ' ' || normalizedLine === '') {
			const content = prefix === ' ' ? normalizedLine.slice(1) : '';
			current.lines.push({ type: 'context', content: normalizeLineContent(content) });
		}
	}

	return hunks.filter((hunk) => hunk.lines.length > 0);
}

export function parseUnifiedDiffToParsedInput(diff: string): ParsedDiffInput {
	const lines = diff.replace(/\r\n/g, '\n').split('\n');
	const files: DiffFile[] = [];
	let truncatedFiles = false;

	for (let i = 0; i < lines.length; i += 1) {
		const line = (lines[i] ?? '').replace(/\r$/, '');
		const parsedHeader = parseDiffGitHeader(line);
		if (!parsedHeader) continue;
		if (files.length >= MAX_FILES) {
			truncatedFiles = true;
			break;
		}

		const { oldPath, newPath } = parsedHeader;
		const status = parseDiffStatus(lines, i + 1);

		const fileSection: string[] = [];
		let j = i + 1;
		for (; j < lines.length; j += 1) {
			if ((lines[j] ?? '').startsWith('diff --git ')) break;
			fileSection.push(lines[j] ?? '');
		}

		const hunks = parseHunks(fileSection);
		let addedLines = 0;
		let removedLines = 0;
		for (const hunk of hunks) {
			for (const hunkLine of hunk.lines) {
				if (hunkLine.type === 'add') addedLines += 1;
				if (hunkLine.type === 'del') removedLines += 1;
			}
		}

		files.push({
			oldPath,
			newPath,
			status,
			addedLines,
			removedLines,
			hunks,
		});

		i = j - 1;
	}

	if (files.length === 0) {
		files.push({
			oldPath: 'staged-diff.txt',
			newPath: 'staged-diff.txt',
			status: 'modified',
			addedLines: 0,
			removedLines: 0,
			hunks: [
				{
					header: '@@ -0,0 +0,0 @@',
					lines: [{ type: 'context', content: diff.slice(0, 1800) || 'No diff lines found.' }],
				},
			],
		});
	}

	const summarySuffix = truncatedFiles ? '\n[truncated files to first 100 entries]' : '';
	const payload: ParsedDiffInput = {
		diffId: 'staged-diff',
		summary: (diff.slice(0, 7800) + summarySuffix) || 'No diff summary.',
		files,
	};

	return ParsedDiffInputSchema.parse(payload);
}
