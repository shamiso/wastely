import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { optimizeRoute, type RouteIssue } from '$lib/domain/route-optimizer';
import { db } from '$lib/server/db';
import {
	citizenReport,
	driverProfile,
	roadConditionReport,
	routeRun,
	routeStop,
	zone,
	user
} from '$lib/server/db/schema';
import { toYmdDate } from '$lib/server/services/date.service';
import { refreshZoneForecasts } from '$lib/server/services/forecast.service';
import { getOsrmRouteSnapshot, resolveZoneFromCoordinates } from '$lib/server/services/geo.service';
import { getZoneOperationalSignals } from '$lib/server/services/intelligence.service';
import { getOsrmTripDistanceKm } from '$lib/server/services/geo.service';
import { ensureReferenceData } from '$lib/server/services/reference-data.service';

type RunGenerationInput = {
	runDate?: string;
	wardId?: number;
};

type RouteGeometry = {
	type: 'LineString';
	coordinates: Array<[number, number]>;
};

type RouteMetadata = {
	model?: string;
	legDurationsMinutes?: number[];
	riskScore?: number;
	congestionScore?: number;
	blockedLegs?: number;
	issueIds?: Array<number | string>;
	nextStopEtaMinutes?: number;
};

export type DispatchDriver = {
	userId: string;
	name: string;
	email: string;
	vehicleId: number | null;
};

