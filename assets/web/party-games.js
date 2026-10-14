"use strict";
/* 谁是卧底 / 骰子冒险. Uses helpers from app.js and more-games.js. */

/* ---------- 谁是卧底 ---------- */

function buildUndercover(stage) {
  gameBar(stage, "谁是卧底");
  const st = snap.state;
  const me = st.players[0];
  stage.append(h("div", { class: "my-card" },
    h("span", { class: "my-card-label" }, "你的词"), h("b", {}, me.word),
    h("span", { class: "my-card-tip" }, "大家拿到的词里有一个人不一样，可能就是你哦")));
  ctx.phaseLine = h("p", { class: "sub phase-line" });
  ctx.seats = h("div", { class: "seats" });
  stage.append(ctx.phaseLine, ctx.seats);
  if (st.phase === "done") {
    ctx.done = h("div", { class: "row", style: "flex-direction:column;margin-top:12px" });
    stage.append(ctx.done);
  } else {
    ctx.form = inputForm("用一句话描述你的词（别说出词本身）", "说完了", (t) => act("describe", { text: t }), { max: 40, width: "min(64vw, 360px)" });
    stage.append(ctx.form);
  }
  ctx.history = h("div", { class: "uc-history" });
  stage.append(ctx.history);
}

function updateUndercover() {
  const st = snap.state;
  const me = st.players[0];
  const descs = Object.fromEntries(st.descs.map((d) => [d.name, d.text]));
  const voting = st.phase === "vote" && me.alive && !st.votes["你"];
  ctx.phaseLine.textContent = st.phase === "done" ? "游戏结束" :
    st.phase === "describe" ? `第 ${st.round} 轮 · 描述环节 · 轮到「${st.turn}」` :
    voting ? `第 ${st.round} 轮 · 点一个你怀疑的玩家投票` : `第 ${st.round} 轮 · 等大家投票…`;
  ctx.seats.innerHTML = "";
  for (const p of st.players) {
    const voted = st.phase === "vote" && st.votes[p.name];
    const canPick = voting && !p.human && p.alive;
    const seat = h("div", { class: "seat" + (p.alive ? "" : " out") + (st.turn === p.name ? " active" : "") + (canPick ? " pickable" : ""),
      onclick: canPick ? () => act("vote", { target: p.name }) : null },
      h("div", { class: "seat-face" }, icon(CRITTER[p.name] || "you")),
      h("div", { class: "seat-name" }, p.name),
      p.spy === true ? h("span", { class: "badge spy" }, "卧底") : p.spy === false && !p.alive ? h("span", { class: "badge civ" }, "平民") : null,
      st.phase === "done" ? h("div", { class: "seat-word" }, p.word) : null,
      descs[p.name] ? h("div", { class: "seat-say" }, descs[p.name]) :
        st.phase === "describe" && st.turn === p.name ? h("div", { class: "seat-say typing-say" }, p.human ? "等你描述…" : "思考中…") : null,
      voted ? h("div", { class: "seat-voted" }, "已投票") : null);
    ctx.seats.append(seat);
  }
  if (ctx.form) {
    const mine = st.phase === "describe" && st.turn === "你";
    ctx.form.style.display = mine ? "" : "none";
    if (mine && document.activeElement === document.body) $("input", ctx.form).focus();
  }
  ctx.history.innerHTML = "";
  if (st.last_out && st.phase !== "done") {
    ctx.history.append(h("div", { class: "notice" }, st.last_out.name
      ? `上一轮 ${st.last_out.name} 被投出局，TA 是${st.last_out.spy ? "卧底！" : "平民"}`
      : `上一轮平票（${st.last_out.tie.join("、")}），没有人出局`));
  }
  if (st.history.length) {
    const det = h("details", {}, h("summary", {}, "之前的发言和投票"));
    st.history.forEach((r) => det.append(h("div", { class: "uc-round" },
      h("b", {}, `第 ${r.round} 轮`),
      ...r.descs.map((d) => h("div", {}, `${d.name}：${d.text}`)),
      h("div", { class: "uc-votes" }, "投票：" + Object.entries(r.votes).map(([a, b]) => `${a}→${b}`).join("，") + (r.out ? `，${r.out} 出局` : "，平票")))));
    ctx.history.append(det);
  }
  if (ctx.done) {
    ctx.done.innerHTML = "";
    const won = (st.winner === "spy") === !!me.spy;
    ctx.done.append(
      h("div", { class: "answer-big" }, st.winner === "spy" ? "卧底获胜！" : "平民获胜！"),
      h("p", { class: "sub" }, `平民词「${st.words.civilian}」 · 卧底词「${st.words.spy}」 · ${won ? "你赢啦！" : "你输了，再来一局？"}`),
      h("button", { class: "btn blue", onclick: () => act("restart") }, "再来一局"));
  }
}

