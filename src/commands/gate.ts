import crypto from 'node:crypto';
import open from 'open';

import { hasStagedChanges, getStagedDiff } from '../git/diff.js';
import { hasApproval, writeApproval } from '../git/approvals.js';
import { getOrCreateClientId } from '../git/clientIdentity.js';
import { startQuizServer } from '../server/index.js';
import { parseUnifiedDiffToParsedInput } from '../git/parsedDiff.js';
import type { SessionPayload } from '../server/index.js';

function sha256(text: string): string {
	return crypto.createHash('sha256').update(text).digest('hex');
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

	const sessionPublic: SessionPayload = {
		diffHash,
	};
	const parsedDiff = parseUnifiedDiffToParsedInput(diff);
	const clientId = getOrCreateClientId();
	const apiBaseUrl = process.env.QWIZZ_API_BASE_URL ?? 'https://qwizz-api.macks0554.workers.dev';

	let settled = false;

	const didPass = await new Promise<boolean>(async (resolve) => {
		const server = await startQuizServer({
			session: sessionPublic,
			parsedDiff,
			apiBaseUrl,
			clientId,
			onPass: (approvedDiffHash) => {
				writeApproval(approvedDiffHash);
				if (!settled) {
					settled = true;
					void server.close().then(() => resolve(true));
				}
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
