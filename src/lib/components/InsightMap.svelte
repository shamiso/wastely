<script lang="ts">
	import { onMount } from 'svelte';
	import 'leaflet/dist/leaflet.css';

	type LeafletModule = typeof import('leaflet');
	type LeafletMap = import('leaflet').Map;
	type FeatureGroup = import('leaflet').FeatureGroup;

	export let center: [number, number] = [-17.8252, 31.0335];
	export let zoom = 12;
	export let fitToContent = true;
	export let ariaLabel = 'Map';
	export let markers: Array<{
		lat: number;
		lng: number;
		label?: string;
		color?: string;
		fillColor?: string;
		radius?: number;
	}> = [];
	export let polylines: Array<{
		points: Array<[number, number]>;
		label?: string;
		color?: string;
		weight?: number;
		dashArray?: string;
	}> = [];

	let container: HTMLDivElement | null = null;
	let L: LeafletModule | null = null;
	let map: LeafletMap | null = null;
	let layerGroup: FeatureGroup | null = null;

	function redraw() {
		if (!L || !map) return;

		if (layerGroup) {
			layerGroup.remove();
		}

		layerGroup = L.featureGroup();

		for (const marker of markers) {
			const circle = L.circleMarker([marker.lat, marker.lng], {
				radius: marker.radius ?? 8,
				weight: 2,
				color: marker.color ?? '#0f172a',
				fillColor: marker.fillColor ?? marker.color ?? '#38bdf8',
				fillOpacity: 0.9
			});

			if (marker.label) circle.bindPopup(marker.label);
			circle.addTo(layerGroup);
		}

		for (const line of polylines) {
			const polyline = L.polyline(line.points, {
				color: line.color ?? '#0284c7',
				weight: line.weight ?? 4,
				dashArray: line.dashArray
			});
			if (line.label) polyline.bindPopup(line.label);
			polyline.addTo(layerGroup);
		}

		layerGroup.addTo(map);

		if (fitToContent && (markers.length > 0 || polylines.length > 0)) {
			const bounds = layerGroup.getBounds();
			if (bounds.isValid()) {
				map.fitBounds(bounds.pad(0.2), {
					animate: false
				});
			}
			return;
		}

		map.setView(center, zoom, {
			animate: false
		});
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

			redraw();
			setTimeout(() => map?.invalidateSize(), 0);
		};

		void initialize();

		return () => {
			disposed = true;
			layerGroup?.remove();
			map?.remove();
			layerGroup = null;
			map = null;
		};
	});

	$: if (map) {
		redraw();
	}
</script>

<div class="map-picker-shell">
	<div bind:this={container} class="map-picker-canvas" aria-label={ariaLabel}></div>
</div>
