import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	citizenReport,
	driverEventLog,
	reportPhoto,
	roadConditionReport,
	routeRun,
	routeStop,
	user,
	zone
} from '$lib/server/db/schema';

export type DriverLogEntry = {
	id: string;
	type: 'run_summary' | 'road_condition';
	driverUserId: string;
	runId: number | null;
	zoneId: number | null;
	zoneName: string | null;
	issueType: string | null;
	severity: 'low' | 'medium' | 'high' | null;
	trafficLevel: 'light' | 'moderate' | 'heavy' | 'standstill' | null;
	estimatedDelayMinutes: number | null;
	collectionVolumeKg: number | null;
	summary: string;
	createdAt: number;
};

export type CitizenReportMapSnapshot = {
	totalReports: number;
	openReports: number;
	inReviewReports: number;
	resolvedReports: number;
	pins: Array<{
		id: number;
		category: string;
		status: string;
		description: string;
		latitude: number;
		longitude: number;
		zoneId: number | null;
		zoneName: string | null;
		createdAt: number;
	}>;
	volumesByZone: Array<{
		zoneId: number | null;
		zoneName: string;
		reportCount: number;
		openCount: number;
		resolvedCount: number;
	}>;
};

export type DatasetHealth = {
	totalCitizenReports: number;
	totalDriverLogs: number;
	totalRoadIssues: number;
	totalRunSummaries: number;
	totalIntegratedRecords: number;
	zoneCoveragePct: number;
	photoCoveragePct: number;
	summaryCoveragePct: number;
	recordsLast7Days: number;
	dailyUpdateFrequency: number;
	lastCitizenReportAt: number | null;
	lastDriverLogAt: number | null;
};

export type ZoneOperationalSignal = {
	zoneId: number;
	historicalAverageVolumeKg: number;
	historicalSamples: number;
	roadRiskScore: number;
	congestionScore: number;
	roadIssues7d: number;
	severeRoadIssues7d: number;
	missedPickupsScore: number;
	summaryIssueScore: number;
};

export type DriverRouteInsight = {
	runId: number;
	driverUserId: string | null;
	driverName: string | null;
	runDate: string;
	status: string;
	plannedDistanceKm: number;
	estimatedDurationMinutes: number;
	elapsedMinutes: number;
	routeGeometry: {
		type: 'LineString';
		coordinates: Array<[number, number]>;
	} | null;
	stops: Array<{
		id: number;
		sequence: number;
		status: string;
		latitude: number;
		longitude: number;
		zoneId: number | null;
		zoneName: string | null;
		notes: string | null;
	}>;
	roadIssues: Array<{
		id: number;
		issueType: string;
		severity: string;
		trafficLevel: string;
		description: string;
		startLabel: string | null;
		endLabel: string | null;
		startLatitude: number | null;
		startLongitude: number | null;
		endLatitude: number | null;
		endLongitude: number | null;
		latitude: number | null;
		longitude: number | null;
		estimatedDelayMinutes: number;
		createdAt: number;
	}>;
	summary: RunSummaryPayload | null;
};

type RunSummaryPayload = {
	collectionVolumeKg?: number;
	issues?: string;
	delays?: string;
	roadConditions?: string;
	missedPickups?: number;
};

function toNumber(value: unknown): number {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') return Number(value);
	return 0;
}

function parsePayload(payloadJson: string | null): RunSummaryPayload {
	if (!payloadJson) return {};

	try {
		return JSON.parse(payloadJson) as RunSummaryPayload;
	} catch {
		return {};
	}
}

function parseRouteGeometry(payloadJson: string | null) {
	if (!payloadJson) return null;

	try {
		const parsed = JSON.parse(payloadJson) as {
			type?: 'LineString';
			coordinates?: Array<[number, number]>;
		};
		if (parsed.type !== 'LineString' || !Array.isArray(parsed.coordinates)) return null;
		return {
			type: 'LineString' as const,
			coordinates: parsed.coordinates
		};
	} catch {
		return null;
	}
}

function buildSummaryText(payload: RunSummaryPayload): string {
	const parts = [
		payload.issues?.trim(),
		payload.delays?.trim(),
		payload.roadConditions?.trim(),
		payload.missedPickups ? `Missed pickups: ${payload.missedPickups}` : null
	].filter(Boolean);

	return parts.join(' | ') || 'Run summary submitted.';
}

