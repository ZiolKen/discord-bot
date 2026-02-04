#include <dpp/dpp.h>
#include <httplib.h>
#include <nlohmann/json.hpp>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <ctime>
#include <deque>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <mutex>
#include <optional>
#include <random>
#include <regex>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

using json = nlohmann::json;

static std::atomic<bool> g_shutdown{false};

static std::string getenv_str(const char* k, const std::string& def = "") {
  const char* v = std::getenv(k);
  return (v && *v) ? std::string(v) : def;
}

static uint64_t getenv_u64(const char* k, uint64_t def = 0) {
  const std::string s = getenv_str(k, "");
  if (s.empty()) return def;
  try { return std::stoull(s); } catch (...) { return def; }
}

static int getenv_int(const char* k, int def = 0) {
  const std::string s = getenv_str(k, "");
  if (s.empty()) return def;
  try { return std::stoi(s); } catch (...) { return def; }
}

static std::string iso_now() {
  std::time_t t = std::time(nullptr);
  std::tm tm{};
  gmtime_r(&t, &tm);
  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S.000Z");
  return oss.str();
}

static std::string format_uptime_ms(uint64_t ms) {
  const uint64_t total = ms / 1000;
  const uint64_t h = total / 3600;
  const uint64_t m = (total % 3600) / 60;
  const uint64_t s = total % 60;
  std::ostringstream oss;
  oss << std::setw(2) << std::setfill('0') << h << "h "
      << std::setw(2) << std::setfill('0') << m << "m "
      << std::setw(2) << std::setfill('0') << s << "s";
  return oss.str();
}

static std::string uuid_like() {
  static thread_local std::mt19937_64 rng{std::random_device{}()};
  auto hex = [&](int n) {
    std::uniform_int_distribution<uint64_t> dist(0, 15);
    std::string out;
    out.reserve(n);
    for (int i = 0; i < n; ++i) {
      const uint64_t v = dist(rng);
      out.push_back("0123456789abcdef"[v]);
    }
    return out;
  };
  return hex(8) + "-" + hex(4) + "-" + hex(4) + "-" + hex(4) + "-" + hex(12);
}

struct Incident {
  std::string id;
  std::string service;
  std::string title;
  std::string status;
  std::string startedAt;
  std::optional<std::string> resolvedAt;
};

struct Services {
  std::atomic<bool> api{true};
  std::atomic<bool> gateway{false};
  std::atomic<bool> commands{true};
};

struct GuildMeta {
  std::string name;
  uint32_t member_count{0};
};

struct GuessState {
  bool active{false};
  int answer{0};
  int tries{0};
};

struct TriviaState {
  bool active{false};
  std::string question;
  std::string answer;
};

struct RateBucket {
  std::deque<std::chrono::steady_clock::time_point> hits;
};

class BotState {
public:
  const uint64_t start_ms = now_ms();
  const std::string lastBoot = iso_now();

  Services services;
  std::atomic<bool> ready{false};

  std::mutex incidents_m;
  std::vector<Incident> incidents;

  std::mutex guilds_m;
  std::unordered_map<dpp::snowflake, GuildMeta> guilds;

  std::mutex prefix_m;
  std::string default_prefix{"!"};
  std::unordered_map<dpp::snowflake, std::string> guild_prefix;

  std::mutex guess_m;
  std::unordered_map<dpp::snowflake, GuessState> guess_by_channel;

  std::mutex trivia_m;
  std::unordered_map<dpp::snowflake, TriviaState> trivia_by_channel;

  std::mutex rate_m;
  std::unordered_map<uint64_t, RateBucket> rate;

  std::vector<std::pair<std::string, std::string>> trivia_bank = {
    {"What is the capital of Japan?", "tokyo"},
    {"2 + 2 = ?", "4"},
    {"Which planet is known as the Red Planet?", "mars"},
    {"What does CPU stand for?", "central processing unit"},
    {"HTTP status for Not Found?", "404"}
  };

  static uint64_t now_ms() {
    return (uint64_t)std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()
    ).count();
  }

  void load_prefixes_best_effort(const std::string& path) {
    std::scoped_lock lk(prefix_m);
    std::ifstream f(path);
    if (!f.good()) return;
    try {
      json j; f >> j;
      if (!j.is_object()) return;
      if (j.contains("default_prefix") && j["default_prefix"].is_string())
        default_prefix = j["default_prefix"].get<std::string>();
      if (j.contains("guild_prefix") && j["guild_prefix"].is_object()) {
        for (auto it = j["guild_prefix"].begin(); it != j["guild_prefix"].end(); ++it) {
          const std::string k = it.key();
          if (!it.value().is_string()) continue;
          try {
            uint64_t gid = std::stoull(k);
            guild_prefix[(dpp::snowflake)gid] = it.value().get<std::string>();
          } catch (...) {}
        }
      }
    } catch (...) {}
  }

  void save_prefixes_best_effort(const std::string& path) {
    std::scoped_lock lk(prefix_m);
    json j;
    j["default_prefix"] = default_prefix;
    json gp = json::object();
    for (const auto& [gid, p] : guild_prefix) gp[std::to_string((uint64_t)gid)] = p;
    j["guild_prefix"] = gp;
    std::error_code ec;
    std::filesystem::create_directories(std::filesystem::path(path).parent_path(), ec);
    std::ofstream f(path, std::ios::trunc);
    if (!f.good()) return;
    f << j.dump(2);
  }

  std::string get_prefix(dpp::snowflake guild_id) {
    std::scoped_lock lk(prefix_m);
    auto it = guild_prefix.find(guild_id);
    if (it != guild_prefix.end() && !it->second.empty()) return it->second;
    return default_prefix;
  }

  bool set_prefix(dpp::snowflake guild_id, const std::string& p) {
    if (p.empty() || p.size() > 8) return false;
    for (char c : p) {
      if (std::isspace((unsigned char)c)) return false;
    }
    {
      std::scoped_lock lk(prefix_m);
      guild_prefix[guild_id] = p;
    }
    return true;
  }

  void create_incident(const std::string& service, const std::string& title) {
    std::scoped_lock lk(incidents_m);
    for (auto& i : incidents) {
      if (i.service == service && !i.resolvedAt.has_value()) return;
    }
    incidents.push_back(Incident{
      uuid_like(),
      service,
      title,
      "investigating",
      iso_now(),
      std::nullopt
    });
  }

  void resolve_incident(const std::string& service) {
    std::scoped_lock lk(incidents_m);
    for (auto it = incidents.rbegin(); it != incidents.rend(); ++it) {
      if (it->service == service && !it->resolvedAt.has_value()) {
        it->status = "resolved";
        it->resolvedAt = iso_now();
        return;
      }
    }
  }

  json incidents_json() {
    std::scoped_lock lk(incidents_m);
    json arr = json::array();
    int count = 0;
    for (auto it = incidents.rbegin(); it != incidents.rend(); ++it) {
      if (++count > 50) break;
      json o;
      o["id"] = it->id;
      o["service"] = it->service;
      o["title"] = it->title;
      o["status"] = it->status;
      o["startedAt"] = it->startedAt;
      if (it->resolvedAt.has_value()) o["resolvedAt"] = *it->resolvedAt; else o["resolvedAt"] = nullptr;
      arr.push_back(o);
    }
    return arr;
  }

  bool rate_limit_hit(dpp::snowflake guild_id, dpp::snowflake user_id) {
    const uint64_t key = ((uint64_t)guild_id << 22) ^ (uint64_t)user_id;
    const auto now = std::chrono::steady_clock::now();
    std::scoped_lock lk(rate_m);
    auto& b = rate[key];
    while (!b.hits.empty() && (now - b.hits.front()) > std::chrono::seconds(6)) b.hits.pop_front();
    b.hits.push_back(now);
    return b.hits.size() >= 7;
  }

  std::pair<uint64_t, uint64_t> totals() {
    std::scoped_lock lk(guilds_m);
    uint64_t g = guilds.size();
    uint64_t u = 0;
    for (const auto& [_, meta] : guilds) u += meta.member_count;
    return {g, u};
  }
};

static bool parse_duration(const std::string& s, std::chrono::seconds& out) {
  if (s.size() < 2) return false;
  char unit = (char)std::tolower((unsigned char)s.back());
  std::string num = s.substr(0, s.size() - 1);
  long long v = 0;
  try { v = std::stoll(num); } catch (...) { return false; }
  if (v <= 0) return false;
  if (unit == 's') out = std::chrono::seconds(v);
  else if (unit == 'm') out = std::chrono::minutes(v);
  else if (unit == 'h') out = std::chrono::hours(v);
  else if (unit == 'd') out = std::chrono::hours(24 * v);
  else return false;
  return true;
}

static std::vector<std::string> split_ws(const std::string& s) {
  std::istringstream iss(s);
  std::vector<std::string> out;
  for (std::string w; iss >> w;) out.push_back(w);
  return out;
}

static std::string lower(std::string s) {
  for (char& c : s) c = (char)std::tolower((unsigned char)c);
  return s;
}

static bool has_mod_perm(const dpp::message& msg, uint64_t needed) {
  dpp::guild* g = dpp::find_guild(msg.guild_id);
  if (!g) return false;
  dpp::permission p = g->base_permissions(msg.member);
  return p.can(needed);
}

