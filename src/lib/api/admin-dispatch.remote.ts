import { command, getRequestEvent, query } from '$app/server';
import { requireUser } from '$lib/server/services/authz.service';
import { generateDailyRuns } from '$lib/server/services/optimizer.service';
import {
	deleteCitizenReport,
	listAllCitizenReports,
	listOpenCitizenReports,
	resolveCitizenReport
} from '$lib/server/services/reporting.service';

export const listOpenReports = query(async () => {
	const event = getRequestEvent();
	requireUser(event);
	return listOpenCitizenReports();
});

export const listAllReports = query(async () => {
	const event = getRequestEvent();
	requireUser(event);
	return listAllCitizenReports();
});

export const runDispatch = command(
	'unchecked',
	async (input: { runDate?: string; wardId?: number | string }) => {
		const event = getRequestEvent();
		requireUser(event);

		return generateDailyRuns({
			runDate: input.runDate,
			wardId:
				input.wardId === undefined || input.wardId === null || input.wardId === ''
					? undefined
					: Number(input.wardId)
		});
	}
);

export const resolveReport = command(
	'unchecked',
	async (input: { reportId: number | string; status?: 'resolved' | 'rejected' }) => {
		const event = getRequestEvent();
		requireUser(event);
		return resolveCitizenReport(Number(input.reportId), input.status ?? 'resolved');
	}
);

export const deleteReport = command('unchecked', async (input: { reportId: number | string }) => {
	const event = getRequestEvent();
	requireUser(event);
	return deleteCitizenReport(Number(input.reportId));
});
