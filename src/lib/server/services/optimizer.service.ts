import { and, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	citizenReport,
	driverProfile,
	routeRun,
	routeStop,
	userRole,
	zone,
	user
} from '$lib/server/db/schema';
import { toYmdDate } from '$lib/server/services/date.service';
import { refreshZoneForecasts } from '$lib/server/services/forecast.service';
import { getZoneOperationalSignals } from '$lib/server/services/intelligence.service';
import {
	getOsrmTripDistanceKm,
	haversineDistanceKm,
	orderByNearestNeighbor
} from '$lib/server/services/geo.service';

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
	stopCount: number;
	completedStopCount: number;
	skippedStopCount: number;
	createdAt: number;
};

function estimateDistance(points: Array<{ lat: number; lng: number }>): number {
	if (points.length < 2) return 0;
	let total = 0;
	for (let i = 1; i < points.length; i += 1) {
		total += haversineDistanceKm(points[i - 1], points[i]);
	}
	return Number(total.toFixed(2));
}

function orderByWeightedNearestNeighbor(
	points: Array<{ id: number; lat: number; lng: number; zoneId: number | null }>,
	zonePenaltyByZone: Map<number, number>
) {
	if (points.length <= 2) {
		return orderByNearestNeighbor(points.map((point) => ({ id: point.id, lat: point.lat, lng: point.lng }))).map(
			(point) => points.find((candidate) => candidate.id === point.id)!
		);
	}

	const remaining = [...points];
	const ordered = [remaining.shift() as (typeof points)[number]];

	while (remaining.length > 0) {
		const current = ordered[ordered.length - 1];
		let candidateIndex = 0;
		let candidateCost = Number.POSITIVE_INFINITY;

		for (let i = 0; i < remaining.length; i += 1) {
			const candidate = remaining[i];
			const distance = haversineDistanceKm(current, candidate);
			const zonePenalty =
				candidate.zoneId === null ? 0 : (zonePenaltyByZone.get(candidate.zoneId) ?? 0) / 120;
			const weightedCost = distance * (1 + zonePenalty);

			if (weightedCost < candidateCost) {
				candidateCost = weightedCost;
				candidateIndex = i;
			}
		}

		ordered.push(remaining.splice(candidateIndex, 1)[0]);
	}

	return ordered;
}

export async function generateDailyRuns(input: RunGenerationInput = {}) {
	const runDate = input.runDate ?? toYmdDate();
	const demand = await refreshZoneForecasts(runDate);
	const demandScoreByZone = new Map(demand.map((item) => [item.zoneId, item.score]));
	const operationalSignals = await getZoneOperationalSignals();
	const zonePenaltyByZone = new Map(
		operationalSignals.map((signal) => [
			signal.zoneId,
			Number((signal.roadRiskScore + signal.summaryIssueScore).toFixed(2))
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

		const ordered = orderByWeightedNearestNeighbor(
			batch.map((row) => ({
				id: row.report.id,
				lat: row.report.latitude,
				lng: row.report.longitude,
				zoneId: row.report.zoneId
			}))
		, zonePenaltyByZone);

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
