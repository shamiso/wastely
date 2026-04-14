<script lang="ts">
	import { onMount } from 'svelte';
	import 'leaflet/dist/leaflet.css';

	type LeafletModule = typeof import('leaflet');
	type LeafletMap = import('leaflet').Map;
	type LeafletCircleMarker = import('leaflet').CircleMarker;
	type LeafletPolyline = import('leaflet').Polyline;

	export let startLatitude: number | null = null;
	export let startLongitude: number | null = null;
	export let endLatitude: number | null = null;
	export let endLongitude: number | null = null;
	export let defaultCenter: [number, number] = [-17.8252, 31.0335];
	export let defaultZoom = 13;

	let container: HTMLDivElement | null = null;
	let L: LeafletModule | null = null;
	let map: LeafletMap | null = null;
	let startMarker: LeafletCircleMarker | null = null;
	let endMarker: LeafletCircleMarker | null = null;
	let line: LeafletPolyline | null = null;

	function roundCoordinate(value: number) {
		return Number(value.toFixed(6));
	}

	function resetLine() {
		startMarker?.remove();
		endMarker?.remove();
		line?.remove();
		startMarker = null;
		endMarker = null;
		line = null;
	}

	function renderSelection() {
		if (!L || !map) return;

		resetLine();

		if (startLatitude !== null && startLongitude !== null) {
			startMarker = L.circleMarker([startLatitude, startLongitude], {
				radius: 8,
				weight: 2,
				color: '#0f172a',
				fillColor: '#22c55e',
				fillOpacity: 0.92
			}).addTo(map);
			startMarker.bindPopup('Segment start');
		}

		if (endLatitude !== null && endLongitude !== null) {
			endMarker = L.circleMarker([endLatitude, endLongitude], {
				radius: 8,
				weight: 2,
				color: '#0f172a',
				fillColor: '#f97316',
				fillOpacity: 0.92
			}).addTo(map);
			endMarker.bindPopup('Segment end');
		}

		if (
			startLatitude !== null &&
			startLongitude !== null &&
			endLatitude !== null &&
			endLongitude !== null
		) {
			line = L.polyline(
				[
					[startLatitude, startLongitude],
					[endLatitude, endLongitude]
				],
				{
					color: '#f97316',
					weight: 4,
					dashArray: '8 8'
				}
			).addTo(map);
			map.fitBounds(line.getBounds().pad(0.2), {
				animate: false
			});
		} else if (startLatitude !== null && startLongitude !== null) {
			map.setView([startLatitude, startLongitude], 14, {
				animate: false
			});
		} else {
			map.setView(defaultCenter, defaultZoom, {
				animate: false
			});
		}
	}

	function selectPoint(lat: number, lng: number) {
		const nextLatitude = roundCoordinate(lat);
		const nextLongitude = roundCoordinate(lng);

		if (startLatitude === null || startLongitude === null || (endLatitude !== null && endLongitude !== null)) {
			startLatitude = nextLatitude;
			startLongitude = nextLongitude;
			endLatitude = null;
			endLongitude = null;
		} else {
			endLatitude = nextLatitude;
			endLongitude = nextLongitude;
		}

		renderSelection();
	}

	onMount(() => {
		let disposed = false;

		const initialize = async () => {
			if (!container) return;

			L = await import('leaflet');
			if (disposed || !container) return;

			map = L.map(container, {
				zoomControl: true
			});
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution: '&copy; OpenStreetMap contributors'
			}).addTo(map);

			renderSelection();

			map.on('click', (event: import('leaflet').LeafletMouseEvent) => {
				selectPoint(event.latlng.lat, event.latlng.lng);
			});

			setTimeout(() => map?.invalidateSize(), 0);
		};

		void initialize();

		return () => {
			disposed = true;
			map?.remove();
			map = null;
			resetLine();
		};
	});

	export function clearSelection() {
		startLatitude = null;
		startLongitude = null;
		endLatitude = null;
		endLongitude = null;
		renderSelection();
	}

	$: if (map) {
		renderSelection();
	}
</script>

<div class="map-picker-shell">
	<div bind:this={container} class="map-picker-canvas" aria-label="Route segment picker map"></div>
</div>
