<script lang="ts">
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
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">My Reports</h1>
			<p class="text-sm text-slate-600">Track status for your submitted waste issues.</p>
		</div>
		<button
			type="button"
			onclick={() => reports.refresh()}
			class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
		>
			Refresh
		</button>
	</div>

	{#if reports.loading && !reports.ready}
		<p class="text-sm text-slate-500">Loading reports...</p>
	{:else if reports.ready && reports.current.length === 0}
		<p class="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
			No reports yet. Use the citizen report form to submit your first issue.
		</p>
	{:else if reports.ready}
		<div class="grid gap-3">
			{#each reports.current as report}
				<article class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<p class="text-sm font-semibold text-slate-900">
							#{report.id} • {report.category.replace('_', ' ')}
						</p>
						<span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
							{report.status}
						</span>
					</div>

					{#if editingId === report.id}
						<div class="mt-3 grid gap-3 sm:grid-cols-2">
							<label class="text-sm font-medium text-slate-700">
								Category
								<select
									bind:value={draftCategory}
									class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
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
									class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
								></textarea>
							</label>
							<div class="sm:col-span-2 flex gap-2">
								<button
									type="button"
									onclick={() => saveEdit(report.id)}
									class="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
								>
									Save
								</button>
								<button
									type="button"
									onclick={cancelEdit}
									class="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
								>
									Cancel
								</button>
							</div>
						</div>
					{:else}
						<p class="mt-2 text-sm text-slate-700">{report.description}</p>
						<p class="mt-2 text-xs text-slate-500">
							Lat/Lng: {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
						</p>

						<div class="mt-3 flex flex-wrap gap-2">
							{#if ['open', 'rejected'].includes(report.status)}
								<button
									type="button"
									onclick={() =>
										startEdit({
											id: report.id,
											category: report.category,
											description: report.description
										})}
									class="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
								>
									Edit
								</button>
								<button
									type="button"
									onclick={() => removeReport(report.id)}
									class="rounded bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
								>
									Delete
								</button>
							{/if}
							{#if report.photoUrl}
								<a
									href={report.photoUrl}
									target="_blank"
									rel="noreferrer"
									class="inline-flex rounded border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
								>
									View photo evidence
								</a>
							{/if}
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</div>
