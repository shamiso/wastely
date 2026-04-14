import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateLegTravel, optimizeRoute } from '../src/lib/domain/route-optimizer.ts';

test('heavy route issues increase travel time', () => {
	const baseline = estimateLegTravel(
		{ id: 1, lat: -17.82, lng: 31.03, zoneId: 1 },
		{ id: 2, lat: -17.83, lng: 31.05, zoneId: 1 },
		[],
		8
	);

	const affected = estimateLegTravel(
		{ id: 1, lat: -17.82, lng: 31.03, zoneId: 1 },
		{ id: 2, lat: -17.83, lng: 31.05, zoneId: 1 },
		[
			{
				id: 10,
				issueType: 'closure',
				severity: 'high',
				trafficLevel: 'standstill',
				startLatitude: -17.823,
				startLongitude: 31.034,
				endLatitude: -17.829,
				endLongitude: 31.046,
				estimatedDelayMinutes: 22
			}
		],
		8
	);

	assert.ok(affected.travelMinutes > baseline.travelMinutes + 10);
	assert.ok(affected.blocked);
});

test('optimizer avoids a heavily blocked candidate when another stop is viable', () => {
	const result = optimizeRoute(
		[
			{ id: 1, lat: -17.82, lng: 31.03, zoneId: 1 },
			{ id: 2, lat: -17.825, lng: 31.045, zoneId: 1 },
			{ id: 3, lat: -17.832, lng: 31.031, zoneId: 2 }
		],
		[
			{
				id: 'closure-1',
				issueType: 'closure',
				severity: 'high',
				trafficLevel: 'standstill',
				startLatitude: -17.822,
				startLongitude: 31.036,
				endLatitude: -17.826,
				endLongitude: 31.044,
				estimatedDelayMinutes: 25
			}
		],
		8
	);

	assert.deepEqual(
		result.orderedPoints.map((point) => point.id),
		[1, 3, 2]
	);
	assert.ok(result.metadata.blockedLegs >= 0);
	assert.ok(result.estimatedDurationMinutes > 0);
});
