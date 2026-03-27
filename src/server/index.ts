import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

export type SubmitPayload = {
	diffHash: string;
	answers: Record<string, string>;
};

export type SubmitResult = {
	passed: boolean;
	explanations: Record<string, string>;
};

type StartQuizServerOptions = {
	session: unknown;
	onSubmit: (payload: SubmitPayload) => SubmitResult;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startQuizServer(options: StartQuizServerOptions): Promise<{
	url: string;
	close: () => Promise<void>;
}> {
	const app = new Hono();

	const webRoot = path.resolve(__dirname, '../../dist-web');

	app.get('/session.json', (c) => {
		return c.json(options.session);
	});

	app.post('/submit', async (c) => {
		const body = (await c.req.json()) as SubmitPayload;
		const result = options.onSubmit(body);
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
