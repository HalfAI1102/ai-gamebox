"use strict";
/* 猜人物 / 成语接龙 / Emoji 猜词 / 故事接龙. Uses helpers from app.js. */

const ANSWER_LABEL = { yes: "是", no: "不是", unknown: "不知道", partly: "部分是", irrelevant: "无关" };

function modePick(stage, title, sub, options) {
  stage.append(h("h2", { class: "title" }, title), h("p", { class: "sub" }, sub),
    h("div", { class: "mode-pick" }, ...options.map((o) =>
      h("div", { class: `game-card ${o.cls}`, onclick: () => act("mode", { mode: o.mode }) },
        o.icon === "ai" ? aiIcon() : icon(o.icon, "gicon"), h("h3", {}, o.title), h("p", {}, o.desc)))));
}

function waiting(stage, ic, text) {
  stage.append(h("div", { class: "waiting-big" }, h("div", { class: "soup-bowl" }, icon(ic)), text));
}

function inputForm(placeholder, button, onSubmit, { cls = "blue", max = 60, width } = {}) {
  const input = h("input", { class: "text-in", placeholder, maxlength: max });
  if (width) input.style.width = width;
  const form = h("form", { class: "guess-form", onsubmit: (e) => {
    e.preventDefault();
    const t = input.value.trim();
    if (!t) return;
    input.value = "";
    onSubmit(t);
  } }, input, h("button", { class: "btn " + cls }, button));
  return form;
}

function chipList(el, items, solvedLast, prefix = "") {
  el.innerHTML = "";
  items.forEach((g, i) => el.append(h("span", { class: "chip " + (solvedLast && i === items.length - 1 ? "good" : "bad") }, prefix + g)));
}

function nextRound(options) {
  return h("div", { class: "row" }, ...options.map(([label, mode, cls]) =>
    h("button", { class: "btn " + cls, onclick: () => act("mode", { mode }) }, label)));
}

/* ---------- 猜人物 ---------- */
function buildGuessWho(stage) {
  gameBar(stage, "猜人物");
  const st = snap.state, name = snap.agent_name;
  if (!st.mode) {
    modePick(stage, "这一轮谁来想？", "想一个人物、角色或动物都可以", [
      { mode: "ai_thinks", icon: "ai", title: `${name} 想，我来猜`, desc: "最多问 20 个是非题", cls: "gc-guesswho" },
      { mode: "human_thinks", icon: "me", title: `我想，${name} 来猜`, desc: "看看 TA 几题能猜中", cls: "gc-emoji" },
    ]);
    return;
  }
  if (st.mode === "ai_thinks" && st.phase === "setup") return waiting(stage, "think", `${name} 正在想一个人物…`);
  if (st.mode === "human_thinks" && st.phase === "setup") {
    let cat = "";
    const chips = h("div", { class: "chips" });
    const cats = ["真实人物", "动漫游戏角色", "电影电视角色", "历史人物", "动物", "神话传说"];
    const drawChips = () => {
      chips.innerHTML = "";
      cats.forEach((c) => chips.append(h("span", { class: "chip" + (c === cat ? " on" : ""), onclick: () => { cat = c; drawChips(); } }, c)));
    };
    drawChips();
    const input = h("input", { class: "text-in", placeholder: "比如：孙悟空", maxlength: 20 });
    stage.append(h("h2", { class: "title" }, "想好一个了吗？"),
      h("p", { class: "sub" }, `写下来，只有你看得到，${name} 会通过提问来猜`),
      h("div", { class: "row" }, input,
        h("button", { class: "btn blue", onclick: () => {
          const v = input.value.trim();
          if (!v) return toast("先写下你想的人物");
          act("set_secret", { secret: v, category: cat });
        } }, "想好了")),
      h("p", { class: "sub", style: "margin:14px 0 0" }, "给 TA 一点范围（可选）"), chips);
    return;
  }
  const info = h("div", { class: "row info-row" });
  const list = h("div", { class: "qa-list" });
  stage.append(info, list);
  Object.assign(ctx, { info, list });
  if (st.phase === "done") {
    ctx.done = h("div", { class: "row", style: "flex-direction:column" });
    stage.append(ctx.done);
    return;
  }
  if (st.mode === "ai_thinks") {
    const guesses = h("div", { class: "chips" });
    stage.append(
      inputForm("问一个能用是/不是回答的问题", "问", (t) => act("ask", { text: t }), { max: 120, width: "min(60vw, 320px)" }),
      h("div", { class: "row", style: "margin-top:6px" },
        inputForm("我猜是…", "猜！", (t) => act("guess", { text: t }), { cls: "mint", max: 20 }),
        h("button", { class: "btn ghost", onclick: () => act("giveup") }, "揭晓吧")),
      guesses);
    ctx.guesses = guesses;
  } else {
    ctx.answers = h("div", { class: "row answer-btns" },
      ...["yes", "no", "partly", "unknown"].map((k) =>
        h("button", { class: "btn " + { yes: "mint", no: "coral", partly: "butter", unknown: "ghost" }[k], onclick: () => act("answer", { kind: k }) }, ANSWER_LABEL[k])));
    stage.append(ctx.answers, h("button", { class: "btn ghost", style: "margin-top:10px", onclick: () => act("reveal") }, "不玩了，公布答案"));
  }
}

