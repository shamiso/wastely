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

	const serviceNodePositions = [
		{ left: 12, top: 14 },
		{ left: 63, top: 10 },
		{ left: 79, top: 39 },
		{ left: 58, top: 73 },
		{ left: 22, top: 76 },
		{ left: 6, top: 45 }
	];
	const serviceNodeAccents = [
		{
			shell: 'from-cyan-400/28 via-sky-500/22 to-blue-600/28',
			border: 'border-cyan-200/70',
			badge: 'bg-cyan-100 text-cyan-900',
			glow: 'bg-cyan-300/28'
		},
		{
			shell: 'from-emerald-300/28 via-teal-500/20 to-sky-500/26',
			border: 'border-emerald-200/70',
			badge: 'bg-emerald-100 text-emerald-900',
			glow: 'bg-emerald-300/28'
		},
		{
			shell: 'from-amber-200/28 via-orange-300/22 to-rose-300/22',
			border: 'border-amber-200/70',
			badge: 'bg-amber-100 text-amber-900',
			glow: 'bg-amber-300/24'
		},
		{
			shell: 'from-fuchsia-200/24 via-pink-300/20 to-rose-400/22',
			border: 'border-fuchsia-200/70',
			badge: 'bg-fuchsia-100 text-fuchsia-900',
			glow: 'bg-fuchsia-300/24'
		},
		{
			shell: 'from-sky-200/24 via-indigo-200/20 to-blue-300/24',
			border: 'border-sky-200/70',
			badge: 'bg-sky-100 text-sky-900',
			glow: 'bg-sky-300/24'
		},
		{
			shell: 'from-lime-200/24 via-emerald-200/20 to-teal-300/24',
			border: 'border-lime-200/70',
			badge: 'bg-lime-100 text-lime-900',
			glow: 'bg-lime-300/24'
		}
	];

	function spreadPins(
		pins: Array<{
			id: number;
			latitude: number;
			longitude: number;
			zoneName: string | null;
			category: string;
			status: string;
		}>
	) {
		const grouped = new Map<string, typeof pins>();

		for (const pin of pins) {
			const key = `${pin.latitude.toFixed(4)}:${pin.longitude.toFixed(4)}`;
			const bucket = grouped.get(key) ?? [];
			bucket.push(pin);
			grouped.set(key, bucket);
		}

		return [...grouped.values()].flatMap((group) => {
			if (group.length === 1) return group;

			return group.map((pin, index) => {
				const angle = (Math.PI * 2 * index) / group.length;
				const offset = 0.0016 + index * 0.00022;
				return {
					...pin,
					latitude: Number((pin.latitude + Math.sin(angle) * offset).toFixed(6)),
					longitude: Number((pin.longitude + Math.cos(angle) * offset).toFixed(6))
				};
			});
		});
	}

	let serviceFieldNodes = $derived(
		reportMap.ready
			? reportMap.current.volumesByZone.slice(0, 6).map((volume, index) => {
					const forecast =
						demand.ready
							? demand.current.find((row) => row.zoneName === volume.zoneName) ?? null
							: null;
					return {
						...volume,
						predictedVolumeKg: forecast?.predictedVolumeKg ?? null,
						confidence: forecast?.confidence ?? null,
						position: serviceNodePositions[index % serviceNodePositions.length],
						accent: serviceNodeAccents[index % serviceNodeAccents.length]
					};
				})
			: []
	);
	let spreadReportPins = $derived(
		reportMap.ready ? spreadPins(reportMap.current.pins) : []
	);
	let liveLoadCenter = $derived(
		reportMap.ready
			? {
					value: queuePressure,
					label: queuePressure > 0 ? 'Active load' : 'Queue clear'
				}
			: { value: 0, label: 'Loading live load' }
	);
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
		<article class="rounded-[2rem] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(240,249,255,0.88))] p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Service field</p>
					<h2 class="mt-2 font-[Georgia] text-3xl font-semibold tracking-tight text-sky-950">
						Live load constellation
					</h2>
					<p class="mt-2 max-w-xl text-sm leading-6 text-slate-600">
						A roomier network view of the busiest zones, paired with a geographic map that now offsets crowded report pins instead of stacking them into a dead center blob.
					</p>
				</div>
				{#if reportMap.ready}
					<div class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
						{reportMap.current.totalReports} total pins
					</div>
				{/if}
			</div>

			<div class="mt-5 grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
				<div class="overflow-hidden rounded-[1.9rem] bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.18),transparent_20%),radial-gradient(circle_at_80%_25%,rgba(45,212,191,0.16),transparent_18%),linear-gradient(160deg,#082f49_0%,#0f172a_52%,#134e4a_100%)] p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Node spacing</p>
							<p class="mt-2 text-lg font-semibold">Backlog, forecast, and zone urgency in one field</p>
						</div>
						<div class="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72">
							{serviceFieldNodes.length} nodes
						</div>
					</div>

					<div class="relative mt-5 min-h-[26rem] overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/6">
						<div class="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:4.6rem_4.6rem] opacity-35"></div>
						<div class="pointer-events-none absolute left-1/2 top-1/2 h-[16rem] w-[16rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/15"></div>
						<div class="pointer-events-none absolute left-1/2 top-1/2 h-[23rem] w-[23rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/10"></div>

						{#if serviceFieldNodes.length > 0}
							{#each serviceFieldNodes as node, index}
								<div
									class="absolute h-px origin-left bg-gradient-to-r from-white/6 via-cyan-300/28 to-white/6"
									style={`left: 50%; top: 50%; width: ${
										index % 2 === 0 ? '10.5rem' : '9rem'
									}; transform: rotate(${index * 60 - 18}deg);`}
								></div>
								<div
									class={`absolute h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl ${node.accent.glow}`}
									style={`left: ${node.position.left}%; top: ${node.position.top}%;`}
								></div>
								<div
									class={`absolute w-[11.5rem] -translate-x-1/2 -translate-y-1/2 rounded-[1.45rem] border bg-gradient-to-br ${node.accent.shell} ${node.accent.border} p-3 shadow-[0_20px_50px_rgba(8,47,73,0.25)] backdrop-blur-md`}
									style={`left: ${node.position.left}%; top: ${node.position.top}%;`}
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<p class="truncate text-sm font-semibold text-white">{node.zoneName}</p>
											<p class="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/62">
												{node.openCount} active • {node.resolvedCount} cleared
											</p>
										</div>
										<div class={`rounded-full px-2 py-1 text-[11px] font-semibold ${node.accent.badge}`}>
											{node.reportCount}
										</div>
									</div>
									<div class="mt-3 flex items-end justify-between gap-3">
										<div>
											<p class="text-[10px] uppercase tracking-[0.18em] text-white/55">Forecast</p>
											<p class="mt-1 text-sm font-semibold text-white">
												{node.predictedVolumeKg !== null ? `${node.predictedVolumeKg.toFixed(0)}kg` : 'Pending'}
											</p>
										</div>
										<div class="text-right">
											<p class="text-[10px] uppercase tracking-[0.18em] text-white/55">Confidence</p>
											<p class="mt-1 text-sm font-semibold text-white">
												{node.confidence !== null ? `${(node.confidence * 100).toFixed(0)}%` : '--'}
											</p>
										</div>
									</div>
								</div>
							{/each}

							<div class="absolute left-1/2 top-1/2 w-[10.5rem] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border border-white/15 bg-white/10 p-4 text-center shadow-[0_24px_70px_rgba(8,47,73,0.28)] backdrop-blur-md">
								<p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">
									{liveLoadCenter.label}
								</p>
								{#if liveLoadCenter.value > 0}
									<p class="mt-3 text-5xl font-semibold text-white">{liveLoadCenter.value}</p>
									<p class="mt-2 text-xs text-white/66">Open plus in-review reports</p>
								{:else}
									<p class="mt-4 text-lg font-semibold text-white">No active pileup</p>
									<p class="mt-2 text-xs text-white/66">Fresh reports will light this field up.</p>
								{/if}
							</div>
						{:else}
							<div class="absolute inset-0 grid place-items-center px-6 text-center">
								<div class="max-w-sm rounded-[1.6rem] border border-white/12 bg-white/8 p-5 backdrop-blur">
									<p class="text-lg font-semibold text-white">No zones are active yet</p>
									<p class="mt-2 text-sm leading-6 text-white/70">
										Once citizen reports arrive, this constellation will spread the busiest zones out instead of stacking them on top of each other.
									</p>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<div>
					<div class="rounded-[1.6rem] border border-sky-100 bg-white/70 p-4 shadow-[0_18px_40px_rgba(8,47,73,0.08)]">
						<div class="flex items-center justify-between gap-3">
							<div>
								<p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Geographic view</p>
								<p class="mt-1 text-sm text-slate-600">Nearby report pins are now fanned out for readability.</p>
							</div>
							<div class="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
								Offset pin layout
							</div>
						</div>
					</div>

					<div class="mt-4">
				{#if reportMap.loading && !reportMap.ready}
					<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading report map…</p>
				{:else if reportMap.ready && reportMap.current.pins.length > 0}
					<InsightMap
						ariaLabel="Citizen report map"
						markers={spreadReportPins.map((pin) => ({
							lat: pin.latitude,
							lng: pin.longitude,
							label: `${pin.zoneName ?? 'Unassigned'} • ${pin.category.replace('_', ' ')} • ${pin.status}`,
							radius: pin.status === 'resolved' ? 8 : pin.status === 'in_review' ? 10 : 11,
							...reportColor(pin.status)
						}))}
					/>
				{:else}
					<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">
						No citizen report locations available yet.
					</p>
				{/if}
			</div>
				</div>
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
						<div class="rounded-[1.7rem] border border-sky-100 bg-[linear-gradient(155deg,rgba(255,255,255,1),rgba(240,249,255,0.95),rgba(237,233,254,0.42))] p-4 shadow-[0_18px_40px_rgba(8,47,73,0.08)]">
							<div class="flex flex-wrap items-start justify-between gap-4">
								<div class="space-y-2">
									<p class="text-base font-semibold text-slate-900">Run #{run.id}</p>
									<span class="inline-flex rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
										{run.status} • {run.stopCount} stops • {run.plannedDistanceKm.toFixed(1)} km • {run.estimatedDurationMinutes.toFixed(0)} min
									</span>
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
