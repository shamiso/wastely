import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	citizenReport,
	kpiDailySnapshot,
	routeRun,
	wasteForecast,
	zone
} from '$lib/server/db/schema';
import { toYmdDate } from '$lib/server/services/date.service';
import { refreshZoneForecasts } from '$lib/server/services/forecast.service';

export type KpiSnapshot = {
	date: string;
	plannedRuns: number;
	completedRuns: number;
	openReports: number;
	resolvedReports: number;
	averageResponseHours: number;
	avgRunDurationMinutes: number;
	totalDistanceKm: number;
};

function toNumber(value: unknown): number {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') return Number(value);
	return 0;
}

export async function getKpiSnapshot(date = toYmdDate()): Promise<KpiSnapshot> {
	const [plannedRuns] = await db
		.select({ count: sql<number>`count(*)` })
		.from(routeRun)
		.where(eq(routeRun.runDate, date));

	const [completedRuns] = await db
		.select({ count: sql<number>`count(*)` })
		.from(routeRun)
		.where(and(eq(routeRun.runDate, date), eq(routeRun.status, 'completed')));

	const [openReports] = await db
		.select({ count: sql<number>`count(*)` })
		.from(citizenReport)
		.where(eq(citizenReport.status, 'open'));

	const [resolvedReports] = await db
		.select({ count: sql<number>`count(*)` })
		.from(citizenReport)
		.where(eq(citizenReport.status, 'resolved'));

	const [avgResponse] = await db
		.select({
			value: sql<number>`coalesce(avg((${citizenReport.updatedAt} - ${citizenReport.createdAt}) / 3600000.0), 0)`
		})
		.from(citizenReport)
		.where(eq(citizenReport.status, 'resolved'));

	const [avgRunDuration] = await db
		.select({
			value: sql<number>`coalesce(avg((${routeRun.completedAt} - ${routeRun.startedAt}) / 60000.0), 0)`
		})
		.from(routeRun)
		.where(
			and(
				eq(routeRun.runDate, date),
				eq(routeRun.status, 'completed'),
				isNotNull(routeRun.startedAt),
				isNotNull(routeRun.completedAt)
			)
		);

	const [totalDistance] = await db
		.select({
			value: sql<number>`coalesce(sum(${routeRun.plannedDistanceKm}), 0)`
		})
		.from(routeRun)
		.where(eq(routeRun.runDate, date));

	const snapshot: KpiSnapshot = {
		date,
		plannedRuns: toNumber(plannedRuns?.count),
		completedRuns: toNumber(completedRuns?.count),
		openReports: toNumber(openReports?.count),
		resolvedReports: toNumber(resolvedReports?.count),
		averageResponseHours: Number(toNumber(avgResponse?.value).toFixed(2)),
		avgRunDurationMinutes: Number(toNumber(avgRunDuration?.value).toFixed(2)),
		totalDistanceKm: Number(toNumber(totalDistance?.value).toFixed(2))
	};

	await db
		.insert(kpiDailySnapshot)
		.values({
			snapshotDate: date,
			plannedRuns: snapshot.plannedRuns,
			completedRuns: snapshot.completedRuns,
			openReports: snapshot.openReports,
			resolvedReports: snapshot.resolvedReports,
			averageResponseHours: snapshot.averageResponseHours,
			avgRunDurationMinutes: snapshot.avgRunDurationMinutes,
			totalDistanceKm: snapshot.totalDistanceKm
		})
		.onConflictDoUpdate({
			target: kpiDailySnapshot.snapshotDate,
			set: {
				plannedRuns: snapshot.plannedRuns,
				completedRuns: snapshot.completedRuns,
				openReports: snapshot.openReports,
				resolvedReports: snapshot.resolvedReports,
				averageResponseHours: snapshot.averageResponseHours,
				avgRunDurationMinutes: snapshot.avgRunDurationMinutes,
				totalDistanceKm: snapshot.totalDistanceKm,
				createdAt: Date.now()
			}
		});

	return snapshot;
}

export async function getZoneDemand(date = toYmdDate()) {
	await refreshZoneForecasts(date);

	return db
		.select({
			zoneId: wasteForecast.zoneId,
			zoneName: zone.name,
			forecastDate: wasteForecast.forecastDate,
			predictedVolumeKg: wasteForecast.predictedVolumeKg,
			confidence: wasteForecast.confidence
		})
		.from(wasteForecast)
		.innerJoin(zone, eq(wasteForecast.zoneId, zone.id))
		.where(eq(wasteForecast.forecastDate, date))
		.orderBy(desc(wasteForecast.predictedVolumeKg));
}