static dpp::embed make_embed(const std::string& title, const std::string& desc, uint32_t color) {
  dpp::embed e;
  e.set_title(title);
  e.set_description(desc);
  e.set_color(color);
  e.set_timestamp(std::time(nullptr));
  return e;
}

static void set_cors(httplib::Response& res) {
  res.set_header("Access-Control-Allow-Origin", "*");
  res.set_header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set_header("Access-Control-Allow-Headers", "Content-Type");
}

static void handle_signal(int) {
  g_shutdown.store(true);
}

int main() {
  std::signal(SIGINT, handle_signal);
  std::signal(SIGTERM, handle_signal);

  const std::string token = getenv_str("DISCORD_TOKEN", "");
  if (token.empty()) {
    std::cerr << "Missing DISCORD_TOKEN\n";
    return 1;
  }

  BotState state;
  state.default_prefix = getenv_str("DEFAULT_PREFIX", "!");
  const uint64_t owner_id = getenv_u64("OWNER_ID", 951037699320602674ULL);
  const std::string status_url = getenv_str("STATUS_URL", "https://botstatus.vercel.app/");
  const std::string host_provider = getenv_str("HOST_PROVIDER", "Render.com");
  const std::string prefix_store_path = "data/prefixes.json";

  state.load_prefixes_best_effort(prefix_store_path);

  const uint32_t intents = dpp::i_default_intents | dpp::i_message_content;

  dpp::cluster bot(token, intents);
  bot.on_log([&](const dpp::log_t& ev) {
    const std::string m = ev.message;
    if (m.find("Disconnected") != std::string::npos || m.find("disconnected") != std::string::npos) {
      state.services.gateway.store(false);
      state.create_incident("gateway", "Discord Gateway disconnected");
    }
    if (m.find("Connected") != std::string::npos || m.find("connected") != std::string::npos) {
      state.services.gateway.store(true);
      state.resolve_incident("gateway");
    }
    std::cout << "[" << (int)ev.severity << "] " << ev.message << "\n";
  });

  bot.on_ready([&](const dpp::ready_t& ev) {
    state.ready.store(true);
    state.services.gateway.store(true);
    state.resolve_incident("gateway");

    bot.set_presence(dpp::presence(dpp::ps_online, dpp::at_watching, status_url));

    if (dpp::run_once<struct register_commands>()) {
      std::vector<dpp::slashcommand> cmds;

      cmds.emplace_back(dpp::slashcommand("ping", "Check bot latency", bot.me.id));
      cmds.emplace_back(dpp::slashcommand("info", "Get bot info", bot.me.id));
      cmds.emplace_back(dpp::slashcommand("serverinfo", "Get current server info", bot.me.id));

      {
        dpp::slashcommand c("userinfo", "Get info about a user", bot.me.id);
        c.add_option(dpp::command_option(dpp::co_user, "target", "User to lookup", false));
        cmds.push_back(c);
      }

      cmds.emplace_back(dpp::slashcommand("credit", "Show bot creator info", bot.me.id));

      {
        dpp::slashcommand c("serverlist", "Show all servers the bot is in (owner only)", bot.me.id);
        cmds.push_back(c);
      }

      {
        dpp::slashcommand c("setprefix", "Change prefix for this server", bot.me.id);
        c.add_option(dpp::command_option(dpp::co_string, "prefix", "New prefix (1..8 chars, no spaces)", true));
        cmds.push_back(c);
      }

      {
        dpp::slashcommand c("rps", "Rock Paper Scissors", bot.me.id);
        dpp::command_option opt(dpp::co_string, "choice", "rock|paper|scissors", true);
        opt.add_choice(dpp::command_option_choice("rock", std::string("rock")));
        opt.add_choice(dpp::command_option_choice("paper", std::string("paper")));
        opt.add_choice(dpp::command_option_choice("scissors", std::string("scissors")));
        c.add_option(opt);
        cmds.push_back(c);
      }

      cmds.emplace_back(dpp::slashcommand("coinflip", "Flip a coin", bot.me.id));

      {
        dpp::slashcommand c("guess", "Guess number minigame", bot.me.id);
        c.add_option(dpp::command_option(dpp::co_string, "action", "start|stop|number", true));
        c.add_option(dpp::command_option(dpp::co_integer, "number", "Your guess (only for action=number)", false));
        cmds.push_back(c);
      }

      cmds.emplace_back(dpp::slashcommand("trivia", "Start a trivia question in this channel", bot.me.id));

      bot.global_bulk_command_create(cmds);
    }
  });

  bot.on_guild_create([&](const dpp::guild_create_t& ev) {
    std::scoped_lock lk(state.guilds_m);
    GuildMeta meta;
    meta.name = ev.created.name;
    meta.member_count = ev.created.member_count;
    state.guilds[ev.created.id] = meta;
  });

  bot.on_guild_delete([&](const dpp::guild_delete_t& ev) {
    std::scoped_lock lk(state.guilds_m);
    state.guilds.erase(ev.deleted.id);
  });

  bot.on_slashcommand([&](const dpp::slashcommand_t& ev) {
    state.services.commands.store(true);
    state.resolve_incident("commands");

    const auto name = ev.command.get_command_name();
    const uint64_t now_ms = BotState::now_ms();
    const std::string uptime = format_uptime_ms(now_ms - state.start_ms);

    auto reply_embed = [&](const dpp::embed& e, bool ephemeral=false) {
      dpp::message m;
      m.add_embed(e);
      if (ephemeral) m.set_flags(dpp::m_ephemeral);
      ev.reply(m);
    };

    try {
      if (name == "ping") {
        double ping_ms = 0.0;
        if (auto* s = bot.get_shard(0)) ping_ms = s->websocket_ping * 1000.0;

        std::ostringstream d;
        d << "**Ping:** " << std::fixed << std::setprecision(2) << ping_ms << "ms\n"
          << "**Uptime:** " << uptime << "\n"
          << "**Status:** " << status_url;

        auto e = make_embed("〽️ Pong!", d.str(), 0xFF00FF);
        reply_embed(e);
      }

      else if (name == "info") {
        const auto servers = state.totals().first;
        std::ostringstream d;
        d << "**Username:** " << bot.me.username << "#" << bot.me.discriminator << "\n"
          << "**ID:** " << (uint64_t)bot.me.id << "\n"
          << "**Servers:** " << servers << "\n"
          << "**Uptime:** " << uptime << "\n"
          << "**Status:** " << status_url;

        auto e = make_embed("🤖 Bot Info", d.str(), 0xFF00FF);
        e.set_thumbnail(bot.me.get_avatar_url());
        reply_embed(e);
      }

      else if (name == "serverinfo") {
        dpp::guild* g = dpp::find_guild(ev.command.guild_id);
        if (!g) { ev.reply("Server info not available."); return; }

        std::ostringstream d;
        d << "**Name:** " << g->name << "\n"
          << "**ID:** " << (uint64_t)g->id << "\n"
          << "**Owner:** <@" << (uint64_t)g->owner_id << ">\n"
          << "**Members:** " << g->member_count;

        auto e = make_embed("🏠 Server Info", d.str(), 0xFF00FF);
        if (!g->icon.is_empty()) e.set_thumbnail(g->get_icon_url());
        reply_embed(e);
      }

      else if (name == "userinfo") {
        dpp::snowflake target = ev.command.usr.id;
        if (ev.command.get_resolved_user("target")) {
          target = ev.command.get_resolved_user("target")->id;
        }
        dpp::user* u = dpp::find_user(target);
        std::ostringstream d;
        if (u) {
          d << "**Username:** " << u->username << "#" << u->discriminator << "\n"
            << "**ID:** " << (uint64_t)u->id;
          auto e = make_embed("ℹ️ User Info", d.str(), 0xFF00FF);
          e.set_thumbnail(u->get_avatar_url());
          reply_embed(e);
        } else {
          ev.reply("User not in cache yet.");
        }
      }

      else if (name == "credit") {
        std::ostringstream d;
        d << "Created by **@ZiolKen**\n"
          << "Website: https://ziolken.vercel.app\n"
          << "Bot Status: " << status_url;
        auto e = make_embed("👨‍💻 Bot Developer", d.str(), 0xFF00FF);
        e.set_thumbnail(bot.me.get_avatar_url());
        reply_embed(e);
      }

      else if (name == "serverlist") {
        if ((uint64_t)ev.command.usr.id != owner_id) {
          ev.reply(dpp::message("🚫 You do not have permission to use this command.").set_flags(dpp::m_ephemeral));
          return;
        }
        std::ostringstream out;
        {
          std::scoped_lock lk(state.guilds_m);
          int i = 1;
          for (const auto& [gid, meta] : state.guilds) {
            out << i++ << ". " << meta.name << " (ID: " << (uint64_t)gid << ")\n";
          }
        }
        const std::string s = out.str();
        if (s.size() > 1800) {
          dpp::message m;
          m.set_flags(dpp::m_ephemeral);
          m.set_content("📄 Server list attached.");
          m.add_file("serverlist.txt", s, "text/plain");
          ev.reply(m);
        } else {
          ev.reply(dpp::message("🤖 Servers:\n" + s).set_flags(dpp::m_ephemeral));
        }
      }

      else if (name == "setprefix") {
        if (!has_mod_perm(*ev.command.msg, dpp::p_manage_guild)) {
          ev.reply(dpp::message("🚫 You need Manage Server to change prefix.").set_flags(dpp::m_ephemeral));
          return;
        }
        const std::string p = std::get<std::string>(ev.get_parameter("prefix"));
        if (!state.set_prefix(ev.command.guild_id, p)) {
          ev.reply(dpp::message("Invalid prefix. 1..8 chars, no spaces.").set_flags(dpp::m_ephemeral));
          return;
        }
        state.save_prefixes_best_effort(prefix_store_path);
        ev.reply("✅ Prefix updated to `" + p + "`");
      }

      else if (name == "rps") {
        const std::string choice = lower(std::get<std::string>(ev.get_parameter("choice")));
        static thread_local std::mt19937 rng{std::random_device{}()};
        const std::vector<std::string> opts{"rock","paper","scissors"};
        const std::string botc = opts[std::uniform_int_distribution<int>(0,2)(rng)];

        auto win = [&](const std::string& a, const std::string& b) {
          return (a=="rock"&&b=="scissors") || (a=="paper"&&b=="rock") || (a=="scissors"&&b=="paper");
        };

        std::string res;
        if (choice == botc) res = "Draw!";
        else if (win(choice, botc)) res = "You win!";
        else res = "You lose!";

        ev.reply("You: **" + choice + "** | Bot: **" + botc + "** → **" + res + "**");
      }

      else if (name == "coinflip") {
        static thread_local std::mt19937 rng{std::random_device{}()};
        const bool heads = std::uniform_int_distribution<int>(0,1)(rng) == 1;
        ev.reply(std::string("🪙 ") + (heads ? "**Heads**" : "**Tails**"));
      }

      else if (name == "guess") {
        const std::string action = lower(std::get<std::string>(ev.get_parameter("action")));
        const dpp::snowflake cid = ev.command.channel_id;

        static thread_local std::mt19937 rng{std::random_device{}()};

        if (action == "start") {
          std::scoped_lock lk(state.guess_m);
          auto& gs = state.guess_by_channel[cid];
          gs.active = true;
          gs.answer = std::uniform_int_distribution<int>(1, 100)(rng);
          gs.tries = 0;
          ev.reply("🎯 Guess game started (1..100). Use `/guess action:number number:<n>` or `!guess <n>`.");
        } else if (action == "stop") {
          std::scoped_lock lk(state.guess_m);
          state.guess_by_channel.erase(cid);
          ev.reply("🛑 Guess game stopped.");
        } else if (action == "number") {
          int n = 0;
          try { n = (int)std::get<int64_t>(ev.get_parameter("number")); } catch (...) { n = 0; }
          if (n < 1 || n > 100) { ev.reply("Pick a number 1..100."); return; }

          std::scoped_lock lk(state.guess_m);
          auto it = state.guess_by_channel.find(cid);
          if (it == state.guess_by_channel.end() || !it->second.active) {
            ev.reply("No active game. Use `/guess start` first.");
            return;
          }
          auto& gs = it->second;
          gs.tries++;
          if (n == gs.answer) {
            ev.reply("✅ Correct! Tries: " + std::to_string(gs.tries));
            state.guess_by_channel.erase(cid);
          } else if (n < gs.answer) {
            ev.reply("⬆️ Higher.");
          } else {
            ev.reply("⬇️ Lower.");
          }
        } else {
          ev.reply("Use action=start|stop|number");
        }
      }

      else if (name == "trivia") {
        static thread_local std::mt19937 rng{std::random_device{}()};
        const auto& qa = state.trivia_bank[std::uniform_int_distribution<int>(0, (int)state.trivia_bank.size()-1)(rng)];

        std::scoped_lock lk(state.trivia_m);
        auto& ts = state.trivia_by_channel[ev.command.channel_id];
        ts.active = true;
        ts.question = qa.first;
        ts.answer = lower(qa.second);

        ev.reply("🧠 Trivia: **" + ts.question + "**\nAnswer with `!answer <text>`.");
      }

    } catch (...) {
      state.services.commands.store(false);
      state.create_incident("commands", "Command execution failed");
      try { ev.reply("⚠️ Command error."); } catch (...) {}
    }
  });

  bot.on_message_create([&](const dpp::message_create_t& ev) {
    const dpp::message& msg = ev.msg;
    if (msg.author.is_bot()) return;
    if (msg.is_dm()) return;
    if (!state.ready.load()) return;

    const std::string content = msg.content;
    const auto guild_id = msg.guild_id;
    const auto channel_id = msg.channel_id;

    const bool is_mod = has_mod_perm(msg, dpp::p_manage_messages);

    static const std::regex invite_re(R"((discord\.gg\/|discord\.com\/invite\/))", std::regex::icase);

    if (!is_mod && std::regex_search(content, invite_re)) {
      bot.message_delete(msg.id, channel_id);
      bot.message_create(dpp::message(channel_id, "🚫 Invite links are not allowed here."));
      return;
    }

    if (!is_mod) {
      const size_t mentions = msg.mentions.size();
      const size_t role_mentions = msg.mention_roles.size();
      const bool everyone = msg.mention_everyone;
      if (everyone || mentions >= 6 || role_mentions >= 4) {
        bot.message_delete(msg.id, channel_id);
        bot.message_create(dpp::message(channel_id, "🚫 Mass mentions are blocked."));
        return;
      }
    }

    if (!is_mod && state.rate_limit_hit(guild_id, msg.author.id)) {
      bot.message_delete(msg.id, channel_id);
      bot.message_create(dpp::message(channel_id, "⚠️ Slow down (anti-spam)."));
      return;
    }

    const std::string prefix = state.get_prefix(guild_id);
    if (content.rfind(prefix, 0) != 0) {
      return;
    }

    const std::string rest = content.substr(prefix.size());
    auto parts = split_ws(rest);
    if (parts.empty()) return;

    const std::string cmd = lower(parts[0]);
    parts.erase(parts.begin());

    auto say = [&](const std::string& t) {
      bot.message_create(dpp::message(channel_id, t));
    };

    auto say_embed = [&](const dpp::embed& e) {
      dpp::message m(channel_id, "");
      m.add_embed(e);
      bot.message_create(m);
    };

    try {
      if (cmd == "help") {
        std::ostringstream d;
        d << "**Prefix:** `" << prefix << "`\n"
          << "**Utilities:** help, ping, info, serverinfo, userinfo, credit, serverlist\n"
          << "**Config:** setprefix\n"
          << "**Games:** rps, coinflip, guess, trivia, answer\n"
          << "**Moderation:** purge\n"
          << "**Status:** " << status_url;
        say_embed(make_embed("🧰 Commands", d.str(), 0x00D4FF));
      }

      else if (cmd == "ping") {
        double ping_ms = 0.0;
        if (auto* s = bot.get_shard(0)) ping_ms = s->websocket_ping * 1000.0;
        const uint64_t now_ms = BotState::now_ms();
        const std::string uptime = format_uptime_ms(now_ms - state.start_ms);

        std::ostringstream d;
        d << "**Ping:** " << std::fixed << std::setprecision(2) << ping_ms << "ms\n"
          << "**Uptime:** " << uptime << "\n"
          << "**Status:** " << status_url;
        say_embed(make_embed("〽️ Pong!", d.str(), 0xFF00FF));
      }

      else if (cmd == "info") {
        const auto totals = state.totals();
        const uint64_t now_ms = BotState::now_ms();
        const std::string uptime = format_uptime_ms(now_ms - state.start_ms);

        std::ostringstream d;
        d << "**Username:** " << bot.me.username << "#" << bot.me.discriminator << "\n"
          << "**ID:** " << (uint64_t)bot.me.id << "\n"
          << "**Servers:** " << totals.first << "\n"
          << "**Uptime:** " << uptime << "\n"
          << "**Status:** " << status_url;

        auto e = make_embed("🤖 Bot Info", d.str(), 0xFF00FF);
        e.set_thumbnail(bot.me.get_avatar_url());
        say_embed(e);
      }

      else if (cmd == "serverinfo") {
        dpp::guild* g = dpp::find_guild(guild_id);
        if (!g) { say("Server info not available."); return; }

        std::ostringstream d;
        d << "**Name:** " << g->name << "\n"
          << "**ID:** " << (uint64_t)g->id << "\n"
          << "**Owner:** <@" << (uint64_t)g->owner_id << ">\n"
          << "**Members:** " << g->member_count;

        auto e = make_embed("🏠 Server Info", d.str(), 0xFF00FF);
        if (!g->icon.is_empty()) e.set_thumbnail(g->get_icon_url());
        say_embed(e);
      }

      else if (cmd == "userinfo") {
        dpp::snowflake target = msg.author.id;
        if (!msg.mentions.empty()) target = msg.mentions[0].first.id;
        dpp::user* u = dpp::find_user(target);
        if (!u) { say("User not in cache yet."); return; }
        std::ostringstream d;
        d << "**Username:** " << u->username << "#" << u->discriminator << "\n"
          << "**ID:** " << (uint64_t)u->id;
        auto e = make_embed("ℹ️ User Info", d.str(), 0xFF00FF);
        e.set_thumbnail(u->get_avatar_url());
        say_embed(e);
      }

      else if (cmd == "credit") {
        std::ostringstream d;
        d << "Created by **@ZiolKen**\n"
          << "Website: https://ziolken.vercel.app\n"
          << "Bot Status: " << status_url;
        auto e = make_embed("👨‍💻 Bot Developer", d.str(), 0xFF00FF);
        e.set_thumbnail(bot.me.get_avatar_url());
        say_embed(e);
      }

      else if (cmd == "serverlist") {
        if ((uint64_t)msg.author.id != owner_id) { say("🚫 You do not have permission to use this command."); return; }
        std::ostringstream out;
        {
          std::scoped_lock lk(state.guilds_m);
          int i = 1;
          for (const auto& [gid, meta] : state.guilds) {
            out << i++ << ". " << meta.name << " (ID: " << (uint64_t)gid << ")\n";
          }
        }
        const std::string s = out.str();
        if (s.size() > 1800) {
          dpp::message m(channel_id, "📄 Server list attached.");
          m.add_file("serverlist.txt", s, "text/plain");
          bot.message_create(m);
        } else {
          say("🤖 Servers:\n" + s);
        }
      }

      else if (cmd == "setprefix") {
        if (!has_mod_perm(msg, dpp::p_manage_guild)) { say("🚫 You need Manage Server to change prefix."); return; }
        if (parts.empty()) { say("Usage: setprefix <prefix>"); return; }
        const std::string p = parts[0];
        if (!state.set_prefix(guild_id, p)) { say("Invalid prefix. 1..8 chars, no spaces."); return; }
        state.save_prefixes_best_effort(prefix_store_path);
        say("✅ Prefix updated to `" + p + "`");
      }

      else if (cmd == "rps") {
        if (parts.empty()) { say("Usage: rps rock|paper|scissors"); return; }
        const std::string choice = lower(parts[0]);
        static thread_local std::mt19937 rng{std::random_device{}()};
        const std::vector<std::string> opts{"rock","paper","scissors"};
        const std::string botc = opts[std::uniform_int_distribution<int>(0,2)(rng)];
        auto win = [&](const std::string& a, const std::string& b) {
          return (a=="rock"&&b=="scissors") || (a=="paper"&&b=="rock") || (a=="scissors"&&b=="paper");
        };
        std::string res;
        if (choice == botc) res = "Draw!";
        else if (win(choice, botc)) res = "You win!";
        else res = "You lose!";
        say("You: **" + choice + "** | Bot: **" + botc + "** → **" + res + "**");
      }

      else if (cmd == "coinflip") {
        static thread_local std::mt19937 rng{std::random_device{}()};
        const bool heads = std::uniform_int_distribution<int>(0,1)(rng) == 1;
        say(std::string("🪙 ") + (heads ? "**Heads**" : "**Tails**"));
      }

      else if (cmd == "guess") {
        static thread_local std::mt19937 rng{std::random_device{}()};
        if (parts.empty()) { say("Usage: guess start|stop|<number>"); return; }
        const std::string a = lower(parts[0]);

        if (a == "start") {
          std::scoped_lock lk(state.guess_m);
          auto& gs = state.guess_by_channel[channel_id];
          gs.active = true;
          gs.answer = std::uniform_int_distribution<int>(1,100)(rng);
          gs.tries = 0;
          say("🎯 Guess game started (1..100).");
        } else if (a == "stop") {
          std::scoped_lock lk(state.guess_m);
          state.guess_by_channel.erase(channel_id);
          say("🛑 Guess game stopped.");
        } else {
          int n = 0;
          try { n = std::stoi(a); } catch (...) { n = 0; }
          if (n < 1 || n > 100) { say("Pick a number 1..100."); return; }
          std::scoped_lock lk(state.guess_m);
          auto it = state.guess_by_channel.find(channel_id);
          if (it == state.guess_by_channel.end() || !it->second.active) { say("No active game. Use `guess start`."); return; }
          auto& gs = it->second;
          gs.tries++;
          if (n == gs.answer) {
            say("✅ Correct! Tries: " + std::to_string(gs.tries));
            state.guess_by_channel.erase(channel_id);
          } else if (n < gs.answer) say("⬆️ Higher.");
          else say("⬇️ Lower.");
        }
      }

      else if (cmd == "trivia") {
        static thread_local std::mt19937 rng{std::random_device{}()};
        const auto& qa = state.trivia_bank[std::uniform_int_distribution<int>(0, (int)state.trivia_bank.size()-1)(rng)];
        std::scoped_lock lk(state.trivia_m);
        auto& ts = state.trivia_by_channel[channel_id];
        ts.active = true;
        ts.question = qa.first;
        ts.answer = lower(qa.second);
        say("🧠 Trivia: **" + ts.question + "**\nAnswer with `answer <text>`.");
      }

      else if (cmd == "answer") {
        if (parts.empty()) { say("Usage: answer <text>"); return; }
        std::string ans;
        for (size_t i = 0; i < parts.size(); ++i) {
          if (i) ans.push_back(' ');
          ans += parts[i];
        }
        ans = lower(ans);

        std::scoped_lock lk(state.trivia_m);
        auto it = state.trivia_by_channel.find(channel_id);
        if (it == state.trivia_by_channel.end() || !it->second.active) { say("No active trivia. Use `trivia`."); return; }
        if (ans == it->second.answer) {
          say("✅ Correct!");
          state.trivia_by_channel.erase(channel_id);
        } else {
          say("❌ Wrong.");
        }
      }

      else if (cmd == "purge") {
        if (!has_mod_perm(msg, dpp::p_manage_messages)) { say("🚫 You need Manage Messages."); return; }
        if (parts.empty()) { say("Usage: purge <count 1..100>"); return; }
        int n = 0;
        try { n = std::stoi(parts[0]); } catch (...) { n = 0; }
        if (n < 1) n = 1;
        if (n > 100) n = 100;

        bot.messages_get(channel_id, n + 1, 0, 0, 0, [&, channel_id](const dpp::confirmation_callback_t& cb) {
          if (cb.is_error()) return;
          const auto& mm = std::get<dpp::message_map>(cb.value);
          std::vector<dpp::snowflake> ids;
          ids.reserve(mm.size());
          for (const auto& [id, _] : mm) ids.push_back(id);
          bot.message_delete_bulk(ids, channel_id);
        });
      }

    } catch (...) {
      state.services.commands.store(false);
      state.create_incident("commands", "Command execution failed");
      say("⚠️ Command error.");
    }
  });

  const int port = getenv_int("PORT", 3000);

  httplib::Server http;

  http.Options(R"(.*)", [&](const httplib::Request&, httplib::Response& res) {
    set_cors(res);
    res.status = 204;
  });

  http.Get("/", [&](const httplib::Request&, httplib::Response& res) {
    set_cors(res);
    res.set_content("🤖 Bot is running!", "text/plain; charset=utf-8");
  });

  http.Get("/status", [&](const httplib::Request&, httplib::Response& res) {
    set_cors(res);

    if (!state.ready.load()) {
      state.services.api.store(false);
      state.create_incident("api", "API unreachable");
      res.status = 503;
      res.set_content(R"({"status":"offline"})", "application/json");
      return;
    }

    state.services.api.store(true);
    state.resolve_incident("api");

    double ping_ms = 0.0;
    if (auto* s = bot.get_shard(0)) ping_ms = s->websocket_ping * 1000.0;

    const uint64_t now_ms = BotState::now_ms();
    const std::string uptime = format_uptime_ms(now_ms - state.start_ms);

    const auto totals = state.totals();

    auto hostService = [&]() {
      if (state.services.api.load() && state.services.gateway.load()) return "operational";
      return "down";
    };

    json services_j = {
      {"api", state.services.api.load() ? "online" : "offline"},
      {"gateway", state.services.gateway.load() ? "online" : "offline"},
      {"commands", state.services.commands.load() ? "online" : "offline"}
    };

    json j = {
      {"status", "online"},
      {"ping", ping_ms},
      {"uptime", uptime},
      {"lastBoot", state.lastBoot},
      {"updated", iso_now()},
      {"host", host_provider},
      {"hostService", hostService()},
      {"guilds", totals.first},
      {"users", totals.second},
      {"services", services_j}
    };

    res.set_content(j.dump(), "application/json");
  });

  http.Get("/incidents", [&](const httplib::Request&, httplib::Response& res) {
    set_cors(res);
    res.set_content(state.incidents_json().dump(), "application/json");
  });

  std::thread http_thread([&]() {
    http.listen("0.0.0.0", port);
  });

  std::thread flush_thread([&]() {
    while (!g_shutdown.load()) {
      std::this_thread::sleep_for(std::chrono::seconds(30));
      state.save_prefixes_best_effort(prefix_store_path);
    }
  });

  bot.start(dpp::st_wait);

  g_shutdown.store(true);
  http.stop();
  if (http_thread.joinable()) http_thread.join();
  if (flush_thread.joinable()) flush_thread.join();

  state.save_prefixes_best_effort(prefix_store_path);
  return 0;
}
#include <dpp/dpp.h>
#include <httplib.h>
#include <nlohmann/json.hpp>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <ctime>
#include <deque>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <mutex>
#include <optional>
#include <random>
#include <regex>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