function renderQA(list, questions, mode) {
  list.innerHTML = "";
  if (!questions.length) list.append(h("p", { class: "sub" }, mode === "ai_thinks" ? "还没有提问，先从大范围问起吧" : `等 ${snap.agent_name} 提第一个问题…`));
  questions.forEach((q) => {
    const asker = q.who === "human" ? "你" : snap.agent_name;
    list.append(h("div", { class: "qa " + q.who + (q.answer ? "" : " pending") },
      h("span", { class: "qa-n" }, q.id),
      h("span", { class: "qa-text" }, `${asker}：${q.text}`, q.note ? h("small", {}, `（${q.note}）`) : null),
      q.answer ? h("span", { class: "stamp " + q.answer }, ANSWER_LABEL[q.answer]) : h("span", { class: "qa-wait" }, "…")));
  });
  list.scrollTop = list.scrollHeight;
}

function updateGuessWho() {
  const st = snap.state;
  if (!ctx.list) return;
  const name = snap.agent_name;
  ctx.info.innerHTML = "";
  if (st.category) ctx.info.append(h("span", { class: "hint" }, `范围：${st.category}`));
  if (st.mode === "ai_thinks") ctx.info.append(h("span", { class: "pill" }, `还能问 ${st.max - st.questions.length} 题`));
  if (st.my_secret) ctx.info.append(h("span", { class: "my-word" }, `你想的是：${st.my_secret}（只有你看得到）`));
  renderQA(ctx.list, st.questions, st.mode);
  if (ctx.guesses) chipList(ctx.guesses, st.guesses, st.solved, "你猜：");
  if (ctx.answers) {
    const pending = st.questions.some((q) => q.who === "agent" && !q.answer);
    ctx.answers.querySelectorAll("button").forEach((b) => (b.disabled = !pending));
  }
  if (ctx.done) {
    ctx.done.innerHTML = "";
    const who = st.mode === "ai_thinks" ? "你" : name;
    ctx.done.append(h("p", { class: "sub", style: "margin:12px 0 0" }, st.solved ? `${who}猜对啦！用了 ${st.questions.length} 个问题` : "答案是"),
      h("div", { class: "answer-big" }, st.revealed || ""),
      nextRound([[`让 ${name} 再想一个`, "ai_thinks", "blue"], ["换我来想", "human_thinks", "mint"]]));
  }
}

/* ---------- 成语接龙 ---------- */
function buildIdiom(stage) {
  gameBar(stage, "成语接龙");
  const hearts = h("div", { class: "hearts" });
  const chain = h("div", { class: "chain" });
  const need = h("div", { class: "need" });
  const notice = h("div", { class: "notice" });
  const form = inputForm("接一个成语", "接！", (t) => act("word", { text: t }), { max: 10 });
  const controls = h("div", { class: "row" }, form,
    h("button", { class: "btn ghost", onclick: () => act("pass") }, "接不上"),
    h("button", { class: "btn butter", onclick: () => act("hint") }, "求提示"));
  const result = h("div", { class: "row", style: "flex-direction:column" });
  stage.append(hearts, chain, need, notice, controls, result);
  Object.assign(ctx, { hearts, chain, need, notice, controls, result, form, count: 0 });
}

