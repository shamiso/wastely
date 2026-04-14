<script lang="ts">
	import InsightMap from '$lib/components/InsightMap.svelte';
	import RouteSegmentPickerMap from '$lib/components/RouteSegmentPickerMap.svelte';
	import {
		getCurrentRun,
		getDriverHistory,
		submitRoadIssue
	} from '$lib/api/driver-ops.remote';

	const currentRun = getCurrentRun();
	const history = getDriverHistory({ limit: 8 });

	let issueType = $state<'congestion' | 'pothole' | 'flooding' | 'closure' | 'surface_damage' | 'accident' | 'other'>('congestion');
	let roadSeverity = $state<'low' | 'medium' | 'high'>('medium');
	let trafficLevel = $state<'light' | 'moderate' | 'heavy' | 'standstill'>('moderate');
	let roadDescription = $state('');
	let startLabel = $state('');
	let endLabel = $state('');
	let estimatedDelayMinutes = $state('10');
	let selectedZoneId = $state('');
	let startLatitude = $state<number | null>(null);
	let startLongitude = $state<number | null>(null);
	let endLatitude = $state<number | null>(null);
	let endLongitude = $state<number | null>(null);
	let submittingIssue = $state(false);
	let segmentMap = $state<RouteSegmentPickerMap | null>(null);

	const activeRoute = $derived(
		currentRun.ready && currentRun.current
			? currentRun.current
			: history.ready
				? history.current[0] ?? null
				: null
	);

	function routeLines() {
		if (!activeRoute?.routeGeometry) return [];
		return [
			{
				points: activeRoute.routeGeometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
				label: `Run #${activeRoute.run.id}`,
				color: '#0ea5e9',
				weight: 5
			},
			...activeRoute.roadIssues
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
		if (!activeRoute) return [];
		return [
			...activeRoute.stops.map((stop) => ({
				lat: stop.latitude,
				lng: stop.longitude,
				label: `Stop ${stop.sequence ?? stop.id}`,
				color: '#0f172a',
				fillColor: '#38bdf8',
				radius: 7
			})),
			...activeRoute.roadIssues
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

	function zoneOptions() {
		if (!currentRun.current) return [];
		return [...new Map(
			currentRun.current.stops
				.filter((stop) => stop.zoneId !== null)
				.map((stop) => [stop.zoneId, { zoneId: stop.zoneId as number, label: `Zone ${stop.zoneId}` }])
		).values()];
	}

	async function reportRoadIssue() {
		submittingIssue = true;
		try {
			await submitRoadIssue({
				runId: currentRun.current?.run.id,
				zoneId: selectedZoneId || undefined,
				issueType,
				severity: roadSeverity,
				trafficLevel,
				description: roadDescription,
				startLabel,
				endLabel,
				startLatitude: startLatitude ?? undefined,
				startLongitude: startLongitude ?? undefined,
				endLatitude: endLatitude ?? undefined,
				endLongitude: endLongitude ?? undefined,
				estimatedDelayMinutes
			});

			roadDescription = '';
			startLabel = '';
			endLabel = '';
			estimatedDelayMinutes = '10';
			selectedZoneId = '';
			startLatitude = null;
			startLongitude = null;
			endLatitude = null;
			endLongitude = null;
			segmentMap?.clearSelection();

			await Promise.all([currentRun.refresh(), history.refresh()]);
		} finally {
			submittingIssue = false;
		}
	}
</script>

<div class="space-y-6">
	<section class="overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-300 via-orange-400 to-rose-500 p-6 text-slate-950 shadow-[0_24px_70px_rgba(8,47,73,0.16)]">
		<p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-900/65">Driver reports</p>
		<h1 class="mt-2 font-[Georgia] text-4xl font-semibold tracking-tight">Mark exactly where the road gets bad</h1>
		<p class="mt-3 max-w-2xl text-sm leading-6 text-slate-900/78">
			Report congestion, potholes, flooding, closures, and other route issues between two streets or two points on the map.
		</p>
	</section>

	<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
					Route and conditions
				</h2>
				<p class="text-sm text-slate-600">
					Current route with condition overlays from your reports.
				</p>
			</div>
			<button
				type="button"
				onclick={() => {
					currentRun.refresh();
					history.refresh();
				}}
				class="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-50"
			>
				Refresh
			</button>
		</div>

		<div class="mt-4">
			{#if activeRoute}
				<InsightMap
					ariaLabel="Driver report route map"
					markers={routeMarkers()}
					polylines={routeLines()}
				/>
			{:else}
				<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">
					No route history available yet.
				</p>
			{/if}
		</div>
	</section>

	<section class="space-y-5 rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
		<div>
			<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
				Report a road issue
			</h2>
			<p class="text-sm text-slate-600">
				Use street labels, point A to point B, and route delay estimates to describe the exact stretch affected.
			</p>
		</div>

		<div class="grid gap-4 md:grid-cols-2">
			<label class="text-sm font-medium text-slate-700">
				Issue type
				<select bind:value={issueType} class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3">
					<option value="congestion">Congestion</option>
					<option value="pothole">Potholes</option>
					<option value="surface_damage">Surface damage</option>
					<option value="flooding">Flooding</option>
					<option value="closure">Road closure</option>
					<option value="accident">Accident</option>
					<option value="other">Other</option>
				</select>
			</label>
			<label class="text-sm font-medium text-slate-700">
				Severity
				<select bind:value={roadSeverity} class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3">
					<option value="low">Low</option>
					<option value="medium">Medium</option>
					<option value="high">High</option>
				</select>
			</label>
			<label class="text-sm font-medium text-slate-700">
				Traffic level
				<select bind:value={trafficLevel} class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3">
					<option value="light">Light</option>
					<option value="moderate">Moderate</option>
					<option value="heavy">Heavy</option>
					<option value="standstill">Standstill</option>
				</select>
			</label>
			<label class="text-sm font-medium text-slate-700">
				Estimated delay (minutes)
				<input
					bind:value={estimatedDelayMinutes}
					type="number"
					min="0"
					step="1"
					class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3"
				/>
			</label>
			<label class="text-sm font-medium text-slate-700">
				Between street / point A
				<input
					bind:value={startLabel}
					placeholder="Samora Machel Ave"
					class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3"
				/>
			</label>
			<label class="text-sm font-medium text-slate-700">
				And street / point B
				<input
					bind:value={endLabel}
					placeholder="Leopold Takawira St"
					class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3"
				/>
			</label>
			<label class="text-sm font-medium text-slate-700 md:col-span-2">
				Description
				<textarea
					bind:value={roadDescription}
					rows="4"
					placeholder="Explain the condition of the road and what drivers should expect on this stretch."
					class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3"
				></textarea>
			</label>
			{#if zoneOptions().length > 0}
				<label class="text-sm font-medium text-slate-700">
					Related zone
					<select bind:value={selectedZoneId} class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-sky-50 px-3 py-3">
						<option value="">Select zone</option>
						{#each zoneOptions() as option}
							<option value={String(option.zoneId)}>{option.label}</option>
						{/each}
					</select>
				</label>
			{/if}
		</div>

		<div class="space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h3 class="text-lg font-semibold text-slate-900">Select the affected segment on the map</h3>
					<p class="text-sm text-slate-600">
						First tap point A, then tap point B to mark the road section.
					</p>
				</div>
				{#if startLatitude !== null && endLatitude !== null}
					<div class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
						Segment locked
					</div>
				{/if}
			</div>

			<RouteSegmentPickerMap
				bind:this={segmentMap}
				bind:startLatitude
				bind:startLongitude
				bind:endLatitude
				bind:endLongitude
			/>
		</div>

		<button
			type="button"
			onclick={reportRoadIssue}
			disabled={!roadDescription.trim() || submittingIssue}
			class="rounded-full bg-sky-950 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-60"
		>
			{submittingIssue ? 'Submitting…' : 'Submit road issue'}
		</button>
	</section>

	<section class="space-y-4 rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
		<div>
			<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
				Recent route histories
			</h2>
			<p class="text-sm text-slate-600">
				Quick recap of recent runs, route conditions, and time taken.
			</p>
		</div>

		{#if history.loading && !history.ready}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading run history…</p>
		{:else if history.ready && history.current.length === 0}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">No route history yet.</p>
		{:else if history.ready}
			<div class="grid gap-4">
				{#each history.current as run}
					<article class="rounded-[1.5rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p class="font-semibold text-slate-900">Run #{run.run.id}</p>
								<p class="mt-1 text-sm text-slate-600">
									{run.run.runDate} • {run.run.plannedDistanceKm.toFixed(1)} km • {run.elapsedMinutes.toFixed(0)} min
								</p>
							</div>
							<span class="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
								{run.run.status}
							</span>
						</div>
						<p class="mt-3 text-xs text-slate-500">
							{run.roadIssues.length} road issues • {run.stops.length} stops • estimated {run.run.estimatedDurationMinutes.toFixed(0)} min
						</p>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>
