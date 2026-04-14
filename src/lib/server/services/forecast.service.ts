import { env } from '$env/dynamic/private';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { predictWasteVolumeHeuristic, type ZoneForecastFeature } from '$lib/domain/forecast';
import { db } from '$lib/server/db';
import { citizenReport, driverEventLog, routeStop, wasteForecast, zone } from '$lib/server/db/schema';
import { toYmdDate } from '$lib/server/services/date.service';
import { getZoneOperationalSignals } from '$lib/server/services/intelligence.service';

export type ZoneDemand = {
	zoneId: number;
	zoneName: string;
	score: number;
	predictedVolumeKg: number;
	confidence: number;
	modelSource: string;
	modelVersion: string;
};

type MlPrediction = {
	zoneId: number;
	predictedVolumeKg: number;
	confidence: number;
	modelSource?: string;
	modelVersion?: string;
};

type TrainingDatasetRow = {
	zoneId: number;
	zoneName: string;
	date: string;
	features: ZoneForecastFeature;
	actualVolumeKg: number;
};

function scorePrediction(feature: ZoneForecastFeature, predictedVolumeKg: number) {
	return Number(
		(
			feature.openReports * 9 +
			feature.severeRoadIssues7d * 7 +
			feature.congestionScore * 0.85 +
			predictedVolumeKg / 38
		).toFixed(2)
	);
}

function parseSummaryPayload(payloadJson: string | null) {
	if (!payloadJson) return {};

	try {
		return JSON.parse(payloadJson) as {
			collectionVolumeKg?: number;
		};
	} catch {
		return {};
	}
}

export async function buildZoneForecastFeatures(): Promise<ZoneForecastFeature[]> {
	const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

	const [reportCounts, recentCounts, zones, operationalSignals] = await Promise.all([
		db
			.select({
				zoneId: citizenReport.zoneId,
				status: citizenReport.status,
				count: sql<number>`count(*)`
			})
			.from(citizenReport)
			.groupBy(citizenReport.zoneId, citizenReport.status),
		db
			.select({
				zoneId: citizenReport.zoneId,
				count: sql<number>`count(*)`
			})
			.from(citizenReport)
			.where(gte(citizenReport.createdAt, sevenDaysAgo))
			.groupBy(citizenReport.zoneId),
		db.select().from(zone),
		getZoneOperationalSignals()
	]);

	const statusCountsByZone = new Map<number, { openReports: number; inReviewReports: number }>();
	for (const row of reportCounts) {
		if (row.zoneId === null) continue;
		const current = statusCountsByZone.get(row.zoneId) ?? { openReports: 0, inReviewReports: 0 };
		if (row.status === 'open') current.openReports = Number(row.count);
		if (row.status === 'in_review') current.inReviewReports = Number(row.count);
		statusCountsByZone.set(row.zoneId, current);
	}

	const recentCountsByZone = new Map<number, number>();
	for (const row of recentCounts) {
		if (row.zoneId === null) continue;
		recentCountsByZone.set(row.zoneId, Number(row.count));
	}

	const signalByZone = new Map(operationalSignals.map((signal) => [signal.zoneId, signal]));

	return zones.map((currentZone) => {
		const counts = statusCountsByZone.get(currentZone.id) ?? { openReports: 0, inReviewReports: 0 };
		const signal = signalByZone.get(currentZone.id);
		return {
			zoneId: currentZone.id,
			zoneName: currentZone.name,
			openReports: counts.openReports,
			inReviewReports: counts.inReviewReports,
			recentReports7d: recentCountsByZone.get(currentZone.id) ?? 0,
			roadIssues7d: signal?.roadIssues7d ?? 0,
			severeRoadIssues7d: signal?.severeRoadIssues7d ?? 0,
			congestionScore: signal?.congestionScore ?? 0,
			historicalAverageVolumeKg:
				signal?.historicalAverageVolumeKg && signal.historicalAverageVolumeKg > 0
					? signal.historicalAverageVolumeKg
					: 120,
			historicalSamples: signal?.historicalSamples ?? 0,
			missedPickupsScore: signal?.missedPickupsScore ?? 0,
			summaryIssueScore: signal?.summaryIssueScore ?? 0
		};
	});
}

async function requestMlForecasts(features: ZoneForecastFeature[]): Promise<Map<number, MlPrediction> | null> {
	if (!env.ML_SERVICE_URL) return null;

	try {
		const response = await fetch(`${env.ML_SERVICE_URL.replace(/\/+$/, '')}/predict`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(env.ML_SERVICE_TOKEN ? { authorization: `Bearer ${env.ML_SERVICE_TOKEN}` } : {})
			},
			body: JSON.stringify({
				features
			})
		});

		if (!response.ok) return null;

		const payload = (await response.json()) as {
			predictions?: MlPrediction[];
		};

		if (!Array.isArray(payload.predictions)) return null;
		return new Map(
			payload.predictions
				.filter((prediction) => Number.isFinite(prediction.zoneId))
				.map((prediction) => [prediction.zoneId, prediction])
		);
	} catch {
		return null;
	}
}

