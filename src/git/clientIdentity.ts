import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getGitDir } from './repo.js';

export function getOrCreateClientId(): string {
	const identityPath = path.join(getGitDir(), 'qwizz', 'client.json');

	try {
		const { clientId } = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
		if (typeof clientId === 'string' && clientId) return clientId;
	} catch {
		// Missing or malformed: create a new identity below.
	}

	const clientId = crypto.randomUUID();
	fs.mkdirSync(path.dirname(identityPath), { recursive: true });
	fs.writeFileSync(identityPath, JSON.stringify({ version: 1, clientId, createdAt: new Date().toISOString() }, null, 2));
	return clientId;
}
