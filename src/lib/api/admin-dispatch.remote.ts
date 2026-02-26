import { command, getRequestEvent, query } from '$app/server';
import { requireRole } from '$lib/server/services/authz.service';
import { generateDailyRuns } from '$lib/server/services/optimizer.service';
import {
	listOpenCitizenReports,
	resolveCitizenReport
} from '$lib/server/services/reporting.service';

export const listOpenReports = query(async () => {
	const event = getRequestEvent();
	requireRole(event, 'admin');
	return listOpenCitizenReports();
});

export const runDispatch = command(
	'unchecked',
	async (input: { runDate?: string; wardId?: number | string }) => {
		const event = getRequestEvent();
		requireRole(event, 'admin');

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
		requireRole(event, 'admin');
		return resolveCitizenReport(Number(input.reportId), input.status ?? 'resolved');
	}
);
