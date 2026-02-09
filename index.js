const DEFAULT_SAT_COLOR = '#3B82F6';
const DEFAULT_SENSOR_COLOR = '#94A3B8';
const TLE_UPDATE_URL = 'https://celestrak.com/NORAD/elements/resource.txt';

const normalizeNoradId = (value) => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
};

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });

const readJsonBody = async (request) => {
  try {
    return await request.json();
  } catch (error) {
    return null;
  }
};

const extractAdminToken = (request) => {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  const headerToken = request.headers.get('x-admin-token');
  if (headerToken) {
    return headerToken.trim();
  }

  const cookieHeader = request.headers.get('cookie') || '';
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
    for (const cookie of cookies) {
      const [name, ...rest] = cookie.split('=');
      if (name === 'admin_token') {
        return rest.join('=').trim();
      }
    }
  }

  return '';
};

const getAdminAuthStatus = (request, env) => {
  const expectedToken = typeof env.ADMIN_TOKEN === 'string' ? env.ADMIN_TOKEN.trim() : '';

  if (!expectedToken) {
    return { ok: false, status: 500, reason: 'Admin auth is not configured' };
  }

  const providedToken = extractAdminToken(request);
  if (!providedToken || providedToken !== expectedToken) {
    return { ok: false, status: 401, reason: 'Unauthorized' };
  }

  return { ok: true };
};

