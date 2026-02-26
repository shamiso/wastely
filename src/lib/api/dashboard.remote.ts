import { getRequestEvent, query } from '$app/server';
import { requireUser } from '$lib/server/services/authz.service';
import { getKpiSnapshot, getZoneDemand } from '$lib/server/services/dashboard.service';

export const kpiSnapshot = query('unchecked', async (input: { date?: string } = {}) => {
	const event = getRequestEvent();
	requireUser(event);
	return getKpiSnapshot(input.date);
});

export const zoneDemand = query('unchecked', async (input: { date?: string } = {}) => {
	const event = getRequestEvent();
	requireUser(event);
	return getZoneDemand(input.date);
});
