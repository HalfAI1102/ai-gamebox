"use strict";

const K = new URLSearchParams(location.search).get("k") || "";
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
};
const SVGNS = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

let snap = null;
let version = -1;   // -1 so the first poll returns immediately
let stageKey = "";
let ctx = {};          // per-screen state that survives re-renders

/* ---------- buddy mascot ---------- */
// Same duotone language as icons.js: one ink outline, soft flat fills. Face layer is shared by every look.
const INK = "#3e3a52", BLUSH = "#ff8f70";
const LOOKS = {
  cat: { name: "小猫", head: "#ddd3ff",
    back: `<path d="M24 40L20 12l25 15" fill="#ddd3ff"/><path d="M84 40l4-28-25 15" fill="#ddd3ff"/>
      <path d="M26 30l-1.5-11 10 6.5M82 30l1.5-11-10 6.5" fill="#ffe6a1" stroke="none"/>`,
    front: `<path d="M8 60l11 2M8 68l11-2M100 60l-11 2M100 68l-11-2" stroke-width="2"/>` },
  bunny: { name: "小兔", head: "#fffdf8",
    back: `<path d="M38 30C32 16 32 3 39 2s11 13 9.5 27M70 30c6-14 6-27-1-28S58 15 59.5 29" fill="#fffdf8"/>
      <path d="M40 10c1.5 5 2.4 10 2.6 15M68 10c-1.5 5-2.4 10-2.6 15" stroke="${BLUSH}" stroke-width="2.4" opacity=".45"/>`,
    front: "" },
  bear: { name: "小熊", head: "#f8d9b0",
    back: `<circle cx="27" cy="31" r="11" fill="#f8d9b0"/><circle cx="81" cy="31" r="11" fill="#f8d9b0"/>
      <circle cx="27" cy="31" r="5" fill="#e9b88a" stroke="none"/><circle cx="81" cy="31" r="5" fill="#e9b88a" stroke="none"/>`,
    front: `<ellipse cx="54" cy="70" rx="13" ry="9.5" fill="#fff4e4" stroke-width="2"/>` },
  dog: { name: "小狗", head: "#ffd8bd",
    back: "",
    front: `<path d="M32 28C17 23 7 33 9 49s11 19 16 11c3-5 3-18 7-32zM76 28c15-5 25 5 23 21s-11 19-16 11c-3-5-3-18-7-32z" fill="#d9a27a"/>
      <ellipse cx="69" cy="55" rx="9" ry="8" fill="#f3bf98" stroke="none"/>
      <ellipse cx="54" cy="63" rx="4.2" ry="3" fill="${INK}" stroke="none"/>` },
  robot: { name: "机器人", head: "#cfe8f8",
    back: `<path d="M54 22V11"/><circle cx="54" cy="8" r="4.5" fill="#ffe6a1"/>
      <rect x="6" y="50" width="9" height="18" rx="4" fill="#9fd0ee"/><rect x="93" y="50" width="9" height="18" rx="4" fill="#9fd0ee"/>`,
    shape: `<rect x="14" y="22" width="80" height="68" rx="26" fill="#cfe8f8"/>`,
    front: "" },
};
const FACES = {
  normal: `<circle cx="40" cy="57" r="3.8" fill="${INK}" stroke="none"/><circle cx="68" cy="57" r="3.8" fill="${INK}" stroke="none"/><path d="M48 66q3 3.5 6 0 3 3.5 6 0"/>`,
  happy: `<path d="M34 58q6-7 12 0M62 58q6-7 12 0"/><path d="M47 66h14q-1 8-7 8t-7-8z" fill="${BLUSH}"/>`,
  smug: `<path d="M34 57h12M62 57h12" /><path d="M35 53q5-3 10 0M63 53q5-3 10 0" stroke-width="2"/><path d="M47 69q8 3 14-4"/>`,
  sad: `<path d="M34 55q6 5 12 2M62 57q6 3 12-2"/><path d="M47 72q7-7 14 0"/><path d="M77 60q4 7 0 9q-4-2 0-9z" fill="#9fd0ee" stroke-width="1.6"/>`,
  surprised: `<circle cx="40" cy="56" r="4.6" fill="#fff"/><circle cx="68" cy="56" r="4.6" fill="#fff"/><circle cx="40" cy="56.5" r="2.2" fill="${INK}" stroke="none"/><circle cx="68" cy="56.5" r="2.2" fill="${INK}" stroke="none"/><ellipse cx="54" cy="70" rx="4.5" ry="5.5" fill="${BLUSH}"/>`,
  thinking: `<circle cx="42" cy="54" r="3.6" fill="${INK}" stroke="none"/><circle cx="70" cy="54" r="3.6" fill="${INK}" stroke="none"/><path d="M49 68h9"/>
    <circle cx="94" cy="24" r="3" fill="#fff" stroke-width="1.8"/><circle cx="101" cy="14" r="4.5" fill="#fff" stroke-width="1.8"/>`,
  love: `<path d="M40 61l-6.5-6a3.7 3.7 0 0 1 6.5-3.6 3.7 3.7 0 0 1 6.5 3.6z" fill="${BLUSH}" stroke-width="1.8"/><path d="M68 61l-6.5-6a3.7 3.7 0 0 1 6.5-3.6 3.7 3.7 0 0 1 6.5 3.6z" fill="${BLUSH}" stroke-width="1.8"/><path d="M47 67q7 6 14 0"/>`,
};
function buddySVG(mood, look) {
  const L = LOOKS[look || (snap && snap.agent_look)] || LOOKS.cat;
  const shape = L.shape || `<path d="M14 61C14 36 31 24 54 24s40 12 40 37c0 20-15 30-40 30S14 81 14 61z" fill="${L.head}"/>`;
  return `<svg viewBox="0 0 108 100" xmlns="${SVGNS}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="54" cy="96" rx="28" ry="3.5" fill="${INK}" opacity=".08" stroke="none"/>
    ${L.back}${shape}
    <ellipse cx="30" cy="67" rx="6" ry="3.6" fill="${BLUSH}" opacity=".35" stroke="none"/>
    <ellipse cx="78" cy="67" rx="6" ry="3.6" fill="${BLUSH}" opacity=".35" stroke="none"/>
    ${L.front}${FACES[mood] || FACES.normal}
  </svg>`;
}
const avatar = (mood) => { const d = h("div", { class: "av" }); d.innerHTML = buddySVG(mood || "normal"); return d; };

