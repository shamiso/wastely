import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { citizenReport, wasteForecast, zone } from '$lib/server/db/schema';
import { toYmdDate } from '$lib/server/services/date.service';
import { getZoneOperationalSignals } from '$lib/server/services/intelligence.service';

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

	const operationalSignals = await getZoneOperationalSignals();
	const signalByZone = new Map(operationalSignals.map((signal) => [signal.zoneId, signal]));

	const zones = await db.select().from(zone);
	const forecasts: ZoneDemand[] = [];

	for (const currentZone of zones) {
		const openCount = openCountByZone.get(currentZone.id) ?? 0;
		const signal = signalByZone.get(currentZone.id);
		const historicalAverage = signal?.historicalAverageVolumeKg && signal.historicalAverageVolumeKg > 0
			? signal.historicalAverageVolumeKg
			: 120;
		const operationalLoad = (signal?.roadRiskScore ?? 0) * 0.9 + (signal?.summaryIssueScore ?? 0) * 0.7;
		const predictedVolumeKg = Math.round(historicalAverage * 0.65 + openCount * 60 + operationalLoad);
		const confidence = Math.min(
			0.97,
			0.38 + Math.min(signal?.historicalSamples ?? 0, 10) * 0.04 + Math.min(openCount, 8) * 0.04
		);
		const score = openCount * 10 + predictedVolumeKg / 45 + operationalLoad / 12;

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
