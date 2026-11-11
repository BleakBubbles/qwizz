import fs from 'node:fs';
import path from 'node:path';
import { getGitDir } from './repo.js';

function getApprovalPath(diffHash: string): string {
	return path.join(getGitDir(), 'qwizz', 'approvals', `${diffHash}.json`);
}

export function hasApproval(diffHash: string): boolean {
	return fs.existsSync(getApprovalPath(diffHash));
}

export function writeApproval(diffHash: string): void {
	const approvalPath = getApprovalPath(diffHash);
	fs.mkdirSync(path.dirname(approvalPath), { recursive: true });
	fs.writeFileSync(approvalPath, JSON.stringify({ version: 1, diffHash, passedAt: new Date().toISOString() }, null, 2));
}
