<script lang="ts">
	import InsightMap from '$lib/components/InsightMap.svelte';
	import { listDriverRouteReports } from '$lib/api/admin-dispatch.remote';
	import { formatLocationLabel } from '$lib/utils/location';

	const routeReports = listDriverRouteReports({ limit: 10 });
	let selectedRunId = $state<number | null>(null);

	$effect(() => {
		if (!routeReports.ready || routeReports.current.length === 0) return;
		if (selectedRunId && routeReports.current.some((run) => run.runId === selectedRunId)) return;
		selectedRunId = routeReports.current[0].runId;
	});

	const selectedRun = $derived(
		routeReports.ready
			? routeReports.current.find((run) => run.runId === selectedRunId) ?? routeReports.current[0] ?? null
			: null
	);

	function routeLines() {
		if (!selectedRun?.routeGeometry) return [];
		return [
			{
				points: selectedRun.routeGeometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
				label: `Run #${selectedRun.runId}`,
				color: '#0ea5e9',
				weight: 5
			},
			...selectedRun.roadIssues
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
		if (!selectedRun) return [];
		return [
			...selectedRun.stops.map((stop) => ({
				lat: stop.latitude,
				lng: stop.longitude,
				label: `Stop ${stop.sequence} • ${formatLocationLabel(stop)} • ${stop.status}`,
				color: '#0f172a',
				fillColor: stop.status === 'done' ? '#22c55e' : stop.status === 'skipped' ? '#f59e0b' : '#38bdf8',
				radius: 7
			})),
			...selectedRun.roadIssues
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
</script>

<div class="space-y-6">
	<section class="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
		<p class="text-xs font-semibold uppercase tracking-[0.28em] text-teal-700">Driver Reports</p>
		<h1 class="mt-2 font-[Georgia] text-4xl font-semibold tracking-tight text-sky-950">
			Route playback and road condition review
		</h1>
		<p class="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
			Inspect the route a driver took, compare estimated and elapsed time, and review congestion or road-surface issues reported along that path.
		</p>
	</section>

	<div class="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
		<section class="space-y-4 rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
						Recent driver runs
					</h2>
					<p class="text-sm text-slate-600">Select a run to inspect its route and issue overlays.</p>
				</div>
				<button
					type="button"
					onclick={() => routeReports.refresh()}
					class="rounded-full bg-sky-950 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900"
				>
					Refresh
				</button>
			</div>

			{#if routeReports.loading && !routeReports.ready}
				<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading route reports…</p>
			{:else if routeReports.ready && routeReports.current.length === 0}
				<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">No driver route reports yet.</p>
			{:else if routeReports.ready}
				<div class="grid gap-3">
					{#each routeReports.current as run}
						<button
							type="button"
							onclick={() => (selectedRunId = run.runId)}
							class={`rounded-[1.4rem] border p-4 text-left transition ${
								selectedRunId === run.runId
									? 'border-sky-300 bg-sky-50'
									: 'border-sky-100 bg-white hover:border-sky-200 hover:bg-sky-50/70'
							}`}
						>
							<div class="flex items-center justify-between gap-2">
								<p class="font-semibold text-slate-900">Run #{run.runId}</p>
								<span class="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
									{run.status}
								</span>
							</div>
							<p class="mt-2 text-sm text-slate-600">
								{run.driverName ?? run.driverUserId ?? 'Unassigned'} • {run.runDate}
							</p>
							<p class="mt-2 text-xs text-slate-500">
								{run.plannedDistanceKm.toFixed(1)} km • {run.roadIssues.length} route issues • {run.stops.length} stops
							</p>
						</button>
					{/each}
				</div>
			{/if}
		</section>

		<section class="space-y-5 rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			{#if selectedRun}
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
							Run #{selectedRun.runId}
						</h2>
						<p class="text-sm text-slate-600">
							{selectedRun.driverName ?? selectedRun.driverUserId ?? 'Unassigned'} • {selectedRun.runDate}
						</p>
					</div>
					<div class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
						{selectedRun.roadIssues.length} condition reports
					</div>
				</div>

				<div class="grid gap-3 md:grid-cols-3">
					<div class="rounded-[1.3rem] bg-gradient-to-br from-cyan-500 to-sky-600 p-4 text-white">
						<p class="text-xs uppercase tracking-[0.18em] text-white/70">Planned distance</p>
						<p class="mt-2 text-3xl font-semibold">{selectedRun.plannedDistanceKm.toFixed(1)}km</p>
					</div>
					<div class="rounded-[1.3rem] bg-gradient-to-br from-emerald-400 to-teal-600 p-4 text-white">
						<p class="text-xs uppercase tracking-[0.18em] text-white/70">Estimated time</p>
						<p class="mt-2 text-3xl font-semibold">{selectedRun.estimatedDurationMinutes.toFixed(0)}m</p>
					</div>
					<div class="rounded-[1.3rem] bg-gradient-to-br from-amber-300 to-orange-500 p-4 text-slate-950">
						<p class="text-xs uppercase tracking-[0.18em] text-slate-900/60">Elapsed time</p>
						<p class="mt-2 text-3xl font-semibold">{selectedRun.elapsedMinutes.toFixed(0)}m</p>
					</div>
				</div>

				<InsightMap
					ariaLabel="Driver route map"
					markers={routeMarkers()}
					polylines={routeLines()}
				/>

				<div class="grid gap-4 lg:grid-cols-2">
					<section class="rounded-[1.4rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
						<h3 class="text-lg font-semibold text-slate-900">Road conditions on route</h3>
						{#if selectedRun.roadIssues.length === 0}
							<p class="mt-3 text-sm text-slate-500">No driver road-condition reports recorded for this run.</p>
						{:else}
							<div class="mt-4 space-y-3">
								{#each selectedRun.roadIssues as issue}
									<div class="rounded-2xl bg-white p-3">
										<div class="flex items-center justify-between gap-2">
											<p class="font-semibold text-slate-900">{issue.issueType}</p>
											<p class="text-xs uppercase tracking-[0.14em] text-slate-500">
												{issue.severity} • {issue.trafficLevel}
											</p>
										</div>
										<p class="mt-2 text-sm text-slate-700">{issue.description}</p>
										<p class="mt-2 text-xs text-slate-500">
											{issue.startLabel ?? 'Point A'} to {issue.endLabel ?? 'Point B'} • Delay {issue.estimatedDelayMinutes.toFixed(0)} min
										</p>
									</div>
								{/each}
							</div>
						{/if}
					</section>

					<section class="rounded-[1.4rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
						<h3 class="text-lg font-semibold text-slate-900">Stop progress</h3>
						<div class="mt-4 space-y-3">
							{#each selectedRun.stops as stop}
								<div class="rounded-2xl bg-white p-3">
									<div class="flex items-center justify-between gap-2">
										<p class="font-semibold text-slate-900">Stop {stop.sequence}</p>
										<p class="text-xs uppercase tracking-[0.14em] text-slate-500">{stop.status}</p>
									</div>
									<p class="mt-2 text-xs text-slate-500">
										{formatLocationLabel(stop)}
									</p>
									{#if stop.notes}
										<p class="mt-2 text-sm text-slate-700">{stop.notes}</p>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				</div>
			{:else}
				<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">
					Select a driver run to inspect it.
				</p>
			{/if}
		</section>
	</div>
</div>
