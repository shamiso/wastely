<script lang="ts">
	import { enhance } from "$app/forms";
	import type { ActionData } from "./$types";

	let { form }: { form: ActionData } = $props();
</script>

<div class="mx-auto max-w-5xl">
	<div class="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
		<form
			method="post"
			action="?/signInEmail"
			use:enhance
			class="space-y-5 rounded-[2.2rem] border border-white/70 bg-white/88 p-6 shadow-[0_24px_70px_rgba(8,47,73,0.12)] backdrop-blur"
		>
			<div>
				<h2
					class="font-[Georgia] text-3xl font-semibold tracking-tight text-emerald-950"
				>
					Enter your details
				</h2>
				<p class="mt-2 text-sm text-slate-600">
					Municipal officer access remains restricted to authorized
					admin accounts.
				</p>
			</div>

			<div class="grid gap-4">
				<label class="text-sm font-medium text-slate-700">
					Portal
					<select
						name="role"
						class="mt-2 w-full rounded-[1.2rem] border border-emerald-100 bg-emerald-50 px-4 py-3 outline-none ring-emerald-300 focus:ring"
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
						class="mt-2 w-full rounded-[1.2rem] border border-emerald-100 bg-emerald-50 px-4 py-3 outline-none ring-emerald-300 focus:ring"
					/>
				</label>
				<label class="text-sm font-medium text-slate-700">
					Password
					<input
						type="password"
						name="password"
						required
						class="mt-2 w-full rounded-[1.2rem] border border-emerald-100 bg-emerald-50 px-4 py-3 outline-none ring-emerald-300 focus:ring"
					/>
				</label>
				<label class="text-sm font-medium text-slate-700">
					Name
					<input
						name="name"
						class="mt-2 w-full rounded-[1.2rem] border border-emerald-100 bg-emerald-50 px-4 py-3 outline-none ring-emerald-300 focus:ring"
					/>
				</label>
			</div>

			<div class="flex flex-wrap gap-3">
				<button
					type="submit"
					class="rounded-full bg-emerald-950 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-900"
				>
					Sign in
				</button>
				<button
					formaction="?/signUpEmail"
					class="rounded-full bg-gradient-to-r from-emerald-500 to-green-600 px-5 py-3 text-sm font-semibold text-white hover:from-emerald-400 hover:to-green-500"
				>
					Register
				</button>
			</div>

			{#if form?.message}
				<p
					class="rounded-[1.2rem] bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
				>
					{form.message}
				</p>
			{/if}
		</form>
	</div>
</div>
