import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { QuizResponseSchema, type ParsedDiffInput, type QuizQuestion } from 'qwizz-shared';

const API_BASE_URL = 'https://qwizz-api.macks0554.workers.dev';
const WEB_ROOT = fileURLToPath(new URL('../../dist-web', import.meta.url));

type StartQuizServerOptions = {
	parsedDiff: ParsedDiffInput;
	clientId: string;
	onPass: () => void;
};

async function fetchQuiz(parsedDiff: ParsedDiffInput, clientId: string): Promise<QuizQuestion[]> {
	const response = await fetch(`${API_BASE_URL}/quiz/from-diff`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-qwizz-client-id': clientId },
		body: JSON.stringify(parsedDiff),
	});

	if (!response.ok) {
		throw new Error(`Quiz API request failed (${response.status}): ${await response.text()}`);
	}

	return QuizResponseSchema.parse(await response.json()).questions;
}

function gradeAnswers(questions: QuizQuestion[], answers: Record<string, string>) {
	const errors: Record<string, string> = {};
	for (const q of questions) {
		if (answers[q.id] !== q.correctOptionId) {
			const correct = q.options.find((option) => option.id === q.correctOptionId);
			errors[q.id] = `Correct answer: ${correct?.text ?? q.correctOptionId}`;
		}
	}
	return { passed: Object.keys(errors).length === 0, errors };
}

export async function startQuizServer({ parsedDiff, clientId, onPass }: StartQuizServerOptions) {
	// Start generating right away so the quiz is (nearly) ready when the browser opens.
	const quiz = fetchQuiz(parsedDiff, clientId);
	quiz.catch(() => {}); // Surfaced to the browser via /quiz; avoid an unhandled rejection.

	const app = new Hono();

	app.get('/quiz', async (c) => {
		try {
			// Strip the answers before sending questions to the browser.
			const questions = (await quiz).map(({ correctOptionId: _, ...question }) => question);
			return c.json({ questions });
		} catch (error) {
			return c.json({ error: error instanceof Error ? error.message : 'Quiz generation failed.' }, 502);
		}
	});

	app.post('/submit', async (c) => {
		const { answers } = await c.req.json<{ answers: Record<string, string> }>();
		const result = gradeAnswers(await quiz, answers);
		if (result.passed) {
			onPass();
		}
		return c.json(result);
	});

	app.use('/*', serveStatic({ root: WEB_ROOT }));

	let server!: ReturnType<typeof serve>;
	const port = await new Promise<number>((resolve) => {
		server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, (info) => resolve(info.port));
	});
	// Drop the browser's idle keep-alive socket quickly so close() doesn't hang.
	if ('keepAliveTimeout' in server) {
		server.keepAliveTimeout = 500;
	}

	return {
		url: `http://127.0.0.1:${port}`,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}
