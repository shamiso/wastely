import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import { buildForecastTrainingDataset } from '$lib/server/services/forecast.service';

function hasMlToken(request: Request, url: URL) {
	if (!env.ML_SHARED_TOKEN) return false;
	const authHeader = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
	return authHeader === env.ML_SHARED_TOKEN || url.searchParams.get('token') === env.ML_SHARED_TOKEN;
}

export const GET = async ({ request, url, locals }) => {
	const isAdmin = locals.role === 'admin';
	if (!isAdmin && !hasMlToken(request, url)) {
		throw error(401, 'Missing valid ML API token');
	}

	const requestedDays = Number(url.searchParams.get('days') ?? '30');
	const days = Number.isFinite(requestedDays) ? Math.min(Math.max(requestedDays, 7), 365) : 30;
	const rows = await buildForecastTrainingDataset(days);

	return json({
		generatedAt: new Date().toISOString(),
		days,
		rows
	});
};