export async function refreshZoneForecasts(forecastDate = toYmdDate()): Promise<ZoneDemand[]> {
	const features = await buildZoneForecastFeatures();
	const mlPredictions = await requestMlForecasts(features);
	const forecasts: ZoneDemand[] = [];

	for (const feature of features) {
		const heuristicPrediction = predictWasteVolumeHeuristic(feature);
		const mlPrediction = mlPredictions?.get(feature.zoneId);
		const predictedVolumeKg = Number(
			(mlPrediction?.predictedVolumeKg ?? heuristicPrediction.predictedVolumeKg).toFixed(1)
		);
		const confidence = Number((mlPrediction?.confidence ?? heuristicPrediction.confidence).toFixed(3));
		const modelSource = mlPrediction?.modelSource ?? heuristicPrediction.modelSource;
		const modelVersion = mlPrediction?.modelVersion ?? heuristicPrediction.modelVersion;
		const score = mlPrediction
			? scorePrediction(feature, predictedVolumeKg)
			: heuristicPrediction.score;

		await db
			.insert(wasteForecast)
			.values({
				zoneId: feature.zoneId,
				forecastDate,
				predictedVolumeKg,
				confidence,
				modelSource,
				modelVersion
			})
			.onConflictDoUpdate({
				target: [wasteForecast.zoneId, wasteForecast.forecastDate],
				set: {
					predictedVolumeKg,
					confidence,
					modelSource,
					modelVersion,
					createdAt: Date.now()
				}
			});

		forecasts.push({
			zoneId: feature.zoneId,
			zoneName: feature.zoneName,
			score,
			predictedVolumeKg,
			confidence,
			modelSource,
			modelVersion
		});
	}

	return forecasts.sort((a, b) => b.score - a.score);
}

export async function buildForecastTrainingDataset(days = 30): Promise<TrainingDatasetRow[]> {
	const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
	const features = await buildZoneForecastFeatures();
	const featureByZone = new Map(features.map((feature) => [feature.zoneId, feature]));

	const summaryRows = await db
		.select({
			runId: driverEventLog.routeRunId,
			payloadJson: driverEventLog.payloadJson,
			createdAt: driverEventLog.createdAt
		})
		.from(driverEventLog)
		.where(and(eq(driverEventLog.eventType, 'run_summary'), gte(driverEventLog.createdAt, cutoff)));

	const runIds = summaryRows
		.map((row) => row.runId)
		.filter((runId): runId is number => typeof runId === 'number');
	const stops =
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

	const dataset: TrainingDatasetRow[] = [];

	const stopsByRun = new Map<number, Array<{ zoneId: number | null }>>();
	for (const stop of stops) {
		if (stop.status !== 'done') continue;
		const current = stopsByRun.get(stop.runId) ?? [];
		current.push({ zoneId: stop.zoneId });
		stopsByRun.set(stop.runId, current);
	}

	for (const row of summaryRows) {
		if (!row.runId) continue;
		const payload = parseSummaryPayload(row.payloadJson);
		const totalVolume = typeof payload.collectionVolumeKg === 'number' ? payload.collectionVolumeKg : 0;
		const runStops = (stopsByRun.get(row.runId) ?? []).filter(
			(stop): stop is { zoneId: number } => stop.zoneId !== null
		);
		if (totalVolume <= 0 || runStops.length === 0) continue;

		const zoneStopCounts = new Map<number, number>();
		for (const stop of runStops) {
			zoneStopCounts.set(stop.zoneId, (zoneStopCounts.get(stop.zoneId) ?? 0) + 1);
		}

		for (const [zoneId, stopCount] of zoneStopCounts) {
			const feature = featureByZone.get(zoneId);
			if (!feature) continue;
			dataset.push({
				zoneId,
				zoneName: feature.zoneName,
				date: new Date(row.createdAt).toISOString().slice(0, 10),
				features: feature,
				actualVolumeKg: Number(((totalVolume * stopCount) / runStops.length).toFixed(1))
			});
		}
	}

	if (dataset.length > 0) return dataset;

	return features.map((feature) => ({
		zoneId: feature.zoneId,
		zoneName: feature.zoneName,
		date: toYmdDate(),
		features: feature,
		actualVolumeKg: predictWasteVolumeHeuristic(feature).predictedVolumeKg
	}));
}
