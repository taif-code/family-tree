// شجرة العائلة — سيرفر محلي بسيط بدون أي مكتبات خارجية
// التشغيل: node server.js  ثم افتح http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const RELATIONS = ["wife", "daughter", "granddaughter"];

const DEFAULT_STATE = {
  settings: {
    title: "شجرة العائلة",
    target: 130,
    // outline = تقسيم الشجرة. إذا كان فاضي تستخدم الصفحة التقسيم الافتراضي اللي في index.html
    // سطر يبدأ بـ #  = فرع رئيسي (وبعد | الوصف)
    // سطر يبدأ بـ ## = مجموعة داخل الفرع
    // أي سطر ثاني    = عائلة داخل المجموعة
    outline: "",
  },
  members: [],
};

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    save(DEFAULT_STATE);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}
function save(state) {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

let state = load();

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 100000) req.destroy();
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
  });
}
const clean = (v, max) => String(v || "").trim().slice(0, max);
const isLocal = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/api/state" && req.method === "GET") {
      return send(res, 200, state);
    }
    if (url.pathname === "/api/members" && req.method === "POST") {
      const b = await readBody(req);
      const m = {
        id: clean(b.id, 40) || Date.now().toString(36),
        name: clean(b.name, 40),
        relation: RELATIONS.includes(b.relation) ? b.relation : "daughter",
        family: clean(b.family, 200),
        createdAt: Date.now(),
      };
      if (!m.name || !m.family) return send(res, 400, { error: "الاسم والفخذ مطلوبة" });
      if (!state.members.some((x) => x.id === m.id)) state.members.push(m);
      save(state);
      return send(res, 200, m);
    }
    if (url.pathname.startsWith("/api/members/") && req.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      state.members = state.members.filter((x) => x.id !== id);
      save(state);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/settings" && req.method === "PUT") {
      if (!isLocal(req)) return send(res, 403, { error: "الإعدادات من جهاز المنظّم فقط" });
      const b = await readBody(req);
      const outline = String(b.outline || "").slice(0, 20000);
      const target = parseInt(b.target, 10);
      if (!outline.trim() || !(target > 0)) return send(res, 400, { error: "بيانات غير صحيحة" });
      state.settings = { title: clean(b.title, 50) || "شجرة العائلة", target, outline };
      save(state);
      return send(res, 200, state.settings);
    }
    // static files
    let file = url.pathname === "/" ? "/index.html" : url.pathname;
    file = path.normalize(path.join(PUBLIC_DIR, file));
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file)) return send(res, 404, "Not found", "text/plain");
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
    return send(res, 200, fs.readFileSync(file), types[path.extname(file)] || "application/octet-stream");
  } catch (e) {
    return send(res, 500, { error: "خطأ في السيرفر" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("\n🌳 شجرة العائلة شغّالة:");
  console.log("   على جهازك:       http://localhost:" + PORT);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === "IPv4" && !a.internal) console.log("   لأجهزة نفس الواي فاي: http://" + a.address + ":" + PORT);
    }
  }
  console.log("\n   البيانات تنحفظ في: " + DATA_FILE + "\n   للإيقاف: Ctrl + C\n");
});