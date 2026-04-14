import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { PublicQuizQuestion } from '../quiz/generate.js';
import { QuizResponseSchema, type ParsedDiffInput, type QuizOptionId } from 'qwizz-shared';

export type SubmitPayload = {
	diffHash: string;
	answers: Record<string, string>;
};

export type SubmitResult = {
	passed: boolean;
	errors: Record<string, string>;
};

export type SessionPayload = {
	diffHash: string;
};

type StartQuizServerOptions = {
	session: SessionPayload;
	apiBaseUrl: string;
	parsedDiff: ParsedDiffInput;
	clientId: string;
	onPass: (diffHash: string) => void;
};

type PrivateQuizQuestion = PublicQuizQuestion & {
	correctOptionId: QuizOptionId;
};

type GeneratedQuizState = {
	publicQuestions: PublicQuizQuestion[];
	privateQuestions: PrivateQuizQuestion[];
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
			generatingPromise = fetchAndNormalizeQuiz(
				options.apiBaseUrl,
				options.parsedDiff,
				options.clientId,
			);
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
			generated = await fetchAndNormalizeQuiz(
				options.apiBaseUrl,
				options.parsedDiff,
				options.clientId,
			);
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
	const errors: Record<string, string> = {};

	for (const question of questions) {
		const selectedOption = answers[question.id];
		const correctOption = question.options.find((option) => option.id === question.correctOptionId);
		if (!correctOption || selectedOption !== question.correctOptionId) {
			errors[question.id] = correctOption ? `Correct answer: ${correctOption.text}` : 'Incorrect.';
		}
	}

	return {
		passed: Object.keys(errors).length === 0,
		errors,
	};
}

async function fetchAndNormalizeQuiz(apiBaseUrl: string, parsedDiff: ParsedDiffInput, clientId: string) {
	const baseUrl = apiBaseUrl.replace(/\/+$/, '');
	const response = await fetch(`${baseUrl}/quiz/from-diff`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-qwizz-client-id': clientId,
		},
		body: JSON.stringify(parsedDiff),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Quiz API request failed (${response.status}): ${body}`);
	}

	const rawPayload = await response.json();
	const parsed = QuizResponseSchema.parse(rawPayload);

	const privateQuestions: PrivateQuizQuestion[] = parsed.questions.map((question) => {
		const options = question.options.map((option) => ({
			id: option.id,
			text: option.text,
		}));

		return {
			id: question.id,
			question: question.question,
			options,
			correctOptionId: question.correctOptionId,
		};
	});

	const publicQuestions: PublicQuizQuestion[] = privateQuestions.map(
		({ correctOptionId: _correctOptionId, ...publicQuestion }) => publicQuestion,
	);

	return { publicQuestions, privateQuestions };
}
