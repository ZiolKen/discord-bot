function svgDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const LOWPOLY = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b1d20"/>
      <stop offset="1" stop-color="#0f1113"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#g)"/>
  <g opacity="0.55">
    <polygon points="0,0 260,0 160,210" fill="#2a2d31"/>
    <polygon points="260,0 520,0 430,220" fill="#23262a"/>
    <polygon points="520,0 780,0 670,200" fill="#2f3338"/>
    <polygon points="780,0 1060,0 910,240" fill="#202327"/>
    <polygon points="1060,0 1600,0 1300,320" fill="#2a2d31"/>
    <polygon points="0,0 160,210 0,420" fill="#1f2226"/>
    <polygon points="160,210 430,220 260,440" fill="#2c3035"/>
    <polygon points="430,220 670,200 560,460" fill="#1d2024"/>
    <polygon points="670,200 910,240 760,480" fill="#2b2f34"/>
    <polygon points="910,240 1300,320 1020,520" fill="#1a1c20"/>
    <polygon points="0,420 160,210 260,440" fill="#2a2d31"/>
    <polygon points="0,420 260,440 120,680" fill="#1b1d20"/>
    <polygon points="260,440 560,460 360,720" fill="#2f3338"/>
    <polygon points="560,460 760,480 620,740" fill="#212428"/>
    <polygon points="760,480 1020,520 860,780" fill="#2a2d31"/>
    <polygon points="1020,520 1600,900 860,780" fill="#141619"/>
    <polygon points="120,680 360,720 0,900" fill="#202327"/>
    <polygon points="360,720 620,740 420,900" fill="#2b2f34"/>
    <polygon points="620,740 860,780 700,900" fill="#1f2226"/>
  </g>
