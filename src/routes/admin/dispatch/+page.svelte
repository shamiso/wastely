<script lang="ts">
	import {
		assignRun,
		deleteReport,
		listDrivers,
		listRuns,
		listOpenReports,
		resolveReport,
		runDispatch
	} from '$lib/api/admin-dispatch.remote';

	const openReports = listOpenReports();
	const drivers = listDrivers();
	const initialRunDate = new Date().toISOString().slice(0, 10);
	let runDate = $state(initialRunDate);
	let dispatchRuns = $state(listRuns({ runDate: initialRunDate }));
	let wardId = $state('');
	let lastDispatchResult = $state<{ runsCreated: number; stopsCreated: number } | null>(null);

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
		await openReports.refresh();
	}

	async function updateAssignment(runId: number, driverUserId: string) {
		await assignRun({
			runId,
			driverUserId: driverUserId || null
		});
		loadDispatchRuns();
	}

	async function closeReport(reportId: number, status: 'resolved' | 'rejected') {
		await resolveReport({ reportId, status });
		await openReports.refresh();
	}

	async function removeReport(reportId: number) {
		if (!confirm(`Delete report #${reportId}?`)) return;
		await deleteReport({ reportId });
		await openReports.refresh();
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Dispatch & Triage</h1>
		<p class="text-sm text-slate-600">Generate daily runs and manage incoming reports.</p>
	</div>

	<section class="space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
		<h2 class="text-sm font-semibold text-slate-800">Generate Daily Runs</h2>
		<div class="grid gap-3 sm:grid-cols-3">
			<label class="text-sm font-medium text-slate-700">
				Run date
				<input
					type="date"
					bind:value={runDate}
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
				/>
			</label>
			<label class="text-sm font-medium text-slate-700">
				Ward ID (optional)
				<input
					type="number"
					bind:value={wardId}
					placeholder="e.g. 1"
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
				/>
			</label>
			<div class="flex items-end">
				<button
					type="button"
					onclick={generateRoutes}
					class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Run optimizer
				</button>
			</div>
		</div>
		{#if lastDispatchResult}
			<p class="text-sm text-emerald-700">
				Dispatch created {lastDispatchResult.runsCreated} runs and {lastDispatchResult.stopsCreated} stops.
			</p>
		{/if}
	</section>

	<section class="space-y-3">
		<div class="flex items-center justify-between gap-2">
			<div>
				<h2 class="text-lg font-semibold tracking-tight">Run Assignments</h2>
				<p class="text-sm text-slate-600">Review optimizer output and assign planned runs to drivers.</p>
			</div>
			<button
				type="button"
				onclick={loadDispatchRuns}
				class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
			>
				Refresh runs
			</button>
		</div>

		{#if dispatchRuns.loading && !dispatchRuns.ready}
			<p class="text-sm text-slate-500">Loading dispatch runs...</p>
		{:else if dispatchRuns.ready && dispatchRuns.current.length === 0}
			<p class="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
				No runs scheduled for {runDate}.
			</p>
		{:else if dispatchRuns.ready}
			<div class="grid gap-3">
				{#each dispatchRuns.current as run}
					<article class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p class="text-sm font-semibold text-slate-900">Run #{run.id} • {run.status}</p>
								<p class="mt-1 text-xs text-slate-500">
									{run.stopCount} stops • {run.completedStopCount} done • {run.skippedStopCount} skipped • {run.plannedDistanceKm.toFixed(2)} km
								</p>
							</div>
							<label class="text-sm font-medium text-slate-700">
								Assigned driver
								<select
									value={run.driverUserId ?? ''}
									onchange={(event) => updateAssignment(run.id, (event.currentTarget as HTMLSelectElement).value)}
									disabled={run.status !== 'planned' || (drivers.loading && !drivers.ready)}
									class="mt-1 min-w-56 rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring disabled:cursor-not-allowed disabled:opacity-50"
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
						<p class="mt-2 text-xs text-slate-500">
							Current assignee: {run.driverName ?? 'Unassigned'} • Created {new Date(run.createdAt).toLocaleString()}
						</p>
						{#if run.status !== 'planned'}
							<p class="mt-2 text-xs font-medium text-amber-700">
								Only planned runs can be reassigned.
							</p>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<section class="space-y-3">
		<div class="flex items-center justify-between gap-2">
			<h2 class="text-lg font-semibold tracking-tight">Open Reports</h2>
			<button
				type="button"
				onclick={() => openReports.refresh()}
				class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
			>
				Refresh
			</button>
		</div>

		{#if openReports.loading && !openReports.ready}
			<p class="text-sm text-slate-500">Loading reports...</p>
		{:else if openReports.ready && openReports.current.length === 0}
			<p class="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
				No open reports.
			</p>
		{:else if openReports.ready}
			<div class="grid gap-3">
				{#each openReports.current as report}
					<article class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-sm font-semibold text-slate-900">
								#{report.id} • {report.category.replace('_', ' ')} • {report.status}
							</p>
							<div class="flex gap-2">
								<button
									type="button"
									onclick={() => closeReport(report.id, 'resolved')}
									class="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
								>
									Resolve
								</button>
								<button
									type="button"
									onclick={() => closeReport(report.id, 'rejected')}
									class="rounded bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
								>
									Reject
								</button>
								<button
									type="button"
									onclick={() => removeReport(report.id)}
									class="rounded border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
								>
									Delete
								</button>
							</div>
						</div>
						<p class="mt-2 text-sm text-slate-700">{report.description}</p>
						<p class="mt-1 text-xs text-slate-500">
							Lat/Lng: {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
							{#if report.zoneName}
								• Zone: {report.zoneName}
							{/if}
						</p>
						{#if report.photoUrl}
							<a
								href={report.photoUrl}
								target="_blank"
								rel="noreferrer"
								class="mt-3 inline-flex text-sm font-medium text-blue-700 hover:text-blue-600"
							>
								View photo
							</a>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>
