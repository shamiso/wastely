import { getRequestEvent, query } from '$app/server';
import { requireRole } from '$lib/server/services/authz.service';
import { getKpiSnapshot, getZoneDemand } from '$lib/server/services/dashboard.service';

export const kpiSnapshot = query('unchecked', async (input: { date?: string } = {}) => {
	const event = getRequestEvent();
	requireRole(event, 'admin');
	return getKpiSnapshot(input.date);
});

export const zoneDemand = query('unchecked', async (input: { date?: string } = {}) => {
	const event = getRequestEvent();
	requireRole(event, 'admin');
	return getZoneDemand(input.date);
});