function getDominantZone(stops: Array<{ zoneId: number | null; zoneName: string | null }>) {
	const counts = new Map<number, { zoneName: string | null; count: number }>();

	for (const stop of stops) {
		if (stop.zoneId === null) continue;
		const current = counts.get(stop.zoneId);
		if (current) {
			current.count += 1;
			continue;
		}
		counts.set(stop.zoneId, {
			zoneName: stop.zoneName,
			count: 1
		});
	}

	let dominant: { zoneId: number; zoneName: string | null; count: number } | null = null;
	for (const [zoneId, entry] of counts) {
		if (!dominant || entry.count > dominant.count) {
			dominant = {
				zoneId,
				zoneName: entry.zoneName,
				count: entry.count
			};
		}
	}

	return dominant;
}

export async function listRecentDriverLogs(limit = 12): Promise<DriverLogEntry[]> {
	const roadLogs = await db
		.select({
			id: roadConditionReport.id,
			driverUserId: roadConditionReport.reporterUserId,
			zoneId: roadConditionReport.zoneId,
			zoneName: zone.name,
			issueType: roadConditionReport.issueType,
			severity: roadConditionReport.severity,
			trafficLevel: roadConditionReport.trafficLevel,
			description: roadConditionReport.description,
			estimatedDelayMinutes: roadConditionReport.estimatedDelayMinutes,
			createdAt: roadConditionReport.createdAt
		})
		.from(roadConditionReport)
		.leftJoin(zone, eq(roadConditionReport.zoneId, zone.id))
		.orderBy(desc(roadConditionReport.createdAt))
		.limit(limit);

	const runSummaryRows = await db
		.select({
			id: driverEventLog.id,
			runId: driverEventLog.routeRunId,
			driverUserId: driverEventLog.driverUserId,
			payloadJson: driverEventLog.payloadJson,
			createdAt: driverEventLog.createdAt
		})
		.from(driverEventLog)
		.where(eq(driverEventLog.eventType, 'run_summary'))
		.orderBy(desc(driverEventLog.createdAt))
		.limit(limit);

	const runIds = runSummaryRows
		.map((row) => row.runId)
		.filter((value): value is number => typeof value === 'number');

	const stopRows =
		runIds.length > 0
			? await db
					.select({
						runId: routeStop.routeRunId,
						zoneId: routeStop.zoneId,
						zoneName: zone.name
					})
					.from(routeStop)
					.leftJoin(zone, eq(routeStop.zoneId, zone.id))
					.where(inArray(routeStop.routeRunId, runIds))
			: [];

	const stopsByRun = new Map<number, Array<{ zoneId: number | null; zoneName: string | null }>>();
	for (const stop of stopRows) {
		const existing = stopsByRun.get(stop.runId) ?? [];
		existing.push({
			zoneId: stop.zoneId,
			zoneName: stop.zoneName
		});
		stopsByRun.set(stop.runId, existing);
	}

	const summaryLogs: DriverLogEntry[] = runSummaryRows.map((row) => {
		const payload = parsePayload(row.payloadJson);
		const dominantZone = row.runId ? getDominantZone(stopsByRun.get(row.runId) ?? []) : null;

		return {
			id: `summary-${row.id}`,
			type: 'run_summary',
			driverUserId: row.driverUserId,
			runId: row.runId ?? null,
			zoneId: dominantZone?.zoneId ?? null,
			zoneName: dominantZone?.zoneName ?? null,
			issueType: null,
			severity: null,
			trafficLevel: null,
			estimatedDelayMinutes: null,
			collectionVolumeKg:
				typeof payload.collectionVolumeKg === 'number' ? payload.collectionVolumeKg : null,
			summary: buildSummaryText(payload),
			createdAt: row.createdAt
		};
	});

	const roadConditionLogs: DriverLogEntry[] = roadLogs.map((row) => ({
		id: `road-${row.id}`,
		type: 'road_condition',
		driverUserId: row.driverUserId,
		runId: null,
			zoneId: row.zoneId,
			zoneName: row.zoneName ?? null,
			issueType: row.issueType,
			severity: row.severity as 'low' | 'medium' | 'high',
			trafficLevel: row.trafficLevel as 'light' | 'moderate' | 'heavy' | 'standstill',
			estimatedDelayMinutes: row.estimatedDelayMinutes,
			collectionVolumeKg: null,
			summary: row.description,
			createdAt: row.createdAt
		}));

	return [...summaryLogs, ...roadConditionLogs]
		.sort((a, b) => b.createdAt - a.createdAt)
		.slice(0, limit);
}

