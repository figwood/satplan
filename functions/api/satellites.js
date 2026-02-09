const DEFAULT_SAT_COLOR = '#3B82F6';
const DEFAULT_SENSOR_COLOR = '#94A3B8';

const normalizeNoradId = (value) => {
    if (typeof value === 'string') {
        return value.trim();
    }

    if (value === undefined || value === null) {
        return '';
    }

    return String(value).trim();
};

export default {
    async fetch(request, env) {
        if (request.method !== 'GET') {
            return new Response('Method not allowed', { status: 405 });
        }

        const db = env.SATPLAN_D1;
        if (!db) {
            console.error('SATPLAN_D1 binding is missing');
            return new Response('D1 is not configured', { status: 500 });
        }

        try {
            const satellitesResult = await db
                .prepare('SELECT id, noard_id, name, hex_color FROM satellite ORDER BY id')
                .all();
            const satellites = satellitesResult.results || [];

            const sensorsResult = await db
                .prepare(
                    'SELECT id, sat_noard_id, sat_name, name, resolution, width, right_side_angle, left_side_angle, observe_angle, hex_color, init_angle FROM sensor ORDER BY id'
                )
                .all();
            const sensors = sensorsResult.results || [];

            const tlesResult = await db
                .prepare('SELECT sat_noard_id, line1, line2, time FROM tle WHERE line1 IS NOT NULL AND line2 IS NOT NULL ORDER BY sat_noard_id, time DESC')
                .all();
            const tles = tlesResult.results || [];

            const latestTleBySat = new Map();
            tles.forEach(tle => {
                const satId = normalizeNoradId(tle.sat_noard_id);
                if (!satId) return;

                const existing = latestTleBySat.get(satId);
                if (!existing || (typeof tle.time === 'number' && tle.time > existing.time)) {
                    latestTleBySat.set(satId, tle);
                }
            });

            const sensorGroups = sensors.reduce((groups, sensor) => {
                const satId = normalizeNoradId(sensor.sat_noard_id);
                if (!groups.has(satId)) {
                    groups.set(satId, []);
                }

                groups.get(satId).push(sensor);
                return groups;
            }, new Map());

            const tree = {
                id: 0,
                type: 'root',
                name: 'Satellites',
                children: satellites.map(sat => {
                    const noradId = normalizeNoradId(sat.noard_id);
                    const tle = latestTleBySat.get(noradId);
                    const sensorsForSat = sensorGroups.get(noradId) || [];

                    return {
                        id: sat.id,
                        type: 'satellite',
                        name: sat.name || `Satellite ${sat.id}`,
                        hex_color: sat.hex_color || DEFAULT_SAT_COLOR,
                        sat_norad_id: noradId,
                        tle1: tle?.line1 ?? '',
                        tle2: tle?.line2 ?? '',
                        children: sensorsForSat.map(sensor => ({
                            id: sensor.id,
                            type: 'sensor',
                            name: sensor.name || `Sensor ${sensor.id}`,
                            hex_color: sensor.hex_color || DEFAULT_SENSOR_COLOR,
                            sat_norad_id: noradId,
                            sat_name: sensor.sat_name || sat.name || '',
                            resolution: sensor.resolution ?? 0,
                            init_angle: sensor.init_angle ?? 0,
                            left_side_angle: sensor.left_side_angle ?? 0,
                            cur_side_angle: sensor.left_side_angle ?? 0,
                            observe_angle: sensor.observe_angle ?? 0
                        }))
                    };
                })
            };

            return new Response(JSON.stringify({ tree, fetchedAt: Date.now() }), {
                headers: {
                    'content-type': 'application/json; charset=utf-8'
                }
            });
        } catch (error) {
            console.error('Satellites API error', error);
            return new Response('Failed to load satellite data', { status: 500 });
        }
    }
};