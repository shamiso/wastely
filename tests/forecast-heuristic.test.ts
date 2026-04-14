import test from 'node:test';
import assert from 'node:assert/strict';
import { predictWasteVolumeHeuristic } from '../src/lib/domain/forecast.ts';

test('forecast heuristic scales with higher operational pressure', () => {
	const quietZone = predictWasteVolumeHeuristic({
		zoneId: 1,
		zoneName: 'Quiet',
		openReports: 1,
		inReviewReports: 0,
		recentReports7d: 2,
		roadIssues7d: 0,
		severeRoadIssues7d: 0,
		congestionScore: 8,
		historicalAverageVolumeKg: 140,
		historicalSamples: 6,
		missedPickupsScore: 0,
		summaryIssueScore: 10
	});

	const pressuredZone = predictWasteVolumeHeuristic({
		zoneId: 2,
		zoneName: 'Pressured',
		openReports: 7,
		inReviewReports: 4,
		recentReports7d: 9,
		roadIssues7d: 5,
		severeRoadIssues7d: 2,
		congestionScore: 34,
		historicalAverageVolumeKg: 140,
		historicalSamples: 6,
		missedPickupsScore: 3,
		summaryIssueScore: 36
	});

	assert.ok(pressuredZone.predictedVolumeKg > quietZone.predictedVolumeKg);
	assert.ok(pressuredZone.score > quietZone.score);
	assert.equal(quietZone.modelSource, 'heuristic');
	assert.ok(quietZone.confidence >= 0.35 && quietZone.confidence <= 0.97);
});