using json = nlohmann::json;

static std::atomic<bool> g_shutdown{false};

static std::string getenv_str(const char* k, const std::string& def = "") {
  const char* v = std::getenv(k);
  return (v && *v) ? std::string(v) : def;
}

static uint64_t getenv_u64(const char* k, uint64_t def = 0) {
  const std::string s = getenv_str(k, "");
  if (s.empty()) return def;
  try { return std::stoull(s); } catch (...) { return def; }
}

static int getenv_int(const char* k, int def = 0) {
  const std::string s = getenv_str(k, "");
  if (s.empty()) return def;
  try { return std::stoi(s); } catch (...) { return def; }
}

static std::string iso_now() {
  std::time_t t = std::time(nullptr);
  std::tm tm{};
  gmtime_r(&t, &tm);
  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S.000Z");
  return oss.str();
}

static std::string format_uptime_ms(uint64_t ms) {
  const uint64_t total = ms / 1000;
  const uint64_t h = total / 3600;
  const uint64_t m = (total % 3600) / 60;
  const uint64_t s = total % 60;
  std::ostringstream oss;
  oss << std::setw(2) << std::setfill('0') << h << "h "
      << std::setw(2) << std::setfill('0') << m << "m "
      << std::setw(2) << std::setfill('0') << s << "s";
  return oss.str();
}

