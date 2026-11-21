// test/mocks/express.js — minimal Express mock for API route tests.
// Records routes + global middleware, and lets tests dispatch a request
// through the middleware chain to the matched handler, capturing the response.
'use strict';

function lowerKeys(obj) {
    const out = {};
    for (const k of Object.keys(obj || {})) out[k.toLowerCase()] = obj[k];
    return out;
}

function parseQuery(qs) {
    const query = {};
    if (!qs) return query;
    for (const pair of qs.split('&')) {
        if (!pair) continue;
        const [k, v] = pair.split('=');
        query[decodeURIComponent(k)] = v === undefined ? '' : decodeURIComponent(v);
    }
    return query;
}

function matchRoute(routes, method, pathname) {
    const segs = pathname.split('/').filter(Boolean);
    for (const route of routes) {
        if (route.method !== method) continue;
        const rsegs = route.path.split('/').filter(Boolean);
        if (rsegs.length !== segs.length) continue;
        const params = {};
        let ok = true;
        for (let i = 0; i < rsegs.length; i++) {
            if (rsegs[i].startsWith(':')) params[rsegs[i].slice(1)] = decodeURIComponent(segs[i]);
            else if (rsegs[i] !== segs[i]) { ok = false; break; }
        }
        if (ok) return { route, params };
    }
    return null;
}

function makeRes() {
    const res = { statusCode: 200, __sent: false, body: undefined };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (obj) => { res.body = obj; res.__sent = true; return res; };
    res.send = (obj) => { res.body = obj; res.__sent = true; return res; };
    res.set = () => res;
    res.setHeader = () => res;
    res.redirect = (...args) => { const url = args[args.length - 1]; res.statusCode = typeof args[0] === 'number' ? args[0] : 302; res.body = { redirect: url }; res.__sent = true; return res; };
    res.end = () => { res.__sent = true; return res; };
    res.__result = () => ({ status: res.statusCode, body: res.body });
    return res;
}

function makeApp() {
    const routes = [];
    const middleware = [];
    const register = (method, path, handlers) => routes.push({ method, path, handlers: handlers.filter(h => typeof h === 'function') });

    const app = {
        use: (fn) => { if (typeof fn === 'function') middleware.push(fn); },
        get: (path, ...handlers) => register('GET', path, handlers),
        post: (path, ...handlers) => register('POST', path, handlers),
        put: (path, ...handlers) => register('PUT', path, handlers),
        delete: (path, ...handlers) => register('DELETE', path, handlers),
        patch: (path, ...handlers) => register('PATCH', path, handlers),
        listen: () => ({ close() {} }),

        // ---- test helper: run a request through the middleware + handler chain ----
        async __dispatch(method, url, { headers = {}, body = {} } = {}) {
            const [pathname, qs] = String(url).split('?');
            const match = matchRoute(routes, method, pathname);
            const res = makeRes();
            if (!match) { res.status(404).json({ error: 'No matching route' }); return res.__result(); }
            const req = { method, path: pathname, originalUrl: url, params: match.params, query: parseQuery(qs), body, headers: lowerKeys(headers) };
            const chain = [...middleware, ...match.route.handlers];
            for (const handler of chain) {
                let calledNext = false;
                const next = () => { calledNext = true; };
                // eslint-disable-next-line no-await-in-loop
                await handler(req, res, next);
                if (res.__sent) break;   // a response was produced → stop
                if (!calledNext) break;  // middleware neither responded nor continued
            }
            return res.__result();
        },
        __routes: routes,
    };
    return app;
}

function express() {
    const app = makeApp();
    express.__app = app; // expose the most recently created app to tests
    return app;
}
express.json = () => (_req, _res, next) => { if (typeof next === 'function') next(); };
express.urlencoded = () => (_req, _res, next) => { if (typeof next === 'function') next(); };
express.static = () => (_req, _res, next) => { if (typeof next === 'function') next(); };
express.Router = () => makeApp();
express.__app = null;

module.exports = express;
