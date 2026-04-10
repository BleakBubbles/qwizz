import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { PublicQuizQuestion } from '../quiz/generate.js';
import { QuizResponseSchema, type ParsedDiffInput } from 'qwizz-shared';

export type SubmitPayload = {
	diffHash: string;
	answers: Record<string, string>;
};

export type SubmitResult = {
	passed: boolean;
	explanations: Record<string, string>;
};

export type SessionPayload = {
	diffHash: string;
};

type StartQuizServerOptions = {
	session: SessionPayload;
	apiBaseUrl: string;
	parsedDiff: ParsedDiffInput;
	onPass: (diffHash: string) => void;
};

type PrivateQuizQuestion = PublicQuizQuestion & {
	answerIndex: 0 | 1 | 2 | 3;
};

type GeneratedQuizState = {
	publicQuestions: PublicQuizQuestion[];
	privateQuestions: PrivateQuizQuestion[];
};

type ApiQuizQuestion = {
	id: string;
	question: string;
	options: Array<{ id: 'A' | 'B' | 'C' | 'D'; text: string }>;
	correctOptionIndex: 0 | 1 | 2 | 3;
	explanation: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startQuizServer(options: StartQuizServerOptions): Promise<{
	url: string;
	close: () => Promise<void>;
}> {
	const app = new Hono();
	let generated: GeneratedQuizState | null = null;
	let generatingPromise: Promise<GeneratedQuizState> | null = null;

	const webRoot = path.resolve(__dirname, '../../dist-web');

	app.get('/session.json', (c) => {
		return c.json(options.session);
	});

	app.get('/quiz', async (c) => {
		if (!generatingPromise) {
			generatingPromise = fetchAndNormalizeQuiz(options.apiBaseUrl, options.parsedDiff);
		}
		const nextGenerated = await generatingPromise;
		generated = nextGenerated;
		return c.json({ questions: nextGenerated.publicQuestions });
	});

	app.post('/submit', async (c) => {
		const body = await c.req.json<SubmitPayload>();

		if (!generated && generatingPromise) {
			generated = await generatingPromise;
		}

		if (!generated) {
			generated = await fetchAndNormalizeQuiz(options.apiBaseUrl, options.parsedDiff);
		}

		const result = gradeAnswers(generated.privateQuestions, body.answers);
		if (result.passed) {
			options.onPass(body.diffHash);
		}
		return c.json(result);
	});

	app.use('/*', serveStatic({ root: webRoot }));

	const server = serve({
		fetch: app.fetch,
		hostname: '127.0.0.1',
		port: 0,
	});

	await new Promise<void>((resolve) => {
		server.on('listening', resolve);
	});

	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('Failed to determine local server address.');
	}

	return {
		url: `http://127.0.0.1:${address.port}`,
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((err) => {
					if (err) reject(err);
					else resolve();
				});
			}),
	};
}

function gradeAnswers(questions: PrivateQuizQuestion[], answers: Record<string, string>): SubmitResult {
	const explanations: Record<string, string> = {};

	for (const question of questions) {
		const selectedOption = answers[question.id];
		const correctOption = question.options[question.answerIndex];
		if (!correctOption || selectedOption !== correctOption.id) {
			explanations[question.id] = correctOption
				? `Correct answer: ${correctOption.text}`
				: 'Incorrect.';
		}
	}

	return {
		passed: Object.keys(explanations).length === 0,
		explanations,
	};
}

async function fetchAndNormalizeQuiz(apiBaseUrl: string, parsedDiff: ParsedDiffInput) {
	const baseUrl = apiBaseUrl.replace(/\/+$/, '');
	const response = await fetch(`${baseUrl}/quiz/from-diff`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(parsedDiff),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Quiz API request failed (${response.status}): ${body}`);
	}

	const rawPayload = await response.json();
	const parsed = QuizResponseSchema.parse(rawPayload) as { questions: ApiQuizQuestion[] };

	const privateQuestions: PrivateQuizQuestion[] = parsed.questions.map((question) => {
		const options = question.options.map((option) => ({
			id: option.id,
			text: option.text,
		}));

		return {
			id: question.id,
			question: question.question,
			options,
			answerIndex: question.correctOptionIndex as 0 | 1 | 2 | 3,
		};
	});

	const publicQuestions: PublicQuizQuestion[] = privateQuestions.map(
		({ answerIndex: _answerIndex, ...publicQuestion }) => publicQuestion,
	);

	return { publicQuestions, privateQuestions };
}