static std::string uuid_like() {
  static thread_local std::mt19937_64 rng{std::random_device{}()};
  auto hex = [&](int n) {
    std::uniform_int_distribution<uint64_t> dist(0, 15);
    std::string out;
    out.reserve(n);
    for (int i = 0; i < n; ++i) {
      const uint64_t v = dist(rng);
      out.push_back("0123456789abcdef"[v]);
    }
    return out;
  };
  return hex(8) + "-" + hex(4) + "-" + hex(4) + "-" + hex(4) + "-" + hex(12);
}

struct Incident {
  std::string id;
  std::string service;
  std::string title;
  std::string status;
  std::string startedAt;
  std::optional<std::string> resolvedAt;
};

struct Services {
  std::atomic<bool> api{true};
  std::atomic<bool> gateway{false};
  std::atomic<bool> commands{true};
};

struct GuildMeta {
  std::string name;
  uint32_t member_count{0};
};

struct GuessState {
  bool active{false};
  int answer{0};
  int tries{0};
};

struct TriviaState {
  bool active{false};
  std::string question;
  std::string answer;
};

struct RateBucket {
  std::deque<std::chrono::steady_clock::time_point> hits;
};

class BotState {
public:
  const uint64_t start_ms = now_ms();
  const std::string lastBoot = iso_now();

