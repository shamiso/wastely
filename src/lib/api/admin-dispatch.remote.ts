import { command, getRequestEvent, query } from '$app/server';
import { requireExactRole } from '$lib/server/services/authz.service';
import {
	assignDispatchRun,
	generateDailyRuns,
	listDispatchDrivers,
	listDispatchRuns
} from '$lib/server/services/optimizer.service';
import {
	listDriverRouteInsights,
	listRecentDriverLogs
} from '$lib/server/services/intelligence.service';
import {
	deleteCitizenReport,
	listAllCitizenReports,
	listOpenCitizenReports,
	resolveCitizenReport
} from '$lib/server/services/reporting.service';

export const listOpenReports = query(async () => {
	const event = getRequestEvent();
	requireExactRole(event, 'admin');
	return listOpenCitizenReports();
});

export const listAllReports = query(async () => {
	const event = getRequestEvent();
	requireExactRole(event, 'admin');
	return listAllCitizenReports();
});

export const listDriverLogs = query('unchecked', async (input: { limit?: number } = {}) => {
	const event = getRequestEvent();
	requireExactRole(event, 'admin');
	return listRecentDriverLogs(input.limit ?? 12);
});

export const listDriverRouteReports = query('unchecked', async (input: { limit?: number } = {}) => {
	const event = getRequestEvent();
	requireExactRole(event, 'admin');
	return listDriverRouteInsights(input.limit ?? 8);
});

export const listDrivers = query(async () => {
	const event = getRequestEvent();
	requireExactRole(event, 'admin');
	return listDispatchDrivers();
});

export const listRuns = query('unchecked', async (input: { runDate?: string } = {}) => {
	const event = getRequestEvent();
	requireExactRole(event, 'admin');
	return listDispatchRuns(input.runDate);
});

export const runDispatch = command(
	'unchecked',
	async (input: { runDate?: string; wardId?: number | string }) => {
		const event = getRequestEvent();
		requireExactRole(event, 'admin');

		return generateDailyRuns({
			runDate: input.runDate,
			wardId:
				input.wardId === undefined || input.wardId === null || input.wardId === ''
					? undefined
					: Number(input.wardId)
		});
	}
);

export const assignRun = command(
	'unchecked',
	async (input: { runId: number | string; driverUserId?: string | null }) => {
		const event = getRequestEvent();
		requireExactRole(event, 'admin');

		return assignDispatchRun({
			runId: Number(input.runId),
			driverUserId: input.driverUserId && input.driverUserId.trim() ? input.driverUserId : null
		});
	}
);

export const resolveReport = command(
	'unchecked',
	async (input: { reportId: number | string; status?: 'resolved' | 'rejected' }) => {
		const event = getRequestEvent();
		requireExactRole(event, 'admin');
		return resolveCitizenReport(Number(input.reportId), input.status ?? 'resolved');
	}
);

export const deleteReport = command('unchecked', async (input: { reportId: number | string }) => {
	const event = getRequestEvent();
	requireExactRole(event, 'admin');
	return deleteCitizenReport(Number(input.reportId));
});
