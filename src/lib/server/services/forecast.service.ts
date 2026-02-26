import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { citizenReport, wasteForecast, zone } from '$lib/server/db/schema';
import { toYmdDate } from '$lib/server/services/date.service';

export type ZoneDemand = {
	zoneId: number;
	zoneName: string;
	score: number;
	predictedVolumeKg: number;
	confidence: number;
};

export async function refreshZoneForecasts(forecastDate = toYmdDate()): Promise<ZoneDemand[]> {
	const openReports = await db
		.select({
			zoneId: citizenReport.zoneId,
			count: sql<number>`count(*)`
		})
		.from(citizenReport)
		.where(eq(citizenReport.status, 'open'))
		.groupBy(citizenReport.zoneId);

	const openCountByZone = new Map<number, number>();
	for (const row of openReports) {
		if (row.zoneId) openCountByZone.set(row.zoneId, Number(row.count));
	}

	const zones = await db.select().from(zone);
	const forecasts: ZoneDemand[] = [];

	for (const currentZone of zones) {
		const openCount = openCountByZone.get(currentZone.id) ?? 0;
		const predictedVolumeKg = Math.round(120 + openCount * 65);
		const confidence = Math.min(0.95, 0.5 + openCount * 0.05);
		const score = openCount * 10 + predictedVolumeKg / 50;

		await db
			.insert(wasteForecast)
			.values({
				zoneId: currentZone.id,
				forecastDate,
				predictedVolumeKg,
				confidence
			})
			.onConflictDoUpdate({
				target: [wasteForecast.zoneId, wasteForecast.forecastDate],
				set: {
					predictedVolumeKg,
					confidence,
					createdAt: Date.now()
				}
			});

		forecasts.push({
			zoneId: currentZone.id,
			zoneName: currentZone.name,
			score,
			predictedVolumeKg,
			confidence
		});
	}

	return forecasts.sort((a, b) => b.score - a.score);
}