  Services services;
  std::atomic<bool> ready{false};

  std::mutex incidents_m;
  std::vector<Incident> incidents;

  std::mutex guilds_m;
  std::unordered_map<dpp::snowflake, GuildMeta> guilds;

  std::mutex prefix_m;
  std::string default_prefix{"!"};
  std::unordered_map<dpp::snowflake, std::string> guild_prefix;

  std::mutex guess_m;
  std::unordered_map<dpp::snowflake, GuessState> guess_by_channel;

  std::mutex trivia_m;
  std::unordered_map<dpp::snowflake, TriviaState> trivia_by_channel;

  std::mutex rate_m;
  std::unordered_map<uint64_t, RateBucket> rate;

  std::vector<std::pair<std::string, std::string>> trivia_bank = {
    {"What is the capital of Japan?", "tokyo"},
    {"2 + 2 = ?", "4"},
    {"Which planet is known as the Red Planet?", "mars"},
    {"What does CPU stand for?", "central processing unit"},
    {"HTTP status for Not Found?", "404"}
  };

  static uint64_t now_ms() {
    return (uint64_t)std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()
    ).count();
  }

  void load_prefixes_best_effort(const std::string& path) {
    std::scoped_lock lk(prefix_m);
    std::ifstream f(path);
    if (!f.good()) return;
    try {
      json j; f >> j;
      if (!j.is_object()) return;
      if (j.contains("default_prefix") && j["default_prefix"].is_string())
        default_prefix = j["default_prefix"].get<std::string>();
      if (j.contains("guild_prefix") && j["guild_prefix"].is_object()) {
        for (auto it = j["guild_prefix"].begin(); it != j["guild_prefix"].end(); ++it) {
          const std::string k = it.key();
          if (!it.value().is_string()) continue;
          try {
            uint64_t gid = std::stoull(k);
            guild_prefix[(dpp::snowflake)gid] = it.value().get<std::string>();
          } catch (...) {}
        }
      }
    } catch (...) {}
  }

  void save_prefixes_best_effort(const std::string& path) {
    std::scoped_lock lk(prefix_m);
    json j;
    j["default_prefix"] = default_prefix;
    json gp = json::object();
    for (const auto& [gid, p] : guild_prefix) gp[std::to_string((uint64_t)gid)] = p;
    j["guild_prefix"] = gp;
    std::error_code ec;
    std::filesystem::create_directories(std::filesystem::path(path).parent_path(), ec);
    std::ofstream f(path, std::ios::trunc);
    if (!f.good()) return;
    f << j.dump(2);
  }

  std::string get_prefix(dpp::snowflake guild_id) {
    std::scoped_lock lk(prefix_m);
    auto it = guild_prefix.find(guild_id);
    if (it != guild_prefix.end() && !it->second.empty()) return it->second;
    return default_prefix;
  }

  bool set_prefix(dpp::snowflake guild_id, const std::string& p) {
    if (p.empty() || p.size() > 8) return false;
    for (char c : p) {
      if (std::isspace((unsigned char)c)) return false;
    }
    {
      std::scoped_lock lk(prefix_m);
      guild_prefix[guild_id] = p;
    }
    return true;
  }

  void create_incident(const std::string& service, const std::string& title) {
    std::scoped_lock lk(incidents_m);
    for (auto& i : incidents) {
      if (i.service == service && !i.resolvedAt.has_value()) return;
    }
    incidents.push_back(Incident{
      uuid_like(),
      service,
      title,
      "investigating",
      iso_now(),
      std::nullopt
    });
  }

  void resolve_incident(const std::string& service) {
    std::scoped_lock lk(incidents_m);
    for (auto it = incidents.rbegin(); it != incidents.rend(); ++it) {
      if (it->service == service && !it->resolvedAt.has_value()) {
        it->status = "resolved";
        it->resolvedAt = iso_now();
        return;
      }
    }
  }

  json incidents_json() {
    std::scoped_lock lk(incidents_m);
    json arr = json::array();
    int count = 0;
    for (auto it = incidents.rbegin(); it != incidents.rend(); ++it) {
      if (++count > 50) break;
      json o;
      o["id"] = it->id;
      o["service"] = it->service;
      o["title"] = it->title;
      o["status"] = it->status;
      o["startedAt"] = it->startedAt;
      if (it->resolvedAt.has_value()) o["resolvedAt"] = *it->resolvedAt; else o["resolvedAt"] = nullptr;
      arr.push_back(o);
    }
    return arr;
  }

  bool rate_limit_hit(dpp::snowflake guild_id, dpp::snowflake user_id) {
    const uint64_t key = ((uint64_t)guild_id << 22) ^ (uint64_t)user_id;
    const auto now = std::chrono::steady_clock::now();
    std::scoped_lock lk(rate_m);
    auto& b = rate[key];
    while (!b.hits.empty() && (now - b.hits.front()) > std::chrono::seconds(6)) b.hits.pop_front();
    b.hits.push_back(now);
    return b.hits.size() >= 7;
  }

  std::pair<uint64_t, uint64_t> totals() {
    std::scoped_lock lk(guilds_m);
    uint64_t g = guilds.size();
    uint64_t u = 0;
    for (const auto& [_, meta] : guilds) u += meta.member_count;
    return {g, u};
  }
};

static bool parse_duration(const std::string& s, std::chrono::seconds& out) {
  if (s.size() < 2) return false;
  char unit = (char)std::tolower((unsigned char)s.back());
  std::string num = s.substr(0, s.size() - 1);
  long long v = 0;
  try { v = std::stoll(num); } catch (...) { return false; }
  if (v <= 0) return false;
  if (unit == 's') out = std::chrono::seconds(v);
  else if (unit == 'm') out = std::chrono::minutes(v);
  else if (unit == 'h') out = std::chrono::hours(v);
  else if (unit == 'd') out = std::chrono::hours(24 * v);
  else return false;
  return true;
}

static std::vector<std::string> split_ws(const std::string& s) {
  std::istringstream iss(s);
  std::vector<std::string> out;
  for (std::string w; iss >> w;) out.push_back(w);
  return out;
}

static std::string lower(std::string s) {
  for (char& c : s) c = (char)std::tolower((unsigned char)c);
  return s;
}

static bool has_mod_perm(const dpp::message& msg, uint64_t needed) {
  dpp::guild* g = dpp::find_guild(msg.guild_id);
  if (!g) return false;
  dpp::permission p = g->base_permissions(msg.member);
  return p.can(needed);
}

