<script lang="ts">
	import AdminReportQueueCard from '$lib/components/AdminReportQueueCard.svelte';
	import { formatLocationLabel } from '$lib/utils/location';
	import {
		assignRun,
		listAllReports,
		listDrivers,
		listRuns,
		listZones,
		runDispatch
	} from '$lib/api/admin-dispatch.remote';

	const reports = listAllReports();
	const drivers = listDrivers();
	const zones = listZones();
	const initialRunDate = new Date().toISOString().slice(0, 10);
	let runDate = $state(initialRunDate);
	let dispatchRuns = $state(listRuns({ runDate: initialRunDate }));
	let wardId = $state('');
	let lastDispatchResult = $state<{ runsCreated: number; stopsCreated: number } | null>(null);
	let queueRefreshing = $state(false);
	let queueFlashMessage = $state('');
	let queueFlashTone = $state<'success' | 'warning' | 'danger'>('success');
	const unresolvedStatuses = new Set(['open', 'in_review', 'rejected']);

	function sortReports<T extends { updatedAt: number; createdAt: number }>(items: T[] | undefined) {
		return [...(items ?? [])].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
	}

	let unresolvedReports = $derived(
		sortReports(reports.current?.filter((report) => unresolvedStatuses.has(report.status)))
	);
	let resolvedReports = $derived(
		sortReports(reports.current?.filter((report) => report.status === 'resolved'))
	);
	let deletedReports = $derived(
		sortReports(reports.current?.filter((report) => report.status === 'deleted'))
	);

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
		await reports.refresh();
	}

	async function updateAssignment(runId: number, driverUserId: string) {
		await assignRun({
			runId,
			driverUserId: driverUserId || null
		});
		loadDispatchRuns();
	}

	async function refreshQueue() {
		queueRefreshing = true;
		try {
			await Promise.all([reports.refresh(), zones.refresh(), drivers.refresh()]);
		} finally {
			queueRefreshing = false;
		}
	}

	async function handleQueueChanged(detail: {
		message: string;
		tone?: 'success' | 'warning' | 'danger';
	}) {
		queueFlashMessage = detail.message;
		queueFlashTone = detail.tone ?? 'success';
		await reports.refresh();
		loadDispatchRuns();
	}
</script>

