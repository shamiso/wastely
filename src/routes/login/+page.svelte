<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<div class="mx-auto max-w-5xl">
	<div class="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
		<section class="overflow-hidden rounded-[2.2rem] bg-gradient-to-br from-amber-300 via-orange-400 to-rose-500 p-8 text-slate-950 shadow-[0_24px_70px_rgba(8,47,73,0.16)]">
			<p class="text-xs font-semibold uppercase tracking-[0.28em] text-slate-900/65">Access portal</p>
			<h1 class="mt-3 font-[Georgia] text-5xl font-semibold tracking-tight">Sign in to Wastely</h1>
			<p class="mt-4 max-w-xl text-base leading-7 text-slate-900/78">
				Choose the citizen, driver, or municipal officer portal. The application shell, cards, and queues stay visually consistent after sign-in.
			</p>

			<div class="mt-8 grid gap-3">
				<div class="rounded-[1.4rem] bg-white/55 p-4">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">Citizen</p>
					<p class="mt-2 text-sm text-slate-800">Report issues on a map, upload evidence, and track progress.</p>
				</div>
				<div class="rounded-[1.4rem] bg-white/55 p-4">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">Driver</p>
					<p class="mt-2 text-sm text-slate-800">Follow optimized routes and log road conditions by segment.</p>
				</div>
				<div class="rounded-[1.4rem] bg-white/55 p-4">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">Officer</p>
					<p class="mt-2 text-sm text-slate-800">Monitor queue maps, dispatch runs, and waste forecasts.</p>
				</div>
			</div>
		</section>

		<form
			method="post"
			action="?/signInEmail"
			use:enhance
			class="space-y-5 rounded-[2.2rem] border border-white/70 bg-white/88 p-6 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur"
		>
			<div>
				<h2 class="font-[Georgia] text-3xl font-semibold tracking-tight text-sky-950">Enter your details</h2>
				<p class="mt-2 text-sm text-slate-600">
					Municipal officer access remains restricted to authorized admin accounts.
				</p>
			</div>

			<div class="grid gap-4">
				<label class="text-sm font-medium text-slate-700">
					Portal
					<select
						name="role"
						class="mt-2 w-full rounded-[1.2rem] border border-sky-100 bg-sky-50 px-4 py-3 outline-none ring-sky-300 focus:ring"
					>
						<option value="citizen">Citizen</option>
						<option value="driver">Driver</option>
						<option value="admin">Municipal Officer</option>
					</select>
				</label>
				<label class="text-sm font-medium text-slate-700">
					Email
					<input
						type="email"
						name="email"
						required
						class="mt-2 w-full rounded-[1.2rem] border border-sky-100 bg-sky-50 px-4 py-3 outline-none ring-sky-300 focus:ring"
					/>
				</label>
				<label class="text-sm font-medium text-slate-700">
					Password
					<input
						type="password"
						name="password"
						required
						class="mt-2 w-full rounded-[1.2rem] border border-sky-100 bg-sky-50 px-4 py-3 outline-none ring-sky-300 focus:ring"
					/>
				</label>
				<label class="text-sm font-medium text-slate-700">
					Name
					<input
						name="name"
						class="mt-2 w-full rounded-[1.2rem] border border-sky-100 bg-sky-50 px-4 py-3 outline-none ring-sky-300 focus:ring"
					/>
				</label>
			</div>

			<div class="flex flex-wrap gap-3">
				<button
					type="submit"
					class="rounded-full bg-sky-950 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-900"
				>
					Sign in
				</button>
				<button
					formaction="?/signUpEmail"
					class="rounded-full bg-gradient-to-r from-cyan-500 to-teal-500 px-5 py-3 text-sm font-semibold text-white hover:from-cyan-400 hover:to-teal-400"
				>
					Register
				</button>
			</div>

			{#if form?.message}
				<p class="rounded-[1.2rem] bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
					{form.message}
				</p>
			{/if}
		</form>
	</div>
</div>
