<script lang="ts">
	import InsightMap from '$lib/components/InsightMap.svelte';
	import {
		assignRun,
		listDrivers,
		listRuns,
		runDispatch
	} from '$lib/api/admin-dispatch.remote';
	import {
		citizenReportMap,
		datasetHealth,
		kpiSnapshot,
		zoneDemand
	} from '$lib/api/dashboard.remote';

	const kpis = kpiSnapshot({});
	const demand = zoneDemand({});
	const dataset = datasetHealth();
	const reportMap = citizenReportMap();
	const drivers = listDrivers();
	const initialRunDate = new Date().toISOString().slice(0, 10);
	let runDate = $state(initialRunDate);
	let dispatchRuns = $state(listRuns({ runDate: initialRunDate }));
	let wardId = $state('');
	let lastDispatchResult = $state<{ runsCreated: number; stopsCreated: number } | null>(null);

	function reportColor(status: string) {
		if (status === 'resolved') {
			return {
				color: '#047857',
				fillColor: '#34d399'
			};
		}

		if (status === 'in_review') {
			return {
				color: '#b45309',
				fillColor: '#f59e0b'
			};
		}

		return {
			color: '#9f1239',
			fillColor: '#fb7185'
		};
	}

	function loadDispatchRuns() {
		dispatchRuns = listRuns({ runDate });
	}

	async function generateRoutes() {
		const result = await runDispatch({
			runDate,
			wardId: wardId || undefined
		});
		lastDispatchResult = {
			runsCreated: result.runsCreated,
			stopsCreated: result.stopsCreated
		};
		loadDispatchRuns();
		await Promise.all([kpis.refresh(), reportMap.refresh()]);
	}

	async function updateAssignment(runId: number, driverUserId: string) {
		await assignRun({
			runId,
			driverUserId: driverUserId || null
		});
		loadDispatchRuns();
	}

	let queuePressure = $derived(
		reportMap.ready ? reportMap.current.openReports + reportMap.current.inReviewReports : 0
	);
	let resolutionRate = $derived(
		reportMap.ready && reportMap.current.totalReports > 0
			? (reportMap.current.resolvedReports / reportMap.current.totalReports) * 100
			: 0
	);
	let dispatchCompletion = $derived(
		kpis.ready && kpis.current.plannedRuns > 0
			? (kpis.current.completedRuns / kpis.current.plannedRuns) * 100
			: 0
	);
	let topComplaintZone = $derived(
		reportMap.ready ? (reportMap.current.volumesByZone[0] ?? null) : null
	);
	let topForecastZone = $derived(demand.ready ? (demand.current[0] ?? null) : null);
	let forecastCoverage = $derived(demand.ready ? demand.current.length : 0);
</script>

