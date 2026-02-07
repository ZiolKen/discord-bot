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
<html
  lang="en"
  data-bot-name="${safeName}"
  data-bot-invite="${invite}"
  data-bot-support="${support}"
  data-bot-github="https://github.com/ZiolKen/discord-bot"
  data-bot-status="https://botstatus.vercel.app"
  data-bot-status-api="/status"
  data-bot-incidents-api="/incidents"
  data-bg-image="${LOWPOLY}"
  translate="no"
  color-scheme="dark"
>

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="color-scheme" content="dark light" />
  <meta name="theme-color" content="#0b0b10" />
  <meta http-equiv="X-UA-Compatible" content="ie=edge" />
  <link rel="icon" type="image/png" href="../../assets/logo.png" />
  <link rel="shortcut icon" href="../../assets/logo.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="../../assets/logo.png" />
  <link rel="manifest" href="../../assets/manifest.json" />
  <meta name="description" content="A versatile, utilities-focused Discord bot built with Node.js, discord.js, and PostgreSQL." />
  <meta property="og:title" content="ZiolKen Bot" />
  <meta property="og:description" content="A versatile, utilities-focused Discord bot built with Node.js, discord.js, and PostgreSQL." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://discord-bot-us.onrender.com/" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:site_name" content="botstatus.vercel.app" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="ZiolKen Bot" />
  <meta name="twitter:description" content="A versatile, utilities-focused Discord bot built with Node.js, discord.js, and PostgreSQL." />

  <title>${safeName}</title>

  <link rel="stylesheet" href="/src/web/styles.css" />
</head>

