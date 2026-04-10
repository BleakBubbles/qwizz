const OPTION_IDS = ['A', 'B', 'C', 'D'] as const
type OptionId = (typeof OPTION_IDS)[number]

export type QuizOption = {
	id: OptionId
	text: string
}

export type PublicQuizQuestion = {
	id: string
	question: string
	options: QuizOption[]
}

export type PrivateQuizQuestion = PublicQuizQuestion & {
	explanation: string
	answerIndex: 0 | 1 | 2 | 3
}

export type GeneratedQuiz = {
	questionsPublic: PublicQuizQuestion[]
	questionsPrivate: PrivateQuizQuestion[]
}

function uniq<T>(arr: T[]): T[] {
	return Array.from(new Set(arr))
}

function pickTouchedFiles(diff: string): string[] {
	const files: string[] = []
	const re = /^diff --git a\/(.+?) b\/(.+)$/gm
	for (const m of diff.matchAll(re)) {
		files.push(m[1] ?? m[2])
	}
	return uniq(files).slice(0, 8)
}

function pickRoutes(diff: string): string[] {
	// Very small heuristic: looks for app.get('/x') etc.
	const routes: string[] = []
	const re = /\bapp\.(get|post|put|delete)\(\s*['"`]([^'"`]+)['"`]/g
	for (const m of diff.matchAll(re)) {
		if (m[2]) routes.push(`${m[1]?.toUpperCase()} ${m[2]}`)
	}
	return uniq(routes).slice(0, 6)
}

function hasAny(diff: string, needles: string[]): boolean {
	return needles.some((n) => diff.includes(n))
}

function ensureFour(options: { text: string }[]): QuizOption[] {
	const base = options
		.slice(0, 4)
		.map((o, i) => ({ id: OPTION_IDS[i], text: o.text }))
	// If caller provided fewer than 4 (shouldn't), pad with blanks that won't win.
	while (base.length < 4) base.push({ id: OPTION_IDS[base.length], text: '—' })
	return base
}

export function generateQuizFromDiff(diff: string): GeneratedQuiz {
	const files = pickTouchedFiles(diff)
	const routes = pickRoutes(diff)

	const q: PrivateQuizQuestion[] = []

	// Easy #1: When does qwizz run? (always true, low-friction)
	q.push({
		id: 'q1',
		question: 'When does qwizz run the quiz (by default)?',
		options: ensureFour(
			[
				{ text: 'During git commit (pre-commit hook)' },
				{ text: 'Only when you run the web app dev server' },
				{ text: 'Only during `npm run build`' },
				{ text: 'Only when you `git push`' },
			],
		),
		answerIndex: 0,
		explanation: 'qwizz runs in the git pre-commit flow by default.',
	})

	// Easy #2: pick a literal fact from diff if possible.
	if (routes.some((r) => r.endsWith('/session.json'))) {
		q.push({
			id: 'q2',
			question: 'Which endpoint returns the quiz session to the browser UI?',
			options: ensureFour(
				[
					{ text: 'GET /session.json' },
					{ text: 'POST /session.json' },
					{ text: 'GET /submit' },
					{ text: 'POST /session' },
				],
			),
			answerIndex: 0,
			explanation: 'The session payload is served through GET /session.json.',
		})
	} else if (hasAny(diff, ['.husky/pre-commit', '.git/hooks/pre-commit', 'pre-commit'])) {
		q.push({
			id: 'q2',
			question: 'Where is qwizz typically installed so git runs it automatically?',
			options: ensureFour(
				[
					{ text: '.husky/pre-commit (if using Husky) or .git/hooks/pre-commit (native)' },
					{ text: '.git/config' },
					{ text: '.gitignore' },
					{ text: 'package-lock.json' },
				],
			),
			answerIndex: 0,
			explanation: 'Hooks run from Husky pre-commit or native git hook paths.',
		})
	} else {
		const fileHint = files[0] ? ` (e.g. ${files[0]})` : ''
		q.push({
			id: 'q2',
			question: `What kind of information does the staged diff contain?${fileHint}`,
			options: ensureFour(
				[
					{ text: 'Code changes that will be included in the next commit' },
					{ text: 'Only unstaged working tree changes' },
					{ text: 'Only commit messages' },
					{ text: 'Only remote branch history' },
				],
			),
			answerIndex: 0,
			explanation: 'The staged diff represents changes queued for commit.',
		})
	}

	// Normal #3: a slightly more conceptual/risk question derived from signals.
	const mentionsServer = hasAny(diff, ['serve(', '127.0.0.1', 'port: 0', 'startQuizServer'])
	const mentionsSpawn = hasAny(diff, ['spawnSync', 'npx', 'husky'])
	const mentionsBrowser = hasAny(diff, ['open(', 'Open this URL'])

	let prompt = 'What is one plausible failure mode of this hook flow?'
	let options: { text: string }[] = [
		{ text: 'The commit could be blocked if the quiz never completes (timeout should mitigate)' },
		{ text: 'It automatically force-pushes to origin' },
		{ text: 'It permanently deletes your staged changes' },
		{ text: 'It rewrites git history during commit' },
	]
	let answerIndex: 0 | 1 | 2 | 3 = 0

	if (mentionsSpawn && !mentionsServer) {
		prompt = 'What is one plausible failure mode when installing/running qwizz via hooks?'
		options = [
			{ text: '`npx` may not be available / PATH issues can break the hook' },
			{ text: 'Git will stop tracking files permanently' },
			{ text: 'The hook will upload your code to a remote server' },
			{ text: 'Git will skip the commit message step entirely' },
		]
		answerIndex = 0
	} else if (mentionsServer && mentionsBrowser) {
		prompt = 'What is one plausible failure mode when starting the quiz UI?'
		options = [
			{ text: 'The browser may not open automatically; you may need to open the URL manually' },
			{ text: 'Git will rebase your branch automatically' },
			{ text: 'It will change your global git config' },
			{ text: 'It will sign commits with a new GPG key' },
		]
		answerIndex = 0
	}

	q.push({
		id: 'q3',
		question: prompt,
		options: ensureFour(options),
		answerIndex,
		explanation: 'This reflects a realistic operational risk from the hook flow.',
	})

	// Enforce exactly 3 questions.
	const trimmed = q.slice(0, 3)

	return {
		questionsPrivate: trimmed,
		questionsPublic: trimmed.map(({ answerIndex: _a, explanation: _e, ...rest }) => rest),
	}
}

