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
						Set the dispatch date and optional ward filter, then run the optimizer.
					</p>
				</div>
				<div class="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
					Route planning
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
							{lastDispatchResult.stopsCreated} stops were generated for {runDate}.
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
								Created {new Date(run.createdAt).toLocaleString()}
							</p>
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
					Open report queue
				</h2>
				<p class="text-sm text-slate-600">
					Resolve or reject open citizen reports using the same redesigned queue cards.
				</p>
			</div>
			<button
				type="button"
				onclick={() => openReports.refresh()}
				class="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-50"
			>
				Refresh queue
			</button>
		</div>

		{#if openReports.loading && !openReports.ready}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading reports…</p>
		{:else if openReports.ready && openReports.current.length === 0}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">No open reports.</p>
		{:else if openReports.ready}
			<div class="grid gap-4 lg:grid-cols-2">
				{#each openReports.current as report}
					<article class="rounded-[1.6rem] border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-cyan-50 p-4 shadow-[0_12px_28px_rgba(8,47,73,0.06)]">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div>
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-sm font-semibold text-slate-900">
										#{report.id} • {report.category.replace('_', ' ')}
									</p>
									<span class="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
										{report.status}
									</span>
								</div>
								<p class="mt-3 text-sm leading-6 text-slate-700">{report.description}</p>
							</div>

							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									onclick={() => closeReport(report.id, 'resolved')}
									class="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
								>
									Resolve
								</button>
								<button
									type="button"
									onclick={() => closeReport(report.id, 'rejected')}
									class="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400"
								>
									Reject
								</button>
								<button
									type="button"
									onclick={() => removeReport(report.id)}
									class="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
								>
									Delete
								</button>
							</div>
						</div>

						<div class="mt-4 grid gap-3 sm:grid-cols-2">
							<div class="rounded-[1.1rem] bg-white/80 px-3 py-3">
								<p class="text-[11px] uppercase tracking-[0.18em] text-slate-500">Location</p>
								<p class="mt-1 text-sm font-semibold text-slate-900">
									{report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
								</p>
							</div>
							<div class="rounded-[1.1rem] bg-white/80 px-3 py-3">
								<p class="text-[11px] uppercase tracking-[0.18em] text-slate-500">Zone</p>
								<p class="mt-1 text-sm font-semibold text-slate-900">{report.zoneName ?? 'Unassigned'}</p>
							</div>
						</div>

						<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
							<p class="text-xs text-slate-500">
								Submitted {new Date(report.createdAt).toLocaleString()}
							</p>
							{#if report.photoUrl}
								<a
									href={report.photoUrl}
									target="_blank"
									rel="noreferrer"
									class="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-50"
								>
									View photo
								</a>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>