function updateIdiom() {
  const st = snap.state, name = snap.agent_name;
  const heartRow = (label, n) => h("div", { class: "heart-row" }, h("span", {}, label), h("span", { class: "hearts-icons" }, ...[0, 1, 2].map((i) => icon(i < n ? "heart" : "heartOff"))));
  ctx.hearts.innerHTML = "";
  ctx.hearts.append(heartRow("你", st.hearts.human), heartRow(name, st.hearts.agent));
  if (st.chain.length < ctx.count) ctx.count = 0;
  ctx.chain.innerHTML = "";
  if (!st.chain.length) ctx.chain.append(h("p", { class: "sub" }, "你先来起个头吧，比如「一心一意」"));
  st.chain.forEach((c, i) => {
    if (i) ctx.chain.append(h("span", { class: "chain-arrow" }, icon("arrow")));
    const tile = h("span", { class: "tile " + c.who + (i >= ctx.count ? " new" : "") },
      c.word.slice(0, -1), h("b", {}, c.word.slice(-1)));
    ctx.chain.append(tile);
  });
  ctx.count = st.chain.length;
  ctx.chain.scrollTop = ctx.chain.scrollHeight;
  ctx.need.innerHTML = "";
  if (!st.winner && st.need) ctx.need.append("下一个要以 ", h("b", {}, st.need), " 开头");
  else if (!st.winner) ctx.need.append(st.turn === "human" ? "随便起个头吧" : `${name} 要重新起头`);
  ctx.notice.textContent = st.notice || "";
  ctx.notice.style.display = st.notice ? "" : "none";
  const mine = st.turn === "human" && !st.winner;
  ctx.controls.style.display = st.winner ? "none" : "";
  ctx.controls.querySelectorAll("button, input").forEach((b) => (b.disabled = !mine));
  if (mine && document.activeElement === document.body) $("input", ctx.form).focus();
  ctx.result.innerHTML = "";
  if (st.winner) {
    ctx.result.append(h("div", { class: "answer-big" }, st.winner === "human" ? "你赢啦！" : `${name} 赢了～`),
      h("p", { class: "sub" }, `一共接了 ${st.chain.length} 个成语`),
      h("button", { class: "btn blue", onclick: () => act("restart") }, "再来一局"));
  }
}

/* ---------- Emoji 猜词 ---------- */
const EMOJI_PALETTE = "😀😂😍😭😡😱🤔😴🥶🤑👀👂👄💪🦵🧍🏃💃👨‍👩‍👧👶👴🐶🐱🐭🐰🐻🐼🐯🦁🐮🐷🐸🐵🐔🐧🐦🐟🐍🐉🦋🐌🌳🌸🌙⭐☀️🌧️❄️🔥💧🌊⛰️🏠🏫🏥🚗🚀✈️⛵🍎🍉🍜🍚🍰☕🍺⚽🎵🎬📚✏️💰💡⏰🔑❤️💔💤❓❗➕➖✖️🔟1️⃣2️⃣3️⃣";

function scoreBoard() {
  const sc = snap.state.score;
  return h("div", { class: "score" }, h("span", {}, `你 ${sc.human}`), h("b", {}, ":"), h("span", {}, `${sc.agent} ${snap.agent_name}`));
}

function buildEmoji(stage) {
  gameBar(stage, "Emoji 猜词");
  const st = snap.state, name = snap.agent_name;
  if (!st.mode) {
    stage.append(scoreBoard());
    modePick(stage, "这一轮谁出题？", "用表情描述一个成语、电影、歌名或者任何东西", [
      { mode: "ai_sets", icon: "ai", title: `${name} 出题，我猜`, desc: "猜对得一分", cls: "gc-emoji" },
      { mode: "human_sets", icon: "me", title: `我出题，${name} 猜`, desc: "看看 TA 懂不懂你的表情", cls: "gc-idiom" },
    ]);
    return;
  }
  if (st.mode === "ai_sets" && st.phase === "setup") return waiting(stage, "think", `${name} 正在出题…`);
  if (st.mode === "human_sets" && st.phase === "setup") return buildEmojiSetup(stage);
  const puzzle = h("div", { class: "emoji-puzzle" });
  const meta = h("div", { class: "row info-row" });
  const boxes = h("div", { class: "word-boxes" });
  const guesses = h("div", { class: "chips" });
  stage.append(scoreBoard(), puzzle, meta, boxes, guesses);
  Object.assign(ctx, { puzzle, meta, boxes, guesses });
  if (st.phase === "guessing" && st.mode === "ai_sets") {
    stage.append(h("div", { class: "row" },
      inputForm("我猜是…", "猜！", (t) => act("guess", { text: t }), { max: 20 }),
      h("button", { class: "btn ghost", onclick: () => act("giveup") }, "猜不出，揭晓吧")));
  } else if (st.phase === "guessing") {
    stage.append(h("button", { class: "btn ghost", onclick: () => act("reveal") }, "公布答案"));
  } else {
    ctx.done = h("div", { class: "row", style: "flex-direction:column" });
    stage.append(ctx.done);
  }
}