export async function getDatasetHealth(): Promise<DatasetHealth> {
	const windowStart = Date.now() - 7 * 24 * 60 * 60 * 1000;

	const [reportStats] = await db
		.select({
			total: sql<number>`count(*)`,
			withZone: sql<number>`sum(case when ${citizenReport.zoneId} is not null then 1 else 0 end)`,
			lastUpdatedAt: sql<number>`max(${citizenReport.updatedAt})`
		})
		.from(citizenReport);

	const [photoStats] = await db
		.select({
			total: sql<number>`count(distinct ${reportPhoto.reportId})`
		})
		.from(reportPhoto);

	const [driverLogStats] = await db
		.select({
			total: sql<number>`count(*)`,
			lastCreatedAt: sql<number>`max(${driverEventLog.createdAt})`
		})
		.from(driverEventLog);

	const [roadIssueStats] = await db
		.select({
			total: sql<number>`count(*)`
		})
		.from(roadConditionReport);

	const [runSummaryStats] = await db
		.select({
			total: sql<number>`count(*)`
		})
		.from(driverEventLog)
		.where(eq(driverEventLog.eventType, 'run_summary'));

	const [completedRunStats] = await db
		.select({
			total: sql<number>`count(*)`
		})
		.from(routeRun)
		.where(eq(routeRun.status, 'completed'));

	const [recentCitizenStats] = await db
		.select({
			total: sql<number>`count(*)`
		})
		.from(citizenReport)
		.where(gte(citizenReport.createdAt, windowStart));

	const [recentDriverStats] = await db
		.select({
			total: sql<number>`count(*)`
		})
		.from(driverEventLog)
		.where(gte(driverEventLog.createdAt, windowStart));

	const totalCitizenReports = toNumber(reportStats?.total);
	const totalDriverLogs = toNumber(driverLogStats?.total);
	const totalRoadIssues = toNumber(roadIssueStats?.total);
	const totalRunSummaries = toNumber(runSummaryStats?.total);
	const completedRuns = toNumber(completedRunStats?.total);
	const reportsWithZone = toNumber(reportStats?.withZone);
	const reportsWithPhoto = toNumber(photoStats?.total);
	const recordsLast7Days = toNumber(recentCitizenStats?.total) + toNumber(recentDriverStats?.total);

	return {
		totalCitizenReports,
		totalDriverLogs,
		totalRoadIssues,
		totalRunSummaries,
		totalIntegratedRecords: totalCitizenReports + totalDriverLogs + totalRoadIssues,
		zoneCoveragePct: totalCitizenReports === 0 ? 0 : (reportsWithZone / totalCitizenReports) * 100,
		photoCoveragePct: totalCitizenReports === 0 ? 0 : (reportsWithPhoto / totalCitizenReports) * 100,
		summaryCoveragePct: completedRuns === 0 ? 0 : (totalRunSummaries / completedRuns) * 100,
		recordsLast7Days,
		dailyUpdateFrequency: Number((recordsLast7Days / 7).toFixed(2)),
		lastCitizenReportAt: reportStats?.lastUpdatedAt ? toNumber(reportStats.lastUpdatedAt) : null,
		lastDriverLogAt: driverLogStats?.lastCreatedAt ? toNumber(driverLogStats.lastCreatedAt) : null
	};
}