static dpp::embed make_embed(const std::string& title, const std::string& desc, uint32_t color) {
  dpp::embed e;
  e.set_title(title);
  e.set_description(desc);
  e.set_color(color);
  e.set_timestamp(std::time(nullptr));
  return e;
}

static void set_cors(httplib::Response& res) {
  res.set_header("Access-Control-Allow-Origin", "*");
  res.set_header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set_header("Access-Control-Allow-Headers", "Content-Type");
}

static void handle_signal(int) {
  g_shutdown.store(true);
}

int main() {
  std::signal(SIGINT, handle_signal);
  std::signal(SIGTERM, handle_signal);

  const std::string token = getenv_str("DISCORD_TOKEN", "");
  if (token.empty()) {
    std::cerr << "Missing DISCORD_TOKEN\n";
    return 1;
  }

  BotState state;
  state.default_prefix = getenv_str("DEFAULT_PREFIX", "!");
  const uint64_t owner_id = getenv_u64("OWNER_ID", 951037699320602674ULL);
  const std::string status_url = getenv_str("STATUS_URL", "https://botstatus.vercel.app/");
  const std::string host_provider = getenv_str("HOST_PROVIDER", "Render.com");
  const std::string prefix_store_path = "data/prefixes.json";

  state.load_prefixes_best_effort(prefix_store_path);

  const uint32_t intents = dpp::i_default_intents | dpp::i_message_content;

  dpp::cluster bot(token, intents);
  bot.on_log([&](const dpp::log_t& ev) {
    const std::string m = ev.message;
    if (m.find("Disconnected") != std::string::npos || m.find("disconnected") != std::string::npos) {
      state.services.gateway.store(false);
      state.create_incident("gateway", "Discord Gateway disconnected");
    }
    if (m.find("Connected") != std::string::npos || m.find("connected") != std::string::npos) {
      state.services.gateway.store(true);
      state.resolve_incident("gateway");
    }
    std::cout << "[" << (int)ev.severity << "] " << ev.message << "\n";
  });

  bot.on_ready([&](const dpp::ready_t& ev) {
    state.ready.store(true);
    state.services.gateway.store(true);
    state.resolve_incident("gateway");

    bot.set_presence(dpp::presence(dpp::ps_online, dpp::at_watching, status_url));

    if (dpp::run_once<struct register_commands>()) {
      std::vector<dpp::slashcommand> cmds;

      cmds.emplace_back(dpp::slashcommand("ping", "Check bot latency", bot.me.id));
      cmds.emplace_back(dpp::slashcommand("info", "Get bot info", bot.me.id));
      cmds.emplace_back(dpp::slashcommand("serverinfo", "Get current server info", bot.me.id));

      {
        dpp::slashcommand c("userinfo", "Get info about a user", bot.me.id);
        c.add_option(dpp::command_option(dpp::co_user, "target", "User to lookup", false));
        cmds.push_back(c);
      }

      cmds.emplace_back(dpp::slashcommand("credit", "Show bot creator info", bot.me.id));

      {
        dpp::slashcommand c("serverlist", "Show all servers the bot is in (owner only)", bot.me.id);
        cmds.push_back(c);
      }

      {
        dpp::slashcommand c("setprefix", "Change prefix for this server", bot.me.id);
        c.add_option(dpp::command_option(dpp::co_string, "prefix", "New prefix (1..8 chars, no spaces)", true));
        cmds.push_back(c);
      }

      {
        dpp::slashcommand c("rps", "Rock Paper Scissors", bot.me.id);
        dpp::command_option opt(dpp::co_string, "choice", "rock|paper|scissors", true);
        opt.add_choice(dpp::command_option_choice("rock", std::string("rock")));
        opt.add_choice(dpp::command_option_choice("paper", std::string("paper")));
        opt.add_choice(dpp::command_option_choice("scissors", std::string("scissors")));
        c.add_option(opt);
        cmds.push_back(c);
      }

      cmds.emplace_back(dpp::slashcommand("coinflip", "Flip a coin", bot.me.id));

      {
        dpp::slashcommand c("guess", "Guess number minigame", bot.me.id);
        c.add_option(dpp::command_option(dpp::co_string, "action", "start|stop|number", true));
        c.add_option(dpp::command_option(dpp::co_integer, "number", "Your guess (only for action=number)", false));
        cmds.push_back(c);
      }

      cmds.emplace_back(dpp::slashcommand("trivia", "Start a trivia question in this channel", bot.me.id));

      bot.global_bulk_command_create(cmds);
    }
  });

  bot.on_guild_create([&](const dpp::guild_create_t& ev) {
    std::scoped_lock lk(state.guilds_m);
    GuildMeta meta;
    meta.name = ev.created.name;
    meta.member_count = ev.created.member_count;
    state.guilds[ev.created.id] = meta;
  });

  bot.on_guild_delete([&](const dpp::guild_delete_t& ev) {
    std::scoped_lock lk(state.guilds_m);
    state.guilds.erase(ev.deleted.id);
  });

  bot.on_slashcommand([&](const dpp::slashcommand_t& ev) {
    state.services.commands.store(true);
    state.resolve_incident("commands");

    const auto name = ev.command.get_command_name();
    const uint64_t now_ms = BotState::now_ms();
    const std::string uptime = format_uptime_ms(now_ms - state.start_ms);

    auto reply_embed = [&](const dpp::embed& e, bool ephemeral=false) {
      dpp::message m;
      m.add_embed(e);
      if (ephemeral) m.set_flags(dpp::m_ephemeral);
      ev.reply(m);
    };

    try {
      if (name == "ping") {
        double ping_ms = 0.0;
        if (auto* s = bot.get_shard(0)) ping_ms = s->websocket_ping * 1000.0;

        std::ostringstream d;
        d << "**Ping:** " << std::fixed << std::setprecision(2) << ping_ms << "ms\n"
          << "**Uptime:** " << uptime << "\n"
          << "**Status:** " << status_url;

        auto e = make_embed("〽️ Pong!", d.str(), 0xFF00FF);
        reply_embed(e);
      }

      else if (name == "info") {
        const auto servers = state.totals().first;
        std::ostringstream d;
        d << "**Username:** " << bot.me.username << "#" << bot.me.discriminator << "\n"
          << "**ID:** " << (uint64_t)bot.me.id << "\n"
          << "**Servers:** " << servers << "\n"
          << "**Uptime:** " << uptime << "\n"
          << "**Status:** " << status_url;

        auto e = make_embed("🤖 Bot Info", d.str(), 0xFF00FF);
        e.set_thumbnail(bot.me.get_avatar_url());
        reply_embed(e);
      }

      else if (name == "serverinfo") {
        dpp::guild* g = dpp::find_guild(ev.command.guild_id);
        if (!g) { ev.reply("Server info not available."); return; }

        std::ostringstream d;
        d << "**Name:** " << g->name << "\n"
          << "**ID:** " << (uint64_t)g->id << "\n"
          << "**Owner:** <@" << (uint64_t)g->owner_id << ">\n"
          << "**Members:** " << g->member_count;

        auto e = make_embed("🏠 Server Info", d.str(), 0xFF00FF);
        if (!g->icon.is_empty()) e.set_thumbnail(g->get_icon_url());
        reply_embed(e);
      }

      else if (name == "userinfo") {
        dpp::snowflake target = ev.command.usr.id;
        if (ev.command.get_resolved_user("target")) {
          target = ev.command.get_resolved_user("target")->id;
        }
        dpp::user* u = dpp::find_user(target);
        std::ostringstream d;
        if (u) {
          d << "**Username:** " << u->username << "#" << u->discriminator << "\n"
            << "**ID:** " << (uint64_t)u->id;
          auto e = make_embed("ℹ️ User Info", d.str(), 0xFF00FF);
          e.set_thumbnail(u->get_avatar_url());
          reply_embed(e);
        } else {
          ev.reply("User not in cache yet.");
        }
      }

      else if (name == "credit") {
        std::ostringstream d;
        d << "Created by **@ZiolKen**\n"
          << "Website: https://ziolken.vercel.app\n"
          << "Bot Status: " << status_url;
        auto e = make_embed("👨‍💻 Bot Developer", d.str(), 0xFF00FF);
        e.set_thumbnail(bot.me.get_avatar_url());
        reply_embed(e);
      }

      else if (name == "serverlist") {
        if ((uint64_t)ev.command.usr.id != owner_id) {
          ev.reply(dpp::message("🚫 You do not have permission to use this command.").set_flags(dpp::m_ephemeral));
          return;
        }
        std::ostringstream out;
        {
          std::scoped_lock lk(state.guilds_m);
          int i = 1;
          for (const auto& [gid, meta] : state.guilds) {
            out << i++ << ". " << meta.name << " (ID: " << (uint64_t)gid << ")\n";
          }
        }
        const std::string s = out.str();
        if (s.size() > 1800) {
          dpp::message m;
          m.set_flags(dpp::m_ephemeral);
          m.set_content("📄 Server list attached.");
          m.add_file("serverlist.txt", s, "text/plain");
          ev.reply(m);
        } else {
          ev.reply(dpp::message("🤖 Servers:\n" + s).set_flags(dpp::m_ephemeral));
        }
      }

      else if (name == "setprefix") {
        if (!has_mod_perm(*ev.command.msg, dpp::p_manage_guild)) {
          ev.reply(dpp::message("🚫 You need Manage Server to change prefix.").set_flags(dpp::m_ephemeral));
          return;
        }
        const std::string p = std::get<std::string>(ev.get_parameter("prefix"));
        if (!state.set_prefix(ev.command.guild_id, p)) {
          ev.reply(dpp::message("Invalid prefix. 1..8 chars, no spaces.").set_flags(dpp::m_ephemeral));
          return;
        }
        state.save_prefixes_best_effort(prefix_store_path);
        ev.reply("✅ Prefix updated to `" + p + "`");
      }

      else if (name == "rps") {
        const std::string choice = lower(std::get<std::string>(ev.get_parameter("choice")));
        static thread_local std::mt19937 rng{std::random_device{}()};
        const std::vector<std::string> opts{"rock","paper","scissors"};
        const std::string botc = opts[std::uniform_int_distribution<int>(0,2)(rng)];

        auto win = [&](const std::string& a, const std::string& b) {
          return (a=="rock"&&b=="scissors") || (a=="paper"&&b=="rock") || (a=="scissors"&&b=="paper");
        };

        std::string res;
        if (choice == botc) res = "Draw!";
        else if (win(choice, botc)) res = "You win!";
        else res = "You lose!";

        ev.reply("You: **" + choice + "** | Bot: **" + botc + "** → **" + res + "**");
      }

      else if (name == "coinflip") {
        static thread_local std::mt19937 rng{std::random_device{}()};
        const bool heads = std::uniform_int_distribution<int>(0,1)(rng) == 1;
        ev.reply(std::string("🪙 ") + (heads ? "**Heads**" : "**Tails**"));
      }

      else if (name == "guess") {
        const std::string action = lower(std::get<std::string>(ev.get_parameter("action")));
        const dpp::snowflake cid = ev.command.channel_id;

        static thread_local std::mt19937 rng{std::random_device{}()};

        if (action == "start") {
          std::scoped_lock lk(state.guess_m);
          auto& gs = state.guess_by_channel[cid];
          gs.active = true;
          gs.answer = std::uniform_int_distribution<int>(1, 100)(rng);
          gs.tries = 0;
          ev.reply("🎯 Guess game started (1..100). Use `/guess action:number number:<n>` or `!guess <n>`.");
        } else if (action == "stop") {
          std::scoped_lock lk(state.guess_m);
          state.guess_by_channel.erase(cid);
          ev.reply("🛑 Guess game stopped.");
        } else if (action == "number") {
          int n = 0;
          try { n = (int)std::get<int64_t>(ev.get_parameter("number")); } catch (...) { n = 0; }
          if (n < 1 || n > 100) { ev.reply("Pick a number 1..100."); return; }

          std::scoped_lock lk(state.guess_m);
          auto it = state.guess_by_channel.find(cid);
          if (it == state.guess_by_channel.end() || !it->second.active) {
            ev.reply("No active game. Use `/guess start` first.");
            return;
          }
          auto& gs = it->second;
          gs.tries++;
          if (n == gs.answer) {
            ev.reply("✅ Correct! Tries: " + std::to_string(gs.tries));
            state.guess_by_channel.erase(cid);
          } else if (n < gs.answer) {
            ev.reply("⬆️ Higher.");
          } else {
            ev.reply("⬇️ Lower.");
          }
        } else {
          ev.reply("Use action=start|stop|number");
        }
      }

      else if (name == "trivia") {
        static thread_local std::mt19937 rng{std::random_device{}()};
        const auto& qa = state.trivia_bank[std::uniform_int_distribution<int>(0, (int)state.trivia_bank.size()-1)(rng)];

        std::scoped_lock lk(state.trivia_m);
        auto& ts = state.trivia_by_channel[ev.command.channel_id];
        ts.active = true;
        ts.question = qa.first;
        ts.answer = lower(qa.second);

        ev.reply("🧠 Trivia: **" + ts.question + "**\nAnswer with `!answer <text>`.");
      }

    } catch (...) {
      state.services.commands.store(false);
      state.create_incident("commands", "Command execution failed");
      try { ev.reply("⚠️ Command error."); } catch (...) {}
    }
  });

  bot.on_message_create([&](const dpp::message_create_t& ev) {
    const dpp::message& msg = ev.msg;
    if (msg.author.is_bot()) return;
    if (msg.is_dm()) return;
    if (!state.ready.load()) return;

    const std::string content = msg.content;
    const auto guild_id = msg.guild_id;
    const auto channel_id = msg.channel_id;

    const bool is_mod = has_mod_perm(msg, dpp::p_manage_messages);

    static const std::regex invite_re(R"((discord\.gg\/|discord\.com\/invite\/))", std::regex::icase);

    if (!is_mod && std::regex_search(content, invite_re)) {
      bot.message_delete(msg.id, channel_id);
      bot.message_create(dpp::message(channel_id, "🚫 Invite links are not allowed here."));
      return;
    }

    if (!is_mod) {
      const size_t mentions = msg.mentions.size();
      const size_t role_mentions = msg.mention_roles.size();
      const bool everyone = msg.mention_everyone;
      if (everyone || mentions >= 6 || role_mentions >= 4) {
        bot.message_delete(msg.id, channel_id);
        bot.message_create(dpp::message(channel_id, "🚫 Mass mentions are blocked."));
        return;
      }
    }

    if (!is_mod && state.rate_limit_hit(guild_id, msg.author.id)) {
      bot.message_delete(msg.id, channel_id);
      bot.message_create(dpp::message(channel_id, "⚠️ Slow down (anti-spam)."));
      return;
    }

    const std::string prefix = state.get_prefix(guild_id);
    if (content.rfind(prefix, 0) != 0) {
      return;
    }

    const std::string rest = content.substr(prefix.size());
    auto parts = split_ws(rest);
    if (parts.empty()) return;

    const std::string cmd = lower(parts[0]);
    parts.erase(parts.begin());

    auto say = [&](const std::string& t) {
      bot.message_create(dpp::message(channel_id, t));
    };

    auto say_embed = [&](const dpp::embed& e) {
      dpp::message m(channel_id, "");
      m.add_embed(e);
      bot.message_create(m);
    };

    try {
      if (cmd == "help") {
        std::ostringstream d;
        d << "**Prefix:** `" << prefix << "`\n"
          << "**Utilities:** help, ping, info, serverinfo, userinfo, credit, serverlist\n"
          << "**Config:** setprefix\n"
          << "**Games:** rps, coinflip, guess, trivia, answer\n"
          << "**Moderation:** purge\n"
          << "**Status:** " << status_url;
        say_embed(make_embed("🧰 Commands", d.str(), 0x00D4FF));
      }

      else if (cmd == "ping") {
        double ping_ms = 0.0;
        if (auto* s = bot.get_shard(0)) ping_ms = s->websocket_ping * 1000.0;
        const uint64_t now_ms = BotState::now_ms();
        const std::string uptime = format_uptime_ms(now_ms - state.start_ms);

        std::ostringstream d;
        d << "**Ping:** " << std::fixed << std::setprecision(2) << ping_ms << "ms\n"
          << "**Uptime:** " << uptime << "\n"
          << "**Status:** " << status_url;
        say_embed(make_embed("〽️ Pong!", d.str(), 0xFF00FF));
      }

      else if (cmd == "info") {
        const auto totals = state.totals();
        const uint64_t now_ms = BotState::now_ms();
        const std::string uptime = format_uptime_ms(now_ms - state.start_ms);

        std::ostringstream d;
        d << "**Username:** " << bot.me.username << "#" << bot.me.discriminator << "\n"
          << "**ID:** " << (uint64_t)bot.me.id << "\n"
          << "**Servers:** " << totals.first << "\n"
          << "**Uptime:** " << uptime << "\n"
          << "**Status:** " << status_url;

        auto e = make_embed("🤖 Bot Info", d.str(), 0xFF00FF);
        e.set_thumbnail(bot.me.get_avatar_url());
        say_embed(e);
      }

      else if (cmd == "serverinfo") {
        dpp::guild* g = dpp::find_guild(guild_id);
        if (!g) { say("Server info not available."); return; }

        std::ostringstream d;
        d << "**Name:** " << g->name << "\n"
          << "**ID:** " << (uint64_t)g->id << "\n"
          << "**Owner:** <@" << (uint64_t)g->owner_id << ">\n"
          << "**Members:** " << g->member_count;

        auto e = make_embed("🏠 Server Info", d.str(), 0xFF00FF);
        if (!g->icon.is_empty()) e.set_thumbnail(g->get_icon_url());
        say_embed(e);
      }

      else if (cmd == "userinfo") {
        dpp::snowflake target = msg.author.id;
        if (!msg.mentions.empty()) target = msg.mentions[0].first.id;
        dpp::user* u = dpp::find_user(target);
        if (!u) { say("User not in cache yet."); return; }
        std::ostringstream d;
        d << "**Username:** " << u->username << "#" << u->discriminator << "\n"
          << "**ID:** " << (uint64_t)u->id;
        auto e = make_embed("ℹ️ User Info", d.str(), 0xFF00FF);
        e.set_thumbnail(u->get_avatar_url());
        say_embed(e);
      }

      else if (cmd == "credit") {
        std::ostringstream d;
        d << "Created by **@ZiolKen**\n"
          << "Website: https://ziolken.vercel.app\n"
          << "Bot Status: " << status_url;
        auto e = make_embed("👨‍💻 Bot Developer", d.str(), 0xFF00FF);
        e.set_thumbnail(bot.me.get_avatar_url());
        say_embed(e);
      }

      else if (cmd == "serverlist") {
        if ((uint64_t)msg.author.id != owner_id) { say("🚫 You do not have permission to use this command."); return; }
        std::ostringstream out;
        {
          std::scoped_lock lk(state.guilds_m);
          int i = 1;
          for (const auto& [gid, meta] : state.guilds) {
            out << i++ << ". " << meta.name << " (ID: " << (uint64_t)gid << ")\n";
          }
        }
        const std::string s = out.str();
        if (s.size() > 1800) {
          dpp::message m(channel_id, "📄 Server list attached.");
          m.add_file("serverlist.txt", s, "text/plain");
          bot.message_create(m);
        } else {
          say("🤖 Servers:\n" + s);
        }
      }

      else if (cmd == "setprefix") {
        if (!has_mod_perm(msg, dpp::p_manage_guild)) { say("🚫 You need Manage Server to change prefix."); return; }
        if (parts.empty()) { say("Usage: setprefix <prefix>"); return; }
        const std::string p = parts[0];
        if (!state.set_prefix(guild_id, p)) { say("Invalid prefix. 1..8 chars, no spaces."); return; }
        state.save_prefixes_best_effort(prefix_store_path);
        say("✅ Prefix updated to `" + p + "`");
      }

      else if (cmd == "rps") {
        if (parts.empty()) { say("Usage: rps rock|paper|scissors"); return; }
        const std::string choice = lower(parts[0]);
        static thread_local std::mt19937 rng{std::random_device{}()};
        const std::vector<std::string> opts{"rock","paper","scissors"};
        const std::string botc = opts[std::uniform_int_distribution<int>(0,2)(rng)];
        auto win = [&](const std::string& a, const std::string& b) {
          return (a=="rock"&&b=="scissors") || (a=="paper"&&b=="rock") || (a=="scissors"&&b=="paper");
        };
        std::string res;
        if (choice == botc) res = "Draw!";
        else if (win(choice, botc)) res = "You win!";
        else res = "You lose!";
        say("You: **" + choice + "** | Bot: **" + botc + "** → **" + res + "**");
      }

      else if (cmd == "coinflip") {
        static thread_local std::mt19937 rng{std::random_device{}()};
        const bool heads = std::uniform_int_distribution<int>(0,1)(rng) == 1;
        say(std::string("🪙 ") + (heads ? "**Heads**" : "**Tails**"));
      }

      else if (cmd == "guess") {
        static thread_local std::mt19937 rng{std::random_device{}()};
        if (parts.empty()) { say("Usage: guess start|stop|<number>"); return; }
        const std::string a = lower(parts[0]);

        if (a == "start") {
          std::scoped_lock lk(state.guess_m);
          auto& gs = state.guess_by_channel[channel_id];
          gs.active = true;
          gs.answer = std::uniform_int_distribution<int>(1,100)(rng);
          gs.tries = 0;
          say("🎯 Guess game started (1..100).");
        } else if (a == "stop") {
          std::scoped_lock lk(state.guess_m);
          state.guess_by_channel.erase(channel_id);
          say("🛑 Guess game stopped.");
        } else {
          int n = 0;
          try { n = std::stoi(a); } catch (...) { n = 0; }
          if (n < 1 || n > 100) { say("Pick a number 1..100."); return; }
          std::scoped_lock lk(state.guess_m);
          auto it = state.guess_by_channel.find(channel_id);
          if (it == state.guess_by_channel.end() || !it->second.active) { say("No active game. Use `guess start`."); return; }
          auto& gs = it->second;
          gs.tries++;
          if (n == gs.answer) {
            say("✅ Correct! Tries: " + std::to_string(gs.tries));
            state.guess_by_channel.erase(channel_id);
          } else if (n < gs.answer) say("⬆️ Higher.");
          else say("⬇️ Lower.");
        }
      }

      else if (cmd == "trivia") {
        static thread_local std::mt19937 rng{std::random_device{}()};
        const auto& qa = state.trivia_bank[std::uniform_int_distribution<int>(0, (int)state.trivia_bank.size()-1)(rng)];
        std::scoped_lock lk(state.trivia_m);
        auto& ts = state.trivia_by_channel[channel_id];
        ts.active = true;
        ts.question = qa.first;
        ts.answer = lower(qa.second);
        say("🧠 Trivia: **" + ts.question + "**\nAnswer with `answer <text>`.");
      }

      else if (cmd == "answer") {
        if (parts.empty()) { say("Usage: answer <text>"); return; }
        std::string ans;
        for (size_t i = 0; i < parts.size(); ++i) {
          if (i) ans.push_back(' ');
          ans += parts[i];
        }
        ans = lower(ans);

        std::scoped_lock lk(state.trivia_m);
        auto it = state.trivia_by_channel.find(channel_id);
        if (it == state.trivia_by_channel.end() || !it->second.active) { say("No active trivia. Use `trivia`."); return; }
        if (ans == it->second.answer) {
          say("✅ Correct!");
          state.trivia_by_channel.erase(channel_id);
        } else {
          say("❌ Wrong.");
        }
      }

      else if (cmd == "purge") {
        if (!has_mod_perm(msg, dpp::p_manage_messages)) { say("🚫 You need Manage Messages."); return; }
        if (parts.empty()) { say("Usage: purge <count 1..100>"); return; }
        int n = 0;
        try { n = std::stoi(parts[0]); } catch (...) { n = 0; }
        if (n < 1) n = 1;
        if (n > 100) n = 100;

        bot.messages_get(channel_id, n + 1, 0, 0, 0, [&, channel_id](const dpp::confirmation_callback_t& cb) {
          if (cb.is_error()) return;
          const auto& mm = std::get<dpp::message_map>(cb.value);
          std::vector<dpp::snowflake> ids;
          ids.reserve(mm.size());
          for (const auto& [id, _] : mm) ids.push_back(id);
          bot.message_delete_bulk(ids, channel_id);
        });
      }

    } catch (...) {
      state.services.commands.store(false);
      state.create_incident("commands", "Command execution failed");
      say("⚠️ Command error.");
    }
  });

  const int port = getenv_int("PORT", 3000);

  httplib::Server http;

  http.Options(R"(.*)", [&](const httplib::Request&, httplib::Response& res) {
    set_cors(res);
    res.status = 204;
  });

  http.Get("/", [&](const httplib::Request&, httplib::Response& res) {
    set_cors(res);
    res.set_content("🤖 Bot is running!", "text/plain; charset=utf-8");
  });

  http.Get("/status", [&](const httplib::Request&, httplib::Response& res) {
    set_cors(res);

    if (!state.ready.load()) {
      state.services.api.store(false);
      state.create_incident("api", "API unreachable");
      res.status = 503;
      res.set_content(R"({"status":"offline"})", "application/json");
      return;
    }

    state.services.api.store(true);
    state.resolve_incident("api");

    double ping_ms = 0.0;
    if (auto* s = bot.get_shard(0)) ping_ms = s->websocket_ping * 1000.0;

    const uint64_t now_ms = BotState::now_ms();
    const std::string uptime = format_uptime_ms(now_ms - state.start_ms);

    const auto totals = state.totals();

    auto hostService = [&]() {
      if (state.services.api.load() && state.services.gateway.load()) return "operational";
      return "down";
    };

    json services_j = {
      {"api", state.services.api.load() ? "online" : "offline"},
      {"gateway", state.services.gateway.load() ? "online" : "offline"},
      {"commands", state.services.commands.load() ? "online" : "offline"}
    };

    json j = {
      {"status", "online"},
      {"ping", ping_ms},
      {"uptime", uptime},
      {"lastBoot", state.lastBoot},
      {"updated", iso_now()},
      {"host", host_provider},
      {"hostService", hostService()},
      {"guilds", totals.first},
      {"users", totals.second},
      {"services", services_j}
    };

    res.set_content(j.dump(), "application/json");
  });

  http.Get("/incidents", [&](const httplib::Request&, httplib::Response& res) {
    set_cors(res);
    res.set_content(state.incidents_json().dump(), "application/json");
  });

  std::thread http_thread([&]() {
    http.listen("0.0.0.0", port);
  });

  std::thread flush_thread([&]() {
    while (!g_shutdown.load()) {
      std::this_thread::sleep_for(std::chrono::seconds(30));
      state.save_prefixes_best_effort(prefix_store_path);
    }
  });

  bot.start(dpp::st_wait);

  g_shutdown.store(true);
  http.stop();
  if (http_thread.joinable()) http_thread.join();
  if (flush_thread.joinable()) flush_thread.join();

  state.save_prefixes_best_effort(prefix_store_path);
  return 0;
}
