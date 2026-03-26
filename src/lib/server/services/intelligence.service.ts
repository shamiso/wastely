import { desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	citizenReport,
	driverEventLog,
	reportPhoto,
	roadConditionReport,
	routeRun,
	routeStop,
	zone
} from '$lib/server/db/schema';

export type DriverLogEntry = {
	id: string;
	type: 'run_summary' | 'road_condition';
	driverUserId: string;
	runId: number | null;
	zoneId: number | null;
	zoneName: string | null;
	severity: 'low' | 'medium' | 'high' | null;
	collectionVolumeKg: number | null;
	summary: string;
	createdAt: number;
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
	summaryIssueScore: number;
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
			severity: roadConditionReport.severity,
			description: roadConditionReport.description,
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
			severity: null,
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
		severity: row.severity as 'low' | 'medium' | 'high',
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

export async function getZoneOperationalSignals(): Promise<ZoneOperationalSignal[]> {
	const recentRoadIssues = await db
		.select({
			zoneId: roadConditionReport.zoneId,
			severity: roadConditionReport.severity
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
	for (const issue of recentRoadIssues) {
		if (issue.zoneId === null) continue;
		const current = roadRiskByZone.get(issue.zoneId) ?? 0;
		const increment = issue.severity === 'high' ? 30 : issue.severity === 'medium' ? 18 : 8;
		roadRiskByZone.set(issue.zoneId, current + increment);
	}

	const volumeTotalsByZone = new Map<number, number>();
	const historicalSamplesByZone = new Map<number, number>();
	const summaryIssueScoreByZone = new Map<number, number>();

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
		}
	}

	const zoneIds = new Set<number>([
		...roadRiskByZone.keys(),
		...volumeTotalsByZone.keys(),
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
			summaryIssueScore: Number((summaryIssueScoreByZone.get(zoneId) ?? 0).toFixed(2))
		};
	});
}