export async function getCitizenReportMapSnapshot(): Promise<CitizenReportMapSnapshot> {
	const rows = await db
		.select({
			id: citizenReport.id,
			category: citizenReport.category,
			status: citizenReport.status,
			description: citizenReport.description,
			latitude: citizenReport.latitude,
			longitude: citizenReport.longitude,
			zoneId: citizenReport.zoneId,
			zoneName: zone.name,
			createdAt: citizenReport.createdAt
		})
		.from(citizenReport)
		.leftJoin(zone, eq(citizenReport.zoneId, zone.id))
		.orderBy(desc(citizenReport.createdAt));

	const volumes = new Map<
		string,
		{ zoneId: number | null; zoneName: string; reportCount: number; openCount: number; resolvedCount: number }
	>();

	for (const row of rows) {
		const key = `${row.zoneId ?? 'unassigned'}:${row.zoneName ?? 'Unassigned'}`;
		const current = volumes.get(key) ?? {
			zoneId: row.zoneId,
			zoneName: row.zoneName ?? 'Unassigned',
			reportCount: 0,
			openCount: 0,
			resolvedCount: 0
		};
		current.reportCount += 1;
		if (row.status === 'resolved') current.resolvedCount += 1;
		if (row.status === 'open' || row.status === 'in_review') current.openCount += 1;
		volumes.set(key, current);
	}

	return {
		totalReports: rows.length,
		openReports: rows.filter((row) => row.status === 'open').length,
		inReviewReports: rows.filter((row) => row.status === 'in_review').length,
		resolvedReports: rows.filter((row) => row.status === 'resolved').length,
		pins: rows,
		volumesByZone: [...volumes.values()].sort((a, b) => b.reportCount - a.reportCount)
	};
}

