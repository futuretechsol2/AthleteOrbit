// Minimal in-memory stand-ins for Supabase, Stripe and Claude used by the API tests.
export function fakeSupabase(tables, users) {
  const q = (table) => {
    let rows = () => tables[table] || (tables[table] = []);
    const filters = []; let op = "select"; let payload; let opts = {}; let lim; let ord;
    const api = {
      select(_c, o = {}) { if (op === "select") opts = o; return api; },
      insert(p) { op = "insert"; payload = p; return api; },
      update(p) { op = "update"; payload = p; return api; },
      delete() { op = "delete"; return api; },
      eq(c, v) { filters.push((r) => r[c] === v); return api; },
      gte(c, v) { filters.push((r) => r[c] >= v); return api; },
      ilike(c, pat) { const re = new RegExp("^" + pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "i"); filters.push((r) => re.test(String(r[c] ?? ""))); return api; },
      in(c, vs) { filters.push((r) => vs.includes(r[c])); return api; },
      order(c, o = {}) { ord = [c, o.ascending !== false]; return api; },
      limit(n) { lim = n; return api; },
      maybeSingle() { return run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })); },
      then(res, rej) { return run().then(res, rej); },
    };
    async function run() {
      if (op === "insert") { (Array.isArray(payload) ? payload : [payload]).forEach((p) => rows().push({ id: `id_${Math.random().toString(36).slice(2)}`, created_at: new Date().toISOString(), ...p })); return { data: null, error: null }; }
      let match = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "delete") { const all = rows(); for (const r of match) all.splice(all.indexOf(r), 1); return { data: null, error: null }; }
      if (op === "update") { match.forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
      if (ord) match = [...match].sort((a, b) => (a[ord[0]] > b[ord[0]] ? 1 : -1) * (ord[1] ? 1 : -1));
      if (lim) match = match.slice(0, lim);
      return opts.head ? { count: match.length, data: null, error: null } : { data: match, error: null };
    }
    return api;
  };
  const files = (tables._files ||= {});
  return {
    from: q,
    storage: { from: (bucket) => ({
      createSignedUploadUrl: async (path) => ({ data: { path, token: `tok-${path}`, signedUrl: `https://store/${bucket}/${path}?upload` }, error: null }),
      createSignedUrls: async (paths, exp) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://store/${bucket}/${p}?exp=${exp}` })), error: null }),
      createSignedUrl: async (p, exp) => ({ data: { signedUrl: `https://store/${bucket}/${p}?exp=${exp}` }, error: null }),
      remove: async (paths) => { for (const p of paths) delete files[p]; (tables._removed ||= []).push(...paths); return { data: null, error: null }; },
    }) },
    auth: { admin: { generateLink: async (p) => { (tables._links ||= []).push(p); if (p.type !== "signup" && !(tables.profiles || []).some((r) => r.email === p.email)) return { data: null, error: { message: "User not found", status: 404 } }; if (p.type === "signup" && (tables.profiles || []).some((r) => r.email === p.email)) return { data: null, error: { message: "A user with this email address has already been registered", status: 422, code: "email_exists" } }; return { data: { properties: { hashed_token: "hash123" }, user: { id: "new1" } }, error: null }; } },
      getUser: async (t) => (users[t] ? { data: { user: users[t] }, error: null } : { data: null, error: new Error("bad") }) },
  };
}

export function mockRes() {
  const res = { statusCode: 200, headers: {}, body: "", writableEnded: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b || ""; this.writableEnded = true; } };
  return res;
}

export async function call(fn, { method = "POST", body, token, headers = {} } = {}) {
  const req = { method, url: arguments[1]?.url || "/", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body };
  const res = mockRes();
  await fn(req, res);
  let json = null; try { json = res.body ? JSON.parse(res.body) : null; } catch { json = { html: res.body }; }
  return { status: res.statusCode, json };
}
