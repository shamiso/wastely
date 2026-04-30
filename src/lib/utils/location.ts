type LocationLabelInput = {
	zoneName?: string | null;
	zoneId?: number | null;
	latitude?: number | null;
	longitude?: number | null;
};

export function formatLocationLabel(
	location: LocationLabelInput,
	options: {
		coordinatePrecision?: number;
		fallbackLabel?: string;
	} = {}
) {
	if (location.zoneName && location.zoneName.trim()) {
		return location.zoneName.trim();
	}

	if (location.zoneId !== undefined && location.zoneId !== null) {
		return `Zone ${location.zoneId}`;
	}

	if (
		typeof location.latitude === 'number' &&
		Number.isFinite(location.latitude) &&
		typeof location.longitude === 'number' &&
		Number.isFinite(location.longitude)
	) {
		const precision = options.coordinatePrecision ?? 5;
		return `${location.latitude.toFixed(precision)}, ${location.longitude.toFixed(precision)}`;
	}

	return options.fallbackLabel ?? 'Unknown location';
}