export async function getZoneOperationalSignals(): Promise<ZoneOperationalSignal[]> {
	const recentWindowStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
	const recentRoadIssues = await db
		.select({
			zoneId: roadConditionReport.zoneId,
			severity: roadConditionReport.severity,
			trafficLevel: roadConditionReport.trafficLevel,
			estimatedDelayMinutes: roadConditionReport.estimatedDelayMinutes,
			createdAt: roadConditionReport.createdAt
		})
		.from(roadConditionReport);

	const summaryRows = await db
		.select({
			runId: driverEventLog.routeRunId,
			payloadJson: driverEventLog.payloadJson
		})
		.from(driverEventLog)
		.where(eq(driverEventLog.eventType, 'run_summary'));

	const runIds = summaryRows
		.map((row) => row.runId)
		.filter((value): value is number => typeof value === 'number');

	const stopRows =
		runIds.length > 0
			? await db
					.select({
						runId: routeStop.routeRunId,
						zoneId: routeStop.zoneId,
						status: routeStop.status
					})
					.from(routeStop)
					.where(inArray(routeStop.routeRunId, runIds))
			: [];

	const doneStopsByRun = new Map<number, Array<{ zoneId: number | null }>>();
	for (const stop of stopRows) {
		if (stop.status !== 'done') continue;
		const existing = doneStopsByRun.get(stop.runId) ?? [];
		existing.push({ zoneId: stop.zoneId });
		doneStopsByRun.set(stop.runId, existing);
	}

	const roadRiskByZone = new Map<number, number>();
	const congestionScoreByZone = new Map<number, number>();
	const recentRoadIssueCountByZone = new Map<number, number>();
	const severeRoadIssueCountByZone = new Map<number, number>();
	for (const issue of recentRoadIssues) {
		if (issue.zoneId === null) continue;
		const current = roadRiskByZone.get(issue.zoneId) ?? 0;
		const severityWeight = issue.severity === 'high' ? 30 : issue.severity === 'medium' ? 18 : 8;
		const trafficWeight =
			issue.trafficLevel === 'standstill'
				? 28
				: issue.trafficLevel === 'heavy'
					? 18
					: issue.trafficLevel === 'moderate'
						? 10
						: 4;
		const delayWeight = Math.min(issue.estimatedDelayMinutes, 45);
		const increment = severityWeight + trafficWeight + delayWeight;
		roadRiskByZone.set(issue.zoneId, current + increment);
		congestionScoreByZone.set(
			issue.zoneId,
			(congestionScoreByZone.get(issue.zoneId) ?? 0) + trafficWeight + delayWeight * 0.8
		);

		if (issue.createdAt >= recentWindowStart) {
			recentRoadIssueCountByZone.set(
				issue.zoneId,
				(recentRoadIssueCountByZone.get(issue.zoneId) ?? 0) + 1
			);
			if (issue.severity === 'high') {
				severeRoadIssueCountByZone.set(
					issue.zoneId,
					(severeRoadIssueCountByZone.get(issue.zoneId) ?? 0) + 1
				);
			}
		}
	}

	const volumeTotalsByZone = new Map<number, number>();
	const historicalSamplesByZone = new Map<number, number>();
	const summaryIssueScoreByZone = new Map<number, number>();
	const missedPickupsScoreByZone = new Map<number, number>();

	for (const row of summaryRows) {
		if (!row.runId) continue;
		const runStops = doneStopsByRun.get(row.runId) ?? [];
		const zonedStops = runStops.filter((stop) => stop.zoneId !== null) as Array<{ zoneId: number }>;
		if (zonedStops.length === 0) continue;

		const payload = parsePayload(row.payloadJson);
		const totalVolume = typeof payload.collectionVolumeKg === 'number' ? payload.collectionVolumeKg : 0;
		const issueWeight =
			(payload.missedPickups ?? 0) * 10 +
			(payload.issues?.trim() ? 12 : 0) +
			(payload.delays?.trim() ? 16 : 0) +
			(payload.roadConditions?.trim() ? 14 : 0);

		const zoneStopCounts = new Map<number, number>();
		for (const stop of zonedStops) {
			zoneStopCounts.set(stop.zoneId, (zoneStopCounts.get(stop.zoneId) ?? 0) + 1);
		}

		for (const [zoneId, stopCount] of zoneStopCounts) {
			const share = stopCount / zonedStops.length;
			if (totalVolume > 0) {
				volumeTotalsByZone.set(zoneId, (volumeTotalsByZone.get(zoneId) ?? 0) + totalVolume * share);
				historicalSamplesByZone.set(zoneId, (historicalSamplesByZone.get(zoneId) ?? 0) + 1);
			}
			if (issueWeight > 0) {
				summaryIssueScoreByZone.set(zoneId, (summaryIssueScoreByZone.get(zoneId) ?? 0) + issueWeight * share);
			}
			if ((payload.missedPickups ?? 0) > 0) {
				missedPickupsScoreByZone.set(
					zoneId,
					(missedPickupsScoreByZone.get(zoneId) ?? 0) + (payload.missedPickups ?? 0) * share
				);
			}
		}
	}

	const zoneIds = new Set<number>([
		...roadRiskByZone.keys(),
		...congestionScoreByZone.keys(),
		...recentRoadIssueCountByZone.keys(),
		...severeRoadIssueCountByZone.keys(),
		...volumeTotalsByZone.keys(),
		...missedPickupsScoreByZone.keys(),
		...summaryIssueScoreByZone.keys()
	]);

	return [...zoneIds].map((zoneId) => {
		const totalVolume = volumeTotalsByZone.get(zoneId) ?? 0;
		const historicalSamples = historicalSamplesByZone.get(zoneId) ?? 0;
		return {
			zoneId,
			historicalAverageVolumeKg:
				historicalSamples === 0 ? 0 : Number((totalVolume / historicalSamples).toFixed(2)),
			historicalSamples,
			roadRiskScore: Number((roadRiskByZone.get(zoneId) ?? 0).toFixed(2)),
			congestionScore: Number((congestionScoreByZone.get(zoneId) ?? 0).toFixed(2)),
			roadIssues7d: recentRoadIssueCountByZone.get(zoneId) ?? 0,
			severeRoadIssues7d: severeRoadIssueCountByZone.get(zoneId) ?? 0,
			missedPickupsScore: Number((missedPickupsScoreByZone.get(zoneId) ?? 0).toFixed(2)),
			summaryIssueScore: Number((summaryIssueScoreByZone.get(zoneId) ?? 0).toFixed(2))
		};
	});
}