</svg>
`);

function renderLandingPage({ inviteUrl, appName, botAvatar, supportServer, statusUrl }) {
  const safeName = String(appName || 'ジオルケン');
  const invite = String(inviteUrl || 'https://discord.com/oauth2/authorize?client_id=1398238289500307578&scope=bot&permissions=8');
  const support = String(supportServer || 'https://discord.gg/X7QrJvx7Sp');
  const status = String(statusUrl || '/status');
  const avatar = botAvatar ? `<img class="brand__avatar" src="../../assets/logo.png" alt="ジオルケン"/>` : '';

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
  <title>${safeName}</title>
  <style>
    :root{
      --bg:#0f1113;
      --panel:rgba(15,17,19,.62);
      --panel2:rgba(15,17,19,.85);
      --text:#f5f6f7;
      --muted:rgba(245,246,247,.75);
      --line:rgba(255,255,255,.12);
      --accent:#ffffff;
      --shadow:0 18px 60px rgba(0,0,0,.45);
      --radius:18px;
    }
    *{box-sizing:border-box}
    html,body{height:100%}
    body{
      margin:0;
      color:var(--text);
      font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      background:
        radial-gradient(1200px 700px at 15% 20%, rgba(255,255,255,.06), transparent 60%),
        radial-gradient(900px 550px at 80% 25%, rgba(255,255,255,.04), transparent 55%),
        url('${LOWPOLY}');
      background-size: cover;
      background-position: center;
      background-attachment: fixed;
    }
    .wrap{
      min-height:100%;
      display:flex;
      flex-direction:column;
    }
    .top{
      max-width:1100px;
      margin:0 auto;
      padding:28px 20px 0;
      width:100%;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:16px;
    }
    .brand{
      display:flex;
      align-items:center;
      gap:10px;
      font-weight:700;
      letter-spacing:.02em;
      text-transform:uppercase;
      font-size:12px;
      opacity:.95;
    }
    .brand__avatar{
      width:26px;height:26px;border-radius:999px;
      border:1px solid var(--line);
      box-shadow:0 8px 30px rgba(0,0,0,.35);
    }
    .nav{
      display:flex;
      align-items:center;
      gap:18px;
      font-size:13px;
      opacity:.9;
    }
    .nav a{
      color:var(--text);
      text-decoration:none;
      padding:8px 10px;
      border-radius:999px;
      transition:background .15s ease, opacity .15s ease;
    }
    .nav a:hover{background:rgba(255,255,255,.06)}
    .nav .cta{
      border:1px solid var(--line);
      background:rgba(255,255,255,.04);
    }
    .hero{
      max-width:1100px;
      margin:0 auto;
      width:100%;
      padding:70px 20px 48px;
      display:grid;
      grid-template-columns: 1.1fr .9fr;
      gap:28px;
      align-items:center;
      flex:1;
    }
    @media (max-width: 900px){
      .hero{grid-template-columns: 1fr; padding-top:46px}
      .nav{gap:8px; flex-wrap:wrap; justify-content:flex-end}
    }
    .card{
      background:var(--panel);
      border:1px solid var(--line);
      border-radius:var(--radius);
      box-shadow:var(--shadow);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .left{
      padding:36px 34px;
    }
    .title{
      font-size:64px;
      line-height:1.02;
      margin:0;
      letter-spacing:-.03em;
    }
    @media (max-width: 520px){
      .title{font-size:46px}
      .left{padding:26px 22px}
    }
    .subtitle{
      margin:16px 0 0;
      font-size:22px;
      font-weight:600;
      color:rgba(255,255,255,.9);
    }
    .desc{
      margin:14px 0 0;
      color:var(--muted);
      font-size:14px;
      line-height:1.7;
      max-width:58ch;
    }
    .actions{
      margin-top:22px;
      display:flex;
      flex-wrap:wrap;
      gap:12px;
    }
    .btn{
      appearance:none;
      border:1px solid var(--line);
      background:rgba(255,255,255,.06);
      color:var(--text);
      padding:10px 14px;
      border-radius:12px;
      text-decoration:none;
      font-weight:600;
      font-size:14px;
      letter-spacing:.01em;
      transition: transform .12s ease, background .12s ease, border-color .12s ease;
      user-select:none;
    }
    .btn:hover{
      transform: translateY(-1px);
      background:rgba(255,255,255,.10);
      border-color:rgba(255,255,255,.20);
    }
    .btn.primary{
      background:rgba(255,255,255,.14);
      border-color:rgba(255,255,255,.28);
    }
    .right{
      padding:22px;
    }
    .panelTitle{
      margin:0;
      font-size:14px;
      letter-spacing:.02em;
      text-transform:uppercase;
      color:rgba(255,255,255,.82);
    }
    .kv{
      margin-top:14px;
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap:10px;
    }
    .kv .item{
      border:1px solid var(--line);
      border-radius:14px;
      padding:12px 12px;
      background:rgba(0,0,0,.18);
    }
    .kv .k{
      font-size:11px;
      text-transform:uppercase;
      letter-spacing:.08em;
      color:rgba(255,255,255,.65);
    }
    .kv .v{
      margin-top:6px;
      font-size:18px;
      font-weight:700;
    }
    .statusbar{
      max-width:1100px;
      margin:0 auto;
      width:100%;
      padding:0 20px 22px;
    }
    .statusInner{
      display:flex;
      flex-wrap:wrap;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      padding:12px 14px;
      background:var(--panel2);
      border:1px solid var(--line);
      border-radius:14px;
      box-shadow:0 12px 45px rgba(0,0,0,.35);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .pill{
      display:inline-flex;
      align-items:center;
      gap:8px;
      font-size:12px;
      color:rgba(255,255,255,.85);
    }
    .dot{
      width:9px;height:9px;border-radius:999px;
      background:#9aa4ad;
      box-shadow:0 0 0 4px rgba(154,164,173,.12);
    }
    .dot.ok{background:#5eea8b; box-shadow:0 0 0 4px rgba(94,234,139,.14)}
    .dot.bad{background:#ff5d5d; box-shadow:0 0 0 4px rgba(255,93,93,.14)}
    .muted{color:rgba(255,255,255,.62)}
    .rightMini{display:flex; gap:14px; flex-wrap:wrap; justify-content:flex-end}
    .linkish{color:rgba(255,255,255,.9); text-decoration:none; border-bottom:1px solid rgba(255,255,255,.22)}
    .linkish:hover{border-bottom-color:rgba(255,255,255,.45)}
  </style>
</head>
<body>
  <div class="wrap">
    <header class="top">
      <div class="brand">${avatar}<span>${safeName}</span></div>
      <nav class="nav">
        <a href="https://botstatus.vercel.app" target="_blank" rel="noopener noreferrer>Status</a>
        <a href="${invite}" target="_blank" rel="noopener noreferrer">Invite</a>
        <a class="cta" href="https://github.com/ZiolKen/discord-bot" target="_blank" rel="noopener noreferrer">Github</a>
      </nav>
    </header>

    <main class="hero" id="home">
      <section class="card left">
        <h1 class="title">ZiolKen</h1>
        <div class="subtitle">• Discord Bot</div>
        <p class="desc">
          A versatile, utilities-focused Discord bot built with Node.js, discord.js, and PostgreSQL.
          It features a comprehensive suite of tools for server management, user engagement, and entertainment, supporting both slash (/) and legacy prefix commands (default !).
        </p>
        <div class="actions">
          <a class="btn primary" href="${invite}" target="_blank" rel="noopener noreferrer">Invite</a>
          <a class="btn" href="${support}" target="_blank" rel="noopener noreferrer">Support</a>
          <a class="btn" href="https://botstatus.vercel.app" target="_blank" rel="noopener noreferrer">Status</a>
        </div>
      </section>

      <aside class="card right" id="about">
        <h2 class="panelTitle">Live</h2>
        <div class="kv">
          <div class="item">
            <div class="k">Status</div>
            <div class="v" id="statusText">…</div>
          </div>
          <div class="item">
            <div class="k">Ping</div>
            <div class="v"><span id="ping">—</span> ms</div>
          </div>
          <div class="item">
            <div class="k">Guilds</div>
            <div class="v" id="guilds">—</div>
          </div>
          <div class="item">
            <div class="k">Uptime</div>
            <div class="v" id="uptime">—</div>
          </div>
        </div>
        <p class="muted">
          The bot also includes an Express-powered web server for a real-time status page and landing page.
        </p>
      </aside>
    </main>

    <footer class="statusbar" id="status">
      <div class="statusInner">
        <div class="pill">
          <span id="dot" class="dot"></span>
          <span><span id="miniStatus">Loading</span> <span class="muted" id="updated"></span></span>
        </div>
        <div class="rightMini">
          <span class="pill">Version <span class="muted" id="version">1.3.2</span></span>
          <span class="pill">Host <span class="muted" id="host">Render</span></span>
          <a class="pill linkish" href="${invite}">Invite</a>
        </div>
      </div>
    </footer>
  </div>

  <script>
    async function refresh() {
      try {
        const res = await fetch('${status}', { cache: 'no-store' });
        const data = await res.json();

        const ok = data && data.status === 'online';
        document.getElementById('dot').className = 'dot ' + (ok ? 'ok' : 'bad');

        document.getElementById('statusText').textContent = ok ? 'Online' : 'Offline';
        document.getElementById('miniStatus').textContent = ok ? 'Online' : 'Offline';

        document.getElementById('ping').textContent = (data.ping ?? '—');
        document.getElementById('guilds').textContent = (data.guilds ?? '—');
        document.getElementById('uptime').textContent = (data.uptime ?? '—');

        document.getElementById('version').textContent = (data.version ?? '—');
        document.getElementById('host').textContent = (data.host ?? '—');
        document.getElementById('updated').textContent = data.updated ? ('· ' + new Date(data.updated).toLocaleString()) : '';
      } catch (e) {
        document.getElementById('dot').className = 'dot bad';
        document.getElementById('statusText').textContent = 'Offline';
        document.getElementById('miniStatus').textContent = 'Offline';
      }
    }

    refresh();
    setInterval(refresh, 10000);
  </script>
</body>
</html>`;
}

module.exports = { renderLandingPage };
