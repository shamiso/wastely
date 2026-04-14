export type ZoneForecastFeature = {
	zoneId: number;
	zoneName: string;
	openReports: number;
	inReviewReports: number;
	recentReports7d: number;
	roadIssues7d: number;
	severeRoadIssues7d: number;
	congestionScore: number;
	historicalAverageVolumeKg: number;
	historicalSamples: number;
	missedPickupsScore: number;
	summaryIssueScore: number;
};

export type ZoneForecastPrediction = {
	zoneId: number;
	zoneName: string;
	score: number;
	predictedVolumeKg: number;
	confidence: number;
	modelSource: string;
	modelVersion: string;
};

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function predictWasteVolumeHeuristic(feature: ZoneForecastFeature): ZoneForecastPrediction {
	const baseline = feature.historicalAverageVolumeKg > 0 ? feature.historicalAverageVolumeKg : 110;
	const predictedVolumeKg =
		baseline * 0.58 +
		feature.openReports * 52 +
		feature.inReviewReports * 23 +
		feature.recentReports7d * 6.5 +
		feature.roadIssues7d * 14 +
		feature.severeRoadIssues7d * 21 +
		feature.congestionScore * 1.9 +
		feature.missedPickupsScore * 12 +
		feature.summaryIssueScore * 0.42;

	const confidence =
		0.34 +
		Math.min(feature.historicalSamples, 10) * 0.042 +
		Math.min(feature.openReports + feature.inReviewReports, 8) * 0.03 +
		Math.min(feature.roadIssues7d, 5) * 0.018;
	const score =
		feature.openReports * 9 +
		feature.severeRoadIssues7d * 7 +
		feature.congestionScore * 0.85 +
		predictedVolumeKg / 38;

	return {
		zoneId: feature.zoneId,
		zoneName: feature.zoneName,
		score: Number(score.toFixed(2)),
		predictedVolumeKg: Number(Math.max(40, predictedVolumeKg).toFixed(1)),
		confidence: Number(clamp(confidence, 0.35, 0.97).toFixed(3)),
		modelSource: 'heuristic',
		modelVersion: 'heuristic-v2'
	};
}