export async function listDriverRouteInsights(limit = 8): Promise<DriverRouteInsight[]> {
	const runs = await db
		.select({
			id: routeRun.id,
			driverUserId: routeRun.driverUserId,
			driverName: user.name,
			runDate: routeRun.runDate,
			status: routeRun.status,
			plannedDistanceKm: routeRun.plannedDistanceKm,
			estimatedDurationMinutes: routeRun.estimatedDurationMinutes,
			startedAt: routeRun.startedAt,
			completedAt: routeRun.completedAt,
			routeGeometryJson: routeRun.routeGeometryJson
		})
		.from(routeRun)
		.leftJoin(user, eq(routeRun.driverUserId, user.id))
		.orderBy(desc(routeRun.createdAt))
		.limit(limit);

	if (runs.length === 0) return [];

	const runIds = runs.map((run) => run.id);
	const [stops, roadIssues, summaries] = await Promise.all([
		db
			.select({
				runId: routeStop.routeRunId,
				id: routeStop.id,
				sequence: routeStop.sequence,
				status: routeStop.status,
				latitude: routeStop.latitude,
				longitude: routeStop.longitude,
				zoneId: routeStop.zoneId,
				zoneName: zone.name,
				notes: routeStop.notes
			})
			.from(routeStop)
			.leftJoin(zone, eq(routeStop.zoneId, zone.id))
			.where(inArray(routeStop.routeRunId, runIds))
			.orderBy(asc(routeStop.sequence)),
		db
			.select({
				runId: roadConditionReport.routeRunId,
				id: roadConditionReport.id,
				issueType: roadConditionReport.issueType,
				severity: roadConditionReport.severity,
				trafficLevel: roadConditionReport.trafficLevel,
				description: roadConditionReport.description,
				startLabel: roadConditionReport.startLabel,
				endLabel: roadConditionReport.endLabel,
				startLatitude: roadConditionReport.startLatitude,
				startLongitude: roadConditionReport.startLongitude,
				endLatitude: roadConditionReport.endLatitude,
				endLongitude: roadConditionReport.endLongitude,
				latitude: roadConditionReport.latitude,
				longitude: roadConditionReport.longitude,
				estimatedDelayMinutes: roadConditionReport.estimatedDelayMinutes,
				createdAt: roadConditionReport.createdAt
			})
			.from(roadConditionReport)
			.where(inArray(roadConditionReport.routeRunId, runIds))
			.orderBy(desc(roadConditionReport.createdAt)),
		db
			.select({
				runId: driverEventLog.routeRunId,
				payloadJson: driverEventLog.payloadJson
			})
			.from(driverEventLog)
			.where(and(inArray(driverEventLog.routeRunId, runIds), eq(driverEventLog.eventType, 'run_summary')))
	]);

	const stopsByRun = new Map<number, DriverRouteInsight['stops']>();
	for (const stop of stops) {
		const current = stopsByRun.get(stop.runId) ?? [];
		current.push({
			id: stop.id,
			sequence: stop.sequence,
			status: stop.status,
			latitude: stop.latitude,
			longitude: stop.longitude,
			zoneId: stop.zoneId,
			zoneName: stop.zoneName ?? null,
			notes: stop.notes
		});
		stopsByRun.set(stop.runId, current);
	}

	const issuesByRun = new Map<number, DriverRouteInsight['roadIssues']>();
	for (const issue of roadIssues) {
		if (issue.runId === null) continue;
		const current = issuesByRun.get(issue.runId) ?? [];
		current.push({
			id: issue.id,
			issueType: issue.issueType,
			severity: issue.severity,
			trafficLevel: issue.trafficLevel,
			description: issue.description,
			startLabel: issue.startLabel,
			endLabel: issue.endLabel,
			startLatitude: issue.startLatitude,
			startLongitude: issue.startLongitude,
			endLatitude: issue.endLatitude,
			endLongitude: issue.endLongitude,
			latitude: issue.latitude,
			longitude: issue.longitude,
			estimatedDelayMinutes: issue.estimatedDelayMinutes,
			createdAt: issue.createdAt
		});
		issuesByRun.set(issue.runId, current);
	}

	const summaryByRun = new Map<number, RunSummaryPayload>();
	for (const summary of summaries) {
		if (summary.runId === null || summaryByRun.has(summary.runId)) continue;
		summaryByRun.set(summary.runId, parsePayload(summary.payloadJson));
	}

	return runs.map((run) => ({
		runId: run.id,
		driverUserId: run.driverUserId,
		driverName: run.driverName ?? null,
		runDate: run.runDate,
		status: run.status,
		plannedDistanceKm: run.plannedDistanceKm,
		estimatedDurationMinutes: run.estimatedDurationMinutes,
		elapsedMinutes: run.startedAt ? Number((((run.completedAt ?? Date.now()) - run.startedAt) / 60000).toFixed(2)) : 0,
		routeGeometry: parseRouteGeometry(run.routeGeometryJson),
		stops: stopsByRun.get(run.id) ?? [],
		roadIssues: issuesByRun.get(run.id) ?? [],
		summary: summaryByRun.get(run.id) ?? null
	}));
}
