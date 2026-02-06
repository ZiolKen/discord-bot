function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function inviteUrl(clientId, permissions) {
  const perms = String(permissions || '8');
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&scope=bot%20applications.commands&permissions=${encodeURIComponent(perms)}`;
}

function renderLandingPage(opts) {
  const title = escapeHtml(opts.title || 'Bot');
  const clientId = String(opts.clientId || '');
  const permissions = String(opts.permissions || '8');
  const statusUrl = opts.statusUrl ? String(opts.statusUrl) : '';
  const invite = clientId ? inviteUrl(clientId, permissions) : '';

  const external = statusUrl
    ? `<a class="btn ghost" href="${escapeHtml(statusUrl)}" target="_blank" rel="noopener">Status</a>`
    : '';

  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="dark light" />
  <link rel="icon" type="image/png" href="../../assets/logo.png" />
  <link rel="shortcut icon" href="../../assets/logo.png" />
  <link rel="apple-touch-icon" size="180x180" href="../../assets/logo.png" />
  <meta content="ie=edge" http-equiv="X-UA-Compatible" />
  <meta name="theme-color" content="#0b0b10" />
  <link rel="manifest" href="../../assets/manifest.json" />
  <title>${title}</title>
  <meta name="description" content="A versatile, utilities-focused Discord bot built with Node.js, discord.js, and PostgreSQL." />
  <meta property="og:title" content="ZiolKen Bot" />
  <meta property="og:description" content="A versatile, utilities-focused Discord bot built with Node.js, discord.js, and PostgreSQL." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://discord-bot-us.onrender.com/" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:site_name" content="ZiolKen Bot" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="ZiolKen Bot" />
  <meta name="twitter:description" content="A versatile, utilities-focused Discord bot built with Node.js, discord.js, and PostgreSQL." />
  <style>
    :root{
      --bg0:#050510;
      --bg1:#0b0b1a;
      --card:rgba(255,255,255,.06);
      --card2:rgba(255,255,255,.09);
      --bd:rgba(255,255,255,.12);
      --txt:#e9e9ff;
      --mut:#b9b9d9;
      --ok:#2ecc71;
      --warn:#f1c40f;
      --bad:#e74c3c;
      --chip:rgba(255,255,255,.10);
      --shadow:0 18px 70px rgba(0,0,0,.45);
      --r:18px;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      min-height:100vh;
      color:var(--txt);
      font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
      background:
        radial-gradient(1200px 900px at 15% 10%, #3b1cff44 0%, transparent 55%),
        radial-gradient(1000px 700px at 85% 25%, #00d4ff33 0%, transparent 55%),
        radial-gradient(900px 650px at 35% 90%, #ff2bd633 0%, transparent 55%),
        linear-gradient(180deg,var(--bg0),var(--bg1));
    }
    a{color:inherit;text-decoration:none}
    .wrap{max-width:1120px;margin:0 auto;padding:28px 18px 44px}
    .top{
      display:flex;align-items:center;justify-content:space-between;gap:12px;
      padding:14px 16px;border:1px solid var(--bd);border-radius:var(--r);
      background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.03));
      box-shadow:var(--shadow);
      backdrop-filter:blur(14px);
    }
    .brand{display:flex;align-items:center;gap:12px}
    .logo{
      width:44px;height:44px;border-radius:12px;
      background:rgba(0,212,255,.20);
      padding:8px;
      box-shadow:0 10px 25px rgba(0,212,255,.20);
    }
    .brand h1{margin:0;font-size:16px;letter-spacing:.2px}
    .brand p{margin:0;color:var(--mut);font-size:12px}
    .actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
    .btn{
      display:inline-flex;align-items:center;gap:8px;
      padding:10px 12px;border-radius:14px;border:1px solid var(--bd);
      background:rgba(255,255,255,.07);
      cursor:pointer;user-select:none;
      transition:transform .12s ease, background .12s ease;
    }
    .btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.10)}
    .btn.primary{border-color:transparent;background:linear-gradient(135deg,#7c4dff,#00d4ff)}
    .btn.ghost{background:transparent}
    .grid{
      margin-top:18px;
      display:grid;
      grid-template-columns:1.1fr .9fr;
      gap:16px;
    }
    @media (max-width: 920px){.grid{grid-template-columns:1fr}}
    .card{
      border:1px solid var(--bd);
      border-radius:var(--r);
      background:linear-gradient(180deg,var(--card),rgba(255,255,255,.03));
      box-shadow:var(--shadow);
      backdrop-filter:blur(14px);
      overflow:hidden;
    }
    .card .hd{
      padding:14px 16px;
      display:flex;align-items:center;justify-content:space-between;gap:10px;
      border-bottom:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.03);
    }
    .card .hd h2{margin:0;font-size:14px}
    .card .bd{padding:14px 16px}
    .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    @media (max-width: 720px){.kpis{grid-template-columns:1fr}}
    .kpi{
      border:1px solid rgba(255,255,255,.10);
      border-radius:16px;
      padding:12px 12px;
      background:rgba(255,255,255,.05);
    }
    .kpi .lab{font-size:12px;color:var(--mut)}
    .kpi .val{margin-top:6px;font-size:20px;font-weight:700;letter-spacing:.2px}
    .chips{display:flex;gap:8px;flex-wrap:wrap}
    .chip{
      display:inline-flex;align-items:center;gap:8px;
      padding:8px 10px;border-radius:999px;
      border:1px solid rgba(255,255,255,.10);
      background:var(--chip);
      font-size:12px;color:var(--mut);
    }
    .dot{width:8px;height:8px;border-radius:999px;background:var(--warn)}
    .dot.ok{background:var(--ok)}
    .dot.bad{background:var(--bad)}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
    .inc{
      display:flex;flex-direction:column;gap:10px;
    }
    .incItem{
      border:1px solid rgba(255,255,255,.10);
      border-radius:16px;
      padding:12px 12px;
      background:rgba(0,0,0,.14);
    }
    .incTop{display:flex;justify-content:space-between;gap:10px}
    .incTitle{font-weight:700}
    .pill{
      padding:6px 10px;border-radius:999px;font-size:12px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.05);
      color:var(--mut);
      white-space:nowrap;
    }
    .pill.ok{color:#bfffd6;border-color:#2ecc7144;background:#2ecc711a}
    .pill.bad{color:#ffd0cc;border-color:#e74c3c44;background:#e74c3c1a}
    .pill.warn{color:#fff2b8;border-color:#f1c40f44;background:#f1c40f1a}
    .mut{color:var(--mut)}
    .foot{
      margin-top:16px;
      display:flex;justify-content:center;flex-wrap:wrap;gap:10px;
      color:var(--mut);font-size:12px;
      text-align:center;align-items:center;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="brand">
        <div class="logo">
        <svg viewBox="0 -28.5 256 256" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z" fill="#5865F2" fill-rule="nonzero"> </path> </g> </g></svg>
        </div>
        <div>
          <h1>${title}</h1>
          <p>@ziolken</p>
        </div>
      </div>
      <div class="actions">
        ${invite ? `<a class="btn primary" href="${escapeHtml(invite)}" target="_blank" rel="noopener noreferrer">Invite</a>` : ''}
        ${external}
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="hd">
          <h2>Live Status</h2>
          <div class="chip"><span id="liveDot" class="dot"></span><span id="liveText">Loading…</span></div>
        </div>
        <div class="bd">
          <div class="kpis">
            <div class="kpi">
              <div class="lab">Ping</div>
              <div class="val" id="kPing">—</div>
            </div>
            <div class="kpi">
              <div class="lab">Uptime</div>
              <div class="val" id="kUptime">—</div>
            </div>
            <div class="kpi">
              <div class="lab">Guilds / Users</div>
              <div class="val"><span id="kGuilds">—</span> / <span id="kUsers">—</span></div>
            </div>
          </div>

          <div style="height:12px"></div>

          <div class="chips" id="svcChips"></div>

          <div style="height:12px"></div>

          <div class="mut">
            Updated: <span class="mono" id="kUpdated">—</span><br/>
            Boot: <span class="mono" id="kBoot">—</span><br/>
            Host: <span class="mono" id="kHost">—</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="hd">
          <h2>Incidents</h2>
          <div class="pill" id="incCount">—</div>
        </div>
        <div class="bd">
          <div class="inc" id="incList"></div>
        </div>
      </div>
    </div>

    <div class="foot">
      <div>© ${year} • ${title}</div>
      <div class="mut">Client: <span class="mono">${escapeHtml(clientId)}</span> • Permissions: <span class="mono">${escapeHtml(permissions)}</span></div>
    </div>
  </div>

<script>
  const $ = (id) => document.getElementById(id);

  function setLive(isOk, txt){
    $('liveText').textContent = txt;
    $('liveDot').className = 'dot' + (isOk ? ' ok' : ' bad');
  }

  function fmtTs(s){
    try { return new Date(s).toISOString(); } catch { return String(s||''); }
  }

  function renderServices(services){
    const box = $('svcChips');
    box.innerHTML = '';
    const entries = Object.entries(services || {});
    if (!entries.length) {
      const el = document.createElement('div');
      el.className = 'chip';
      el.innerHTML = '<span class="dot"></span><span>No services</span>';
      box.appendChild(el);
      return;
    }
    for (const [k,v] of entries){
      const el = document.createElement('div');
      el.className = 'chip';
      el.innerHTML = '<span class="dot ' + (v === 'online' ? 'ok' : 'bad') + '"></span>' +
                     '<span class="mono">' + k + '</span>' +
                     '<span>' + v + '</span>';
      box.appendChild(el);
    }
  }

  function renderIncidents(list){
    const box = $('incList');
    box.innerHTML = '';
    const arr = Array.isArray(list) ? list : [];
    $('incCount').textContent = arr.length ? (arr.length + ' total') : 'none';
    if (!arr.length){
      const el = document.createElement('div');
      el.className = 'incItem';
      el.innerHTML = '<div class="incTop"><div class="incTitle">All clear</div><div class="pill ok">healthy</div></div><div class="mut" style="margin-top:6px">No recent incidents.</div>';
      box.appendChild(el);
      return;
    }
    for (const it of arr.slice(0, 12)){
      const st = String(it.status || '');
      const isResolved = st === 'resolved' || it.resolvedAt || it.resolved_at;
      const pillCls = isResolved ? 'ok' : 'warn';
      const started = it.startedAt || it.started_at;
      const resolved = it.resolvedAt || it.resolved_at;
      const title = it.title || '';
      const service = it.service || '';
      const el = document.createElement('div');
      el.className = 'incItem';
      el.innerHTML =
        '<div class="incTop">' +
          '<div class="incTitle">' + service + '</div>' +
          '<div class="pill ' + pillCls + '">' + (isResolved ? 'resolved' : 'investigating') + '</div>' +
        '</div>' +
        '<div style="margin-top:8px">' + title + '</div>' +
        '<div class="mut" style="margin-top:8px">Started: <span class="mono">' + fmtTs(started) + '</span>' +
        (resolved ? '<br/>Resolved: <span class="mono">' + fmtTs(resolved) + '</span>' : '') +
        '</div>';
      box.appendChild(el);
    }
  }

  async function refresh(){
    try{
      const r = await fetch('/status', { cache: 'no-store' });
      if(!r.ok) throw new Error('status');
      const s = await r.json();
      setLive(true, 'Online');
      $('kPing').textContent = Math.round(Number(s.ping || 0)) + 'ms';
      $('kUptime').textContent = s.uptime || '—';
      $('kGuilds').textContent = String(s.guilds ?? '—');
      $('kUsers').textContent = String(s.users ?? '—');
      $('kUpdated').textContent = s.updated ? fmtTs(s.updated) : '—';
      $('kBoot').textContent = s.lastBoot ? fmtTs(s.lastBoot) : '—';
      $('kHost').textContent = s.host || '—';
      renderServices(s.services);
    }catch{
      setLive(false, 'Offline');
      renderServices({});
    }

    try{
      const r = await fetch('/incidents', { cache: 'no-store' });
      const list = await r.json();
      renderIncidents(list);
    }catch{
      renderIncidents([]);
    }
  }

  refresh();
  setInterval(refresh, 12000);
</script>
</body>
</html>`;
}

module.exports = { renderLandingPage };