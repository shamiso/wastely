<script lang="ts">
	export let label = 'Print';

	function printPage() {
		window.print();
	}
</script>

<button
	type="button"
	onclick={printPage}
	data-print-ignore="true"
	class="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-50"
>
	{label}
</button>
