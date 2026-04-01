import crypto from 'node:crypto';
import open from 'open';

import { hasStagedChanges, getStagedDiff } from '../git/diff.js';
import { hasApproval, writeApproval } from '../git/approvals.js';
import { startQuizServer } from '../server/index.js';
import { generateQuizFromDiff } from '../quiz/generate.js';

type PublicSession = {
	diffHash: string;
	questions: ReturnType<typeof generateQuizFromDiff>['questionsPublic'];
};

function sha256(text: string): string {
	return crypto.createHash('sha256').update(text).digest('hex');
}

function gradeAnswers(
	questions: ReturnType<typeof generateQuizFromDiff>['questionsPrivate'],
	answers: Record<string, string>,
): {
	passed: boolean;
	explanations: Record<string, string>;
} {
	const explanations: Record<string, string> = {};

	for (const q of questions) {
		if (answers[q.id] !== q.answer) {
			const correct = q.options.find((o) => o.key === q.answer);
			explanations[q.id] = correct ? `Correct answer: ${correct.text}` : 'Incorrect.';
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

	const generated = generateQuizFromDiff(diff);
	const sessionPublic: PublicSession = {
		diffHash,
		questions: generated.questionsPublic,
	};

	let settled = false;

	const didPass = await new Promise<boolean>(async (resolve) => {
		const server = await startQuizServer({
			session: sessionPublic,
			onSubmit: ({ diffHash, answers }) => {
				const result = gradeAnswers(generated.questionsPrivate, answers);

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
