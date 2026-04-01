import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getGitDir, getRepoRoot, isGitRepo } from '../git/repo.js'

const MARKER_BEGIN = '# qwizz begin'

type Check = {
	label: string
	ok: boolean
	details?: string
}

function format(check: Check): string {
	const tag = check.ok ? 'OK  ' : 'WARN'
	return `${tag} ${check.label}${check.details ? ` — ${check.details}` : ''}`
}

function readText(filePath: string): string {
	try {
		return fs.readFileSync(filePath, 'utf8')
	} catch {
		return ''
	}
}

function detectHook(repoRoot: string, gitDir: string): Check[] {
	const checks: Check[] = []

	const huskyHook = path.join(repoRoot, '.husky', 'pre-commit')
	const nativeHook = path.join(gitDir, 'hooks', 'pre-commit')

	const huskyExists = fs.existsSync(huskyHook)
	const nativeExists = fs.existsSync(nativeHook)

	if (!huskyExists && !nativeExists) {
		checks.push({
			label: 'pre-commit hook',
			ok: false,
			details: 'not found (run `npx qwizz install`)',
		})
		return checks
	}

	if (huskyExists) {
		const raw = readText(huskyHook)
		checks.push({
			label: '.husky/pre-commit',
			ok: raw.includes(MARKER_BEGIN),
			details: raw.includes(MARKER_BEGIN) ? 'qwizz installed' : 'qwizz block missing',
		})

		const huskyCore = path.join(repoRoot, '.husky', '_', 'husky.sh')
		checks.push({
			label: '.husky/_/husky.sh',
			ok: fs.existsSync(huskyCore),
			details: fs.existsSync(huskyCore) ? 'present' : 'missing (husky init may not have run)',
		})
	}

	if (nativeExists) {
		const raw = readText(nativeHook)
		checks.push({
			label: '.git/hooks/pre-commit',
			ok: raw.includes(MARKER_BEGIN),
			details: raw.includes(MARKER_BEGIN) ? 'qwizz installed' : 'qwizz block missing',
		})
	}

	return checks
}

function detectWebBuild(): Check {
	const __dirname = path.dirname(fileURLToPath(import.meta.url))
	const webRoot = path.resolve(__dirname, '../../dist-web')
	const indexHtml = path.join(webRoot, 'index.html')

	return {
		label: 'quiz UI build (dist-web)',
		ok: fs.existsSync(indexHtml),
		details: fs.existsSync(indexHtml)
			? 'present'
			: 'missing (run `npm run build:web` before publishing)',
	}
}

export function doctor(): void {
	const checks: Check[] = []

	checks.push({
		label: 'node',
		ok: typeof process.versions.node === 'string' && process.versions.node.length > 0,
		details: process.versions.node,
	})

	if (!isGitRepo()) {
		checks.push({
			label: 'git repository',
			ok: false,
			details: 'run from inside a git repo',
		})
		for (const c of checks) console.log(format(c))
		process.exit(1)
	}

	const repoRoot = getRepoRoot()
	const gitDir = getGitDir()

	checks.push({ label: 'git repository', ok: true, details: repoRoot })
	checks.push({ label: 'git dir', ok: true, details: gitDir })

	checks.push(...detectHook(repoRoot, gitDir))
	checks.push(detectWebBuild())

	for (const c of checks) console.log(format(c))

	const anyBad = checks.some((c) => !c.ok && c.label !== 'pre-commit hook')
	const missingHook = checks.some((c) => c.label === 'pre-commit hook' && !c.ok)
	process.exit(anyBad || missingHook ? 1 : 0)
}