export type DispatchZone = {
	id: number;
	wardId: number;
	name: string;
	code: string;
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
	routeGeometry: RouteGeometry | null;
	optimizerMetadata: RouteMetadata | null;
	stops: Array<{
		id: number;
		sequence: number;
		zoneId: number | null;
		zoneName: string | null;
		sourceReportId: number | null;
		latitude: number;
		longitude: number;
		status: 'pending' | 'done' | 'skipped';
	}>;
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

function parseJson<T>(value: string | null): T | null {
	if (!value) return null;

	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

async function buildPersistedRouteSnapshot(
	points: Array<{ lat: number; lng: number }>,
	routePlan: {
		geometry: Array<[number, number]>;
		plannedDistanceKm: number;
		estimatedDurationMinutes: number;
		legDurationsMinutes: number[];
	}
) {
	const osrmRoute = await getOsrmRouteSnapshot(points);

	return {
		distanceKm:
			osrmRoute?.distanceKm ??
			(await getOsrmTripDistanceKm(points)) ??
			routePlan.plannedDistanceKm ??
			estimateDistance(points),
		durationMinutes: osrmRoute?.durationMinutes ?? routePlan.estimatedDurationMinutes,
		routeGeometry: osrmRoute?.geometry ?? {
			type: 'LineString' as const,
			coordinates: routePlan.geometry.map(([lat, lng]) => [lng, lat] as [number, number])
		}
	};
}

async function listRecentRouteIssues() {
	return db
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
}

async function listActiveDispatchDrivers() {
	return db
		.select({
			userId: driverProfile.userId,
			name: user.name,
			email: user.email,
			vehicleId: driverProfile.vehicleId
		})
		.from(driverProfile)
		.innerJoin(user, eq(driverProfile.userId, user.id))
		.where(eq(driverProfile.active, true));
}

async function getAvailableDriverOrThrow(driverUserId: string) {
	const [driver] = await db
		.select({
			userId: driverProfile.userId,
			name: user.name,
			email: user.email,
			vehicleId: driverProfile.vehicleId
		})
		.from(driverProfile)
		.innerJoin(user, eq(driverProfile.userId, user.id))
		.where(and(eq(driverProfile.userId, driverUserId), eq(driverProfile.active, true)))
		.limit(1);

	if (!driver) throw error(400, 'Selected driver is not available.');
	return driver;
}

async function syncPlannedRunAfterRemovingReport(runId: number, reportId: number) {
	const [run] = await db.select().from(routeRun).where(eq(routeRun.id, runId)).limit(1);
	if (!run || run.status !== 'planned') return;

	const remainingStops = await db
		.select()
		.from(routeStop)
		.where(eq(routeStop.routeRunId, runId))
		.orderBy(routeStop.sequence);
	const filteredStops = remainingStops.filter((stop) => stop.sourceReportId !== reportId);

	if (filteredStops.length === remainingStops.length) return;

	if (filteredStops.length === 0) {
		await db.delete(routeStop).where(eq(routeStop.routeRunId, runId));
		await db
			.update(routeRun)
			.set({
				plannedDistanceKm: 0,
				estimatedDurationMinutes: 0,
				originLatitude: null,
				originLongitude: null,
				destinationLatitude: null,
				destinationLongitude: null,
				routeGeometryJson: null,
				optimizerMetadataJson: null,
				updatedAt: Date.now()
			})
			.where(eq(routeRun.id, runId));
		return;
	}

	await rebuildPlannedRunRoute({
		runId,
		wardId: run.wardId,
		driverUserId: run.driverUserId,
		stops: filteredStops.map((stop) => ({
			zoneId: stop.zoneId,
			sourceReportId: stop.sourceReportId as number,
			latitude: stop.latitude,
			longitude: stop.longitude,
			label: `Report ${stop.sourceReportId ?? stop.id}`
		}))
	});
}

async function rebuildPlannedRunRoute(input: {
	runId: number;
	wardId: number | null;
	driverUserId: string | null;
	stops: Array<{
		zoneId: number | null;
		sourceReportId: number;
		latitude: number;
		longitude: number;
		label: string;
	}>;
}) {
	if (input.stops.length === 0) {
		throw error(400, 'At least one stop is required to build a route.');
	}

	const [recentRoadIssues, operationalSignals] = await Promise.all([
		listRecentRouteIssues(),
		getZoneOperationalSignals()
	]);
	const zonePenaltyByZone = new Map(
		operationalSignals.map((signal) => [
			signal.zoneId,
			Number(
				(
					signal.congestionScore +
					signal.summaryIssueScore +
					signal.missedPickupsScore
				).toFixed(2)
			)
		])
	);
	const zoneIds = new Set(
		input.stops
			.map((stop) => stop.zoneId)
			.filter((zoneId): zoneId is number => zoneId !== null)
	);

	const batchIssues: RouteIssue[] = recentRoadIssues
		.filter((issue) => {
			if (issue.routeRunId && issue.routeRunId !== input.runId) return false;
			if (issue.zoneId === null) return true;
			return zoneIds.has(issue.zoneId);
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
		input.stops.map((stop) => ({
			id: stop.sourceReportId,
			lat: stop.latitude,
			lng: stop.longitude,
			zoneId: stop.zoneId,
			label: stop.label
		})),
		batchIssues
	);
	const stopByReportId = new Map(input.stops.map((stop) => [stop.sourceReportId, stop]));
	const orderedStops = routePlan.orderedPoints.map((point) => {
		const stop = stopByReportId.get(point.id);
		if (!stop) {
			throw error(500, `Route stop ${point.id} could not be mapped back to the report.`);
		}
		return stop;
	});

	await db.delete(routeStop).where(eq(routeStop.routeRunId, input.runId));
	const insertedStops = await db
		.insert(routeStop)
		.values(
			orderedStops.map((stop, index) => ({
				routeRunId: input.runId,
				zoneId: stop.zoneId,
				sourceReportId: stop.sourceReportId,
				sequence: index + 1,
				latitude: stop.latitude,
				longitude: stop.longitude,
				action: 'collect' as const,
				status: 'pending' as const,
				updatedAt: Date.now()
			}))
		)
		.returning();

	const persistedRoute = await buildPersistedRouteSnapshot(
		insertedStops.map((stop) => ({ lat: stop.latitude, lng: stop.longitude })),
		routePlan
	);
	const lastStop = insertedStops[insertedStops.length - 1];

	const [updatedRun] = await db
		.update(routeRun)
		.set({
			wardId: input.wardId,
			driverUserId: input.driverUserId,
			plannedDistanceKm: persistedRoute.distanceKm,
			originLatitude: null,
			originLongitude: null,
			destinationLatitude: lastStop?.latitude ?? null,
			destinationLongitude: lastStop?.longitude ?? null,
			estimatedDurationMinutes: persistedRoute.durationMinutes,
			routeGeometryJson: JSON.stringify(persistedRoute.routeGeometry),
			optimizerMetadataJson: JSON.stringify({
				model: 'condition-aware-nn-v2',
				legDurationsMinutes: routePlan.legDurationsMinutes,
				riskScore: routePlan.metadata.riskScore,
				congestionScore: routePlan.metadata.congestionScore,
				blockedLegs: routePlan.metadata.blockedLegs,
				issueIds: routePlan.metadata.issueIds,
				nextStopEtaMinutes: routePlan.legDurationsMinutes[0] ?? persistedRoute.durationMinutes
			}),
			updatedAt: Date.now()
		})
		.where(eq(routeRun.id, input.runId))
		.returning();

	return updatedRun;
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

	const drivers = await listActiveDispatchDrivers();

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

	const recentRoadIssues = await listRecentRouteIssues();

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

		const persistedRoute = await buildPersistedRouteSnapshot(
			stops.map((stop) => ({ lat: stop.latitude, lng: stop.longitude })),
			routePlan
		);
		const lastStop = stops[stops.length - 1];

		await db
			.update(routeRun)
			.set({
				plannedDistanceKm: persistedRoute.distanceKm,
				originLatitude: null,
				originLongitude: null,
				destinationLatitude: lastStop?.latitude ?? null,
				destinationLongitude: lastStop?.longitude ?? null,
				estimatedDurationMinutes: persistedRoute.durationMinutes,
				routeGeometryJson: JSON.stringify(persistedRoute.routeGeometry),
				optimizerMetadataJson: JSON.stringify({
					model: 'condition-aware-nn-v2',
					legDurationsMinutes: routePlan.legDurationsMinutes,
					riskScore: routePlan.metadata.riskScore,
					congestionScore: routePlan.metadata.congestionScore,
					blockedLegs: routePlan.metadata.blockedLegs,
					issueIds: routePlan.metadata.issueIds,
					nextStopEtaMinutes: routePlan.legDurationsMinutes[0] ?? persistedRoute.durationMinutes
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
	const rows = await listActiveDispatchDrivers();

	return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listDispatchZones(): Promise<DispatchZone[]> {
	await ensureReferenceData();
	const rows = await db.select().from(zone);
	return rows
		.filter((row) => !/^zone\b/i.test(row.name))
		.map((row) => ({
			id: row.id,
			wardId: row.wardId,
			name: row.name,
			code: row.code
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
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
			createdAt: routeRun.createdAt,
			routeGeometryJson: routeRun.routeGeometryJson,
			optimizerMetadataJson: routeRun.optimizerMetadataJson
		})
		.from(routeRun)
		.leftJoin(user, eq(routeRun.driverUserId, user.id))
		.where(eq(routeRun.runDate, runDate));

	if (runRows.length === 0) return [];

	const runIds = runRows.map((run) => run.id);
	const stopRows = await db
		.select({
			id: routeStop.id,
			routeRunId: routeStop.routeRunId,
			sequence: routeStop.sequence,
			zoneId: routeStop.zoneId,
			zoneName: zone.name,
			sourceReportId: routeStop.sourceReportId,
			latitude: routeStop.latitude,
			longitude: routeStop.longitude,
			status: routeStop.status
		})
		.from(routeStop)
		.leftJoin(zone, eq(routeStop.zoneId, zone.id))
		.where(inArray(routeStop.routeRunId, runIds))
		.orderBy(routeStop.sequence);

	const stopStatsByRun = new Map<number, { total: number; completed: number; skipped: number }>();
	const stopsByRun = new Map<DispatchRun['id'], DispatchRun['stops']>();

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

		const runStops = stopsByRun.get(stop.routeRunId) ?? [];
		runStops.push({
			id: stop.id,
			sequence: stop.sequence,
			zoneId: stop.zoneId,
			zoneName: stop.zoneName ?? null,
			sourceReportId: stop.sourceReportId,
			latitude: stop.latitude,
			longitude: stop.longitude,
			status: stop.status
		});
		stopsByRun.set(stop.routeRunId, runStops);
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
				createdAt: run.createdAt,
				routeGeometry: parseJson<RouteGeometry>(run.routeGeometryJson),
				optimizerMetadata: parseJson<RouteMetadata>(run.optimizerMetadataJson),
				stops: stopsByRun.get(run.id) ?? []
			} as DispatchRun;
		})
		.sort((a, b) => b.createdAt - a.createdAt);
}

export async function assignDispatchRun(input: { runId: number; driverUserId: string | null }) {
	const [run] = await db.select().from(routeRun).where(eq(routeRun.id, input.runId)).limit(1);
	if (!run) throw error(404, 'Route run not found');
	if (run.status !== 'planned') throw error(400, 'Only planned runs can be reassigned.');

	if (input.driverUserId) {
		await getAvailableDriverOrThrow(input.driverUserId);
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

export async function dispatchCitizenReport(input: {
	reportId: number;
	driverUserId: string;
	zoneId?: number | null;
	runDate?: string;
}) {
	const runDate = input.runDate ?? toYmdDate();
	const [report] = await db
		.select()
		.from(citizenReport)
		.where(eq(citizenReport.id, input.reportId))
		.limit(1);

	if (!report) throw error(404, 'Citizen report not found.');
	if (report.status === 'resolved') throw error(400, 'This report is already resolved.');
	if (report.status === 'rejected') throw error(400, 'Rejected reports cannot be dispatched.');
	if (report.status === 'deleted') throw error(400, 'Deleted reports cannot be dispatched.');

	const driver = await getAvailableDriverOrThrow(input.driverUserId);
	const resolvedZoneId =
		input.zoneId ??
		report.zoneId ??
		(await resolveZoneFromCoordinates(report.latitude, report.longitude))?.zoneId ??
		null;

	if (!resolvedZoneId) {
		throw error(400, 'Assign a zone before dispatching this report.');
	}

	const [zoneRow] = await db.select().from(zone).where(eq(zone.id, resolvedZoneId)).limit(1);
	if (!zoneRow) throw error(400, 'Selected zone does not exist.');

	const [existingAssignedStop] = await db
		.select({
			runId: routeRun.id,
			status: routeRun.status,
			driverUserId: routeRun.driverUserId,
			runDate: routeRun.runDate
		})
		.from(routeStop)
		.innerJoin(routeRun, eq(routeStop.routeRunId, routeRun.id))
		.where(eq(routeStop.sourceReportId, report.id))
		.orderBy(desc(routeRun.createdAt))
		.limit(1);

	if (existingAssignedStop?.status === 'in_progress') {
		throw error(400, 'This report is already on a run that is in progress.');
	}

	const baseConditions = [
		eq(routeRun.runDate, runDate),
		eq(routeRun.status, 'planned'),
		eq(routeRun.driverUserId, driver.userId)
	];
	if (zoneRow.wardId !== null) {
		baseConditions.push(eq(routeRun.wardId, zoneRow.wardId));
	}

	let plannedRun =
		(
			await db
				.select()
				.from(routeRun)
				.where(and(...baseConditions))
				.orderBy(desc(routeRun.createdAt))
				.limit(1)
		)[0] ??
		null;

	if (
		!plannedRun &&
		existingAssignedStop?.status === 'planned' &&
		existingAssignedStop.runDate === runDate &&
		existingAssignedStop.driverUserId === driver.userId
	) {
		plannedRun =
			(
				await db.select().from(routeRun).where(eq(routeRun.id, existingAssignedStop.runId)).limit(1)
			)[0] ?? null;
	}

	let runId = plannedRun?.id ?? null;

	if (!runId) {
		const [createdRun] = await db
			.insert(routeRun)
			.values({
				runDate,
				wardId: zoneRow.wardId,
				driverUserId: driver.userId,
				status: 'planned',
				plannedDistanceKm: 0,
				estimatedDurationMinutes: 0,
				updatedAt: Date.now()
			})
			.returning();
		runId = createdRun.id;
	}

	if (existingAssignedStop && existingAssignedStop.runId !== runId) {
		await syncPlannedRunAfterRemovingReport(existingAssignedStop.runId, report.id);
	}

	const existingStops = await db
		.select()
		.from(routeStop)
		.where(eq(routeStop.routeRunId, runId))
		.orderBy(routeStop.sequence);
	const stopInputs = existingStops.map((stop) => ({
		zoneId: stop.sourceReportId === report.id ? zoneRow.id : stop.zoneId,
		sourceReportId: stop.sourceReportId as number,
		latitude: stop.latitude,
		longitude: stop.longitude,
		label: stop.sourceReportId === report.id ? zoneRow.name : `Report ${stop.sourceReportId ?? stop.id}`
	}));
	const alreadyIncluded = stopInputs.some((stop) => stop.sourceReportId === report.id);
	if (!alreadyIncluded) {
		stopInputs.push({
			zoneId: zoneRow.id,
			sourceReportId: report.id,
			latitude: report.latitude,
			longitude: report.longitude,
			label: zoneRow.name
		});
	}

	const updatedRun = await rebuildPlannedRunRoute({
		runId,
		wardId: zoneRow.wardId,
		driverUserId: driver.userId,
		stops: stopInputs
	});

	await db
		.update(citizenReport)
		.set({
			zoneId: zoneRow.id,
			status: 'in_review',
			updatedAt: Date.now()
		})
		.where(eq(citizenReport.id, report.id));

	return {
		reportId: report.id,
		runId: updatedRun.id,
		runDate: updatedRun.runDate,
		driverUserId: driver.userId,
		driverName: driver.name,
		zoneId: zoneRow.id,
		zoneName: zoneRow.name,
		status: 'in_review' as const
	};
}
