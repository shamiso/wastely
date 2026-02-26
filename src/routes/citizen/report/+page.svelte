<script lang="ts">
	import { createReport } from '$lib/api/citizen-reports.remote';
</script>

<div class="space-y-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight">Citizen Report</h1>
		<p class="text-sm text-slate-600">
			Submit uncollected waste, illegal dumping, or overflowing bin reports with photo evidence.
		</p>
	</div>

	<form
		{...createReport}
		class="grid gap-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2"
	>
		<label class="text-sm font-medium text-slate-700">
			Category
			<select
				name="category"
				required
				class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
			>
				<option value="uncollected">Uncollected waste</option>
				<option value="illegal_dumping">Illegal dumping</option>
				<option value="overflowing_bin">Overflowing bin</option>
				<option value="other">Other</option>
			</select>
		</label>

		<label class="text-sm font-medium text-slate-700">
			Zone ID (optional)
			<input
				type="number"
				name="zoneId"
				placeholder="e.g. 1"
				class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
			/>
		</label>

		<label class="text-sm font-medium text-slate-700 sm:col-span-2">
			Description
			<textarea
				name="description"
				required
				rows="4"
				placeholder="What happened and where?"
				class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
			></textarea>
		</label>

		<label class="text-sm font-medium text-slate-700">
			Latitude
			<input
				type="number"
				step="0.000001"
				name="latitude"
				required
				placeholder="-17.8252"
				class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
			/>
		</label>

		<label class="text-sm font-medium text-slate-700">
			Longitude
			<input
				type="number"
				step="0.000001"
				name="longitude"
				required
				placeholder="31.0335"
				class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
			/>
		</label>

		<label class="text-sm font-medium text-slate-700 sm:col-span-2">
			Photo evidence
			<input
				type="file"
				name="photo"
				required
				accept="image/*"
				class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
			/>
		</label>

		<div class="sm:col-span-2">
			<button
				type="submit"
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
			>
				Submit report
			</button>
		</div>
	</form>

	{#if createReport.result?.ok}
		<div class="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
			Report #{createReport.result.report.id} submitted successfully.
		</div>
	{/if}
</div>
