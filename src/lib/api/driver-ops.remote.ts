import { command, getRequestEvent, query } from '$app/server';
import { requireExactRole } from '$lib/server/services/authz.service';
import {
	finishAssignedRun,
	getAssignedRun,
	getAssignedRunLiveNavigation,
	listDriverRouteHistory,
	startAssignedRun,
	submitRoadConditionIssue,
	submitRunSummary,
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
	const user = requireExactRole(event, 'driver');
	return getAssignedRun(user.id);
});

export const getLiveNavigationRoute = command(
	'unchecked',
	async (input: {
		runId: number | string;
		latitude: number | string;
		longitude: number | string;
	}) => {
		const event = getRequestEvent();
		const user = requireExactRole(event, 'driver');
		return getAssignedRunLiveNavigation({
			driverUserId: user.id,
			runId: Number(input.runId),
			latitude: Number(input.latitude),
			longitude: Number(input.longitude)
		});
	}
);

export const getDriverHistory = query('unchecked', async (input: { limit?: number } = {}) => {
	const event = getRequestEvent();
	const user = requireExactRole(event, 'driver');
	return listDriverRouteHistory(user.id, input.limit ?? 8);
});

export const startRun = command(
	'unchecked',
	async (input: {
		runId: number | string;
		latitude?: number | string;
		longitude?: number | string;
	}) => {
	const event = getRequestEvent();
	const user = requireExactRole(event, 'driver');
	return startAssignedRun(user.id, Number(input.runId), {
		latitude: toOptionalNumber(input.latitude),
		longitude: toOptionalNumber(input.longitude)
	});
});

export const finishRun = command('unchecked', async (input: { runId: number | string }) => {
	const event = getRequestEvent();
	const user = requireExactRole(event, 'driver');
	return finishAssignedRun(user.id, Number(input.runId));
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
		const user = requireExactRole(event, 'driver');

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
		issueType?: string;
		severity?: 'low' | 'medium' | 'high';
		trafficLevel?: string;
		description: string;
		startLabel?: string;
		endLabel?: string;
		startLatitude?: number | string;
		startLongitude?: number | string;
		endLatitude?: number | string;
		endLongitude?: number | string;
		latitude?: number | string;
		longitude?: number | string;
		estimatedDelayMinutes?: number | string;
	}) => {
		const event = getRequestEvent();
		const user = requireExactRole(event, 'driver');
		const severity = roadSeverities.includes(input.severity ?? 'medium')
			? (input.severity as 'low' | 'medium' | 'high')
			: 'medium';

		return submitRoadConditionIssue({
			driverUserId: user.id,
			runId: toOptionalNumber(input.runId),
			zoneId: toOptionalNumber(input.zoneId),
			issueType: input.issueType,
			severity,
			trafficLevel: input.trafficLevel,
			description: input.description,
			startLabel: input.startLabel,
			endLabel: input.endLabel,
			startLatitude: toOptionalNumber(input.startLatitude),
			startLongitude: toOptionalNumber(input.startLongitude),
			endLatitude: toOptionalNumber(input.endLatitude),
			endLongitude: toOptionalNumber(input.endLongitude),
			latitude: toOptionalNumber(input.latitude),
			longitude: toOptionalNumber(input.longitude),
			estimatedDelayMinutes: toOptionalNumber(input.estimatedDelayMinutes)
		});
	}
);

export const submitRunSummaryEntry = command(
	'unchecked',
	async (input: {
		runId: number | string;
		collectionVolumeKg?: number | string;
		issues?: string;
		delays?: string;
		roadConditions?: string;
		missedPickups?: number | string;
	}) => {
		const event = getRequestEvent();
		const user = requireExactRole(event, 'driver');

		return submitRunSummary({
			driverUserId: user.id,
			runId: Number(input.runId),
			collectionVolumeKg: toOptionalNumber(input.collectionVolumeKg),
			issues: input.issues,
			delays: input.delays,
			roadConditions: input.roadConditions,
			missedPickups: toOptionalNumber(input.missedPickups)
		});
	}
);