<div class="space-y-6">
	<section class="overflow-hidden rounded-[2.2rem] bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.38),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.32),_transparent_24%),linear-gradient(135deg,_#082f49_0%,_#0f766e_50%,_#0ea5e9_100%)] p-6 text-white shadow-[0_28px_80px_rgba(8,47,73,0.2)]">
		<div class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
			<div class="space-y-5">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
						Officer dashboard
					</p>
					<h1 class="mt-3 max-w-3xl font-[Georgia] text-5xl font-semibold tracking-tight">
						Command view for waste pressure, route readiness, and hotspot control
					</h1>
					<p class="mt-4 max-w-2xl text-sm leading-7 text-white/82">
						A dashboard should feel like a control room, not a stack of cards. This layout pushes the hottest zone, forecast signal, queue pressure, and dispatch health into one scan path.
					</p>
				</div>

				<div class="flex flex-wrap gap-3">
					<button
						type="button"
						onclick={async () => {
							loadDispatchRuns();
							await Promise.all([
								kpis.refresh(),
								demand.refresh(),
								dataset.refresh(),
								reportMap.refresh(),
								drivers.refresh()
							]);
						}}
						class="rounded-full bg-white px-5 py-3 text-sm font-semibold text-sky-950 hover:bg-sky-50"
					>
						Refresh control room
					</button>
					<a
						href="/admin/dispatch"
						class="rounded-full border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
					>
						Open dispatch
					</a>
					<a
						href="/admin/reports"
						class="rounded-full border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
					>
						Open citizen queue
					</a>
				</div>
			</div>

			<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
				<div class="rounded-[1.7rem] border border-white/20 bg-white/12 p-5 backdrop-blur">
					<p class="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Hot zone</p>
					{#if topComplaintZone}
						<p class="mt-3 text-3xl font-semibold">{topComplaintZone.zoneName}</p>
						<p class="mt-2 text-sm text-white/78">
							{topComplaintZone.reportCount} reports in total, {topComplaintZone.openCount} still active.
						</p>
					{:else}
						<p class="mt-3 text-sm text-white/78">Waiting for enough citizen reports to identify the dominant zone.</p>
					{/if}
				</div>

				<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
					<div class="rounded-[1.7rem] border border-white/20 bg-white/12 p-5 backdrop-blur">
						<p class="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Queue pressure</p>
						<p class="mt-3 text-4xl font-semibold">{queuePressure}</p>
						<p class="mt-2 text-sm text-white/78">Open plus in-review reports.</p>
					</div>
					<div class="rounded-[1.7rem] border border-white/20 bg-white/12 p-5 backdrop-blur">
						<p class="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Run completion</p>
						<p class="mt-3 text-4xl font-semibold">{dispatchCompletion.toFixed(0)}%</p>
						<p class="mt-2 text-sm text-white/78">Completed runs versus planned runs today.</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="grid gap-4 xl:grid-cols-[1.45fr_0.85fr_0.7fr]">
		<article class="rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Citizen report map</p>
					<h2 class="mt-2 font-[Georgia] text-3xl font-semibold tracking-tight text-sky-950">
						Origin field
					</h2>
				</div>
				{#if reportMap.ready}
					<div class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
						{reportMap.current.totalReports} total pins
					</div>
				{/if}
			</div>

			<div class="mt-4">
				{#if reportMap.loading && !reportMap.ready}
					<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading report map…</p>
				{:else if reportMap.ready && reportMap.current.pins.length > 0}
					<InsightMap
						ariaLabel="Citizen report map"
						markers={reportMap.current.pins.map((pin) => ({
							lat: pin.latitude,
							lng: pin.longitude,
							label: `${pin.zoneName ?? 'Unassigned'} • ${pin.category.replace('_', ' ')} • ${pin.status}`,
							...reportColor(pin.status)
						}))}
					/>
				{:else}
					<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">
						No citizen report locations available yet.
					</p>
				{/if}
			</div>
		</article>

		<article class="rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div>
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Signal board</p>
				<h2 class="mt-2 font-[Georgia] text-3xl font-semibold tracking-tight text-sky-950">
					Operational pulse
				</h2>
			</div>

			<div class="mt-5 space-y-4">
				<div class="rounded-[1.5rem] bg-gradient-to-br from-cyan-500 to-sky-600 p-4 text-white">
					<p class="text-xs uppercase tracking-[0.18em] text-white/70">Open reports</p>
					<p class="mt-2 text-4xl font-semibold">{kpis.ready ? kpis.current.openReports : '...'}</p>
					<p class="mt-2 text-sm text-white/78">Live backlog waiting on action.</p>
				</div>
				<div class="rounded-[1.5rem] bg-gradient-to-br from-emerald-400 to-teal-600 p-4 text-white">
					<p class="text-xs uppercase tracking-[0.18em] text-white/70">Resolved share</p>
					<p class="mt-2 text-4xl font-semibold">{resolutionRate.toFixed(0)}%</p>
					<p class="mt-2 text-sm text-white/78">Resolved reports across the current report pool.</p>
				</div>
				<div class="rounded-[1.5rem] bg-gradient-to-br from-amber-300 to-orange-500 p-4 text-slate-950">
					<p class="text-xs uppercase tracking-[0.18em] text-slate-900/60">Avg response</p>
					<p class="mt-2 text-4xl font-semibold">{kpis.ready ? `${kpis.current.averageResponseHours.toFixed(1)}h` : '...'}</p>
					<p class="mt-2 text-sm text-slate-900/72">Time to resolution across completed cases.</p>
				</div>
			</div>
		</article>

		<article class="rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div>
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Daily stack</p>
				<h2 class="mt-2 font-[Georgia] text-3xl font-semibold tracking-tight text-sky-950">
					Today
				</h2>
			</div>

			<div class="mt-5 grid gap-3">
				<div class="rounded-[1.35rem] bg-slate-950 p-4 text-white">
					<p class="text-xs uppercase tracking-[0.18em] text-white/60">Planned runs</p>
					<p class="mt-2 text-3xl font-semibold">{kpis.ready ? kpis.current.plannedRuns : '...'}</p>
				</div>
				<div class="rounded-[1.35rem] bg-sky-50 p-4">
					<p class="text-xs uppercase tracking-[0.18em] text-sky-700">Completed runs</p>
					<p class="mt-2 text-3xl font-semibold text-slate-900">{kpis.ready ? kpis.current.completedRuns : '...'}</p>
				</div>
				<div class="rounded-[1.35rem] bg-rose-50 p-4">
					<p class="text-xs uppercase tracking-[0.18em] text-rose-700">Distance planned</p>
					<p class="mt-2 text-3xl font-semibold text-slate-900">{kpis.ready ? `${kpis.current.totalDistanceKm.toFixed(1)} km` : '...'}</p>
				</div>
			</div>
		</article>
	</section>

	<section class="grid gap-6 xl:grid-cols-[0.84fr_1.16fr]">
		<article class="rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Officer controls</p>
					<h2 class="mt-2 font-[Georgia] text-3xl font-semibold tracking-tight text-sky-950">
						Generate and assign runs
					</h2>
				</div>
				<div class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
					Municipal officer
				</div>
			</div>

			<div class="mt-5 grid gap-4">
				<label class="text-sm font-medium text-slate-700">
					Run date
					<input
						type="date"
						bind:value={runDate}
						class="mt-2 w-full rounded-[1.2rem] border border-sky-100 bg-sky-50 px-4 py-3 outline-none ring-sky-300 focus:ring"
					/>
				</label>
				<label class="text-sm font-medium text-slate-700">
					Ward ID
					<input
						type="number"
						bind:value={wardId}
						placeholder="Optional"
						class="mt-2 w-full rounded-[1.2rem] border border-sky-100 bg-sky-50 px-4 py-3 outline-none ring-sky-300 focus:ring"
					/>
				</label>

				<div class="flex flex-wrap gap-3">
					<button
						type="button"
						onclick={generateRoutes}
						class="rounded-full bg-sky-950 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-900"
					>
						Run optimizer
					</button>
					<button
						type="button"
						onclick={loadDispatchRuns}
						class="rounded-full border border-sky-200 bg-white px-5 py-3 text-sm font-semibold text-sky-900 hover:bg-sky-50"
					>
						Load runs
					</button>
				</div>

				{#if lastDispatchResult}
					<div class="rounded-[1.35rem] bg-gradient-to-r from-emerald-50 to-cyan-50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
							Last optimization
						</p>
						<p class="mt-2 text-lg font-semibold text-slate-900">
							{lastDispatchResult.runsCreated} runs and {lastDispatchResult.stopsCreated} stops created
						</p>
						<p class="mt-1 text-sm text-slate-600">For {runDate}.</p>
					</div>
				{/if}
			</div>
		</article>

		<article class="rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Run assignment board</p>
					<h2 class="mt-2 font-[Georgia] text-3xl font-semibold tracking-tight text-sky-950">
						Assign runs to drivers
					</h2>
				</div>
				<div class="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
					{dispatchRuns.ready ? `${dispatchRuns.current.length} runs` : 'Loading'}
				</div>
			</div>

			{#if dispatchRuns.loading && !dispatchRuns.ready}
				<p class="mt-5 rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading runs…</p>
			{:else if dispatchRuns.ready && dispatchRuns.current.length === 0}
				<p class="mt-5 rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">
					No runs loaded for {runDate} yet.
				</p>
			{:else if dispatchRuns.ready}
				<div class="mt-5 grid gap-4">
					{#each dispatchRuns.current.slice(0, 6) as run}
						<div class="rounded-[1.5rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
							<div class="flex flex-wrap items-start justify-between gap-4">
								<div class="space-y-2">
									<div class="flex flex-wrap items-center gap-2">
										<p class="text-base font-semibold text-slate-900">Run #{run.id}</p>
										<span class="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
											{run.status}
										</span>
									</div>
									<p class="text-sm text-slate-600">
										{run.stopCount} stops • {run.plannedDistanceKm.toFixed(1)} km • {run.estimatedDurationMinutes.toFixed(0)} min
									</p>
									<p class="text-xs text-slate-500">
										Currently assigned to {run.driverName ?? 'nobody yet'}
									</p>
								</div>

								<label class="min-w-64 text-sm font-medium text-slate-700">
									Assign driver
									<select
										value={run.driverUserId ?? ''}
										onchange={(event) => updateAssignment(run.id, (event.currentTarget as HTMLSelectElement).value)}
										disabled={run.status !== 'planned' || (drivers.loading && !drivers.ready)}
										class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-white px-4 py-3 outline-none ring-sky-300 focus:ring disabled:cursor-not-allowed disabled:opacity-50"
									>
										<option value="">Unassigned</option>
										{#if drivers.ready}
											{#each drivers.current as driver}
												<option value={driver.userId}>
													{driver.name} ({driver.email})
												</option>
											{/each}
										{/if}
									</select>
								</label>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</article>
	</section>

	<div class="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
		<section class="rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Zone report load</p>
					<h2 class="mt-2 font-[Georgia] text-3xl font-semibold tracking-tight text-sky-950">
						Backlog ladder
					</h2>
				</div>
				{#if topComplaintZone}
					<div class="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
						Lead zone: {topComplaintZone.zoneName}
					</div>
				{/if}
			</div>

			{#if reportMap.ready && reportMap.current.volumesByZone.length > 0}
				<div class="mt-5 space-y-4">
					{#each reportMap.current.volumesByZone.slice(0, 8) as volume, index}
						<div class="rounded-[1.4rem] border border-sky-100 bg-gradient-to-r from-white to-sky-50 p-4">
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="text-sm font-semibold text-slate-900">{index + 1}. {volume.zoneName}</p>
									<p class="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
										{volume.openCount} active • {volume.resolvedCount} resolved
									</p>
								</div>
								<p class="text-sm font-semibold text-slate-500">{volume.reportCount} reports</p>
							</div>
							<div class="mt-3 h-3 overflow-hidden rounded-full bg-sky-100">
								<div
									class="h-full rounded-full bg-gradient-to-r from-teal-400 via-sky-500 to-blue-600"
									style={`width: ${Math.max(12, (volume.reportCount / reportMap.current.volumesByZone[0].reportCount) * 100)}%`}
								></div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="mt-5 rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">
					Zone-level complaint load will appear after reports come in.
				</p>
			{/if}
		</section>

		<section class="rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">ML waste forecast</p>
					<h2 class="mt-2 font-[Georgia] text-3xl font-semibold tracking-tight text-sky-950">
						Forecast board
					</h2>
				</div>
				{#if topForecastZone}
					<div class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
						{topForecastZone.modelSource === 'heuristic' ? 'Fallback model' : 'Python ML'} • {topForecastZone.modelVersion}
					</div>
				{/if}
			</div>

			{#if demand.loading && !demand.ready}
				<p class="mt-5 rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading forecasts…</p>
			{:else if demand.ready && demand.current.length > 0}
				<div class="mt-5 grid gap-4">
					<div class="grid gap-4 md:grid-cols-[1fr_0.9fr]">
						<div class="rounded-[1.6rem] bg-gradient-to-br from-slate-950 via-sky-950 to-teal-800 p-5 text-white">
							<p class="text-xs uppercase tracking-[0.18em] text-white/60">Highest predicted load</p>
							<p class="mt-3 text-3xl font-semibold">{topForecastZone?.zoneName ?? 'Waiting…'}</p>
							<p class="mt-2 text-5xl font-semibold">
								{topForecastZone ? `${topForecastZone.predictedVolumeKg.toFixed(1)}kg` : '...'}
							</p>
							<p class="mt-3 text-sm text-white/76">
								Confidence {topForecastZone ? `${(topForecastZone.confidence * 100).toFixed(0)}%` : '...'} across {forecastCoverage} forecasted zones.
							</p>
						</div>

						<div class="grid gap-3">
							{#each demand.current.slice(1, 3) as row}
								<div class="rounded-[1.35rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
									<p class="text-xs uppercase tracking-[0.18em] text-sky-700">{row.forecastDate}</p>
									<p class="mt-2 text-lg font-semibold text-slate-900">{row.zoneName}</p>
									<p class="mt-2 text-3xl font-semibold text-sky-950">{row.predictedVolumeKg.toFixed(1)}kg</p>
									<p class="mt-1 text-sm text-slate-500">{(row.confidence * 100).toFixed(0)}% confidence</p>
								</div>
							{/each}
						</div>
					</div>

					<div class="rounded-[1.6rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
						<div class="flex items-center justify-between gap-3">
							<p class="text-sm font-semibold text-slate-900">Forecast ranking</p>
							<p class="text-xs uppercase tracking-[0.16em] text-slate-500">Next dispatch cycle</p>
						</div>
						<div class="mt-4 space-y-3">
							{#each demand.current.slice(0, 6) as row, index}
								<div class="flex items-center justify-between gap-3 rounded-[1.15rem] bg-white px-4 py-3">
									<div class="flex items-center gap-3">
										<div class="grid h-9 w-9 place-items-center rounded-full bg-sky-100 text-sm font-semibold text-sky-900">
											{index + 1}
										</div>
										<div>
											<p class="font-semibold text-slate-900">{row.zoneName}</p>
											<p class="text-xs uppercase tracking-[0.16em] text-slate-500">
												{row.modelSource} • {row.modelVersion}
											</p>
										</div>
									</div>
									<div class="text-right">
										<p class="font-semibold text-slate-900">{row.predictedVolumeKg.toFixed(1)}kg</p>
										<p class="text-xs text-slate-500">{(row.confidence * 100).toFixed(0)}%</p>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{:else}
				<p class="mt-5 rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">
					No forecasts available yet.
				</p>
			{/if}
		</section>
	</div>

	{#if dataset.ready}
		<section class="rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Data engine</p>
					<h2 class="mt-2 font-[Georgia] text-3xl font-semibold tracking-tight text-sky-950">
						What is feeding the model and the queue
					</h2>
				</div>
				<div class="rounded-full bg-slate-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white">
					{dataset.current.totalIntegratedRecords} integrated records
				</div>
			</div>

			<div class="mt-5 grid gap-4 lg:grid-cols-4">
				<div class="rounded-[1.45rem] bg-gradient-to-br from-cyan-500 to-sky-600 p-4 text-white">
					<p class="text-xs uppercase tracking-[0.18em] text-white/70">Citizen reports</p>
					<p class="mt-2 text-3xl font-semibold">{dataset.current.totalCitizenReports}</p>
				</div>
				<div class="rounded-[1.45rem] bg-gradient-to-br from-emerald-400 to-teal-600 p-4 text-white">
					<p class="text-xs uppercase tracking-[0.18em] text-white/70">Driver logs</p>
					<p class="mt-2 text-3xl font-semibold">{dataset.current.totalDriverLogs}</p>
				</div>
				<div class="rounded-[1.45rem] bg-gradient-to-br from-amber-300 to-orange-500 p-4 text-slate-950">
					<p class="text-xs uppercase tracking-[0.18em] text-slate-900/60">Zone coverage</p>
					<p class="mt-2 text-3xl font-semibold">{dataset.current.zoneCoveragePct.toFixed(0)}%</p>
				</div>
				<div class="rounded-[1.45rem] bg-gradient-to-br from-fuchsia-300 to-pink-500 p-4 text-slate-950">
					<p class="text-xs uppercase tracking-[0.18em] text-slate-900/60">Photo coverage</p>
					<p class="mt-2 text-3xl font-semibold">{dataset.current.photoCoveragePct.toFixed(0)}%</p>
				</div>
			</div>

			<div class="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
				<div class="rounded-[1.5rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
					<p class="text-xs uppercase tracking-[0.18em] text-sky-700">Recent update cadence</p>
					<p class="mt-2 text-4xl font-semibold text-slate-900">{dataset.current.recordsLast7Days}</p>
					<p class="mt-2 text-sm text-slate-500">
						{dataset.current.dailyUpdateFrequency.toFixed(2)} integrated updates per day over the last 7 days.
					</p>
				</div>

				<div class="rounded-[1.5rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="rounded-[1.15rem] bg-white px-4 py-3">
							<p class="text-xs uppercase tracking-[0.16em] text-slate-500">Last citizen update</p>
							<p class="mt-2 text-sm font-semibold text-slate-900">
								{dataset.current.lastCitizenReportAt
									? new Date(dataset.current.lastCitizenReportAt).toLocaleString()
									: 'No citizen report yet'}
							</p>
						</div>
						<div class="rounded-[1.15rem] bg-white px-4 py-3">
							<p class="text-xs uppercase tracking-[0.16em] text-slate-500">Last driver log</p>
							<p class="mt-2 text-sm font-semibold text-slate-900">
								{dataset.current.lastDriverLogAt
									? new Date(dataset.current.lastDriverLogAt).toLocaleString()
									: 'No driver log yet'}
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>
	{/if}
</div>
