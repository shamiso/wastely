<script lang="ts">
	import { onMount } from 'svelte';
	import { haversineDistanceKm } from '$lib/domain/route-optimizer';
	import InsightMap from '$lib/components/InsightMap.svelte';
	import { formatLocationLabel } from '$lib/utils/location';
	import {
		finishRun,
		getCurrentRun,
		getLiveNavigationRoute,
		startRun,
		submitRunSummaryEntry,
		submitStop
	} from '$lib/api/driver-ops.remote';

	type DriverLocation = {
		latitude: number;
		longitude: number;
		accuracy: number;
		timestamp: number;
	};

	type LiveNavigationSnapshot = {
		liveRoute: {
			model: string;
			generatedAt: number;
			routeGeometry: {
				type: 'LineString';
				coordinates: Array<[number, number]>;
			};
			legDurationsMinutes: number[];
			remainingDistanceKm: number;
			remainingDurationMinutes: number;
			baselineRemainingMinutes: number;
			etaDeltaMinutes: number;
			nextStopEtaMinutes: number;
			expectedCompletionAt: string | null;
			rerouted: boolean;
			liveStopIds: number[];
			riskScore: number;
			congestionScore: number;
			blockedLegs: number;
			issueIds: Array<number | string>;
			activeIssueCount: number;
			currentLocation: {
				latitude: number;
				longitude: number;
			} | null;
		} | null;
		liveStopIds: number[];
	};

	const currentRun = getCurrentRun();
	let collectionVolumeKg = $state('');
	let runIssues = $state('');
	let delayNotes = $state('');
	let roadConditionNotes = $state('');
	let missedPickups = $state('0');
	let submittingSummary = $state(false);
	let finishingRun = $state(false);
	let updatingStopId = $state<number | null>(null);
	let checklistMessage = $state('');
	let checklistTone = $state<'success' | 'danger'>('success');
	let driverLocation = $state<DriverLocation | null>(null);
	let locationState = $state<'idle' | 'locating' | 'tracking' | 'unsupported' | 'denied' | 'error'>('idle');
	let locationMessage = $state('');
	let navigationMessage = $state('');
	let liveNavigation = $state<LiveNavigationSnapshot | null>(null);
	let liveNavigationLoading = $state(false);
	let lastNavigationOrigin = $state<{
		runId: number;
		latitude: number;
		longitude: number;
		timestamp: number;
	} | null>(null);
	let navigationRequestToken = 0;
	let lastLiveNavigationTriggerKey = '';

	async function startCurrentRun(runId: number) {
		await startRun({
			runId,
			latitude: driverLocation?.latitude,
			longitude: driverLocation?.longitude
		});
		await currentRun.refresh();
		await refreshLiveNavigation(true);
	}

	async function finishCurrentRun(runId: number) {
		finishingRun = true;
		try {
			await finishRun({ runId });
			await currentRun.refresh();
			liveNavigation = null;
		} finally {
			finishingRun = false;
		}
	}

	async function markStop(runId: number, stopId: number, status: 'done' | 'skipped') {
		updatingStopId = stopId;
		checklistMessage = '';
		try {
			await submitStop({
				runId,
				stopId,
				status
			});
			checklistTone = 'success';
			checklistMessage = `Stop ${stopId} marked ${status === 'done' ? 'done' : 'skipped'}.`;
			await currentRun.refresh();
			await refreshLiveNavigation(true);
		} catch (error) {
			checklistTone = 'danger';
			checklistMessage =
				error instanceof Error && error.message
					? error.message
					: `Could not mark stop ${stopId} as ${status}.`;
		} finally {
			updatingStopId = null;
		}
	}

	async function markCurrentStop(stopId: number, status: 'done' | 'skipped') {
		if (!currentRun.current) return;
		await markStop(currentRun.current.run.id, stopId, status);
	}

	async function saveRunSummary() {
		if (!currentRun.current) return;

		submittingSummary = true;
		try {
			await submitRunSummaryEntry({
				runId: currentRun.current.run.id,
				collectionVolumeKg,
				issues: runIssues,
				delays: delayNotes,
				roadConditions: roadConditionNotes,
				missedPickups
			});

			await currentRun.refresh();
		} finally {
			submittingSummary = false;
		}
	}

	function routeStatusHeading(status: string) {
		if (status === 'planned') return 'Ready to start';
		if (status === 'completed') return 'Run completed';
		return 'Route in progress';
	}

	function etaLabel(iso: string | null | undefined) {
		if (!iso) return 'Awaiting live ETA';
		return new Date(iso).toLocaleTimeString([], {
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatSignedMinutes(value: number | null | undefined) {
		if (value === null || value === undefined) return '0 min';
		const rounded = Math.round(value);
		if (rounded === 0) return '0 min';
		return `${rounded > 0 ? '+' : ''}${rounded} min`;
	}

	function formatAccuracy(value: number | null | undefined) {
		if (value === null || value === undefined || !Number.isFinite(value)) return 'Awaiting GPS';
		return `${Math.round(value)} m`;
	}

	function formatStopLocation(stop: {
		zoneName?: string | null;
		zoneId?: number | null;
		latitude: number;
		longitude: number;
	}) {
		return formatLocationLabel(stop);
	}

	function trafficWeight(issue: {
		severity: 'low' | 'medium' | 'high';
		trafficLevel: 'light' | 'moderate' | 'heavy' | 'standstill';
	}) {
		const base =
			issue.trafficLevel === 'standstill'
				? 8
				: issue.trafficLevel === 'heavy'
					? 7
					: issue.trafficLevel === 'moderate'
						? 5
						: 4;
		return issue.severity === 'high'
			? base + 1
			: issue.severity === 'low'
				? Math.max(3, base - 1)
				: base;
	}

	function sortStopsByDynamicOrder(
		stops: Array<{
			id: number;
			sequence: number;
			latitude: number;
			longitude: number;
			zoneId: number | null;
			status: 'pending' | 'done' | 'skipped';
			completedAt: number | null;
		}>,
		liveStopIds: number[]
	) {
		const liveOrder = new Map(liveStopIds.map((stopId, index) => [stopId, index]));

		return [...stops].sort((a, b) => {
			if (a.status === 'pending' && b.status !== 'pending') return -1;
			if (a.status !== 'pending' && b.status === 'pending') return 1;
			if (a.status !== 'pending' && b.status !== 'pending') return a.sequence - b.sequence;
			return (
				(liveOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
				(liveOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
			);
		});
	}

	function stopStatusTone(status: 'pending' | 'done' | 'skipped') {
		if (status === 'done') return 'bg-emerald-100 text-emerald-700';
		if (status === 'skipped') return 'bg-amber-100 text-amber-700';
		return 'bg-sky-100 text-sky-700';
	}

	function handleLocationError(error: GeolocationPositionError) {
		liveNavigation = null;
		if (error.code === error.PERMISSION_DENIED) {
			locationState = 'denied';
			locationMessage = 'Location access is off. Enable it to follow the live route.';
			return;
		}

		locationState = 'error';
		locationMessage = error.message || 'Could not read the device location.';
	}

	async function refreshLiveNavigation(force = false) {
		const run = currentRun.current;
		const location = driverLocation;
		if (!run || !location || run.run.status === 'completed') {
			if (!run || run?.run.status === 'completed') liveNavigation = null;
			return;
		}

		const now = Date.now();
		if (!force && lastNavigationOrigin && lastNavigationOrigin.runId === run.run.id) {
			const distanceMovedKm = haversineDistanceKm(
				{ lat: lastNavigationOrigin.latitude, lng: lastNavigationOrigin.longitude },
				{ lat: location.latitude, lng: location.longitude }
			);
			const ageMs = now - lastNavigationOrigin.timestamp;
			if (distanceMovedKm < 0.05 && ageMs < 15000) return;
		}

		const requestToken = ++navigationRequestToken;
		liveNavigationLoading = true;

		try {
			const snapshot = (await getLiveNavigationRoute({
				runId: run.run.id,
				latitude: location.latitude,
				longitude: location.longitude
			})) as LiveNavigationSnapshot;

			if (requestToken !== navigationRequestToken) return;

			liveNavigation = snapshot;
			navigationMessage = '';
			lastNavigationOrigin = {
				runId: run.run.id,
				latitude: location.latitude,
				longitude: location.longitude,
				timestamp: now
			};
		} catch (error) {
			if (requestToken !== navigationRequestToken) return;
			navigationMessage =
				error instanceof Error && error.message
					? error.message
					: 'Live navigation could not be updated.';
		} finally {
			if (requestToken === navigationRequestToken) {
				liveNavigationLoading = false;
			}
		}
	}

	$effect(() => {
		if (!currentRun.current || currentRun.current.run.status === 'completed') return;
		const handle = window.setInterval(() => {
			void currentRun.refresh();
			void refreshLiveNavigation(true);
		}, 30000);

		return () => window.clearInterval(handle);
	});

	onMount(() => {
		if (!navigator.geolocation) {
			locationState = 'unsupported';
			locationMessage = 'Live location is not supported on this device.';
			return;
		}

		const applyPosition = (position: GeolocationPosition) => {
			driverLocation = {
				latitude: Number(position.coords.latitude.toFixed(6)),
				longitude: Number(position.coords.longitude.toFixed(6)),
				accuracy: position.coords.accuracy,
				timestamp: position.timestamp
			};
			locationState = 'tracking';
			locationMessage = '';
			void refreshLiveNavigation();
		};

		locationState = 'locating';
		navigator.geolocation.getCurrentPosition(
			(position) => applyPosition(position),
			(error) => handleLocationError(error),
			{
				enableHighAccuracy: true,
				maximumAge: 0,
				timeout: 10000
			}
		);

		const watchId = navigator.geolocation.watchPosition(
			(position) => applyPosition(position),
			(error) => handleLocationError(error),
			{
				enableHighAccuracy: true,
				maximumAge: 10000,
				timeout: 15000
			}
		);

		return () => {
			navigator.geolocation.clearWatch(watchId);
		};
	});

	$effect(() => {
		const run = currentRun.current;
		const location = driverLocation;
		if (!run || !location || run.run.status === 'completed') return;

		const triggerKey = `${run.run.id}:${run.run.status}:${run.stops
			.map((stop) => `${stop.id}:${stop.status}`)
			.join('|')}:${location.latitude}:${location.longitude}:${location.timestamp}`;

		if (triggerKey === lastLiveNavigationTriggerKey) return;
		lastLiveNavigationTriggerKey = triggerKey;

		queueMicrotask(() => {
			void refreshLiveNavigation();
		});
	});

	function buildRouteRequests() {
		const run = currentRun.current;
		if (!run) return [];

		const points: Array<[number, number]> = [];

		if (driverLocation) {
			points.push([driverLocation.latitude, driverLocation.longitude]);
		} else if (
			run.run.originLatitude !== null &&
			run.run.originLongitude !== null
		) {
			points.push([run.run.originLatitude, run.run.originLongitude]);
		}

		const pendingRouteStops = displayedStops.filter((stop) => stop.status === 'pending');
		for (const stop of pendingRouteStops) {
			points.push([stop.latitude, stop.longitude]);
		}

		if (points.length < 2) {
			const fallbackStops = displayedStops
				.filter((stop) => stop.status === 'pending')
				.map((stop) => [stop.latitude, stop.longitude] as [number, number]);

			if (fallbackStops.length >= 2) {
				return [
					{
						points: fallbackStops,
						label: liveRoute?.rerouted ? `Run #${run.run.id} live reroute` : `Run #${run.run.id}`,
						color: '#0ea5e9',
						weight: liveRoute?.rerouted ? 6 : 5
					}
				];
			}

			return [];
		}

		return [
			{
				points,
				label: liveRoute?.rerouted ? `Run #${run.run.id} live reroute` : `Run #${run.run.id}`,
				color: '#0ea5e9',
				weight: liveRoute?.rerouted ? 6 : 5
			}
		];
	}

	function routeLines() {
		const run = currentRun.current;
		if (!run) return [];

		const geometry = liveRoute?.routeGeometry ?? run.routeGeometry;
		const fallbackGeometryLine =
			mapRouteRequests.length === 0 && geometry && geometry.coordinates.length >= 2
				? [
						{
							points: geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
							label: liveRoute?.rerouted ? `Run #${run.run.id} saved route` : `Run #${run.run.id}`,
							color: '#0ea5e9',
							weight: liveRoute?.rerouted ? 6 : 5
						}
					]
				: [];

		return [
			...fallbackGeometryLine,
			...run.roadIssues
				.filter(
					(issue) =>
						issue.startLatitude !== null &&
						issue.startLongitude !== null &&
						issue.endLatitude !== null &&
						issue.endLongitude !== null
				)
				.map((issue) => ({
					points: [
						[issue.startLatitude as number, issue.startLongitude as number],
						[issue.endLatitude as number, issue.endLongitude as number]
					] as Array<[number, number]>,
					label: `${issue.issueType} • ${issue.trafficLevel}`,
					color:
						issue.severity === 'high'
							? '#ef4444'
							: issue.severity === 'medium'
								? '#f59e0b'
								: '#22c55e',
					weight: trafficWeight(issue),
					dashArray: '10 8'
				}))
		];
	}

	function routeMarkers() {
		if (!currentRun.current) return [];
		const nextDynamicStopId = liveStopIds[0] ?? null;

		return [
			...currentRun.current.stops.map((stop) => ({
				lat: stop.latitude,
				lng: stop.longitude,
				label:
					stop.id === nextDynamicStopId
						? `Next stop ${stop.sequence} • ${formatStopLocation(stop)} • ${stop.status}`
						: `Stop ${stop.sequence} • ${formatStopLocation(stop)} • ${stop.status}`,
				color: '#0f172a',
				fillColor:
					stop.status === 'done'
						? '#22c55e'
						: stop.status === 'skipped'
							? '#f59e0b'
							: '#38bdf8',
				radius: stop.id === nextDynamicStopId ? 9 : 7
			})),
			...currentRun.current.roadIssues
				.filter((issue) => issue.latitude !== null && issue.longitude !== null)
				.map((issue) => ({
					lat: issue.latitude as number,
					lng: issue.longitude as number,
					label: `${issue.issueType} • ${issue.description}`,
					color: '#7f1d1d',
					fillColor: '#fb7185',
					radius: 8
				}))
		];
	}

	function mapFocusPoints() {
		const focus: Array<[number, number]> = [];

		if (driverLocation) {
			focus.push([driverLocation.latitude, driverLocation.longitude]);
		}

		for (const stop of displayedStops.filter((item) => item.status === 'pending').slice(0, 2)) {
			focus.push([stop.latitude, stop.longitude]);
		}

		if (focus.length === 0 && currentRun.current) {
			for (const stop of currentRun.current.stops.slice(0, 2)) {
				focus.push([stop.latitude, stop.longitude]);
			}
		}

		return focus;
	}

	let liveRoute = $derived(liveNavigation?.liveRoute ?? currentRun.current?.liveRoute ?? null);
	let liveStopIds = $derived(liveNavigation?.liveStopIds ?? currentRun.current?.liveStopIds ?? []);
	let displayedStops = $derived(
		currentRun.current ? sortStopsByDynamicOrder(currentRun.current.stops, liveStopIds) : []
	);
	let mapRouteRequests = $derived(buildRouteRequests());
	let optimizerLegs = $derived(
		liveRoute?.legDurationsMinutes ?? currentRun.current?.optimizerMetadata?.legDurationsMinutes ?? []
	);
	let plannedRemainingEtaMinutes = $derived(
		optimizerLegs.length > 0
			? optimizerLegs.reduce((sum, value) => sum + value, 0)
			: currentRun.current?.run.estimatedDurationMinutes ?? 0
	);
	let plannedNextStopEtaMinutes = $derived(
		liveRoute?.nextStopEtaMinutes ??
			currentRun.current?.optimizerMetadata?.nextStopEtaMinutes ??
			optimizerLegs[0] ??
			currentRun.current?.run.estimatedDurationMinutes ??
			0
	);
	let displayRemainingEtaMinutes = $derived(liveRoute?.remainingDurationMinutes ?? plannedRemainingEtaMinutes);
	let displayExpectedCompletionAt = $derived(
		liveRoute?.expectedCompletionAt ??
			(displayRemainingEtaMinutes > 0
				? new Date(Date.now() + displayRemainingEtaMinutes * 60_000).toISOString()
				: null)
	);
	let nextPendingStop = $derived(
		currentRun.current?.stops.find((stop) => stop.id === (liveStopIds[0] ?? -1)) ??
			currentRun.current?.stops.find((stop) => stop.status === 'pending') ??
			null
	);
	let pendingStops = $derived(currentRun.current?.stops.filter((stop) => stop.status === 'pending') ?? []);
	let canFinishRun = $derived(
		!!currentRun.current &&
			pendingStops.length === 0 &&
			currentRun.current.run.status !== 'completed'
	);
	let optimizerPlan = $derived(
		currentRun.current
			? displayedStops
					.filter((stop) => stop.status === 'pending')
					.map((stop, index) => ({
						stop,
						legMinutes: optimizerLegs[index] ?? 0,
						cumulativeMinutes: optimizerLegs
							.slice(0, index + 1)
							.reduce((sum, value) => sum + value, 0)
					}))
			: []
	);
</script>

<div class="space-y-6">
	<section class="overflow-hidden rounded-[2rem] bg-gradient-to-br from-sky-600 via-cyan-600 to-teal-600 p-6 text-white shadow-[0_24px_70px_rgba(8,47,73,0.16)]">
		<p class="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Driver dashboard</p>
		<h1 class="mt-2 font-[Georgia] text-4xl font-semibold tracking-tight">Follow the route. Watch the time.</h1>
		<p class="mt-3 max-w-2xl text-sm leading-6 text-white/82">
			View the live optimized route, follow traffic-weighted reroutes, track ETA to the next stop, and close the run when collection is complete.
		</p>
	</section>

	{#if currentRun.loading && !currentRun.ready}
		<p class="rounded-[1.6rem] bg-white/85 px-4 py-10 text-sm text-slate-500 shadow-[0_24px_70px_rgba(8,47,73,0.12)]">
			Loading run assignment…
		</p>
	{:else if currentRun.ready && !currentRun.current}
		<section class="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">No active run</h2>
			<p class="mt-2 text-sm text-slate-600">No route run is assigned for today yet.</p>
		</section>
	{:else if currentRun.ready && currentRun.current}
		<div class="space-y-6">
			<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
							Run #{currentRun.current.run.id}
						</p>
						<h2 class="mt-2 font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
							{routeStatusHeading(currentRun.current.run.status)}
						</h2>
						<p class="mt-2 text-sm text-slate-600">
							{currentRun.current.run.runDate} • {currentRun.current.run.plannedDistanceKm.toFixed(1)} km planned
						</p>
					</div>

					<div class="flex flex-wrap gap-2">
						<a
							href="/driver/reports"
							class="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-50"
						>
							Report road issue
						</a>
						{#if currentRun.current.run.status === 'planned'}
							<button
								type="button"
								onclick={() => startCurrentRun(currentRun.current!.run.id)}
								class="rounded-full bg-sky-950 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900"
							>
								Start run
							</button>
						{:else if canFinishRun}
							<button
								type="button"
								onclick={() => finishCurrentRun(currentRun.current!.run.id)}
								disabled={finishingRun}
								class="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{finishingRun ? 'Finishing…' : 'Finish run'}
							</button>
						{/if}
					</div>
				</div>

				<div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					<div class="rounded-[1.3rem] bg-gradient-to-br from-cyan-500 to-sky-600 p-4 text-white">
						<p class="text-xs uppercase tracking-[0.18em] text-white/70">Stops</p>
						<p class="mt-2 text-3xl font-semibold">{currentRun.current.stops.length}</p>
					</div>
					<div class="rounded-[1.3rem] bg-gradient-to-br from-emerald-400 to-teal-600 p-4 text-white">
						<p class="text-xs uppercase tracking-[0.18em] text-white/70">Next stop ETA</p>
						<p class="mt-2 text-3xl font-semibold">
							{plannedNextStopEtaMinutes.toFixed(0)}m
						</p>
					</div>
					<div class="rounded-[1.3rem] bg-gradient-to-br from-violet-500 to-indigo-600 p-4 text-white">
						<p class="text-xs uppercase tracking-[0.18em] text-white/70">Expected arrival</p>
						<p class="mt-2 text-2xl font-semibold">{etaLabel(displayExpectedCompletionAt)}</p>
					</div>
					<div class="rounded-[1.3rem] bg-gradient-to-br from-amber-300 to-orange-500 p-4 text-slate-950">
						<p class="text-xs uppercase tracking-[0.18em] text-slate-900/60">Time taken</p>
						<p class="mt-2 text-3xl font-semibold">{currentRun.current.elapsedMinutes.toFixed(0)}m</p>
					</div>
					<div class="rounded-[1.3rem] bg-gradient-to-br from-emerald-300 to-lime-500 p-4 text-slate-950">
						<p class="text-xs uppercase tracking-[0.18em] text-slate-900/60">Remaining ETA</p>
						<p class="mt-2 text-3xl font-semibold">
							{displayRemainingEtaMinutes.toFixed(0)}m
						</p>
					</div>
					<div class="rounded-[1.3rem] bg-gradient-to-br from-rose-300 to-pink-500 p-4 text-slate-950">
						<p class="text-xs uppercase tracking-[0.18em] text-slate-900/60">Road issues</p>
						<p class="mt-2 text-3xl font-semibold">{currentRun.current.roadIssues.length}</p>
					</div>
					<div class="rounded-[1.3rem] bg-gradient-to-br from-slate-800 to-slate-950 p-4 text-white">
						<p class="text-xs uppercase tracking-[0.18em] text-white/60">Live location</p>
						<p class="mt-2 text-2xl font-semibold">
							{locationState === 'tracking' ? 'Tracking' : 'Not live'}
						</p>
						<p class="mt-2 text-sm text-white/72">
							{locationState === 'tracking'
								? `Accuracy ${formatAccuracy(driverLocation?.accuracy)}`
								: locationMessage || 'Enable GPS to navigate from your current position.'}
						</p>
					</div>
				</div>
			</section>

			<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
							Route map
						</h2>
						<p class="text-sm text-slate-600">
							Live route from your current position, plus traffic-weighted condition segments.
						</p>
					</div>
					{#if liveRoute || currentRun.current.optimizerMetadata}
						<div class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
							Risk {(liveRoute?.riskScore ?? currentRun.current.optimizerMetadata?.riskScore ?? 0).toFixed(0)} • Congestion {(liveRoute?.congestionScore ?? currentRun.current.optimizerMetadata?.congestionScore ?? 0).toFixed(0)}
						</div>
					{/if}
				</div>

				{#if liveRoute?.rerouted}
					<div class="mt-4 rounded-[1.35rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
						Route updated from live traffic and congestion weights. Remaining ETA changed by {formatSignedMinutes(liveRoute.etaDeltaMinutes)} and {liveRoute.activeIssueCount} active road issue(s) are influencing the route.
					</div>
				{/if}

				{#if locationMessage}
					<div class="mt-4 rounded-[1.35rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
						{locationMessage}
					</div>
				{/if}

				{#if navigationMessage}
					<div class="mt-4 rounded-[1.35rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
						{navigationMessage}
					</div>
				{/if}

				<div class="mt-4">
					<InsightMap
						ariaLabel="Driver route dashboard map"
						focusPoints={mapFocusPoints()}
						userLocation={
							driverLocation
								? {
										lat: driverLocation.latitude,
										lng: driverLocation.longitude,
										accuracy: driverLocation.accuracy
									}
								: null
						}
						markers={routeMarkers()}
						polylines={routeLines()}
						routeRequests={mapRouteRequests}
					/>
				</div>

				{#if liveNavigationLoading}
					<p class="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
						Refreshing live navigation…
					</p>
				{/if}
			</section>

			<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
							Route optimizer
						</p>
						<h2 class="mt-2 font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
							Optimizer guidance
						</h2>
						<p class="mt-2 text-sm text-slate-600">
							Recommended stop order, ETA, and route changes caused by live traffic reports.
						</p>
					</div>
					{#if liveRoute || currentRun.current.optimizerMetadata}
						<div class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
							{liveRoute?.model ?? currentRun.current.optimizerMetadata?.model ?? 'condition-aware'}
						</div>
					{/if}
				</div>

				<div class="mt-5 grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
					<div class="grid gap-3">
						<div class="rounded-[1.35rem] bg-gradient-to-br from-cyan-500 to-sky-600 p-4 text-white">
							<p class="text-xs uppercase tracking-[0.18em] text-white/70">Next recommended stop</p>
							<p class="mt-2 text-3xl font-semibold">
								{nextPendingStop ? `Stop ${nextPendingStop.sequence}` : 'Route complete'}
							</p>
							<p class="mt-2 text-sm text-white/78">
								{nextPendingStop
									? formatStopLocation(nextPendingStop)
									: 'All assigned stops are done or skipped.'}
							</p>
						</div>
						<div class="rounded-[1.35rem] bg-gradient-to-br from-emerald-400 to-teal-600 p-4 text-white">
							<p class="text-xs uppercase tracking-[0.18em] text-white/70">Expected completion</p>
							<p class="mt-2 text-3xl font-semibold">
								{etaLabel(displayExpectedCompletionAt)}
							</p>
							<p class="mt-2 text-sm text-white/78">
								Remaining distance {(liveRoute?.remainingDistanceKm ?? currentRun.current.run.plannedDistanceKm).toFixed(1)} km
							</p>
						</div>
						<div class="grid gap-3 sm:grid-cols-2">
							<div class="rounded-[1.25rem] bg-amber-50 p-4">
								<p class="text-xs uppercase tracking-[0.18em] text-amber-700">Blocked legs</p>
								<p class="mt-2 text-3xl font-semibold text-slate-900">
									{liveRoute?.blockedLegs ?? currentRun.current.optimizerMetadata?.blockedLegs ?? 0}
								</p>
							</div>
							<div class="rounded-[1.25rem] bg-rose-50 p-4">
								<p class="text-xs uppercase tracking-[0.18em] text-rose-700">ETA change</p>
								<p class="mt-2 text-3xl font-semibold text-slate-900">
									{formatSignedMinutes(liveRoute?.etaDeltaMinutes)}
								</p>
							</div>
						</div>
					</div>

					<div class="rounded-[1.45rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
						<div class="flex items-center justify-between gap-3">
							<p class="text-sm font-semibold text-slate-900">Recommended stop order</p>
							<p class="text-xs uppercase tracking-[0.16em] text-slate-500">
								Leg ETA and cumulative ETA
							</p>
						</div>

						<div class="mt-4 space-y-3">
							{#if optimizerPlan.length === 0}
								<p class="rounded-[1.15rem] bg-white px-4 py-6 text-sm text-slate-500">
									All assigned stops have been handled.
								</p>
							{:else}
								{#each optimizerPlan as item, index}
									<div class="flex flex-wrap items-center justify-between gap-3 rounded-[1.15rem] bg-white px-4 py-3">
										<div>
											<p class="font-semibold text-slate-900">
												{index === 0 ? 'Next stop' : 'Then'} • Stop {item.stop.sequence}
											</p>
											<p class="mt-1 text-xs text-slate-500">
												{formatStopLocation(item.stop)}
											</p>
										</div>
										<div class="text-right">
											<p class="text-sm font-semibold text-slate-900">
												{item.legMinutes.toFixed(0)} min leg
											</p>
											<p class="mt-1 text-xs text-slate-500">
												ETA +{item.cumulativeMinutes.toFixed(0)} min
											</p>
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</div>
			</section>

			<section class="space-y-4 rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
							Stop checklist
						</h2>
						<p class="text-sm text-slate-600">Mark each stop as done or skipped as you work through the live route.</p>
					</div>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							onclick={() => currentRun.refresh()}
							class="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-50"
						>
							Refresh
						</button>
						{#if canFinishRun}
							<button
								type="button"
								onclick={() => finishCurrentRun(currentRun.current!.run.id)}
								disabled={finishingRun}
								class="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{finishingRun ? 'Finishing…' : 'Finish run'}
							</button>
						{/if}
					</div>
				</div>

				{#if canFinishRun}
					<div class="rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
						All stops have been handled. Finish the run to mark the collection route as complete.
					</div>
				{/if}

				{#if checklistMessage}
					<div
						class={`rounded-[1.25rem] px-4 py-3 text-sm ${
							checklistTone === 'danger'
								? 'border border-rose-200 bg-rose-50 text-rose-700'
								: 'border border-emerald-200 bg-emerald-50 text-emerald-700'
						}`}
					>
						{checklistMessage}
					</div>
				{/if}

				<div class="grid gap-4">
					{#each displayedStops as stop}
						<article class="rounded-[1.5rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<div class="flex flex-wrap items-center gap-2">
										<p class="font-semibold text-slate-900">
										Stop {stop.sequence}
										{#if stop.id === (liveStopIds[0] ?? -1)}
											<span class="ml-2 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-cyan-700">
												Next
											</span>
										{/if}
										</p>
										<span
											class={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${stopStatusTone(stop.status)}`}
										>
											{stop.status}
										</span>
									</div>
									<p class="mt-1 text-xs text-slate-500">
										{formatStopLocation(stop)}
									</p>
									{#if stop.status !== 'pending'}
										<p class="mt-2 text-xs font-medium text-slate-500">
											Handled {stop.completedAt ? new Date(stop.completedAt).toLocaleString() : 'already'}.
										</p>
									{/if}
								</div>

								<div class="flex flex-wrap gap-2">
									<a
										href={`https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`}
										target="_blank"
										rel="noreferrer"
										class="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-50"
									>
										Open map
									</a>
									<button
										type="button"
										onclick={() => markCurrentStop(stop.id, 'done')}
										disabled={stop.status !== 'pending' || updatingStopId === stop.id}
										class="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
									>
										{updatingStopId === stop.id ? 'Saving…' : 'I have arrived'}
									</button>
									<button
										type="button"
										onclick={() => markCurrentStop(stop.id, 'skipped')}
										disabled={stop.status !== 'pending' || updatingStopId === stop.id}
										class="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
									>
										{updatingStopId === stop.id ? 'Saving…' : 'Skip stop'}
									</button>
								</div>
							</div>
						</article>
					{/each}
				</div>
			</section>

			{#if currentRun.current.run.status === 'completed'}
				<section class="space-y-4 rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
					<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
						Run summary
					</h2>
					{#if currentRun.current.summary}
						<div class="rounded-[1.4rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
							Run summary submitted on {new Date(currentRun.current.summary.createdAt).toLocaleString()}.
						</div>
					{/if}

					<div class="grid gap-3 sm:grid-cols-2">
						<label class="text-sm font-medium text-slate-700">
							Collection volume (kg)
							<input
								bind:value={collectionVolumeKg}
								type="number"
								min="0"
								step="0.1"
								placeholder="620"
								class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3"
							/>
						</label>
						<label class="text-sm font-medium text-slate-700">
							Missed pickups
							<input
								bind:value={missedPickups}
								type="number"
								min="0"
								step="1"
								class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3"
							/>
						</label>
						<label class="text-sm font-medium text-slate-700 sm:col-span-2">
							Issues faced
							<textarea
								bind:value={runIssues}
								rows="3"
								placeholder="Missed pickups, access constraints, safety issues."
								class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3"
							></textarea>
						</label>
						<label class="text-sm font-medium text-slate-700">
							Delays
							<textarea
								bind:value={delayNotes}
								rows="3"
								placeholder="Traffic, queueing, diversions."
								class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3"
							></textarea>
						</label>
						<label class="text-sm font-medium text-slate-700">
							Road conditions
							<textarea
								bind:value={roadConditionNotes}
								rows="3"
								placeholder="Flooding, damaged surface, blocked section."
								class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3"
							></textarea>
						</label>
					</div>

					<button
						type="button"
						onclick={saveRunSummary}
						disabled={submittingSummary || !!currentRun.current.summary}
						class="rounded-full bg-sky-950 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{submittingSummary ? 'Saving summary…' : currentRun.current.summary ? 'Summary already saved' : 'Save run summary'}
					</button>
				</section>
			{/if}
		</div>
	{/if}
</div>
