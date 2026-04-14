<script lang="ts">
	import InsightMap from '$lib/components/InsightMap.svelte';
	import {
		deleteMyReport,
		listMyReports,
		updateMyReport
	} from '$lib/api/citizen-reports.remote';

	const reports = listMyReports();
	let editingId = $state<number | null>(null);
	let draftCategory = $state('uncollected');
	let draftDescription = $state('');

	function startEdit(report: { id: number; category: string; description: string }) {
		editingId = report.id;
		draftCategory = report.category;
		draftDescription = report.description;
	}

	function cancelEdit() {
		editingId = null;
		draftCategory = 'uncollected';
		draftDescription = '';
	}

	async function saveEdit(reportId: number) {
		await updateMyReport({
			reportId,
			category: draftCategory,
			description: draftDescription
		});
		cancelEdit();
		await reports.refresh();
	}

	async function removeReport(reportId: number) {
		if (!confirm(`Delete report #${reportId}?`)) return;
		await deleteMyReport({ reportId });
		await reports.refresh();
	}

	function markerColor(status: string) {
		if (status === 'resolved') return '#22c55e';
		if (status === 'in_review') return '#f59e0b';
		if (status === 'rejected') return '#fb7185';
		return '#38bdf8';
	}
	
</script>

<div class="space-y-6">
	<section class="overflow-hidden rounded-[2rem] bg-gradient-to-br from-teal-500 via-cyan-600 to-sky-700 p-6 text-white shadow-[0_24px_70px_rgba(8,47,73,0.16)]">
		<p class="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">My reports</p>
		<h1 class="mt-2 font-[Georgia] text-4xl font-semibold tracking-tight">Track every report you’ve sent</h1>
		<p class="mt-3 max-w-2xl text-sm leading-6 text-white/82">
			See where your submissions are on the map, check their status, and update open reports when the situation changes.
		</p>
	</section>

	{#if reports.ready}
		<section class="grid gap-4 sm:grid-cols-3">
			<article class="rounded-[1.5rem] bg-gradient-to-br from-cyan-500 to-sky-600 p-5 text-white shadow-lg">
				<p class="text-xs uppercase tracking-[0.18em] text-white/70">Total reports</p>
				<p class="mt-3 text-4xl font-semibold">{reports.current.length}</p>
			</article>
			<article class="rounded-[1.5rem] bg-gradient-to-br from-amber-300 to-orange-500 p-5 text-slate-950 shadow-lg">
				<p class="text-xs uppercase tracking-[0.18em] text-slate-900/60">Active</p>
				<p class="mt-3 text-4xl font-semibold">
					{reports.current.filter((report) => report.status === 'open' || report.status === 'in_review').length}
				</p>
			</article>
			<article class="rounded-[1.5rem] bg-gradient-to-br from-emerald-400 to-teal-600 p-5 text-white shadow-lg">
				<p class="text-xs uppercase tracking-[0.18em] text-white/70">Resolved</p>
				<p class="mt-3 text-4xl font-semibold">
					{reports.current.filter((report) => report.status === 'resolved').length}
				</p>
			</article>
		</section>
	{/if}

	<section class="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">
					Report map
				</h2>
				<p class="text-sm text-slate-600">Pin-level view of where your complaints were filed.</p>
			</div>
			<button
				type="button"
				onclick={() => reports.refresh()}
				class="rounded-full bg-sky-950 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-900"
			>
				Refresh
			</button>
		</div>

		<div class="mt-4">
			{#if reports.ready && reports.current.length > 0}
				<InsightMap
					ariaLabel="My reports map"
					markers={reports.current.map((report) => ({
						lat: report.latitude,
						lng: report.longitude,
						label: `#${report.id} • ${report.category.replace('_', ' ')} • ${report.status}`,
						color: '#0f172a',
						fillColor: markerColor(report.status)
					}))}
				/>
			{:else if reports.loading && !reports.ready}
				<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading reports…</p>
			{:else}
				<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">
					No reports yet. Use the report tab to submit your first issue.
				</p>
			{/if}
		</div>
	</section>

	<section class="space-y-4 rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur">
		<div>
			<h2 class="font-[Georgia] text-2xl font-semibold tracking-tight text-sky-950">Report history</h2>
			<p class="text-sm text-slate-600">Edit open reports or remove rejected ones when needed.</p>
		</div>

		{#if reports.loading && !reports.ready}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">Loading reports…</p>
		{:else if reports.ready && reports.current.length === 0}
			<p class="rounded-2xl bg-sky-50 px-4 py-10 text-sm text-slate-500">No reports yet.</p>
		{:else if reports.ready}
			<div class="grid gap-4">
				{#each reports.current as report}
					<article class="rounded-[1.5rem] border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-sm font-semibold text-slate-900">
								#{report.id} • {report.category.replace('_', ' ')}
							</p>
							<span class="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
								{report.status}
							</span>
						</div>

						{#if editingId === report.id}
							<div class="mt-4 grid gap-3 sm:grid-cols-2">
								<label class="text-sm font-medium text-slate-700">
									Category
									<select
										bind:value={draftCategory}
										class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-white px-3 py-3"
									>
										<option value="uncollected">Uncollected waste</option>
										<option value="illegal_dumping">Illegal dumping</option>
										<option value="overflowing_bin">Overflowing bin</option>
										<option value="other">Other</option>
									</select>
								</label>
								<label class="text-sm font-medium text-slate-700 sm:col-span-2">
									Description
									<textarea
										bind:value={draftDescription}
										rows="3"
										class="mt-2 w-full rounded-[1.1rem] border border-sky-100 bg-white px-3 py-3"
									></textarea>
								</label>
								<div class="sm:col-span-2 flex flex-wrap gap-2">
									<button
										type="button"
										onclick={() => saveEdit(report.id)}
										class="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-400"
									>
										Save changes
									</button>
									<button
										type="button"
										onclick={cancelEdit}
										class="rounded-full border border-sky-200 bg-white px-4 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-50"
									>
										Cancel
									</button>
								</div>
							</div>
						{:else}
							<p class="mt-3 text-sm leading-6 text-slate-700">{report.description}</p>
							<p class="mt-3 text-xs text-slate-500">
								{report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
								{#if report.zoneName}
									• {report.zoneName}
								{/if}
							</p>
							<p class="mt-1 text-xs text-slate-500">
								Submitted {new Date(report.createdAt).toLocaleString()}
							</p>

							<div class="mt-4 flex flex-wrap gap-2">
								{#if ['open', 'rejected'].includes(report.status)}
									<button
										type="button"
										onclick={() =>
											startEdit({
												id: report.id,
												category: report.category,
												description: report.description
											})}
										class="rounded-full border border-sky-200 bg-white px-4 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-50"
									>
										Edit
									</button>
									<button
										type="button"
										onclick={() => removeReport(report.id)}
										class="rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
									>
										Delete
									</button>
								{/if}
								{#if report.photoUrl}
									<a
										href={report.photoUrl}
										target="_blank"
										rel="noreferrer"
										class="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100"
									>
										View photo
									</a>
								{/if}
							</div>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>