<div class="space-y-6">
	<section class="overflow-hidden rounded-[2rem] bg-gradient-to-br from-sky-600 via-cyan-600 to-teal-600 p-6 text-white shadow-[0_24px_70px_rgba(8,47,73,0.16)]">
		<p class="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Dispatch & triage</p>
		<h1 class="mt-2 font-[Georgia] text-4xl font-semibold tracking-tight">
			Launch routes and clear the queue with one visual system
		</h1>
		<p class="mt-3 max-w-2xl text-sm leading-6 text-white/82">
			Generate the day’s runs, assign drivers, and work through open citizen reports without dropping back into the old plain-card layout.
		</p>
	</section>

	<div class="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
		<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
						Generate daily runs
					</h2>
					<p class="text-sm text-slate-600">
						Set the collection date and optional ward filter, then generate the optimized pickup runs.
					</p>
				</div>
				<div class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
					Route planning
				</div>
			</div>

			<div class="mt-5 grid gap-4">
				<label class="text-sm font-medium text-slate-700">
					Collection date
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
						Generate runs
					</button>
					<button
						type="button"
						onclick={loadDispatchRuns}
						class="rounded-full border border-sky-200 bg-white px-5 py-3 text-sm font-semibold text-sky-900 hover:bg-sky-50"
					>
						Refresh runs
					</button>
				</div>

				{#if lastDispatchResult}
					<div class="rounded-[1.35rem] bg-gradient-to-r from-emerald-50 to-cyan-50 p-4">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
							Optimizer result
						</p>
						<p class="mt-2 text-lg font-semibold text-slate-900">
							{lastDispatchResult.runsCreated} runs created
						</p>
						<p class="mt-1 text-sm text-slate-600">
							{lastDispatchResult.stopsCreated} stops were generated for collection on {runDate}.
						</p>
					</div>
				{/if}
			</div>
		</section>

		<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
						Run assignments
					</h2>
					<p class="text-sm text-slate-600">
						Review optimizer output, expected time, and assign planned runs to drivers.
					</p>
				</div>
				<div class="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
					{dispatchRuns.ready ? `${dispatchRuns.current.length} runs` : 'Loading'}
				</div>
			</div>

			{#if dispatchRuns.loading && !dispatchRuns.ready}
				<p class="mt-5 rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading dispatch runs…</p>
			{:else if dispatchRuns.ready && dispatchRuns.current.length === 0}
				<p class="mt-5 rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">
					No runs scheduled for {runDate}.
				</p>
			{:else if dispatchRuns.ready}
				<div class="mt-5 grid gap-4">
					{#each dispatchRuns.current as run}
						<article class="rounded-[1.55rem] border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-cyan-50 p-4 shadow-[0_12px_28px_rgba(8,47,73,0.06)]">
							<div class="flex flex-wrap items-start justify-between gap-4">
								<div class="space-y-3">
									<div class="flex flex-wrap items-center gap-2">
										<p class="text-base font-semibold text-slate-900">Run #{run.id}</p>
										<span class="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
											{run.status}
										</span>
									</div>

									<div class="grid gap-3 sm:grid-cols-3">
										<div class="rounded-[1.1rem] bg-white/80 px-3 py-3">
											<p class="text-[11px] uppercase tracking-[0.18em] text-slate-500">Stops</p>
											<p class="mt-1 text-xl font-semibold text-slate-900">{run.stopCount}</p>
										</div>
										<div class="rounded-[1.1rem] bg-white/80 px-3 py-3">
											<p class="text-[11px] uppercase tracking-[0.18em] text-slate-500">Distance</p>
											<p class="mt-1 text-xl font-semibold text-slate-900">
												{run.plannedDistanceKm.toFixed(1)} km
											</p>
										</div>
										<div class="rounded-[1.1rem] bg-white/80 px-3 py-3">
											<p class="text-[11px] uppercase tracking-[0.18em] text-slate-500">Est. time</p>
											<p class="mt-1 text-xl font-semibold text-slate-900">
												{run.estimatedDurationMinutes.toFixed(0)} min
											</p>
										</div>
									</div>

									<p class="text-xs text-slate-500">
										{run.completedStopCount} done • {run.skippedStopCount} skipped • Assigned to {run.driverName ?? 'nobody yet'}
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

							<p class="mt-4 text-xs text-slate-500">
								Collection date {run.runDate} • Created {new Date(run.createdAt).toLocaleString()}
							</p>
							{#if run.stops.length > 0}
								<div class="mt-4 rounded-[1.2rem] bg-white/75 p-3">
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
										Optimum route order
									</p>
									<div class="mt-3 grid gap-2 sm:grid-cols-2">
										{#each run.stops as stop}
											<div class="rounded-[1rem] bg-sky-50 px-3 py-2 text-sm text-slate-700">
												<p class="font-semibold text-slate-900">
													Stop {stop.sequence} • {stop.status}
												</p>
												<p class="mt-1 text-xs text-slate-500">
													{formatLocationLabel(stop)}
												</p>
											</div>
										{/each}
									</div>
								</div>
							{/if}
							{#if run.status !== 'planned'}
								<p class="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
									Only planned runs can be reassigned
								</p>
							{/if}
						</article>
					{/each}
				</div>
			{/if}
		</section>
	</div>

	<section class="space-y-4 rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
					Report queue by status
				</h2>
				<p class="text-sm text-slate-600">
					Assign zone, driver, and collection date for unresolved reports, while keeping resolved and deleted items visible for audit.
				</p>
			</div>
			<button
				type="button"
				onclick={refreshQueue}
				disabled={queueRefreshing}
				class="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{queueRefreshing ? 'Refreshing…' : 'Refresh queue'}
			</button>
		</div>

		{#if queueFlashMessage}
			<p
				class={`rounded-[1.25rem] px-4 py-3 text-sm font-medium ${
					queueFlashTone === 'danger'
						? 'bg-rose-50 text-rose-700'
						: queueFlashTone === 'warning'
							? 'bg-amber-50 text-amber-700'
							: 'bg-emerald-50 text-emerald-700'
				}`}
			>
				{queueFlashMessage}
			</p>
		{/if}

		{#if reports.loading && !reports.ready}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading reports…</p>
		{:else if reports.ready && reports.current.length === 0}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">No citizen reports yet.</p>
		{:else if reports.ready}
			<div class="space-y-6">
				<section class="space-y-4">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h3 class="font-[Georgia] text-xl font-semibold tracking-tight text-sky-950">
								Unresolved
							</h3>
							<p class="text-sm text-slate-600">
								Open, in-review, or rejected reports that still need officer attention.
							</p>
						</div>
						<div class="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
							{unresolvedReports.length} reports
						</div>
					</div>
					{#if unresolvedReports.length === 0}
						<p class="rounded-2xl bg-sky-50 px-4 py-6 text-sm text-slate-500">
							No unresolved reports.
						</p>
					{:else}
						<div class="grid gap-4 lg:grid-cols-2">
							{#each unresolvedReports as report (report.id)}
								<AdminReportQueueCard
									{report}
									{drivers}
									{zones}
									onChanged={handleQueueChanged}
								/>
							{/each}
						</div>
					{/if}
				</section>

				<section class="space-y-4">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h3 class="font-[Georgia] text-xl font-semibold tracking-tight text-sky-950">
								Resolved
							</h3>
							<p class="text-sm text-slate-600">
								Reports already completed in the field.
							</p>
						</div>
						<div class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
							{resolvedReports.length} reports
						</div>
					</div>
					{#if resolvedReports.length === 0}
						<p class="rounded-2xl bg-sky-50 px-4 py-6 text-sm text-slate-500">No resolved reports.</p>
					{:else}
						<div class="grid gap-4 lg:grid-cols-2">
							{#each resolvedReports as report (report.id)}
								<AdminReportQueueCard
									{report}
									{drivers}
									{zones}
									onChanged={handleQueueChanged}
								/>
							{/each}
						</div>
					{/if}
				</section>

				<section class="space-y-4">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h3 class="font-[Georgia] text-xl font-semibold tracking-tight text-sky-950">
								Deleted
							</h3>
							<p class="text-sm text-slate-600">
								Deleted reports are retained here instead of being removed from the system.
							</p>
						</div>
						<div class="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
							{deletedReports.length} reports
						</div>
					</div>
					{#if deletedReports.length === 0}
						<p class="rounded-2xl bg-sky-50 px-4 py-6 text-sm text-slate-500">No deleted reports.</p>
					{:else}
						<div class="grid gap-4 lg:grid-cols-2">
							{#each deletedReports as report (report.id)}
								<AdminReportQueueCard
									{report}
									{drivers}
									{zones}
									onChanged={handleQueueChanged}
								/>
							{/each}
						</div>
					{/if}
				</section>
			</div>
		{/if}
	</section>
</div>
