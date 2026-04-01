import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { getRepoRoot, isGitRepo } from '../git/repo.js'

export type InstallOptions = {
	/** Skip Husky; write only `.git/hooks/pre-commit`. */
	native?: boolean
}

const MARKER_BEGIN = '# qwizz begin'
const MARKER_END = '# qwizz end'

const QWIZZ_BLOCK = `${MARKER_BEGIN}
npx qwizz gate
${MARKER_END}
`

/** Husky 9+ loads this script before hook commands. */
const HUSKY_SH_HEADER = `#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"

`

function huskyPreCommitPath(repoRoot: string): string {
	return path.join(repoRoot, '.husky', 'pre-commit')
}

function nativeHookPath(repoRoot: string): string {
	return path.join(repoRoot, '.git', 'hooks', 'pre-commit')
}

function hasHuskyDir(repoRoot: string): boolean {
	return fs.existsSync(path.join(repoRoot, '.husky'))
}

function huskyCorePresent(repoRoot: string): boolean {
	return fs.existsSync(path.join(repoRoot, '.husky', '_', 'husky.sh'))
}

function readHookFile(filePath: string): string {
	try {
		return fs.readFileSync(filePath, 'utf8')
	} catch {
		return ''
	}
}

function stripQwizzBlock(content: string): string {
	const start = content.indexOf(MARKER_BEGIN)
	const end = content.indexOf(MARKER_END)
	if (start === -1 || end === -1 || end < start) {
		return content
	}
	const afterEnd = content.indexOf('\n', end)
	const removeTo = afterEnd === -1 ? content.length : afterEnd + 1
	return content.slice(0, start) + content.slice(removeTo)
}

function ensureQwizzBlock(content: string): string {
	const trimmed = stripQwizzBlock(content).replace(/\s+$/, '')
	const block = QWIZZ_BLOCK.trimEnd() + '\n'
	if (!trimmed) {
		return block
	}
	return `${trimmed}\n\n${block}`
}

function writeExecutable(filePath: string, content: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, content, { mode: 0o755 })
}

function runHuskyInit(repoRoot: string): boolean {
	const result = spawnSync('npx', ['--yes', 'husky', 'init'], {
		cwd: repoRoot,
		stdio: 'inherit',
		shell: true,
	})
	return result.status === 0
}

export function install(options: InstallOptions = {}): void {
	if (!isGitRepo()) {
		console.error('Not a git repository (run from inside a repo).')
		process.exit(1)
	}

	const repoRoot = getRepoRoot()

	if (!hasHuskyDir(repoRoot) && !options.native) {
		const pkgJson = path.join(repoRoot, 'package.json')
		if (fs.existsSync(pkgJson)) {
			console.log('Setting up Husky so hooks live in the repo (one-time)…')
			if (!runHuskyInit(repoRoot)) {
				console.warn(
					'Husky setup failed — using .git/hooks only. Fix npm/network and run npx qwizz install again.',
				)
			}
		}
	}

	if (hasHuskyDir(repoRoot)) {
		const hookPath = huskyPreCommitPath(repoRoot)
		let existing = readHookFile(hookPath)
		if (!existing.trim()) {
			existing = huskyCorePresent(repoRoot) ? HUSKY_SH_HEADER : '#!/usr/bin/env sh\n\n'
		}
		const next = ensureQwizzBlock(existing)
		writeExecutable(hookPath, next)
		console.log(`Updated ${path.relative(repoRoot, hookPath)}`)
		return
	}

	const hookPath = nativeHookPath(repoRoot)
	const existing = readHookFile(hookPath)
	const shebang = '#!/usr/bin/env sh\n'
	const body = existing.startsWith('#!/') ? existing : shebang + existing
	const next = ensureQwizzBlock(body)
	writeExecutable(hookPath, next)
	console.log(`Updated ${path.relative(repoRoot, hookPath)}`)
}

export function uninstall(): void {
	if (!isGitRepo()) {
		console.error('Not a git repository (run from inside a repo).')
		process.exit(1)
	}

	const repoRoot = getRepoRoot()
	const paths = [
		huskyPreCommitPath(repoRoot),
		nativeHookPath(repoRoot),
	]

	let removed = false
	for (const hookPath of paths) {
		if (!fs.existsSync(hookPath)) continue
		const raw = readHookFile(hookPath)
		if (!raw.includes(MARKER_BEGIN)) continue
		const next = stripQwizzBlock(raw).replace(/\n{3,}/g, '\n\n').trimEnd()
		if (next) {
			writeExecutable(hookPath, next + '\n')
		} else {
			fs.unlinkSync(hookPath)
		}
		console.log(`Removed qwizz from ${path.relative(repoRoot, hookPath)}`)
		removed = true
	}

	if (!removed) {
		console.log('No qwizz hook block found.')
	}
}
