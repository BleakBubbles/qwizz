import crypto from 'node:crypto';
import open from 'open';

import { hasStagedChanges, getStagedDiff } from '../git/diff.js';
import { hasApproval, writeApproval } from '../git/approvals.js';
import { getOrCreateClientId } from '../git/clientIdentity.js';
import { parseUnifiedDiffToParsedInput } from '../git/parsedDiff.js';
import { startQuizServer } from '../server/index.js';

const TIMEOUT_MS = 10 * 60 * 1000;

export async function gate(): Promise<never> {
	if (!hasStagedChanges()) {
		process.exit(0);
	}

	const diff = getStagedDiff();
	const diffHash = crypto.createHash('sha256').update(diff).digest('hex');
	if (hasApproval(diffHash)) {
		process.exit(0);
	}

	let onPass!: () => void;
	const passed = new Promise<void>((resolve) => (onPass = resolve));

	const server = await startQuizServer({
		parsedDiff: parseUnifiedDiffToParsedInput(diff),
		clientId: getOrCreateClientId(),
		onPass,
	});

	open(server.url).catch(() => {
		console.log(`Open this URL in your browser: ${server.url}`);
	});

	const didPass = await Promise.race([
		passed.then(() => true),
		new Promise<false>((resolve) => setTimeout(resolve, TIMEOUT_MS, false)),
	]);

	if (didPass) {
		writeApproval(diffHash);
	}
	await server.close();
	process.exit(didPass ? 0 : 1);
}
