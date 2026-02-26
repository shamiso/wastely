import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	citizenReport,
	driverProfile,
	routeRun,
	routeStop,
	userRole,
	zone
} from '$lib/server/db/schema';
import { toYmdDate } from '$lib/server/services/date.service';
import { refreshZoneForecasts } from '$lib/server/services/forecast.service';
import {
	getOsrmTripDistanceKm,
	haversineDistanceKm,
	orderByNearestNeighbor
} from '$lib/server/services/geo.service';

type RunGenerationInput = {
	runDate?: string;
	wardId?: number;
};

function estimateDistance(points: Array<{ lat: number; lng: number }>): number {
	if (points.length < 2) return 0;
	let total = 0;
	for (let i = 1; i < points.length; i += 1) {
		total += haversineDistanceKm(points[i - 1], points[i]);
	}
	return Number(total.toFixed(2));
}

export async function generateDailyRuns(input: RunGenerationInput = {}) {
	const runDate = input.runDate ?? toYmdDate();
	const demand = await refreshZoneForecasts(runDate);
	const demandScoreByZone = new Map(demand.map((item) => [item.zoneId, item.score]));

	const openReportRows = await db
		.select({
			report: citizenReport,
			zone: zone
		})
		.from(citizenReport)
		.leftJoin(zone, eq(citizenReport.zoneId, zone.id))
		.where(eq(citizenReport.status, 'open'));

	const filteredRows = openReportRows.filter((row) => {
		if (input.wardId && row.zone?.wardId !== input.wardId) return false;
		return true;
	});

	if (filteredRows.length === 0) {
		return {
			runDate,
			runsCreated: 0,
			stopsCreated: 0
		};
	}

	const drivers = await db
		.select({
			userId: driverProfile.userId
		})
		.from(driverProfile)
		.innerJoin(userRole, eq(driverProfile.userId, userRole.userId))
		.where(and(eq(driverProfile.active, true), eq(userRole.role, 'driver')));

	const assignees: Array<string | null> = drivers.length > 0 ? drivers.map((d) => d.userId) : [null];
	const assignments: typeof filteredRows[] = assignees.map(() => []);

	const sortedReports = [...filteredRows].sort((a, b) => {
		const aScore = demandScoreByZone.get(a.report.zoneId ?? -1) ?? 0;
		const bScore = demandScoreByZone.get(b.report.zoneId ?? -1) ?? 0;
		if (bScore !== aScore) return bScore - aScore;
		return a.report.createdAt - b.report.createdAt;
	});

	sortedReports.forEach((row, index) => {
		assignments[index % assignments.length].push(row);
	});

	let runsCreated = 0;
	let stopsCreated = 0;

	for (let i = 0; i < assignments.length; i += 1) {
		const batch = assignments[i];
		if (batch.length === 0) continue;

		const [run] = await db
			.insert(routeRun)
			.values({
				runDate,
				wardId: input.wardId ?? null,
				driverUserId: assignees[i],
				status: 'planned',
				plannedDistanceKm: 0,
				updatedAt: Date.now()
			})
			.returning();

		const ordered = orderByNearestNeighbor(
			batch.map((row) => ({
				id: row.report.id,
				lat: row.report.latitude,
				lng: row.report.longitude
			}))
		);

		const reportById = new Map(batch.map((row) => [row.report.id, row.report]));
		const stops = ordered.map((point, index) => {
			const report = reportById.get(point.id);
			if (!report) throw new Error(`Missing report ${point.id}`);
			return {
				routeRunId: run.id,
				zoneId: report.zoneId,
				sourceReportId: report.id,
				sequence: index + 1,
				latitude: report.latitude,
				longitude: report.longitude,
				action: 'collect' as const,
				status: 'pending' as const,
				updatedAt: Date.now()
			};
		});

		await db.insert(routeStop).values(stops);

		const osrmDistance =
			(await getOsrmTripDistanceKm(stops.map((stop) => ({ lat: stop.latitude, lng: stop.longitude })))) ??
			estimateDistance(stops.map((stop) => ({ lat: stop.latitude, lng: stop.longitude })));

		await db
			.update(routeRun)
			.set({
				plannedDistanceKm: osrmDistance,
				updatedAt: Date.now()
			})
			.where(eq(routeRun.id, run.id));

		await db
			.update(citizenReport)
			.set({
				status: 'in_review',
				updatedAt: Date.now()
			})
			.where(eq(citizenReport.id, stops[0].sourceReportId!));

		if (stops.length > 1) {
			const remainingIds = stops.slice(1).map((stop) => stop.sourceReportId as number);
			for (const reportId of remainingIds) {
				await db
					.update(citizenReport)
					.set({
						status: 'in_review',
						updatedAt: Date.now()
					})
					.where(eq(citizenReport.id, reportId));
			}
		}

		runsCreated += 1;
		stopsCreated += stops.length;
	}

	return {
		runDate,
		runsCreated,
		stopsCreated
	};
}
