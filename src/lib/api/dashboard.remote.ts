import { getRequestEvent, query } from '$app/server';
import { requireExactRole } from '$lib/server/services/authz.service';
import {
	getDatasetHealth,
	getKpiSnapshot,
	getZoneDemand
} from '$lib/server/services/dashboard.service';

export const kpiSnapshot = query('unchecked', async (input: { date?: string } = {}) => {
	const event = getRequestEvent();
	requireExactRole(event, 'admin');
	return getKpiSnapshot(input.date);
});

export const zoneDemand = query('unchecked', async (input: { date?: string } = {}) => {
	const event = getRequestEvent();
	requireExactRole(event, 'admin');
	return getZoneDemand(input.date);
});

export const datasetHealth = query(async () => {
	const event = getRequestEvent();
	requireExactRole(event, 'admin');
	return getDatasetHealth();
});
