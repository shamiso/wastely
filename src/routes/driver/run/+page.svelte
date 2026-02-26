<script lang="ts">
	import { getCurrentRun, submitRoadIssue, submitStop } from '$lib/api/driver-ops.remote';

	const currentRun = getCurrentRun();
	let roadDescription = $state('');
	let roadSeverity = $state<'low' | 'medium' | 'high'>('medium');

	async function markStop(runId: number, stopId: number, status: 'done' | 'skipped') {
		await submitStop({
			runId,
			stopId,
			status
		});
		await currentRun.refresh();
	}

	async function markCurrentStop(stopId: number, status: 'done' | 'skipped') {
		if (!currentRun.current) return;
		await markStop(currentRun.current.run.id, stopId, status);
	}

	async function reportRoadIssue() {
		const runId = currentRun.ready && currentRun.current?.run ? currentRun.current.run.id : undefined;
		await submitRoadIssue({
			runId,
			severity: roadSeverity,
			description: roadDescription
		});
		roadDescription = '';
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between gap-2">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Driver Run</h1>
			<p class="text-sm text-slate-600">Follow assigned stops and submit operational updates.</p>
		</div>
		<button
			type="button"
			onclick={() => currentRun.refresh()}
			class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100"
		>
			Refresh
		</button>
	</div>

	{#if currentRun.loading && !currentRun.ready}
		<p class="text-sm text-slate-500">Loading run assignment...</p>
	{:else if currentRun.ready && !currentRun.current}
		<div class="rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
			No active run assigned today.
		</div>
	{:else if currentRun.ready}
		{#if currentRun.current}
			<div class="space-y-4">
				<section class="rounded-xl bg-white p-4 ring-1 ring-slate-200">
					<h2 class="text-sm font-semibold text-slate-800">
						Run #{currentRun.current.run.id} • {currentRun.current.run.status}
					</h2>
					<p class="mt-1 text-sm text-slate-600">
						Date: {currentRun.current.run.runDate} • Planned distance: {currentRun.current.run.plannedDistanceKm.toFixed(2)} km
					</p>
				</section>

				<section class="grid gap-3">
					{#each currentRun.current.stops as stop}
						<article class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="text-sm font-semibold text-slate-900">
									Stop {stop.sequence} • {stop.status}
								</p>
								<div class="flex gap-2">
									<button
										type="button"
										onclick={() => markCurrentStop(stop.id, 'done')}
										class="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
									>
										Done
									</button>
									<button
										type="button"
										onclick={() => markCurrentStop(stop.id, 'skipped')}
										class="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
									>
										Skipped
									</button>
								</div>
							</div>
							<p class="mt-1 text-xs text-slate-500">
								Lat/Lng: {stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}
							</p>
						</article>
					{/each}
				</section>
			</div>
		{/if}
	{/if}

	<section class="space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
		<h2 class="text-sm font-semibold text-slate-800">Report Road Condition</h2>
		<div class="grid gap-3 sm:grid-cols-3">
			<label class="text-sm font-medium text-slate-700 sm:col-span-1">
				Severity
				<select
					bind:value={roadSeverity}
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
				>
					<option value="low">Low</option>
					<option value="medium">Medium</option>
					<option value="high">High</option>
				</select>
			</label>
			<label class="text-sm font-medium text-slate-700 sm:col-span-2">
				Description
				<input
					bind:value={roadDescription}
					placeholder="Road blocked, flooding, diversion, etc."
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
				/>
			</label>
		</div>
		<button
			type="button"
			onclick={reportRoadIssue}
			disabled={!roadDescription.trim()}
			class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
		>
			Submit road issue
		</button>
	</section>
</div>