// The AI's own face (current look) in place of a generic icon.
function aiIcon() {
  const el = h("span", { class: "ic gicon ai-face" });
  el.innerHTML = buddySVG("happy");
  return el;
}

function lookPicker(box, current, onPick) {
  box.innerHTML = "";
  for (const [k, L] of Object.entries(LOOKS)) {
    const b = h("button", { type: "button", class: "look" + (k === current ? " on" : ""), title: L.name, onclick: () => onPick(k) });
    b.innerHTML = buddySVG("happy", k);
    b.append(h("span", {}, L.name));
    box.append(b);
  }
}

/* ---------- network ---------- */
async function act(action, data = {}) {
  try {
    const r = await fetch(`/api/human?k=${encodeURIComponent(K)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data }),
    });
    const j = await r.json();
    if (j.error) toast(j.error);
    return j;
  } catch (e) {
    toast("连不上游戏桌了");
    return { error: "offline" };
  }
}

async function loop() {
  for (;;) {
    try {
      const r = await fetch(`/api/state?k=${encodeURIComponent(K)}&v=${version}`);
      const j = await r.json();
      if (j.error) { setStatus("链接不对，请用 TA 给你的网址打开", "away"); await sleep(4000); continue; }
      const prev = snap;
      snap = j;
      version = j.version;
      render(prev);
    } catch (e) {
      setStatus("游戏桌关掉啦，让 TA 重新开一下吧", "away");
      await sleep(2500);
    }
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- shell ---------- */
function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2200);
}

const CONFETTI = {
  win: ["#6fb6e3", "#64c49f", "#f4bf45", "#9d86f0", "#ff8f70"],
  lose: ["#c9bff0", "#b9c6d6", "#d9d2e6"],
  gold: ["#f4bf45", "#ffe6a1", "#64c49f", "#6fb6e3"],
};
function confetti(kind = "win") {
  const box = $("#confetti");
  const colors = CONFETTI[kind] || CONFETTI.win;
  const shapes = ["dot", "bar", "sq", "star"];
  for (let i = 0; i < 44; i++) {
    const c = h("span", { class: "cf " + shapes[i % shapes.length] });
    c.style.setProperty("--c", colors[i % colors.length]);
    c.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
    c.style.left = Math.random() * 100 + "vw";
    c.style.animationDuration = 2 + Math.random() * 2 + "s";
    c.style.animationDelay = Math.random() * .6 + "s";
    box.append(c);
    setTimeout(() => c.remove(), 5000);
  }
}

function setStatus(text, cls = "") {
  const p = $("#status");
  p.textContent = text;
  p.className = "status-pill " + cls;
}

function render(prev) {
  const name = snap.agent_name;
  $("#buddy").innerHTML = buddySVG(snap.agent === "thinking" ? (snap.mood === "happy" || snap.mood === "normal" ? "thinking" : snap.mood) : snap.mood);
  const st = snap.state || {};
  let myTurn = `${name} 在等你～`;
  if (snap.game === "gomoku" && !st.winner) myTurn = st.turn === "human" ? "到你落子啦～" : `${name} 在等你～`;
  if (snap.game === "idiom" && !st.winner) myTurn = st.turn === "human" ? "到你接啦～" : `${name} 在等你～`;
  if (snap.game === "undercover" && st.phase === "describe" && st.turn === "你") myTurn = "到你描述啦～";
  if (snap.game === "undercover" && st.phase === "vote" && st.players[0].alive && !st.votes["你"]) myTurn = "该投票啦～";
  if (snap.game === "adventure" && st.check) myTurn = "掷骰子吧～";
  if (snap.game === "story" && st.phase === "writing") myTurn = st.turn === "human" ? "到你写啦～" : `${name} 在等你～`;
  const statusMap = {
    connecting: [`等 ${name} 上线…`, ""],
    waiting: [myTurn, ""],
    thinking: [`${name} 正在想`, "thinking"],
    away: [`${name} 走神了，去对话框叫叫 TA 吧`, "away"],
  };
  setStatus(...statusMap[snap.agent]);
  renderSetup();
  if (prev && prev.agent_look !== snap.agent_look) { $("#chat-log").innerHTML = ""; chatRendered = 0; }
  renderStage(prev);
  renderChat();
  celebrate(prev);
}

function celebrate(prev) {
  if (!prev || prev.game !== snap.game) return;
  const a = prev.state || {}, b = snap.state || {};
  if (snap.game === "undercover" && !a.winner && b.winner) {
    const meSpy = b.players[0].spy;
    const won = (b.winner === "spy") === !!meSpy;
    confetti(won ? "win" : "lose");
    return;
  }
  if (snap.game === "adventure" && a.phase !== "done" && b.phase === "done") {
    confetti(b.result === "win" ? "gold" : "lose");
    return;
  }
  if (!a.winner && b.winner) {
    if (b.winner === "human") confetti();
    else if (b.winner === "agent") confetti("lose");
  }
  if (!a.solved && b.solved) confetti();
  if (snap.game === "story" && a.phase !== "done" && b.phase === "done") confetti("win");
  if (snap.game === "soup" && !a.revealed && b.revealed) confetti("gold");
}

$("#home").addEventListener("click", () => { if (snap && snap.game) act("lobby"); });

/* ---------- first-run setup ---------- */
function renderSetup() {
  const box = $("#setup");
  const show = !snap.setup_done;
  if (show && box.hidden) {
    box.hidden = false;
    $("#setup-agent").value = snap.agent_name && snap.agent_name !== "小伙伴" ? snap.agent_name : "";
    $("#setup-human").value = snap.human_name && snap.human_name !== "你" ? snap.human_name : "";
    setLook(snap.agent_look || "cat");
    setTimeout(() => $("#setup-human").focus(), 50);
  }
  if (!show) box.hidden = true;
}
let pickedLook = "cat";
function setLook(k) {
  pickedLook = k;
  $("#setup-art").innerHTML = buddySVG("happy", k);
  lookPicker($("#setup-looks"), k, setLook);
}
$("#setup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const human_name = $("#setup-human").value.trim();
  const name = $("#setup-agent").value.trim();
  if (!human_name) return toast("先写下你的昵称吧");
  if (!name) return toast("给 AI 起个名字吧");
  const r = await act("setup", { name, human_name, look: pickedLook });
  if (!r.error) { $("#setup").hidden = true; stageKey = ""; toast("认识啦，开始玩吧"); }
});

let renameLook = "cat";
function openRename() {
  const pop = $("#rename-pop");
  $("#rename-input").value = snap ? snap.agent_name : "";
  $("#rename-human").value = snap ? snap.human_name : "";
  const pick = (k) => { renameLook = k; lookPicker($("#rename-looks"), k, pick); };
  pick((snap && snap.agent_look) || "cat");
  pop.classList.add("show");
  $("#rename-input").select();
}
$("#rename-btn").addEventListener("click", openRename);
$("#buddy").addEventListener("click", openRename);
$("#rename-cancel").addEventListener("click", () => $("#rename-pop").classList.remove("show"));
$("#rename-pop").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#rename-input").value.trim();
  const human_name = $("#rename-human").value.trim();
  if (!name) return toast("名字不能为空哦");
  const r = await act("rename", { name, human_name, look: renameLook });
  if (!r.error) { $("#rename-pop").classList.remove("show"); toast("改好啦"); if (!snap || !snap.game) stageKey = ""; }
});

/* ---------- chat ---------- */
let chatRendered = 0;
function renderChat() {
  const log = $("#chat-log");
  const chat = snap.chat || [];
  const lastId = chat.length ? chat[chat.length - 1].id : 0;
  if (lastId < chatRendered) { log.innerHTML = ""; chatRendered = 0; }
  const fresh = chat.filter((m) => m.id > chatRendered);
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  $(".chat-empty", log)?.remove();
  for (const m of fresh) {
    const alias = m.name && CRITTER[m.name];
    const row = h("div", { class: "msg " + m.who, "data-id": m.id },
      m.who === "agent" ? (alias ? h("div", { class: "av av-critter" }, icon(alias)) : avatar("normal")) : null,
      h("div", { class: "bubble" }, m.name ? h("span", { class: "who" }, m.name) : null, m.text));
    const typingRow = log.querySelector(".typing");
    if (typingRow) typingRow.before(row); else log.append(row);
  }
  chatRendered = Math.max(chatRendered, lastId);
  if (!chat.length) log.append(h("div", { class: "chat-empty" }, icon("think", "big"), `和 ${snap.agent_name} 打个招呼吧`, h("small", {}, "玩的时候也可以随时聊天")));
  // soup stamps on questions
  const answers = (snap.game === "soup" && snap.state.answers) || {};
  const labels = { yes: "是", no: "不是", irrelevant: "无关", partly: "部分是" };
  log.querySelectorAll(".msg.human").forEach((row) => {
    const kind = answers[row.dataset.id];
    const old = $(".stamp", row);
    if (kind && !old) $(".bubble", row).append(h("span", { class: "stamp " + kind }, labels[kind]));
    if (!kind && old) old.remove();
  });
  // typing dots
  const typing = log.querySelector(".typing");
  if (snap.agent === "thinking" && !typing) log.append(h("div", { class: "typing" }, h("i"), h("i"), h("i")));
  if (snap.agent !== "thinking" && typing) typing.remove();
  if (nearBottom || fresh.length) log.scrollTop = log.scrollHeight;
  $("#chat-sub").textContent = snap.game === "soup" ? "在这里提问，TA 会盖章回答" : "边玩边聊吧";
}

$("#chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const inp = $("#chat-input");
  const text = inp.value.trim();
  if (!text) return;
  inp.value = "";
  await act("chat", { text });
});

/* ---------- stage ---------- */
// Each screen: key(state) decides when to rebuild; build() makes the DOM once; update() refreshes it.
const SCREENS = {
  lobby: { key: () => "", build: buildLobby, update: () => {} },
  gomoku: { key: () => "", build: buildGomoku, update: updateGomoku },
  drawguess: { key: (st) => `${st.mode || "pick"}:${st.round}`, build: buildDraw, update: updateDraw },
  soup: { key: (st) => `${st.title}:${st.story ? 1 : 0}`, build: buildSoup, update: updateSoup },
};

function renderStage(prev) {
  const stage = $("#stage");
  const g = snap.game || "lobby";
  const scr = SCREENS[g];
  const key = g + ":" + scr.key(snap.state || {});
  if (key !== stageKey) {
    stageKey = key;
    ctx = {};
    stage.innerHTML = "";
    scr.build(stage);
  }
  scr.update(stage, prev);
}

function gameBar(stage, label) {
  stage.append(h("div", { class: "game-bar" },
    h("span", { class: "name" }, icon(snap.game), label),
    h("div", { class: "row" },
      h("button", { class: "btn ghost", onclick: () => act("restart") }, "重新开始"),
      h("button", { class: "btn ghost", onclick: () => act("lobby") }, "换个游戏"))));
}

function buildLobby(stage) {
  stage.append(
    h("h2", { class: "title" }, snap.human_name && snap.human_name !== "你" ? `嗨 ${snap.human_name}，想和 ${snap.agent_name} 玩什么？` : `想和 ${snap.agent_name} 玩什么？`),
    h("p", { class: "sub" }, "点一个就开始啦，玩的时候右边可以随时聊天"),
    h("div", { class: "lobby" },
      card("soup", "海龟汤", "TA 出一个离奇的小故事，你提问，TA 只回答是、不是、无关，看你多久猜出真相"),
      card("drawguess", "你画我猜", "TA 一笔一笔画给你猜，或者你来画、TA 来猜"),
      card("gomoku", "五子棋", "先连成五颗就赢，TA 会边下边跟你斗嘴"),
      card("guesswho", "猜人物", "一个想、一个问，20 个是非题内猜出是谁"),
      card("idiom", "成语接龙", "首尾相接，各有三颗心，接不上就扣一颗"),
      card("emoji", "Emoji 猜词", "用一串表情出题，猜成语、电影或歌名"),
      card("story", "故事接龙", "你一句我一句，一起写个故事，TA 还会画封面"),
      card("undercover", "谁是卧底", "你和三个 AI 小伙伴同桌，轮流描述、投票揪出卧底"),
      card("adventure", "骰子冒险", "TA 当主持人带你闯关，关键时刻掷骰子定生死")));
  function card(id, title, desc) {
    return h("div", { class: `game-card gc-${id}`, onclick: () => act("choose_game", { game: id }) },
      icon(id, "gicon"), h("h3", {}, title), h("p", {}, desc));
  }
}

/* ---------- gomoku ---------- */
const N = 15, COLS = "ABCDEFGHIJKLMNO", CELL = 36, PAD = 34;
function buildGomoku(stage) {
  gameBar(stage, "五子棋");
  const size = PAD * 2 + CELL * (N - 1);
  const svg = s("svg", { viewBox: `0 0 ${size} ${size}` });
  svg.append(s("rect", { x: 4, y: 4, width: size - 8, height: size - 8, rx: 28, fill: "#ffe7c4", stroke: "#f6cf98", "stroke-width": 6 }));
  for (let i = 0; i < N; i++) {
    const p = PAD + i * CELL;
    svg.append(s("line", { x1: PAD, y1: p, x2: size - PAD, y2: p, stroke: "#e2b47c", "stroke-width": 1.6 }));
    svg.append(s("line", { x1: p, y1: PAD, x2: p, y2: size - PAD, stroke: "#e2b47c", "stroke-width": 1.6 }));
    const col = s("text", { x: p, y: size - 10, "text-anchor": "middle", "font-size": 13, fill: "#c99a62" }); col.textContent = COLS[i];
    const row = s("text", { x: 14, y: PAD + (N - 1 - i) * CELL + 4, "text-anchor": "middle", "font-size": 13, fill: "#c99a62" }); row.textContent = i + 1;
    svg.append(col, row);
  }
  for (const [c, r] of [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]])
    svg.append(s("circle", { cx: PAD + c * CELL, cy: PAD + (N - 1 - r) * CELL, r: 4, fill: "#e2b47c" }));
  const stones = s("g"), marks = s("g"), hover = s("g", { class: "hover-stone" });
  svg.append(stones, marks, hover);
  const pick = (ev) => {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const x = Math.round((p.x - PAD) / CELL), y = N - 1 - Math.round((p.y - PAD) / CELL);
    return x >= 0 && x < N && y >= 0 && y < N ? { x, y } : null;
  };
  svg.addEventListener("pointermove", (ev) => {
    hover.innerHTML = "";
    const st = snap.state, c = pick(ev);
    if (!c || st.winner || st.turn !== "human" || st.board[c.y][c.x]) return;
    hover.append(stoneEl(c.x, c.y, st.human_stone));
  });
  svg.addEventListener("pointerleave", () => (hover.innerHTML = ""));
  svg.addEventListener("click", (ev) => {
    const st = snap.state, c = pick(ev);
    if (!c) return;
    if (st.winner) return toast("这局结束啦，点“重新开始”再来");
    if (st.turn !== "human") return toast(`等 ${snap.agent_name} 下完哦`);
    hover.innerHTML = "";
    act("move", c);
  });
  stage.append(h("div", { class: "board-wrap" }, svg), h("p", { class: "gomoku-info", id: "g-info" }));
  Object.assign(ctx, { stones, marks, drawn: new Set() });
}

function stoneEl(x, y, color) {
  const cx = PAD + x * CELL, cy = PAD + (N - 1 - y) * CELL;
  const g = s("g", { class: "stone" });
  const dark = color === 1;
  g.append(s("circle", { cx, cy: cy + 2, r: 15.5, fill: "#000", opacity: .12 }));
  g.append(s("circle", { cx, cy, r: 15.5, fill: dark ? "#4b4562" : "#fffaf5", stroke: dark ? "#3e3a52" : "#f0d8de", "stroke-width": 1.5 }));
  g.append(s("circle", { cx: cx - 5, cy: cy - 6, r: 4, fill: "#fff", opacity: dark ? .35 : .9 }));
  const eye = dark ? "#fff" : "#5b4660";
  g.append(s("circle", { cx: cx - 4.5, cy: cy + 1, r: 1.6, fill: eye }));
  g.append(s("circle", { cx: cx + 4.5, cy: cy + 1, r: 1.6, fill: eye }));
  g.append(s("circle", { cx: cx - 8, cy: cy + 5, r: 2.4, fill: "#ffc59e", opacity: .7 }));
  g.append(s("circle", { cx: cx + 8, cy: cy + 5, r: 2.4, fill: "#ffc59e", opacity: .7 }));
  return g;
}

function updateGomoku() {
  const st = snap.state;
  const count = st.board.flat().filter(Boolean).length;
  if (count < ctx.drawn.size) { ctx.stones.innerHTML = ""; ctx.drawn.clear(); }
  st.board.forEach((row, y) => row.forEach((v, x) => {
    const id = `${x},${y}`;
    if (v && !ctx.drawn.has(id)) { ctx.drawn.add(id); ctx.stones.append(stoneEl(x, y, v)); }
  }));
  ctx.marks.innerHTML = "";
  if (st.last) {
    const cx = PAD + st.last.x * CELL, cy = PAD + (N - 1 - st.last.y) * CELL;
    ctx.marks.append(s("circle", { cx, cy, r: 19, fill: "none", stroke: "#4fa8e0", "stroke-width": 2.5, "stroke-dasharray": "4 4" }));
  }
  for (const [x, y] of st.line || []) {
    ctx.marks.append(s("circle", { class: "win-cell", cx: PAD + x * CELL, cy: PAD + (N - 1 - y) * CELL, r: 19, fill: "#ffe08a", opacity: .8 }));
  }
  const name = snap.agent_name;
  const info = $("#g-info");
  if (st.winner === "human") info.textContent = "你赢啦！太厉害了";
  else if (st.winner === "agent") info.textContent = `${name} 赢了，再来一局报仇？`;
  else if (st.winner === "draw") info.textContent = "平局！棋逢对手～";
  else info.textContent = st.turn === "human" ? "轮到你（深色小团子）落子" : `${name}（白色小团子）思考中…`;
}

/* ---------- draw & guess ---------- */
function buildDraw(stage) {
  gameBar(stage, "你画我猜");
  const st = snap.state;
  if (!st.mode) {
    stage.append(
      h("h2", { class: "title" }, "这一轮谁来画？"),
      h("p", { class: "sub" }, "可以轮流来哦"),
      h("div", { class: "mode-pick" },
        h("div", { class: "game-card gc-drawguess", onclick: () => act("mode", { mode: "ai_draws" }) },
          aiIcon(), h("h3", {}, `${snap.agent_name} 画，我猜`), h("p", {}, "看 TA 一笔一笔画出来")),
        h("div", { class: "game-card gc-gomoku", onclick: () => act("mode", { mode: "human_draws" }) },
          icon("me", "gicon"), h("h3", {}, `我画，${snap.agent_name} 猜`), h("p", {}, "需要 TA 能看图片"))));
    return;
  }
  if (st.mode === "ai_draws") buildAiDraws(stage);
  else buildHumanDraws(stage);
}

function buildAiDraws(stage) {
  const svg = s("svg", { viewBox: "0 0 400 300" });
  const label = h("p", { class: "sub", id: "dg-label" });
  const boxes = h("div", { class: "word-boxes" });
  const hint = h("span", { class: "hint", id: "dg-hint" });
  const guesses = h("div", { class: "chips" });
  const input = h("input", { class: "text-in", placeholder: "我猜是…", maxlength: 20 });
  const form = h("form", { class: "guess-form", onsubmit: (e) => {
    e.preventDefault();
    const t = input.value.trim(); if (!t) return;
    input.value = ""; act("guess", { text: t });
  } }, input, h("button", { class: "btn blue" }, "猜！"));
  const giveup = h("button", { class: "btn ghost", onclick: () => act("giveup") }, "猜不出，揭晓吧");
  const done = h("div", { class: "row", style: "flex-direction:column" });
  stage.append(h("div", { class: "paper" }, svg), label, boxes, hint, guesses,
    h("div", { class: "row", id: "dg-play" }, form, giveup), done);
  Object.assign(ctx, { svg, label, boxes, hint, guesses, form, giveup, done, drawn: 0, drawId: 0 });
}

function animatePaths(svg, paths, from) {
  let delay = 0;
  paths.slice(from).forEach((p) => {
    const el = s("path", { d: p.d, stroke: p.color, "stroke-width": p.width, fill: p.fill || "none",
      "stroke-linecap": "round", "stroke-linejoin": "round" });
    svg.append(el);
    let len = 300;
    try { len = el.getTotalLength() || 300; } catch (e) {}
    const dur = Math.min(1600, Math.max(350, len * 3));
    el.style.strokeDasharray = len;
    el.style.strokeDashoffset = len;
    const fill = p.fill && p.fill !== "none";
    if (fill) el.style.fillOpacity = 0;
    el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: dur, delay, fill: "forwards", easing: "ease-in-out" });
    if (fill) el.animate([{ fillOpacity: 0 }, { fillOpacity: 1 }], { duration: 400, delay: delay + dur, fill: "forwards" });
    delay += dur + 120;
  });
  return delay;
}

function updateDraw(stage) {
  const st = snap.state;
  if (!st.mode) return;
  if (st.mode === "ai_draws") return updateAiDraws(st);
  updateHumanDraws(st);
}

function wordBoxes(el, n, word) {
  el.innerHTML = "";
  for (let i = 0; i < (n || 0); i++) el.append(h("span", {}, word ? word[i] : ""));
}

function updateAiDraws(st) {
  const name = snap.agent_name;
  if (st.draw_id !== ctx.drawId) {
    const from = st.draw_id > ctx.drawId && st.paths.length >= ctx.drawn && ctx.drawn ? ctx.drawn : 0;
    if (!from) ctx.svg.innerHTML = "";
    const t = animatePaths(ctx.svg, st.paths, from);
    ctx.drawId = st.draw_id;
    ctx.drawn = st.paths.length;
    ctx.label.textContent = `${name} 正在画…`;
    clearTimeout(ctx.lt);
    ctx.lt = setTimeout(() => { if (snap.state.phase === "guessing") ctx.label.textContent = "画好啦，猜猜是什么？"; }, t);
  }
  if (st.phase === "drawing") ctx.label.textContent = `${name} 正在想画什么…`;
  wordBoxes(ctx.boxes, st.word_len, st.revealed);
  ctx.hint.textContent = st.hint ? `提示：${st.hint}` : "";
  ctx.hint.style.display = st.hint ? "" : "none";
  ctx.guesses.innerHTML = "";
  st.guesses.forEach((g, i) => ctx.guesses.append(h("span", { class: "chip " + (st.solved && i === st.guesses.length - 1 ? "good" : "bad") }, g)));
  $("#dg-play").style.display = st.phase === "guessing" ? "" : "none";
  ctx.done.innerHTML = "";
  if (st.phase === "done") {
    if (ctx.label.textContent.includes("正在画")) {} else ctx.label.textContent = st.solved ? "猜对啦！" : "答案揭晓～";
    ctx.done.append(h("div", { class: "answer-big" }, st.revealed || ""), roundButtons());
  }
}

function roundButtons() {
  return h("div", { class: "row" },
    h("button", { class: "btn blue", onclick: () => act("mode", { mode: "ai_draws" }) }, `再让 ${snap.agent_name} 画`),
    h("button", { class: "btn mint", onclick: () => act("mode", { mode: "human_draws" }) }, "换我来画"));
}

const PALETTE = ["#5b4660", "#e85d5d", "#ff9a5c", "#f2c230", "#5fc39e", "#5aa9e6", "#a68cff", "#8b5e3c"];
function buildHumanDraws(stage) {
  const canvas = h("canvas", { width: 800, height: 600 });
  const c2d = canvas.getContext("2d");
  const strokes = [];
  let cur = null, color = PALETTE[0], size = 8;
  const redraw = () => {
    c2d.fillStyle = "#fff"; c2d.fillRect(0, 0, 800, 600);
    for (const st of strokes) drawStroke(st);
  };
  const drawStroke = (st) => {
    c2d.strokeStyle = st.color; c2d.lineWidth = st.size; c2d.lineCap = "round"; c2d.lineJoin = "round";
    c2d.beginPath();
    st.points.forEach(([x, y], i) => (i ? c2d.lineTo(x, y) : c2d.moveTo(x, y)));
    if (st.points.length === 1) c2d.lineTo(st.points[0][0] + .1, st.points[0][1]);
    c2d.stroke();
  };
  const pos = (ev) => { const r = canvas.getBoundingClientRect(); return [(ev.clientX - r.left) * 800 / r.width, (ev.clientY - r.top) * 600 / r.height]; };
  canvas.addEventListener("pointerdown", (ev) => {
    if (snap.state.phase === "done") return;
    if (!snap.state.my_word) return toast("先在上面选一个要画的词哦");
    canvas.setPointerCapture(ev.pointerId);
    cur = { color, size, points: [pos(ev)] }; strokes.push(cur); drawStroke(cur);
  });
  canvas.addEventListener("pointermove", (ev) => { if (!cur) return; cur.points.push(pos(ev)); drawStroke({ ...cur, points: cur.points.slice(-2) }); });
  const end = () => (cur = null);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  redraw();

  const swatches = h("div", { class: "tools" });
  const refreshTools = () => {
    swatches.innerHTML = "";
    for (const c of PALETTE) swatches.append(h("span", { class: "swatch" + (c === color ? " on" : ""), style: `background:${c}`, onclick: () => { color = c; refreshTools(); } }));
    swatches.append(h("span", { class: "swatch" + (color === "#ffffff" ? " on" : ""), title: "橡皮", style: "background:#fff;display:grid;place-items:center", onclick: () => { color = "#ffffff"; refreshTools(); } }, icon("eraser")));
    for (const z of [4, 8, 16]) swatches.append(h("span", { class: "size" + (z === size ? " on" : ""), onclick: () => { size = z; refreshTools(); } }, h("i", { style: `width:${z / 1.4 + 2}px;height:${z / 1.4 + 2}px` })));
    swatches.append(h("button", { class: "btn ghost", onclick: () => { strokes.pop(); redraw(); } }, "撤销"),
      h("button", { class: "btn ghost", onclick: () => { strokes.length = 0; redraw(); } }, "清空"));
  };
  refreshTools();

  const top = h("div", { id: "hd-top", style: "width:100%;text-align:center" });
  const submit = h("button", { class: "btn blue", onclick: async () => {
    if (!strokes.length) return toast("还没画呢～");
    const r = await act("submit_drawing", { image: canvas.toDataURL("image/png") });
    if (!r.error) toast(`已经拿给 ${snap.agent_name} 看啦`);
  } }, `画好啦，给 ${snap.agent_name} 看`);
  const guesses = h("div", { class: "chips" });
  const done = h("div", { class: "row", style: "flex-direction:column" });
  stage.append(top, h("div", { class: "paper" }, canvas), swatches, h("div", { class: "row", id: "hd-submit" }, submit), guesses, done);
  Object.assign(ctx, { top, submit, guesses, done });
}

function updateHumanDraws(st) {
  const name = snap.agent_name;
  ctx.top.innerHTML = "";
  if (!st.my_word) {
    const input = h("input", { class: "text-in", placeholder: "或者自己想一个", maxlength: 12, style: "width:160px" });
    ctx.top.append(h("p", { class: "sub", style: "margin:0" }, `选一个词画给 ${name} 猜（TA 看不到）`),
      h("div", { class: "chips" },
        ...(st.suggestions || []).map((w) => h("span", { class: "chip", onclick: () => act("pick_word", { word: w }) }, w)),
        input, h("button", { class: "btn butter", onclick: () => input.value.trim() && act("pick_word", { word: input.value.trim() }) }, "就它了")));
  } else {
    ctx.top.append(h("div", { class: "my-word" }, `你要画的是：${st.my_word}（只有你看得到）`));
  }
  ctx.submit.textContent = st.phase === "guessing" ? `补好了，再给 ${name} 看一次` : `画好啦，给 ${name} 看`;
  $("#hd-submit").style.display = st.phase === "done" ? "none" : "";
  ctx.guesses.innerHTML = "";
  if (st.phase === "guessing" && !st.guesses.length) ctx.guesses.append(h("span", { class: "sub" }, `${name} 正在看你的画…`));
  st.guesses.forEach((g, i) => ctx.guesses.append(h("span", { class: "chip " + (st.solved && i === st.guesses.length - 1 ? "good" : "bad") }, `${name}：${g}`)));
  ctx.done.innerHTML = "";
  if (st.phase === "done") ctx.done.append(h("div", { class: "answer-big" }, st.solved ? `${name} 猜对了：${st.revealed}` : st.revealed || ""), roundButtons());
}

/* ---------- turtle soup ---------- */
function buildSoup(stage) {
  gameBar(stage, "海龟汤");
  const st = snap.state;
  if (!st.story) {
    stage.append(h("div", { class: "waiting-big" }, h("div", { class: "soup-bowl" }, icon("soup")), `${snap.agent_name} 正在熬汤，马上就好…`));
    return;
  }
  stage.append(
    h("div", { class: "soup-card" }, h("h3", {}, `《${st.title}》`), h("p", {}, st.story)),
    h("div", { class: "legend" },
      h("span", { class: "stamp yes" }, "是"), h("span", { class: "stamp no" }, "不是"),
      h("span", { class: "stamp partly" }, "部分是"), h("span", { class: "stamp irrelevant" }, "无关")),
    h("p", { class: "sub" }, "在右边聊天框里提问吧，只能问能用“是/不是”回答的问题哦"),
    h("div", { id: "soup-count", class: "sub" }),
    h("div", { id: "soup-reveal", style: "width:100%;display:flex;flex-direction:column;align-items:center" }));
}

function updateSoup() {
  const st = snap.state;
  if (!st.story) return;
  $("#soup-count").textContent = `已经问了 ${st.count} 个问题`;
  const box = $("#soup-reveal");
  if (st.revealed && !box.childElementCount) {
    box.append(h("div", { class: "reveal-card" }, h("h4", {}, "汤底揭晓"), h("p", {}, st.revealed)),
      h("div", { class: "row", style: "margin-top:14px" },
        h("button", { class: "btn mint", onclick: () => act("restart") }, "再来一碗")));
  }
}

$("#buddy").innerHTML = buddySVG("happy");
$("#brand-mark").append(icon("logo"));
$("#rename-btn").append(icon("pencil"));
document.addEventListener("DOMContentLoaded", loop);
