import fs from 'node:fs';
import path from 'node:path';
import { getGitDir } from './repo.js';

type ApprovalRecord = {
	version: number;
	diffHash: string;
	passedAt: string;
};

export function getApprovalDir(): string {
	return path.join(getGitDir(), 'qwizz', 'approvals');
}

export function getApprovalPath(diffHash: string): string {
	return path.join(getApprovalDir(), `${diffHash}.json`);
}

export function hasApproval(diffHash: string): boolean {
	const approvalPath = getApprovalPath(diffHash);

	if (!fs.existsSync(approvalPath)) {
		return false;
	}

	try {
		const raw = fs.readFileSync(approvalPath, 'utf8');
		const parsed = JSON.parse(raw) as ApprovalRecord;
		return parsed.diffHash === diffHash;
	} catch {
		return false;
	}
}

export function writeApproval(diffHash: string): void {
	const approvalDir = getApprovalDir();
	const approvalPath = getApprovalPath(diffHash);

	fs.mkdirSync(approvalDir, { recursive: true });

	const record: ApprovalRecord = {
		version: 1,
		diffHash,
		passedAt: new Date().toISOString(),
	};

	fs.writeFileSync(approvalPath, JSON.stringify(record, null, 2), 'utf8');
}

export function clearApproval(diffHash: string): void {
	const approvalPath = getApprovalPath(diffHash);

	if (fs.existsSync(approvalPath)) {
		fs.unlinkSync(approvalPath);
	}
}
