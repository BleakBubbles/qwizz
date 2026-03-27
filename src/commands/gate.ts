import crypto from 'node:crypto';
import open from 'open';

import { hasStagedChanges, getStagedDiff } from '../git/diff.js';
import { hasApproval, writeApproval } from '../git/approvals.js';
import { startQuizServer } from '../server/index.js';

type QuizOption = {
	key: string;
	text: string;
};

type QuizQuestion = {
	id: string;
	prompt: string;
	options: QuizOption[];
	answer: string;
};

type QuizSession = {
	diffHash: string;
	diff: string;
	questions: QuizQuestion[];
};

function sha256(text: string): string {
	return crypto.createHash('sha256').update(text).digest('hex');
}

function createSession(diffHash: string, diff: string): QuizSession {
	return {
		diffHash,
		diff,
		questions: [
			{
				id: 'q1',
				prompt: 'What does this change do at a high level?',
				options: [
					{ key: 'a', text: 'Adds a new feature or capability' },
					{ key: 'b', text: 'Fixes a bug in existing behavior' },
					{ key: 'c', text: 'Refactors code without changing behavior' },
					{ key: 'd', text: 'Updates dependencies or configuration' },
				],
				answer: 'a',
			},
			{
				id: 'q2',
				prompt: 'What is one possible risk introduced by this change?',
				options: [
					{ key: 'a', text: 'It could break existing tests' },
					{ key: 'b', text: 'It introduces a potential performance regression' },
					{ key: 'c', text: 'It changes a public API surface' },
					{ key: 'd', text: 'It has no meaningful risk' },
				],
				answer: 'a',
			},
		],
	};
}

function gradeAnswers(
	questions: QuizQuestion[],
	answers: Record<string, string>,
): {
	passed: boolean;
	explanations: Record<string, string>;
} {
	const explanations: Record<string, string> = {};

	for (const q of questions) {
		if (answers[q.id] !== q.answer) {
			const correct = q.options.find((o) => o.key === q.answer);
			explanations[q.id] = correct
				? `Correct answer: ${correct.text}`
				: 'Incorrect.';
		}
	}

	return {
		passed: Object.keys(explanations).length === 0,
		explanations,
	};
}

export async function gate(): Promise<void> {
	if (!hasStagedChanges()) {
		process.exit(0);
	}

	const diff = getStagedDiff();
	const diffHash = sha256(diff);

	if (hasApproval(diffHash)) {
		process.exit(0);
	}

	const session = createSession(diffHash, diff);

	let settled = false;

  const didPass = await new Promise<boolean>(async (resolve) => {
    const server = await startQuizServer({
      session,
      onSubmit: ({ diffHash, answers }) => {
				const result = gradeAnswers(session.questions, answers);

				if (result.passed) {
					writeApproval(diffHash);
				}

				if (result.passed && !settled) {
					settled = true;
					void server.close().then(() => resolve(true));
				}

				return result;
			},
		});

		open(server.url).catch(() => {
			console.log(`Open this URL in your browser: ${server.url}`);
		});

		setTimeout(
			() => {
				if (settled) return;
				settled = true;
				void server.close().then(() => resolve(false));
			},
			10 * 60 * 1000,
		);
	});

	process.exit(didPass ? 0 : 1);
}
