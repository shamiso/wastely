import { and, eq, gte, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { optimizeRoute, type RouteIssue } from '$lib/domain/route-optimizer';
import { db } from '$lib/server/db';
import {
	citizenReport,
	driverProfile,
	roadConditionReport,
	routeRun,
	routeStop,
	userRole,
	zone,
	user
} from '$lib/server/db/schema';
import { toYmdDate } from '$lib/server/services/date.service';
import { refreshZoneForecasts } from '$lib/server/services/forecast.service';
import { getZoneOperationalSignals } from '$lib/server/services/intelligence.service';
import { getOsrmTripDistanceKm } from '$lib/server/services/geo.service';

type RunGenerationInput = {
	runDate?: string;
	wardId?: number;
};

export type DispatchDriver = {
	userId: string;
	name: string;
	email: string;
	vehicleId: number | null;
};

export type DispatchRun = {
	id: number;
	runDate: string;
	status: 'planned' | 'in_progress' | 'completed' | 'blocked';
	driverUserId: string | null;
	driverName: string | null;
	plannedDistanceKm: number;
	estimatedDurationMinutes: number;
	stopCount: number;
	completedStopCount: number;
	skippedStopCount: number;
	createdAt: number;
};

function estimateDistance(points: Array<{ lat: number; lng: number }>): number {
	if (points.length < 2) return 0;
	return Number(
		points
			.slice(1)
			.reduce((sum, point, index) => {
				const previous = points[index];
				const dx = point.lat - previous.lat;
				const dy = point.lng - previous.lng;
				return sum + Math.sqrt(dx ** 2 + dy ** 2) * 111;
			}, 0)
			.toFixed(2)
	);
}

export async function generateDailyRuns(input: RunGenerationInput = {}) {
	const runDate = input.runDate ?? toYmdDate();
	const demand = await refreshZoneForecasts(runDate);
	const demandScoreByZone = new Map(demand.map((item) => [item.zoneId, item.score]));
	const operationalSignals = await getZoneOperationalSignals();
	const zonePenaltyByZone = new Map(
		operationalSignals.map((signal) => [
			signal.zoneId,
			Number((signal.congestionScore + signal.summaryIssueScore + signal.missedPickupsScore).toFixed(2))
		])
	);

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

	const recentRoadIssues = await db
		.select({
			id: roadConditionReport.id,
			routeRunId: roadConditionReport.routeRunId,
			zoneId: roadConditionReport.zoneId,
			issueType: roadConditionReport.issueType,
			severity: roadConditionReport.severity,
			trafficLevel: roadConditionReport.trafficLevel,
			latitude: roadConditionReport.latitude,
			longitude: roadConditionReport.longitude,
			startLatitude: roadConditionReport.startLatitude,
			startLongitude: roadConditionReport.startLongitude,
			endLatitude: roadConditionReport.endLatitude,
			endLongitude: roadConditionReport.endLongitude,
			estimatedDelayMinutes: roadConditionReport.estimatedDelayMinutes,
			createdAt: roadConditionReport.createdAt
		})
		.from(roadConditionReport)
		.where(gte(roadConditionReport.createdAt, Date.now() - 14 * 24 * 60 * 60 * 1000));

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
				estimatedDurationMinutes: 0,
				updatedAt: Date.now()
			})
			.returning();

		const batchIssues: RouteIssue[] = recentRoadIssues
			.filter((issue) => {
				if (issue.routeRunId && issue.routeRunId !== run.id) return false;
				if (issue.zoneId === null) return true;
				return batch.some((row) => row.report.zoneId === issue.zoneId);
			})
			.map((issue) => ({
				id: issue.id,
				issueType: issue.issueType,
				severity: issue.severity,
				trafficLevel: issue.trafficLevel,
				latitude: issue.latitude,
				longitude: issue.longitude,
				startLatitude: issue.startLatitude,
				startLongitude: issue.startLongitude,
				endLatitude: issue.endLatitude,
				endLongitude: issue.endLongitude,
				estimatedDelayMinutes:
					issue.estimatedDelayMinutes +
					(issue.zoneId === null ? 0 : (zonePenaltyByZone.get(issue.zoneId) ?? 0) / 8)
			}));

		const routePlan = optimizeRoute(
			batch.map((row) => ({
				id: row.report.id,
				lat: row.report.latitude,
				lng: row.report.longitude,
				zoneId: row.report.zoneId,
				label: row.zone?.name ?? `Report ${row.report.id}`
			})),
			batchIssues
		);

		const reportById = new Map(batch.map((row) => [row.report.id, row.report]));
		const stops = routePlan.orderedPoints.map((point, index) => {
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
			routePlan.plannedDistanceKm ??
			estimateDistance(stops.map((stop) => ({ lat: stop.latitude, lng: stop.longitude })));
		const firstStop = stops[0];
		const lastStop = stops[stops.length - 1];

		await db
			.update(routeRun)
			.set({
				plannedDistanceKm: osrmDistance,
				originLatitude: firstStop?.latitude ?? null,
				originLongitude: firstStop?.longitude ?? null,
				destinationLatitude: lastStop?.latitude ?? null,
				destinationLongitude: lastStop?.longitude ?? null,
				estimatedDurationMinutes: routePlan.estimatedDurationMinutes,
				routeGeometryJson: JSON.stringify({
					type: 'LineString',
					coordinates: routePlan.geometry.map(([lat, lng]) => [lng, lat])
				}),
				optimizerMetadataJson: JSON.stringify({
					model: 'condition-aware-nn-v2',
					legDurationsMinutes: routePlan.legDurationsMinutes,
					riskScore: routePlan.metadata.riskScore,
					congestionScore: routePlan.metadata.congestionScore,
					blockedLegs: routePlan.metadata.blockedLegs,
					issueIds: routePlan.metadata.issueIds
				}),
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

export async function listDispatchDrivers(): Promise<DispatchDriver[]> {
	const rows = await db
		.select({
			userId: driverProfile.userId,
			name: user.name,
			email: user.email,
			vehicleId: driverProfile.vehicleId
		})
		.from(driverProfile)
		.innerJoin(userRole, eq(driverProfile.userId, userRole.userId))
		.innerJoin(user, eq(driverProfile.userId, user.id))
		.where(and(eq(driverProfile.active, true), eq(userRole.role, 'driver')));

	return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listDispatchRuns(runDate = toYmdDate()): Promise<DispatchRun[]> {
	const runRows = await db
		.select({
			id: routeRun.id,
			runDate: routeRun.runDate,
			status: routeRun.status,
			driverUserId: routeRun.driverUserId,
			driverName: user.name,
			plannedDistanceKm: routeRun.plannedDistanceKm,
			estimatedDurationMinutes: routeRun.estimatedDurationMinutes,
			createdAt: routeRun.createdAt
		})
		.from(routeRun)
		.leftJoin(user, eq(routeRun.driverUserId, user.id))
		.where(eq(routeRun.runDate, runDate));

	if (runRows.length === 0) return [];

	const runIds = runRows.map((run) => run.id);
	const stopRows = await db
		.select({
			routeRunId: routeStop.routeRunId,
			status: routeStop.status
		})
		.from(routeStop)
		.where(inArray(routeStop.routeRunId, runIds));

	const stopStatsByRun = new Map<number, { total: number; completed: number; skipped: number }>();

	for (const stop of stopRows) {
		const current = stopStatsByRun.get(stop.routeRunId) ?? {
			total: 0,
			completed: 0,
			skipped: 0
		};
		current.total += 1;
		if (stop.status === 'done') current.completed += 1;
		if (stop.status === 'skipped') current.skipped += 1;
		stopStatsByRun.set(stop.routeRunId, current);
	}

	return runRows
		.map((run) => {
			const stopStats = stopStatsByRun.get(run.id) ?? {
				total: 0,
				completed: 0,
				skipped: 0
			};

			return {
				id: run.id,
				runDate: run.runDate,
				status: run.status,
				driverUserId: run.driverUserId,
				driverName: run.driverName ?? null,
				plannedDistanceKm: run.plannedDistanceKm,
				estimatedDurationMinutes: run.estimatedDurationMinutes,
				stopCount: stopStats.total,
				completedStopCount: stopStats.completed,
				skippedStopCount: stopStats.skipped,
				createdAt: run.createdAt
			} as DispatchRun;
		})
		.sort((a, b) => b.createdAt - a.createdAt);
}

export async function assignDispatchRun(input: { runId: number; driverUserId: string | null }) {
	const [run] = await db.select().from(routeRun).where(eq(routeRun.id, input.runId)).limit(1);
	if (!run) throw error(404, 'Route run not found');
	if (run.status !== 'planned') throw error(400, 'Only planned runs can be reassigned.');

	if (input.driverUserId) {
		const [driver] = await db
			.select({ userId: driverProfile.userId })
			.from(driverProfile)
			.innerJoin(userRole, eq(driverProfile.userId, userRole.userId))
			.where(and(eq(driverProfile.userId, input.driverUserId), eq(driverProfile.active, true), eq(userRole.role, 'driver')))
			.limit(1);

		if (!driver) throw error(400, 'Selected driver is not available.');
	}

	const [updated] = await db
		.update(routeRun)
		.set({
			driverUserId: input.driverUserId,
			updatedAt: Date.now()
		})
		.where(eq(routeRun.id, input.runId))
		.returning();

	return updated;
}
