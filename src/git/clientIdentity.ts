import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getGitDir } from './repo.js';

type ClientIdentityRecord = {
	version: number;
	clientId: string;
	createdAt: string;
};

const CLIENT_IDENTITY_VERSION = 1;

function getIdentityDir(): string {
	return path.join(getGitDir(), 'qwizz');
}

function getIdentityPath(): string {
	return path.join(getIdentityDir(), 'client.json');
}

function isValidIdentityRecord(value: unknown): value is ClientIdentityRecord {
	if (!value || typeof value !== 'object') return false;
	const record = value as Partial<ClientIdentityRecord>;
	return (
		record.version === CLIENT_IDENTITY_VERSION &&
		typeof record.clientId === 'string' &&
		record.clientId.length > 0 &&
		typeof record.createdAt === 'string' &&
		record.createdAt.length > 0
	);
}

export function getOrCreateClientId(): string {
	const identityPath = getIdentityPath();

	if (fs.existsSync(identityPath)) {
		try {
			const raw = fs.readFileSync(identityPath, 'utf8');
			const parsed = JSON.parse(raw) as unknown;
			if (isValidIdentityRecord(parsed)) {
				return parsed.clientId;
			}
		} catch {
			// If the file is malformed, regenerate it below.
		}
	}

	const identityDir = getIdentityDir();
	fs.mkdirSync(identityDir, { recursive: true });

	const record: ClientIdentityRecord = {
		version: CLIENT_IDENTITY_VERSION,
		clientId: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
	};

	fs.writeFileSync(identityPath, JSON.stringify(record, null, 2), 'utf8');
	return record.clientId;
}
