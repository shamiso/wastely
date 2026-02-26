import { command, getRequestEvent, query } from '$app/server';
import { requireUser } from '$lib/server/services/authz.service';
import {
	getAssignedRun,
	submitRoadConditionIssue,
	submitStopUpdate
} from '$lib/server/services/driver.service';

const roadSeverities = ['low', 'medium', 'high'] as const;

function toOptionalNumber(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const parsed = Number(value);
	return Number.isNaN(parsed) ? undefined : parsed;
}

export const getCurrentRun = query(async () => {
	const event = getRequestEvent();
	const user = requireUser(event);
	return getAssignedRun(user.id);
});

export const submitStop = command(
	'unchecked',
	async (input: {
		runId: number | string;
		stopId: number | string;
		status: 'pending' | 'done' | 'skipped';
		notes?: string;
	}) => {
		const event = getRequestEvent();
		const user = requireUser(event);

		return submitStopUpdate({
			driverUserId: user.id,
			runId: Number(input.runId),
			stopId: Number(input.stopId),
			status: input.status,
			notes: input.notes
		});
	}
);

export const submitRoadIssue = command(
	'unchecked',
	async (input: {
		runId?: number | string;
		zoneId?: number | string;
		severity?: 'low' | 'medium' | 'high';
		description: string;
		latitude?: number | string;
		longitude?: number | string;
	}) => {
		const event = getRequestEvent();
		const user = requireUser(event);
		const severity = roadSeverities.includes(input.severity ?? 'medium')
			? (input.severity as 'low' | 'medium' | 'high')
			: 'medium';

		return submitRoadConditionIssue({
			driverUserId: user.id,
			runId: toOptionalNumber(input.runId),
			zoneId: toOptionalNumber(input.zoneId),
			severity,
			description: input.description,
			latitude: toOptionalNumber(input.latitude),
			longitude: toOptionalNumber(input.longitude)
		});
	}
);
