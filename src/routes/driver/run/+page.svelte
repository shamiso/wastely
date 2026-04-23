<script lang="ts">
	import InsightMap from '$lib/components/InsightMap.svelte';
	import {
		getCurrentRun,
		startRun,
		submitRunSummaryEntry,
		submitStop
	} from '$lib/api/driver-ops.remote';

	const currentRun = getCurrentRun();
	let collectionVolumeKg = $state('');
	let runIssues = $state('');
	let delayNotes = $state('');
	let roadConditionNotes = $state('');
	let missedPickups = $state('0');
	let submittingSummary = $state(false);

	async function startCurrentRun(runId: number) {
		await startRun({ runId });
		await currentRun.refresh();
	}

	async function markStop(runId: number, stopId: number, status: 'done' | 'skipped') {
		await submitStop({
			runId,
			stopId,
			status
		});
		await currentRun.refresh();
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

	function routeLines() {
		if (!currentRun.current?.routeGeometry) return [];
		return [
			{
				points: currentRun.current.routeGeometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
				label: `Run #${currentRun.current.run.id}`,
				color: '#0ea5e9',
				weight: 5
			},
			...currentRun.current.roadIssues
				.filter((issue) => issue.startLatitude !== null && issue.startLongitude !== null && issue.endLatitude !== null && issue.endLongitude !== null)
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
					weight: 4,
					dashArray: '10 8'
				}))
		];
	}

	function routeMarkers() {
		if (!currentRun.current) return [];
		return [
			...currentRun.current.stops.map((stop) => ({
				lat: stop.latitude,
				lng: stop.longitude,
				label: `Stop ${stop.sequence} • ${stop.status}`,
				color: '#0f172a',
				fillColor: stop.status === 'done' ? '#22c55e' : stop.status === 'skipped' ? '#f59e0b' : '#38bdf8',
				radius: 7
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

	let optimizerLegs = $derived(
		currentRun.current?.optimizerMetadata?.legDurationsMinutes ?? []
	);
	let nextPendingStop = $derived(
		currentRun.current?.stops.find((stop) => stop.status === 'pending') ?? null
	);
	let optimizerPlan = $derived(
		currentRun.current
			? currentRun.current.stops.map((stop, index) => ({
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
			View the optimized route, compare estimated and actual time, and keep stop progress updated while road-condition reports stay on their own tab.
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
							{currentRun.current.run.status === 'planned' ? 'Ready to start' : 'Route in progress'}
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
						{/if}
					</div>
				</div>

				<div class="mt-5 grid gap-3 md:grid-cols-4">
					<div class="rounded-[1.3rem] bg-gradient-to-br from-cyan-500 to-sky-600 p-4 text-white">
						<p class="text-xs uppercase tracking-[0.18em] text-white/70">Stops</p>
						<p class="mt-2 text-3xl font-semibold">{currentRun.current.stops.length}</p>
					</div>
					<div class="rounded-[1.3rem] bg-gradient-to-br from-emerald-400 to-teal-600 p-4 text-white">
						<p class="text-xs uppercase tracking-[0.18em] text-white/70">Estimated time</p>
						<p class="mt-2 text-3xl font-semibold">{currentRun.current.run.estimatedDurationMinutes.toFixed(0)}m</p>
					</div>
					<div class="rounded-[1.3rem] bg-gradient-to-br from-amber-300 to-orange-500 p-4 text-slate-950">
						<p class="text-xs uppercase tracking-[0.18em] text-slate-900/60">Time taken</p>
						<p class="mt-2 text-3xl font-semibold">{currentRun.current.elapsedMinutes.toFixed(0)}m</p>
					</div>
					<div class="rounded-[1.3rem] bg-gradient-to-br from-rose-300 to-pink-500 p-4 text-slate-950">
						<p class="text-xs uppercase tracking-[0.18em] text-slate-900/60">Road issues</p>
						<p class="mt-2 text-3xl font-semibold">{currentRun.current.roadIssues.length}</p>
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
							Optimized path plus reported route-condition segments.
						</p>
					</div>
					{#if currentRun.current.optimizerMetadata}
						<div class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
							Risk {currentRun.current.optimizerMetadata.riskScore?.toFixed(0) ?? '0'} • Congestion {currentRun.current.optimizerMetadata.congestionScore?.toFixed(0) ?? '0'}
						</div>
					{/if}
				</div>

				<div class="mt-4">
					<InsightMap
						ariaLabel="Driver route dashboard map"
						markers={routeMarkers()}
						polylines={routeLines()}
					/>
				</div>
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
							Recommended stop order, leg timing, and route risk summary for the assigned run.
						</p>
					</div>
					{#if currentRun.current.optimizerMetadata}
						<div class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
							{currentRun.current.optimizerMetadata.model ?? 'condition-aware'}
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
									? `${nextPendingStop.latitude.toFixed(5)}, ${nextPendingStop.longitude.toFixed(5)}`
									: 'All assigned stops are done or skipped.'}
							</p>
						</div>
						<div class="rounded-[1.35rem] bg-gradient-to-br from-emerald-400 to-teal-600 p-4 text-white">
							<p class="text-xs uppercase tracking-[0.18em] text-white/70">Estimated full route</p>
							<p class="mt-2 text-3xl font-semibold">
								{currentRun.current.run.estimatedDurationMinutes.toFixed(0)} min
							</p>
							<p class="mt-2 text-sm text-white/78">
								Distance {currentRun.current.run.plannedDistanceKm.toFixed(1)} km
							</p>
						</div>
						<div class="grid gap-3 sm:grid-cols-2">
							<div class="rounded-[1.25rem] bg-amber-50 p-4">
								<p class="text-xs uppercase tracking-[0.18em] text-amber-700">Blocked legs</p>
								<p class="mt-2 text-3xl font-semibold text-slate-900">
									{currentRun.current.optimizerMetadata?.blockedLegs ?? 0}
								</p>
							</div>
							<div class="rounded-[1.25rem] bg-rose-50 p-4">
								<p class="text-xs uppercase tracking-[0.18em] text-rose-700">Risk score</p>
								<p class="mt-2 text-3xl font-semibold text-slate-900">
									{currentRun.current.optimizerMetadata?.riskScore?.toFixed(0) ?? '0'}
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
							{#each optimizerPlan as item}
								<div class="flex flex-wrap items-center justify-between gap-3 rounded-[1.15rem] bg-white px-4 py-3">
									<div>
										<p class="font-semibold text-slate-900">Stop {item.stop.sequence}</p>
										<p class="mt-1 text-xs text-slate-500">
											{item.stop.latitude.toFixed(5)}, {item.stop.longitude.toFixed(5)}
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
						<p class="text-sm text-slate-600">Mark each stop as done or skipped as you work through the route.</p>
					</div>
					<button
						type="button"
						onclick={() => currentRun.refresh()}
						class="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-50"
					>
						Refresh
					</button>
				</div>

				<div class="grid gap-4">
					{#each currentRun.current.stops as stop}
						<article class="rounded-[1.5rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p class="font-semibold text-slate-900">Stop {stop.sequence}</p>
									<p class="mt-1 text-xs text-slate-500">
										{stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}
										{#if stop.zoneId}
											• Zone {stop.zoneId}
										{/if}
									</p>
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
										disabled={stop.status !== 'pending'}
										class="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
									>
										Done
									</button>
									<button
										type="button"
										onclick={() => markCurrentStop(stop.id, 'skipped')}
										disabled={stop.status !== 'pending'}
										class="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
									>
										Skipped
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