/* ---------- 骰子冒险 ---------- */
const CLASS_INFO = [
  ["战士", "sword", "力量", 14, "皮糙肉厚，推石头、打怪兽都靠一身力气"],
  ["盗贼", "dagger", "敏捷", 11, "身手灵活，开锁、潜行、躲陷阱"],
  ["法师", "orb", "智力", 9, "懂魔法和古老知识，就是身子骨弱"],
  ["吟游诗人", "lute", "魅力", 10, "能说会唱，靠一张嘴化解危机"],
];

function buildAdventure(stage) {
  gameBar(stage, "骰子冒险");
  const st = snap.state, name = snap.agent_name;
  if (st.phase === "create") {
    let cls = "";
    const grid = h("div", { class: "class-grid" });
    const draw = () => {
      grid.innerHTML = "";
      for (const [c, ic, skill, hp, desc] of CLASS_INFO)
        grid.append(h("div", { class: "class-card" + (c === cls ? " on" : ""), onclick: () => { cls = c; draw(); } },
          h("div", { class: "class-icon" }, icon(ic)), h("h3", {}, c),
          h("div", { class: "class-stats" }, `擅长 ${skill} · 生命 ${hp}`), h("p", {}, desc)));
    };
    draw();
    const input = h("input", { class: "text-in", placeholder: "给你的角色起个名字", maxlength: 12 });
    stage.append(h("h2", { class: "title" }, "创建你的冒险者"),
      h("p", { class: "sub" }, `${name} 会当主持人，用擅长的属性检定时骰子 +3`), grid,
      h("div", { class: "row", style: "margin-top:14px" }, input,
        h("button", { class: "btn blue", onclick: () => {
          if (!cls) return toast("先选一个职业");
          act("hero", { cls, name: input.value.trim() });
        } }, "出发！")));
    return;
  }
  if (st.phase === "intro") return waiting(stage, "map", `${name} 正在铺开地图…`);
  ctx.hero = h("aside", { class: "hero-card" });
  ctx.scene = h("h3", { class: "scene-title" });
  ctx.log = h("div", { class: "adv-log" });
  ctx.choices = h("div", { class: "choices" });
  ctx.dice = h("div", { class: "dice-box" });
  const main = h("div", { class: "adv-main" }, ctx.scene, ctx.log, ctx.dice, ctx.choices);
  if (st.phase === "play") {
    ctx.form = inputForm("或者自己说要做什么…", "行动", (t) => act("act", { text: t }), { max: 120, width: "min(56vw, 340px)" });
    main.append(ctx.form);
  } else {
    ctx.done = h("div", { class: "row", style: "flex-direction:column;margin-top:10px" });
    main.append(ctx.done);
  }
  stage.append(h("div", { class: "adv" }, ctx.hero, main));
}

function heartBar(hp, max) {
  const pct = Math.max(0, Math.min(100, hp / max * 100));
  return h("div", { class: "hp" }, h("div", { class: "hp-fill" + (pct <= 30 ? " low" : ""), style: `width:${pct}%` }), h("span", {}, `${hp} / ${max}`));
}

