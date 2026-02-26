<script lang="ts">
	import {
		listOpenReports,
		resolveReport,
		runDispatch
	} from '$lib/api/admin-dispatch.remote';

	const openReports = listOpenReports();
	let runDate = $state(new Date().toISOString().slice(0, 10));
	let wardId = $state('');
	let lastDispatchResult = $state<{ runsCreated: number; stopsCreated: number } | null>(null);

	async function generateRoutes() {
		const result = await runDispatch({
			runDate,
			wardId: wardId || undefined
		});
		lastDispatchResult = {
			runsCreated: result.runsCreated,
			stopsCreated: result.stopsCreated
		};
		await openReports.refresh();
	}

	async function closeReport(reportId: number, status: 'resolved' | 'rejected') {
		await resolveReport({ reportId, status });
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
							</div>
						</div>
						<p class="mt-2 text-sm text-slate-700">{report.description}</p>
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