function buildEmojiSetup(stage) {
  let cat = "成语";
  const cats = ["成语", "电影", "歌曲", "动物", "食物", "地名", "其他"];
  const chips = h("div", { class: "chips" });
  const drawChips = () => {
    chips.innerHTML = "";
    cats.forEach((c) => chips.append(h("span", { class: "chip" + (c === cat ? " on" : ""), onclick: () => { cat = c; drawChips(); } }, c)));
  };
  drawChips();
  const answer = h("input", { class: "text-in", placeholder: "答案（TA 看不到）", maxlength: 20 });
  const puzzle = h("input", { class: "text-in emoji-in", placeholder: "点下面的表情，或者直接输入", maxlength: 60 });
  const preview = h("div", { class: "emoji-puzzle small" });
  puzzle.addEventListener("input", () => (preview.textContent = puzzle.value));
  const pal = h("div", { class: "emoji-palette" });
  for (const e of Array.from(new Intl.Segmenter().segment(EMOJI_PALETTE), (x) => x.segment))
    pal.append(h("span", { onclick: () => { puzzle.value += e; preview.textContent = puzzle.value; } }, e));
  stage.append(h("h2", { class: "title" }, "出一道表情题"),
    h("div", { class: "row" }, answer), chips, preview,
    h("div", { class: "row" }, puzzle,
      h("button", { class: "btn ghost", onclick: () => { const segs = Array.from(new Intl.Segmenter().segment(puzzle.value)); segs.pop(); puzzle.value = segs.map((x) => x.segment).join(""); preview.textContent = puzzle.value; } }, "退格")),
    pal,
    h("button", { class: "btn blue", style: "margin-top:12px", onclick: () => {
      if (!answer.value.trim()) return toast("先写答案");
      if (!puzzle.value.trim()) return toast("再放几个表情吧");
      act("set_puzzle", { answer: answer.value.trim(), puzzle: puzzle.value.trim(), category: cat });
    } }, `出题！考考 ${snap.agent_name}`));
}

function updateEmoji() {
  const st = snap.state, name = snap.agent_name;
  const sb = $(".score", $("#stage"));
  if (sb) sb.replaceWith(scoreBoard());
  if (!ctx.puzzle) return;
  ctx.puzzle.textContent = st.puzzle || "";
  ctx.meta.innerHTML = "";
  if (st.category) ctx.meta.append(h("span", { class: "pill" }, st.category));
  if (st.hint) ctx.meta.append(h("span", { class: "hint" }, `提示：${st.hint}`));
  if (st.my_answer && st.phase !== "done") ctx.meta.append(h("span", { class: "my-word" }, `答案：${st.my_answer}（TA 看不到）`));
  wordBoxes(ctx.boxes, st.word_len, st.revealed);
  chipList(ctx.guesses, st.guesses, st.solved, st.mode === "human_sets" ? `${name}：` : "");
  if (st.mode === "human_sets" && st.phase === "guessing" && !st.guesses.length)
    ctx.guesses.append(h("span", { class: "sub" }, `${name} 正在琢磨…`));
  if (ctx.done) {
    ctx.done.innerHTML = "";
    const who = st.mode === "ai_sets" ? "你" : name;
    ctx.done.append(h("p", { class: "sub", style: "margin:8px 0 0" }, st.solved ? `${who}猜对啦，加一分！` : "答案揭晓"),
      h("div", { class: "answer-big" }, st.revealed || ""),
      nextRound([[`${name} 再出一题`, "ai_sets", "blue"], ["换我出题", "human_sets", "mint"]]));
  }
}