function updateAdventure() {
  const st = snap.state, name = snap.agent_name;
  if (!ctx.hero) return;
  const hr = st.hero;
  ctx.hero.innerHTML = "";
  ctx.hero.append(h("div", { class: "hero-icon" }, icon(CLASS_ICON[hr.cls])), h("div", { class: "hero-name" }, hr.name),
    h("div", { class: "sub", style: "margin:0" }, `${hr.cls} · 擅长${hr.skill}`),
    h("div", { class: "hero-label" }, "生命"), heartBar(hr.hp, hr.maxhp),
    h("div", { class: "hero-label" }, icon("coin"), `金币 ${hr.gold}`),
    h("div", { class: "hero-label" }, icon("bag"), "背包"),
    h("div", { class: "chips" }, ...(hr.items.length ? hr.items.map((i) => h("span", { class: "chip" }, i)) : [h("span", { class: "sub" }, "空空如也")])));
  ctx.scene.innerHTML = "";
  if (st.scene) ctx.scene.append(icon("pin"), st.scene);
  const n = ctx.logN || 0;
  if (st.log.length !== n) {
    ctx.log.innerHTML = "";
    st.log.forEach((e, i) => ctx.log.append(h("div", { class: `entry ${e.kind}` + (e.ok === true ? " ok" : e.ok === false ? " bad" : "") + (i >= n && n ? " new" : "") },
      e.kind === "scene" && e.title ? h("b", {}, e.title) : null,
      e.kind === "action" ? `${hr.name}：${e.text}` : e.text)));
    ctx.logN = st.log.length;
    ctx.log.scrollTop = ctx.log.scrollHeight;
  }
  ctx.choices.innerHTML = "";
  if (st.phase === "play" && !st.check)
    st.choices.forEach((c) => ctx.choices.append(h("button", { class: "btn ghost choice", onclick: () => act("act", { text: c }) }, c)));
  ctx.dice.innerHTML = "";
  if (st.check) {
    const face = h("div", { class: "d20" }, "20");
    const btn = h("button", { class: "btn butter big", onclick: async () => {
      btn.disabled = true;
      face.classList.add("rolling");
      const tick = setInterval(() => (face.textContent = 1 + Math.floor(Math.random() * 20)), 70);
      await sleep(900);
      clearInterval(tick);
      act("roll");
    } }, "掷骰子！");
    ctx.dice.append(face, h("div", {}, h("div", { class: "check-title" }, `${st.check.reason}`),
      h("div", { class: "sub", style: "margin:4px 0 10px" }, `${st.check.skill}检定，需要 ${st.check.dc} 或以上${st.check.skill === hr.skill ? "（你擅长，+3）" : ""}`), btn));
  } else if (st.roll && st.roll.n !== ctx.rollShown) {
    ctx.rollShown = st.roll.n;
    const r = st.roll;
    const face = h("div", { class: "d20 " + (r.ok ? "ok" : "bad") }, r.die);
    ctx.dice.append(face, h("div", { class: "check-title" }, r.ok ? (r.die === 20 ? "大成功！" : "成功！") : (r.die === 1 ? "大失败…" : "失败…")));
    clearTimeout(ctx.diceT);
    ctx.diceT = setTimeout(() => { if (ctx.dice) ctx.dice.innerHTML = ""; }, 4000);
  }
  if (ctx.form) ctx.form.style.display = st.check ? "none" : "";
  if (ctx.done) {
    ctx.done.innerHTML = "";
    ctx.done.append(h("div", { class: "answer-big" }, st.result === "win" ? "冒险成功！" : "冒险失败"),
      h("button", { class: "btn blue", onclick: () => act("restart") }, "再冒险一次"));
  }
}

Object.assign(SCREENS, {
  undercover: { key: (st) => (st.phase === "done" ? "done" : "play") + ":" + (st.words ? 1 : 0) + ":" + (st.players || [])[0]?.word, build: buildUndercover, update: updateUndercover },
  adventure: { key: (st) => st.phase, build: buildAdventure, update: updateAdventure },
});
