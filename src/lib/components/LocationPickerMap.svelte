<script lang="ts">
	import { onMount } from 'svelte';
	import 'leaflet/dist/leaflet.css';

	type LeafletModule = typeof import('leaflet');
	type LeafletMap = import('leaflet').Map;
	type LeafletCircleMarker = import('leaflet').CircleMarker;

	export let latitude: number | null = null;
	export let longitude: number | null = null;
	export let defaultCenter: [number, number] = [-17.8252, 31.0335];
	export let defaultZoom = 13;

	let container: HTMLDivElement | null = null;
	let L: LeafletModule | null = null;
	let map: LeafletMap | null = null;
	let marker: LeafletCircleMarker | null = null;

	function formatCoordinate(value: number): number {
		return Number(value.toFixed(6));
	}

	function setMarker(lat: number, lng: number): void {
		if (!L || !map) return;

		if (marker) {
			marker.setLatLng([lat, lng]);
			return;
		}

		marker = L.circleMarker([lat, lng], {
			radius: 8,
			weight: 2,
			color: '#0f172a',
			fillColor: '#2563eb',
			fillOpacity: 0.9
		}).addTo(map);
	}

	function selectPoint(lat: number, lng: number): void {
		const latValue = formatCoordinate(lat);
		const lngValue = formatCoordinate(lng);
		latitude = latValue;
		longitude = lngValue;
		setMarker(latValue, lngValue);
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

			const hasInitialValue = latitude !== null && longitude !== null;
			const initialCenter: [number, number] = hasInitialValue
				? [latitude as number, longitude as number]
				: defaultCenter;

			map.setView(initialCenter, hasInitialValue ? 15 : defaultZoom);

			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 19,
				attribution: '&copy; OpenStreetMap contributors'
			}).addTo(map);

			if (hasInitialValue) {
				setMarker(latitude as number, longitude as number);
			}

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
			marker = null;
		};
	});

	$: if (map && latitude !== null && longitude !== null) {
		setMarker(latitude, longitude);
	}
</script>

<div class="map-picker-shell">
	<div bind:this={container} class="map-picker-canvas" aria-label="Location picker map"></div>
</div>