/* ---------- 故事接龙 ---------- */
const THEMES = ["森林冒险", "太空旅行", "校园奇事", "悬疑侦探", "奇幻魔法", "甜品王国", "小动物日常"];

function buildStory(stage) {
  gameBar(stage, "故事接龙");
  const st = snap.state, name = snap.agent_name;
  if (st.phase === "theme") {
    ctx.themeBox = h("div", { style: "width:100%;display:flex;flex-direction:column;align-items:center" });
    stage.append(ctx.themeBox);
    return;
  }
  const book = h("div", { class: "book" + (st.phase === "done" ? " done" : "") });
  stage.append(book);
  ctx.book = book;
  if (st.phase === "writing") {
    const ta = h("textarea", { class: "story-in", maxlength: 150, rows: 2, placeholder: "接着写一两句…（Ctrl/⌘ + 回车发送）" });
    const send = () => { const v = ta.value.trim(); if (!v) return; ta.value = ""; act("line", { text: v }); };
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); });
    ctx.write = h("div", { class: "story-write" }, ta,
      h("div", { class: "row" }, h("button", { class: "btn blue", onclick: send }, "写好了"),
        h("button", { class: "btn ghost", onclick: () => act("request_end") }, `差不多了，请 ${name} 写结局`)));
    stage.append(ctx.write);
  } else {
    stage.append(h("div", { class: "row", style: "margin-top:14px" },
      h("button", { class: "btn blue", onclick: () => act("restart") }, "再写一个故事")));
  }
}

function updateStory() {
  const st = snap.state, name = snap.agent_name;
  if (ctx.themeBox) {
    ctx.themeBox.innerHTML = "";
    if (!st.theme) {
      const custom = inputForm("或者自己写个主题", "就它", (t) => act("theme", { text: t }), { max: 30 });
      ctx.themeBox.append(h("h2", { class: "title" }, "想写个什么样的故事？"),
        h("p", { class: "sub" }, `${name} 先开个头，然后你们一人一段`),
        h("div", { class: "chips themes" }, ...THEMES.map((t) => h("span", { class: "chip", onclick: () => act("theme", { text: t }) }, t))),
        custom);
    } else {
      waiting(ctx.themeBox, "pencil", `主题「${st.theme}」，${name} 正在构思开头…`);
    }
    return;
  }
  if (!ctx.book) return;
  const book = ctx.book;
  if (!ctx.built || ctx.lines !== st.lines.length || ctx.phase !== st.phase) {
    book.innerHTML = "";
    if (st.phase === "done" && st.cover.length) {
      const svg = s("svg", { viewBox: "0 0 400 300" });
      book.append(h("div", { class: "cover" }, svg));
      animatePaths(svg, st.cover, 0);
    }
    book.append(h("h3", { class: "book-title" }, `《${st.title}》`));
    st.lines.forEach((l, i) => book.append(h("p", { class: "line " + l.who + (i >= (ctx.lines || 0) && ctx.built ? " new" : "") }, l.text)));
    if (st.ending) book.append(h("p", { class: "line ending" }, st.ending), h("p", { class: "the-end" }, "— 完 —"));
    book.append(h("p", { class: "credits" }, `作者：你 & ${name}`));
    ctx.built = true;
    ctx.lines = st.lines.length;
    ctx.phase = st.phase;
    book.scrollTop = st.phase === "done" ? 0 : book.scrollHeight;
  }
  if (ctx.write) {
    const mine = st.turn === "human";
    ctx.write.querySelectorAll("textarea, .btn.blue").forEach((el) => (el.disabled = !mine));
    $("textarea", ctx.write).placeholder = mine ? "接着写一两句…（Ctrl/⌘ + 回车发送）" : `${name} 正在写…`;
  }
}

Object.assign(SCREENS, {
  guesswho: { key: (st) => `${st.mode || "pick"}:${st.phase}:${st.round}`, build: buildGuessWho, update: updateGuessWho },
  idiom: { key: () => "", build: buildIdiom, update: updateIdiom },
  emoji: { key: (st) => `${st.mode || "pick"}:${st.phase}:${st.round}`, build: buildEmoji, update: updateEmoji },
  story: { key: (st) => st.phase, build: buildStory, update: updateStory },
});