<body autocomplete="off" spellcheck="false">
  <a class="skip" href="#main">Skip to content</a>

  <div class="bg" aria-hidden="true">
    <div class="bgImage"></div>
  </div>

  <div class="wrap">
    <header class="header">
      <div class="container">
        <div class="topbar">
          <a class="brand" href="#home">
            <img class="mark" src="../../assets/logo.png" alt="Bot logo" loading="eager" decoding="async" />
            <div class="brandText">
              <div class="brandName" data-bind="name">ZiolKen Bot</div>
              <div class="brandSub">• Discord Bot</div>
            </div>
          </a>

          <nav class="nav" style="justify-content: center;align-items: center" aria-label="Primary navigation">
            <a href="#features" class="zzz">Features</a>
            <a href="#stack" class="zzz">Stack</a>
            <a href="https://botstatus.vercel.app" target="_blank" rel="noopener noreferrer" class="zzz grad">Live Status</a>
          </nav>
          <nav class="nav" aria-label="Nav btn">
            <a class="btn btnPrimary" data-bind-href="invite" href="${invite}" target="_blank" rel="noopener noreferrer">
              Invite
              <span class="kbd">+</span>
            </a>
            <a class="btn" data-bind-href="github" href="https://github.com/ZiolKen/discord-bot" target="_blank" rel="noopener noreferrer">GitHub</a>
          </nav>
        </div>
      </div>
    </header>

    <main id="main">
      <section class="hero" id="home">
        <div class="container">
          <div class="heroGrid">
            <div class="heroLeft">
              <div class="badge reveal">
                <span class="badgeDot" aria-hidden="true"></span>
                Slash <span class="kbd">/</span> + Prefix <span class="kbd">!</span> commands
              </div>

              <h1 class="h1 reveal">
                Meet <span class="grad" data-bind="name">ZiolKen Bot</span>
              </h1>

              <p class="lead reveal">
                A <strong>utilities-first</strong> Discord bot built for <strong>moderation</strong>, <strong>economy & minigames</strong>, and <strong>server tools</strong> — with an Express-powered status API for real-time visibility.
              </p>

              <div class="heroActions reveal">
                <a class="btn btnPrimary" data-bind-href="invite" href="#" target="_blank" rel="noopener noreferrer">
                  Invite to Discord
                  <span class="kbd">↗</span>
                </a>
                <a class="btn" data-bind-href="support" href="${support}" target="_blank" rel="noopener noreferrer">Support</a>
                <a class="btn" data-bind-href="status" href="https://botstatus.vercel.app" target="_blank" rel="noopener noreferrer">Live Status</a>
              </div>

              <div class="heroMeta reveal" role="list">
                <div class="mini" role="listitem">
                  <div class="miniK">Focus</div>
                  <div class="miniV">Moderation</div>
                  <div class="miniS">Warnings, logs, automod modules</div>
                </div>
                <div class="mini" role="listitem">
                  <div class="miniK">Play</div>
                  <div class="miniV">Minigames</div>
                  <div class="miniS">Blackjack, slots, fishing</div>
                </div>
                <div class="mini" role="listitem">
                  <div class="miniK">Ops</div>
                  <div class="miniV">Status API</div>
                  <div class="miniS">Health, /status, /incidents</div>
                </div>
              </div>
            </div>

            <aside class="heroRight card reveal" aria-label="Quick preview panel">
              <div class="panelTop">
                <p class="panelTitle">Quick start</p>
                <span class="pill" id="heroHealthPill" aria-live="polite">
                  <span class="dot warn" id="heroHealthDot" aria-hidden="true"></span>
                  <span id="heroHealthText"><a href="${invite}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;font-weight:bold;color:var(--text)">Invite</a></span>
                </span>
              </div>

              <div class="panelBody">
                <div class="cmdBox" aria-label="Command examples">
                  <div class="cmdTop">
                    <div class="cmdLabel">
                      <span class="cmdIcon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                          <path d="M7.5 12h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                          <path d="M12 7.5v9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                          <path d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" stroke="currentColor" stroke-width="2" opacity=".8"/>
                        </svg>
                      </span>
                      Command palette
                    </div>
                    <span class="kbd">Tab</span>
                  </div>

                  <div class="cmdMain">
                    <div class="cmdLine">
                      <div class="cmdText" id="rotCmd">/setlog #mod-log</div>
                      <button class="copy" type="button" data-copy="#rotCmd">Copy</button>
                    </div>
                    <div class="cmdLine">
                      <div class="cmdText" id="rotHint">Route moderation actions to a dedicated log channel.</div>
                      <span class="kbd">Tip</span>
                    </div>
                  </div>
                </div>

                <div class="panelGrid" aria-label="Live highlights">
                  <div class="tiny">
                    <div class="tinyK">Bot version</div>
                    <div class="tinyV" id="statVersion">1.3.2</div>
                  </div>
                  <div class="tiny">
                    <div class="tinyK">Node</div>
                    <div class="tinyV" id="statPing">20.20.0</div>
                  </div>
                  <div class="tiny">
                    <div class="tinyK">discord.js</div>
                    <div class="tinyV" id="statGuilds">14.25.1</div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section class="section" id="features">
        <div class="container">
          <div class="secHead reveal">
            <div>
              <h2 class="h2">Everything a server needs, in one bot</h2>
              <p class="sub">
                Designed as a versatile utilities suite: moderation and security, economy & minigames, everyday utilities, leveling, and an Express status layer.
              </p>
            </div>
          </div>

          <div class="grid3">
            <article class="feat reveal">
              <div class="featTop">
                <div class="ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 2 3 6v6c0 5 3.5 9.5 9 10 5.5-.5 9-5 9-10V6l-9-4Z" stroke="currentColor" stroke-width="2" opacity=".9"/>
                    <path d="m9.5 12 1.8 1.8 3.7-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <h3 class="featTitle">Moderation & Security</h3>
              </div>
              <p class="featP">
                Ban/kick/timeout tools, purge/lock/slowmode controls, a warning system, configurable mod logs, plus opt-in automod modules.
              </p>
              <div class="chipRow" aria-label="Moderation highlights">
                <span class="chip">warn</span>
                <span class="chip">setlog</span>
                <span class="chip">antilink</span>
                <span class="chip">raid protection</span>
              </div>
            </article>

            <article class="feat reveal">
              <div class="featTop">
                <div class="ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M7 8h10M8.5 12H15.5M10 16h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" stroke="currentColor" stroke-width="2" opacity=".85"/>
                  </svg>
                </div>
                <h3 class="featTitle">Utilities that feel instant</h3>
              </div>
              <p class="featP">
                Server/user/channel/role info, avatar/banner, snipe, AFK, polls, reminders, timestamp generator, say, and custom prefixes.
              </p>
              <div class="chipRow" aria-label="Utilities highlights">
                <span class="chip">serverinfo</span>
                <span class="chip">reminders</span>
                <span class="chip">timestamp</span>
                <span class="chip">prefix</span>
              </div>
            </article>

            <article class="feat reveal">
              <div class="featTop">
                <div class="ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 3v18" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".9"/>
                    <path d="M7 8c1-2 3-3 5-3s4 1 5 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M7 16c1 2 3 3 5 3s4-1 5-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M6.5 12h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </div>
                <h3 class="featTitle">Economy, minigames & leveling</h3>
              </div>
              <p class="featP">
                Server economy with daily/weekly rewards, leaderboard tracking, and fun games like blackjack, slots, fishing, and more. Leveling is opt-in per server.
              </p>
              <div class="chipRow" aria-label="Game highlights">
                <span class="chip">daily</span>
                <span class="chip">leaderboard</span>
                <span class="chip">blackjack</span>
                <span class="chip">level</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="section" id="stack">
        <div class="container">
          <div class="secHead reveal">
            <div>
              <h2 class="h2">Built for long-term reliability</h2>
              <p class="sub">
                A modern Node.js bot stack with PostgreSQL persistence and an Express layer for health checks and operational visibility.
              </p>
            </div>
          </div>

          <div class="split">
            <div class="card stackCard reveal">
              <h3 class="featTitle" style="margin:0;font-size:16px">Tech stack</h3>
              <p class="featP" style="margin-top:10px">
                Node.js + discord.js + PostgreSQL, plus Express endpoints for status and incidents.
              </p>
              <div class="stackGrid">
                <div class="step">
                  <div class="stepTop">
                    <div class="stepN">Runtime</div>
                    <span class="kbd">Node.js</span>
                  </div>
                  <div class="stepT">Stable operations</div>
                  <div class="stepP">Designed to run cleanly in production environments.</div>
                </div>
                <div class="step">
                  <div class="stepTop">
                    <div class="stepN">Framework</div>
                    <span class="kbd">discord.js</span>
                  </div>
                  <div class="stepT">Discord-native UX</div>
                  <div class="stepP">Slash + prefix command support for flexible usage.</div>
                </div>
                <div class="step">
                  <div class="stepTop">
                    <div class="stepN">Database</div>
                    <span class="kbd">PostgreSQL</span>
                  </div>
                  <div class="stepT">Persistence</div>
                  <div class="stepP">Economy, leveling, reminders, and server settings.</div>
                </div>
                <div class="step">
                  <div class="stepTop">
                    <div class="stepN">Web</div>
                    <span class="kbd">Express</span>
                  </div>
                  <div class="stepT">Status endpoints</div>
                  <div class="stepP">Health checks, /status detail, /incidents history.</div>
                </div>
              </div>
            </div>

            <div class="card stackCard reveal">
              <h3 class="featTitle" style="margin:0;font-size:16px">Getting started</h3>
              <p class="featP" style="margin-top:10px">
                Add the bot, configure essentials, and optionally enable advanced modules.
              </p>

              <div class="stackGrid">
                <div class="step">
                  <div class="stepTop">
                    <div class="stepN">Step 01</div>
                    <span class="kbd">Invite</span>
                  </div>
                  <div class="stepT">Add to server</div>
                  <div class="stepP">Invite the bot with the required permissions for your needs.</div>
                </div>

                <div class="step">
                  <div class="stepTop">
                    <div class="stepN">Step 02</div>
                    <span class="kbd">/setlog</span>
                  </div>
                  <div class="stepT">Enable mod logs</div>
                  <div class="stepP">Route moderation actions to a dedicated channel.</div>
                </div>

                <div class="step">
                  <div class="stepTop">
                    <div class="stepN">Step 03</div>
                    <span class="kbd">/automod</span>
                  </div>
                  <div class="stepT">Opt-in AutoMod</div>
                  <div class="stepP">Toggle modules like antilink/antispam as needed.</div>
                </div>

                <div class="step">
                  <div class="stepTop">
                    <div class="stepN">Step 04</div>
                    <span class="kbd">/level</span>
                  </div>
                  <div class="stepT">Opt-in leveling</div>
                  <div class="stepP">Enable per-server leveling when you’re ready.</div>
                </div>
              </div>

              <div style="margin-top:14px;display:flex;gap:12px;flex-wrap:wrap">
                <a class="btn btnPrimary" data-bind-href="invite" href="${invite}" target="_blank" rel="noopener noreferrer">Invite now</a>
                <a class="btn" data-bind-href="github" href="https://github.com/ZiolKen/discord-bot" target="_blank" rel="noopener noreferrer">View source</a>
              </div>
            </div>
          </div>
        </div>
      </section>

    <footer class="statusbar2" id="status">
      <div class="statusInner2">
        <div class="pill2">
          <span><span id="miniStatus">Version: 1.3.2</span> <span class="muted2" id="updated"></span></span>
        </div>
        <div class="rightMini2">
          <span class="pill2">Node <span class="muted2" id="version">20.20.0</span></span>
          <span class="pill2">Host <span class="muted2" id="host">Render</span></span>
          <a class="pill2 linkish" href="${invite}">Invite</a>
        </div>
      </div>
    </footer>

    <footer class="container ft2">
    <div class="topbar">
      <div class="brand">
        <div class="brandText">
        <div class="brandName grad" style="font-weight:bold">ZiolKen Bot</div>
        <div class="brandSub">A versatile, utilities-focused Discord bot.</div>
        </div>
      </div>

      <div class="nav" aria-label="Sponsor">
        <a class="btn btnPrimary" href="https://buymeacoffee.com/_zkn" target="_blank" rel="noopener noreferrer">Buy Me a Coffee</a>
        <a class="btn" href="https://www.patreon.com/ZiolKen" target="_blank" rel="noopener noreferrer">Patreon</a>
      </div>
      </main>
    </div>
    </footer>
  </div>
</body>
</html>`;
}

module.exports = { renderLandingPage };