const parseTleFeed = (text) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const records = [];
  let pendingName = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.startsWith('1 ') && !line.startsWith('2 ')) {
      pendingName = line;
      i += 1;
      continue;
    }

    if (line.startsWith('1 ') && i + 1 < lines.length && lines[i + 1].startsWith('2 ')) {
      const line1 = line;
      const line2 = lines[i + 1];
      const noradId = line1.substring(2, 7).trim();

      if (noradId) {
        const name = pendingName && !pendingName.startsWith('1 ') && !pendingName.startsWith('2 ')
          ? pendingName
          : `NORAD ${noradId}`;

        records.push({ name, line1, line2, noradId });
      }

      pendingName = '';
      i += 2;
      continue;
    }

    i += 1;
  }

  return records;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/tle')) {
      const db = env.SATPLAN_D1;
      if (!db) {
        console.error('SATPLAN_D1 binding is missing');
        return new Response('D1 is not configured', { status: 500 });
      }

      if (url.pathname === '/api/tle/refresh') {
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405 });
        }

        try {
          const response = await fetch(TLE_UPDATE_URL);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
          }

          const text = await response.text();
          const records = parseTleFeed(text);
          if (!records.length) {
            return jsonResponse({ error: 'No TLE records were parsed from the feed' }, 400);
          }

          const satelliteIdsResult = await db.prepare('SELECT noard_id FROM satellite WHERE noard_id IS NOT NULL').all();
          const allowedIds = new Set(
            (satelliteIdsResult.results || [])
              .map((row) => normalizeNoradId(row.noard_id))
              .filter((id) => id)
          );

          const filteredRecords = records.filter((record) => allowedIds.has(normalizeNoradId(record.noradId)));
          if (!filteredRecords.length) {
            return jsonResponse({ error: 'No matching satellites for TLE refresh' }, 400);
          }

          const timestamp = Math.floor(Date.now() / 1000);
          const statements = filteredRecords.map((record) =>
            db
              .prepare('INSERT INTO tle (sat_noard_id, time, line1, line2) VALUES (?, ?, ?, ?)')
              .bind(record.noradId, timestamp, record.line1, record.line2)
          );

          await db.batch(statements);

          return jsonResponse({
            count: filteredRecords.length,
            timestamp: timestamp * 1000
          });
        } catch (error) {
          console.error('TLE refresh error', error);
          return jsonResponse({ error: 'Failed to refresh TLE data' }, 500);
        }
      }

      if (url.pathname === '/api/tle/status') {
        if (request.method !== 'GET') {
          return new Response('Method not allowed', { status: 405 });
        }

        try {
          const latestResult = await db.prepare('SELECT MAX(time) AS latestTime FROM tle').all();
          const latestTime = latestResult.results?.[0]?.latestTime ?? null;
          return jsonResponse({
            latestTime: typeof latestTime === 'number' ? latestTime * 1000 : null
          });
        } catch (error) {
          console.error('TLE status error', error);
          return jsonResponse({ error: 'Failed to load TLE status' }, 500);
        }
      }

      if (url.pathname === '/api/tle') {
        if (request.method === 'GET') {
          const satId = normalizeNoradId(url.searchParams.get('sat_noard_id'));
          const limitParam = parseInt(url.searchParams.get('limit') || '500', 10);
          const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 5000) : 500;

          try {
            let stmt = 'SELECT id, sat_noard_id, time, line1, line2 FROM tle';
            const params = [];
            if (satId) {
              stmt += ' WHERE sat_noard_id = ?';
              params.push(satId);
            }
            stmt += ' ORDER BY time DESC LIMIT ?';
            params.push(limit);

            const result = await db.prepare(stmt).bind(...params).all();
            return jsonResponse({ results: result.results || [] });
          } catch (error) {
            console.error('TLE query error', error);
            return jsonResponse({ error: 'Failed to load TLE data' }, 500);
          }
        }

        if (request.method === 'POST') {
          try {
            const body = await request.json();
            const satId = normalizeNoradId(body?.sat_noard_id);
            const line1 = typeof body?.line1 === 'string' ? body.line1.trim() : '';
            const line2 = typeof body?.line2 === 'string' ? body.line2.trim() : '';
            const time = Number.isFinite(body?.time)
              ? Math.floor(body.time)
              : Math.floor(Date.now() / 1000);

            if (!satId || !line1 || !line2) {
              return jsonResponse({ error: 'sat_noard_id, line1, line2 are required' }, 400);
            }

            const result = await db
              .prepare('INSERT INTO tle (sat_noard_id, time, line1, line2) VALUES (?, ?, ?, ?)')
              .bind(satId, time, line1, line2)
              .run();

            return jsonResponse({ id: result.lastRowId, time: time * 1000 });
          } catch (error) {
            console.error('TLE create error', error);
            return jsonResponse({ error: 'Failed to create TLE record' }, 500);
          }
        }

        if (request.method === 'PUT') {
          try {
            const body = await request.json();
            const id = Number(body?.id);
            if (!Number.isFinite(id)) {
              return jsonResponse({ error: 'id is required' }, 400);
            }

            const fields = [];
            const params = [];

            if (typeof body?.sat_noard_id === 'string') {
              fields.push('sat_noard_id = ?');
              params.push(normalizeNoradId(body.sat_noard_id));
            }
            if (typeof body?.line1 === 'string') {
              fields.push('line1 = ?');
              params.push(body.line1.trim());
            }
            if (typeof body?.line2 === 'string') {
              fields.push('line2 = ?');
              params.push(body.line2.trim());
            }
            if (Number.isFinite(body?.time)) {
              fields.push('time = ?');
              params.push(Math.floor(body.time));
            }

            if (!fields.length) {
              return jsonResponse({ error: 'No fields to update' }, 400);
            }

            params.push(id);
            await db.prepare(`UPDATE tle SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();

            return jsonResponse({ updated: true });
          } catch (error) {
            console.error('TLE update error', error);
            return jsonResponse({ error: 'Failed to update TLE record' }, 500);
          }
        }

        if (request.method === 'DELETE') {
          const idParam = url.searchParams.get('id');
          const id = Number(idParam);
          if (!Number.isFinite(id)) {
            return jsonResponse({ error: 'id is required' }, 400);
          }

          try {
            await db.prepare('DELETE FROM tle WHERE id = ?').bind(id).run();
            return jsonResponse({ deleted: true });
          } catch (error) {
            console.error('TLE delete error', error);
            return jsonResponse({ error: 'Failed to delete TLE record' }, 500);
          }
        }

        return new Response('Method not allowed', { status: 405 });
      }

      return new Response('Not found', { status: 404 });
    }

    if (url.pathname.startsWith('/api/admin')) {
      const authStatus = getAdminAuthStatus(request, env);
      if (!authStatus.ok) {
        return jsonResponse({ error: authStatus.reason }, authStatus.status);
      }

      if (url.pathname === '/api/admin/auth') {
        if (request.method !== 'GET') {
          return new Response('Method not allowed', { status: 405 });
        }
        return jsonResponse({ ok: true });
      }

      const db = env.SATPLAN_D1;
      if (!db) {
        console.error('SATPLAN_D1 binding is missing');
        return new Response('D1 is not configured', { status: 500 });
      }

      const segments = url.pathname.replace('/api/admin', '').split('/').filter(Boolean);
      const resource = segments[0];
      const id = segments[1] ? Number(segments[1]) : null;

      if (segments.length > 2 || !resource) {
        return new Response('Not found', { status: 404 });
      }

      if (resource === 'satellites') {
        if (request.method === 'GET') {
          if (id) {
            const result = await db
              .prepare('SELECT id, noard_id, name, hex_color FROM satellite WHERE id = ?')
              .bind(id)
              .all();
            const sat = result.results?.[0];
            if (!sat) {
              return jsonResponse({ error: 'Satellite not found' }, 404);
            }
            return jsonResponse({ result: sat });
          }

          const listResult = await db
            .prepare('SELECT id, noard_id, name, hex_color FROM satellite ORDER BY id')
            .all();
          return jsonResponse({ results: listResult.results || [] });
        }

        if (request.method === 'POST') {
          const body = await readJsonBody(request);
          const noardId = normalizeNoradId(body?.noard_id);
          const name = typeof body?.name === 'string' ? body.name.trim() : '';
          const hexColor = typeof body?.hex_color === 'string' ? body.hex_color.trim() : null;

          if (!noardId) {
            return jsonResponse({ error: 'noard_id is required' }, 400);
          }

          const result = await db
            .prepare('INSERT INTO satellite (noard_id, name, hex_color) VALUES (?, ?, ?)')
            .bind(noardId, name, hexColor)
            .run();

          return jsonResponse({ id: result.lastRowId });
        }

        if (request.method === 'PUT') {
          if (!Number.isFinite(id)) {
            return jsonResponse({ error: 'id is required' }, 400);
          }

          const body = await readJsonBody(request);
          const fields = [];
          const params = [];

          if (typeof body?.noard_id === 'string') {
            fields.push('noard_id = ?');
            params.push(normalizeNoradId(body.noard_id));
          }
          if (typeof body?.name === 'string') {
            fields.push('name = ?');
            params.push(body.name.trim());
          }
          if (typeof body?.hex_color === 'string') {
            fields.push('hex_color = ?');
            params.push(body.hex_color.trim());
          }

          if (!fields.length) {
            return jsonResponse({ error: 'No fields to update' }, 400);
          }

          params.push(id);
          await db.prepare(`UPDATE satellite SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
          return jsonResponse({ updated: true });
        }

        if (request.method === 'DELETE') {
          if (!Number.isFinite(id)) {
            return jsonResponse({ error: 'id is required' }, 400);
          }

          const satResult = await db
            .prepare('SELECT noard_id FROM satellite WHERE id = ?')
            .bind(id)
            .all();
          const satNoardId = satResult.results?.[0]?.noard_id;
          if (!satNoardId) {
            return jsonResponse({ error: 'Satellite not found' }, 404);
          }

          await db.batch([
            db.prepare('DELETE FROM sensor WHERE sat_noard_id = ?').bind(satNoardId),
            db.prepare('DELETE FROM tle WHERE sat_noard_id = ?').bind(satNoardId),
            db.prepare('DELETE FROM satellite WHERE id = ?').bind(id)
          ]);

          return jsonResponse({ deleted: true });
        }

        return new Response('Method not allowed', { status: 405 });
      }

      if (resource === 'sensors') {
        if (request.method === 'GET') {
          if (id) {
            const result = await db
              .prepare(
                'SELECT id, sat_noard_id, sat_name, name, resolution, width, right_side_angle, left_side_angle, observe_angle, hex_color, init_angle FROM sensor WHERE id = ?'
              )
              .bind(id)
              .all();
            const sensor = result.results?.[0];
            if (!sensor) {
              return jsonResponse({ error: 'Sensor not found' }, 404);
            }
            return jsonResponse({ result: sensor });
          }

          const listResult = await db
            .prepare(
              'SELECT id, sat_noard_id, sat_name, name, resolution, width, right_side_angle, left_side_angle, observe_angle, hex_color, init_angle FROM sensor ORDER BY id'
            )
            .all();
          return jsonResponse({ results: listResult.results || [] });
        }

        if (request.method === 'POST') {
          const body = await readJsonBody(request);
          const satNoardId = normalizeNoradId(body?.sat_noard_id);
          const satName = typeof body?.sat_name === 'string' ? body.sat_name.trim() : '';
          const name = typeof body?.name === 'string' ? body.name.trim() : '';

          if (!satNoardId || !name) {
            return jsonResponse({ error: 'sat_noard_id and name are required' }, 400);
          }

          const resolution = Number.isFinite(body?.resolution) ? body.resolution : 0;
          const width = Number.isFinite(body?.width) ? body.width : 0;
          const rightSideAngle = Number.isFinite(body?.right_side_angle) ? body.right_side_angle : 0;
          const leftSideAngle = Number.isFinite(body?.left_side_angle) ? body.left_side_angle : 0;
          const observeAngle = Number.isFinite(body?.observe_angle) ? body.observe_angle : 0;
          const initAngle = Number.isFinite(body?.init_angle) ? body.init_angle : 0;
          const hexColor = typeof body?.hex_color === 'string' ? body.hex_color.trim() : null;

          const result = await db
            .prepare(
              'INSERT INTO sensor (sat_noard_id, sat_name, name, resolution, width, right_side_angle, left_side_angle, observe_angle, hex_color, init_angle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )
            .bind(
              satNoardId,
              satName,
              name,
              resolution,
              width,
              rightSideAngle,
              leftSideAngle,
              observeAngle,
              hexColor,
              initAngle
            )
            .run();

          return jsonResponse({ id: result.lastRowId });
        }

        if (request.method === 'PUT') {
          if (!Number.isFinite(id)) {
            return jsonResponse({ error: 'id is required' }, 400);
          }

          const body = await readJsonBody(request);
          const fields = [];
          const params = [];

          if (typeof body?.sat_noard_id === 'string') {
            fields.push('sat_noard_id = ?');
            params.push(normalizeNoradId(body.sat_noard_id));
          }
          if (typeof body?.sat_name === 'string') {
            fields.push('sat_name = ?');
            params.push(body.sat_name.trim());
          }
          if (typeof body?.name === 'string') {
            fields.push('name = ?');
            params.push(body.name.trim());
          }
          if (Number.isFinite(body?.resolution)) {
            fields.push('resolution = ?');
            params.push(body.resolution);
          }
          if (Number.isFinite(body?.width)) {
            fields.push('width = ?');
            params.push(body.width);
          }
          if (Number.isFinite(body?.right_side_angle)) {
            fields.push('right_side_angle = ?');
            params.push(body.right_side_angle);
          }
          if (Number.isFinite(body?.left_side_angle)) {
            fields.push('left_side_angle = ?');
            params.push(body.left_side_angle);
          }
          if (Number.isFinite(body?.observe_angle)) {
            fields.push('observe_angle = ?');
            params.push(body.observe_angle);
          }
          if (typeof body?.hex_color === 'string') {
            fields.push('hex_color = ?');
            params.push(body.hex_color.trim());
          }
          if (Number.isFinite(body?.init_angle)) {
            fields.push('init_angle = ?');
            params.push(body.init_angle);
          }

          if (!fields.length) {
            return jsonResponse({ error: 'No fields to update' }, 400);
          }

          params.push(id);
          await db.prepare(`UPDATE sensor SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
          return jsonResponse({ updated: true });
        }

        if (request.method === 'DELETE') {
          if (!Number.isFinite(id)) {
            return jsonResponse({ error: 'id is required' }, 400);
          }

          await db.prepare('DELETE FROM sensor WHERE id = ?').bind(id).run();
          return jsonResponse({ deleted: true });
        }

        return new Response('Method not allowed', { status: 405 });
      }

      if (resource === 'tle-sites') {
        if (request.method === 'GET') {
          if (id) {
            const result = await db
              .prepare('SELECT id, site, url, description FROM tle_site WHERE id = ?')
              .bind(id)
              .all();
            const site = result.results?.[0];
            if (!site) {
              return jsonResponse({ error: 'TLE site not found' }, 404);
            }
            return jsonResponse({ result: site });
          }

          const listResult = await db
            .prepare('SELECT id, site, url, description FROM tle_site ORDER BY id')
            .all();
          return jsonResponse({ results: listResult.results || [] });
        }

        if (request.method === 'POST') {
          const body = await readJsonBody(request);
          const site = typeof body?.site === 'string' ? body.site.trim() : '';
          const urlValue = typeof body?.url === 'string' ? body.url.trim() : '';
          const description = typeof body?.description === 'string' ? body.description.trim() : '';

          if (!site || !urlValue) {
            return jsonResponse({ error: 'site and url are required' }, 400);
          }

          const result = await db
            .prepare('INSERT INTO tle_site (site, url, description) VALUES (?, ?, ?)')
            .bind(site, urlValue, description)
            .run();
          return jsonResponse({ id: result.lastRowId });
        }

        if (request.method === 'PUT') {
          if (!Number.isFinite(id)) {
            return jsonResponse({ error: 'id is required' }, 400);
          }

          const body = await readJsonBody(request);
          const fields = [];
          const params = [];

          if (typeof body?.site === 'string') {
            fields.push('site = ?');
            params.push(body.site.trim());
          }
          if (typeof body?.url === 'string') {
            fields.push('url = ?');
            params.push(body.url.trim());
          }
          if (typeof body?.description === 'string') {
            fields.push('description = ?');
            params.push(body.description.trim());
          }

          if (!fields.length) {
            return jsonResponse({ error: 'No fields to update' }, 400);
          }

          params.push(id);
          await db.prepare(`UPDATE tle_site SET ${fields.join(', ')} WHERE id = ?`).bind(...params).run();
          return jsonResponse({ updated: true });
        }

        if (request.method === 'DELETE') {
          if (!Number.isFinite(id)) {
            return jsonResponse({ error: 'id is required' }, 400);
          }

          await db.prepare('DELETE FROM tle_site WHERE id = ?').bind(id).run();
          return jsonResponse({ deleted: true });
        }

        return new Response('Method not allowed', { status: 405 });
      }

      return new Response('Not found', { status: 404 });
    }

    // 1. 处理 API 请求 (对应原来的 functions/api/satellites.js)
    if (url.pathname === '/api/satellites') {
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

        const latestTimeResult = await db.prepare('SELECT MAX(time) AS latestTime FROM tle').all();
        const latestTime = latestTimeResult.results?.[0]?.latestTime ?? null;

        const latestTleBySat = new Map();
        tles.forEach((tle) => {
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
          children: satellites.map((sat) => {
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
              children: sensorsForSat.map((sensor) => ({
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

        return jsonResponse({
          tree,
          fetchedAt: Date.now(),
          tleLastSync: typeof latestTime === 'number' ? latestTime * 1000 : null
        });
      } catch (error) {
        console.error('Satellites API error', error);
        return new Response('Failed to load satellite data', { status: 500 });
      }
    }

    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      const adminUrl = new URL('/admin.html', url);
      return env.ASSETS.fetch(new Request(adminUrl, request));
    }

    // 2. 其他所有请求，交给 [assets] 里的静态文件处理
    // 这会自动寻找 static 目录下的 index.html, styles.css 等
    return env.ASSETS.fetch(request);
  }
};