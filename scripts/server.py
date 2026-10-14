#!/usr/bin/env python3
"""Local game server for AI GameBox. Standard library only.

The server owns all game state and judging. The human talks to it through the
web page; the agent talks to it through scripts/game.py. Secrets the agent must
not see (e.g. the word the human is drawing) stay in this process's memory.
"""
import argparse
import base64
import json
import os
import random
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "assets" / "web"
HOME = Path(os.environ.get("AI_GAMEBOX_HOME", Path.home() / ".ai-gamebox"))

BOARD = 15
COLS = "ABCDEFGHIJKLMNO"
GAMES = {"soup": "海龟汤", "drawguess": "你画我猜", "gomoku": "五子棋",
         "guesswho": "猜人物", "idiom": "成语接龙", "emoji": "Emoji 猜词", "story": "故事接龙",
         "undercover": "谁是卧底", "adventure": "骰子冒险"}
MOODS = {"happy", "smug", "sad", "surprised", "thinking", "love", "normal"}
WORD_BANK = [
    "苹果", "猫咪", "雨伞", "太阳", "冰淇淋", "长颈鹿", "蜗牛", "火箭", "西瓜", "蛋糕",
    "彩虹", "企鹅", "灯泡", "眼镜", "雪人", "蝴蝶", "城堡", "汉堡", "月亮", "钢琴",
    "热气球", "章鱼", "仙人掌", "风筝", "小狗", "兔子", "蘑菇", "帆船", "闹钟", "向日葵",
]
IDLE_EXIT_SECONDS = 3 * 3600
MODE_CN = {"ai_draws": "你画对方猜", "human_draws": "对方画你猜", "ai_thinks": "你想人物对方猜",
           "human_thinks": "对方想人物你猜", "ai_sets": "你出 emoji 题对方猜", "human_sets": "对方出 emoji 题你猜"}


def now():
    return time.time()


class Game:
    def __init__(self, agent_name, human_name):
        self.lock = threading.Condition()
        self.agent_name = agent_name
        self.human_name = human_name
        self.setup_done = False
        self.agent_look = "cat"
        self.log = []          # every event, in order
        self.seq = 0
        self.version = 0
        self.chat = []         # public chat history
        self.mood = "happy"
        self.game = None       # None = lobby
        self.state = {}
        self.secret = None     # word only the server (and one player) may know
        self.agent_cursor = 0
        self.unanswered = []   # human chat lines the agent hasn't replied to yet
        self.agent_waiting = 0
        self.agent_last_seen = None
        self.last_request = now()
        self.drawings = HOME / "drawings"

    # ---- events -------------------------------------------------------
    def emit(self, who, type_, **data):
        self.seq += 1
        ev = {"seq": self.seq, "ts": now(), "who": who, "type": type_, **data}
        self.log.append(ev)
        if len(self.log) > 2000:
            self.log = self.log[-1000:]
        self.version += 1
        self.lock.notify_all()
        return ev

    def add_chat(self, who, text, **extra):
        msg = {"id": self.seq + 1, "who": who, "text": text, "ts": now(), **extra}
        self.chat.append(msg)
        self.chat = self.chat[-300:]
        return msg

    def touch(self):
        self.version += 1
        self.lock.notify_all()

    # ---- game setup ---------------------------------------------------
    def start_game(self, game, who):
        if game not in GAMES:
            raise ValueError(f"未知游戏：{game}，可选 {', '.join(GAMES)}")
        self.game = game
        self.secret = None
        if game == "gomoku":
            self.state = {
                "board": [[0] * BOARD for _ in range(BOARD)],
                "turn": "human", "human_stone": 1, "winner": None,
                "last": None, "moves": 0,
            }
        elif game == "drawguess":
            self.state = {"phase": "pick", "mode": None, "paths": [], "draw_id": 0,
                          "hint": None, "word_len": None, "guesses": [],
                          "revealed": None, "solved": False, "round": 0,
                          "image_id": 0, "suggestions": random.sample(WORD_BANK, 3)}
        elif game == "soup":
            self.state = {"title": None, "story": None, "answers": {},
                          "revealed": None, "count": 0}
        elif game == "guesswho":
            self.state = {"phase": "pick", "mode": None, "round": 0, "questions": [],
                          "category": None, "guesses": [], "revealed": None,
                          "solved": False, "max": 20}
        elif game == "idiom":
            self.state = {"chain": [], "turn": "human", "hearts": {"human": 3, "agent": 3},
                          "winner": None, "need": None, "notice": None}
        elif game == "emoji":
            self.state = {"phase": "pick", "mode": None, "round": 0, "puzzle": None,
                          "category": None, "hint": None, "guesses": [], "revealed": None,
                          "solved": False, "word_len": None, "score": {"human": 0, "agent": 0}}
        elif game == "story":
            self.state = {"phase": "theme", "theme": None, "title": None, "lines": [],
                          "turn": None, "ending": None, "cover": [], "end_requested": False}
        elif game == "undercover":
            self.state = {}
            uc_new(self.state)
        elif game == "adventure":
            self.state = {"phase": "create", "hero": None, "scene": None, "log": [], "choices": [],
                          "check": None, "roll": None, "result": None}
        self.emit(who, "game_started", game=game)

    def to_lobby(self, who):
        self.game = None
        self.state = {}
        self.secret = None
        self.emit(who, "lobby")

    # ---- public snapshot for the web page ---------------------------
    def agent_status(self):
        if self.agent_waiting > 0:
            return "waiting"
        if self.agent_last_seen is None:
            return "connecting"
        if now() - self.agent_last_seen > 180:
            return "away"
        return "thinking"

    def snapshot(self):
        st = dict(self.state)
        if self.game == "drawguess" and st.get("mode") != "human_draws":
            st.pop("suggestions", None)
        if self.game == "undercover":
            st = uc_public(st)
        return {
            "version": self.version, "seq": self.seq,
            "agent_name": self.agent_name, "human_name": self.human_name, "setup_done": self.setup_done,
            "agent_look": self.agent_look,
            "agent": self.agent_status(), "mood": self.mood,
            "game": self.game, "games": GAMES, "state": st,
            "chat": self.chat[-150:],
        }

    # ---- text summary for the agent ----------------------------------
    def board_text(self):
        b = self.state["board"]
        hs = self.state["human_stone"]
        mark = {0: "·", hs: "X", 3 - hs: "O"}
        lines = ["    " + " ".join(COLS)]
        for r in range(BOARD - 1, -1, -1):
            lines.append(f"{r + 1:>2}  " + " ".join(mark[b[r][c]] for c in range(BOARD)))
        return "\n".join(lines)

    def agent_view(self):
        g = self.game
        out = [f"你在游戏里的名字：{self.agent_name}；对方叫：{self.human_name}"]
        if self.unanswered:
            said = " / ".join(f"「{x}」" for x in self.unanswered)
            out.insert(0, f"【先回复聊天】对方说了 {said}，你还没回 → 马上 `game.py say \"...\"` 回应，然后再继续游戏。")
        if g is None:
            out.append("当前在游戏大厅，等对方选游戏（也可以用 `game.py play <游戏>` 帮对方开一局）。")
            return out
        out.append(f"当前游戏：{GAMES[g]}（{g}）")
        s = self.state
        if g == "gomoku":
            out.append("棋盘（X=对方，O=你）：")
            out.append(self.board_text())
            if s["last"]:
                out.append(f"最后一手：{s['last']['who_cn']} {s['last']['pos']}")
            if s["winner"]:
                out.append(f"对局结束，胜者：{ {'human': '对方', 'agent': '你', 'draw': '平局'}[s['winner']] }")
                out.append("下一步：聊聊这局，问要不要再来（`game.py play gomoku` 开新局）。")
            elif s["turn"] == "agent":
                out.append("轮到你了 → `game.py move <坐标>`，例如 `game.py move H8`。")
            else:
                out.append("轮到对方落子，继续 `game.py wait`。")
        elif g == "drawguess":
            out.append(f"阶段：{s['phase']}，模式：{s['mode'] or '未选'}")
            if s["phase"] == "pick":
                out.append("等对方选择模式：ai_draws（你画对方猜）或 human_draws（对方画你猜）。")
            elif s["mode"] == "ai_draws":
                if s["phase"] == "drawing":
                    out.append("轮到你出题作画 → 想一个词，`game.py draw --word <词> --paths <文件或->`。")
                elif s["phase"] == "guessing":
                    out.append(f"对方正在猜你的画（答案是你出的词）。已猜：{', '.join(s['guesses']) or '无'}")
                    out.append("可以 `game.py hint <提示>`、`game.py add-paths` 补几笔，或 `game.py reveal` 公布答案。")
                else:
                    out.append(f"本轮结束，答案：{s['revealed']}。问对方要不要再来一轮。")
            elif s["mode"] == "human_draws":
                if s["phase"] == "guessing":
                    out.append(f"对方画好了，图片：{s.get('image_path')}。看图后 `game.py guess <词>`。"
                               f"词长 {s['word_len']} 个字。已猜：{', '.join(s['guesses']) or '无'}")
                elif s["phase"] == "drawing":
                    out.append("对方正在画，继续 `game.py wait`。")
                else:
                    out.append(f"本轮结束，答案：{s['revealed']}。")
        elif g == "soup":
            if not s["story"]:
                out.append("还没出题 → `game.py soup --title <标题> --story <汤面>`，汤底自己记住，不要说出来。")
            elif s["revealed"]:
                out.append("汤底已揭晓，本局结束。")
            else:
                out.append(f"题目《{s['title']}》，已回答 {s['count']} 个问题。")
                out.append("对方每个提问 → `game.py answer yes|no|irrelevant|partly [补充一句]`；"
                           "猜中核心或对方放弃 → `game.py reveal <汤底>`。")
        elif g in EXTRA:
            out += EXTRA[g]["view"](s)
        return out


GAME: Game = None
TOKENS = {"agent": "", "web": ""}


PROFILE = HOME / "profile.json"
LOOKS = ("cat", "bunny", "bear", "dog", "robot")


def load_profile():
    try:
        return json.loads(PROFILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_profile():
    try:
        HOME.mkdir(parents=True, exist_ok=True)
        PROFILE.write_text(json.dumps({"agent_name": GAME.agent_name, "human_name": GAME.human_name,
                                       "setup_done": GAME.setup_done, "agent_look": GAME.agent_look}, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def save_name(name):
    save_profile()


def human_move(x, y):
    s = GAME.state
    if s["winner"]:
        raise ValueError("这局已经结束啦")
    if s["turn"] != "human":
        raise ValueError("还没轮到你哦")
    place(x, y, "human")


def place(x, y, who):
    s = GAME.state
    if not (0 <= x < BOARD and 0 <= y < BOARD):
        raise ValueError("坐标超出棋盘")
    if s["board"][y][x]:
        raise ValueError(f"{COLS[x]}{y + 1} 已经有棋子了")
    stone = s["human_stone"] if who == "human" else 3 - s["human_stone"]
    s["board"][y][x] = stone
    s["moves"] += 1
    pos = f"{COLS[x]}{y + 1}"
    s["last"] = {"x": x, "y": y, "pos": pos, "who": who,
                 "who_cn": "对方" if who == "human" else "你"}
    GAME.emit(who, "move", pos=pos, x=x, y=y)
    line = five(s["board"], x, y, stone)
    if line:
        s["winner"] = who
        s["line"] = line
        GAME.emit("system", "game_over", winner=who)
    elif s["moves"] >= BOARD * BOARD:
        s["winner"] = "draw"
        GAME.emit("system", "game_over", winner="draw")
    else:
        s["turn"] = "agent" if who == "human" else "human"


def five(b, x, y, stone):
    for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
        cells = [(x, y)]
        for sign in (1, -1):
            cx, cy = x + dx * sign, y + dy * sign
            while 0 <= cx < BOARD and 0 <= cy < BOARD and b[cy][cx] == stone:
                cells.append((cx, cy))
                cx += dx * sign
                cy += dy * sign
        if len(cells) >= 5:
            return cells
    return None


def parse_pos(pos):
    pos = pos.strip().upper()
    if len(pos) < 2 or pos[0] not in COLS or not pos[1:].isdigit():
        raise ValueError("坐标格式应为 列字母+行号，例如 H8")
    return COLS.index(pos[0]), int(pos[1:]) - 1


def norm(w):
    return "".join(ch for ch in str(w).lower() if ch.isalnum())


def handle_human(action, d):
    g, s = GAME.game, GAME.state
    if action == "chat":
        text = str(d.get("text", "")).strip()[:500]
        if not text:
            raise ValueError("说点什么吧")
        msg = GAME.add_chat("human", text)
        GAME.unanswered = (GAME.unanswered + [text])[-5:]
        GAME.emit("human", "chat", text=text, chat_id=msg["id"])
    elif action == "choose_game":
        GAME.start_game(d.get("game"), "human")
    elif action in ("rename", "setup"):
        name = str(d.get("name", "")).strip()[:12]
        me = str(d.get("human_name", "")).strip()[:12]
        if not name or (action == "setup" and not me):
            raise ValueError("两个名字都要填哦")
        old_me = GAME.human_name
        GAME.agent_name = name
        if me:
            GAME.human_name = me
        if d.get("look") in LOOKS:
            GAME.agent_look = d["look"]
        GAME.setup_done = True
        save_profile()
        GAME.emit("human", "rename", name=name, human_name=GAME.human_name,
                  human_changed=GAME.human_name != old_me)
    elif action == "lobby":
        GAME.to_lobby("human")
    elif action == "restart":
        GAME.start_game(g, "human")
    elif g == "gomoku" and action == "move":
        human_move(int(d["x"]), int(d["y"]))
    elif g == "drawguess" and action == "mode":
        mode = d.get("mode")
        if mode not in ("ai_draws", "human_draws"):
            raise ValueError("未知模式")
        s.update(mode=mode, phase="drawing", paths=[], hint=None, guesses=[],
                 revealed=None, solved=False, word_len=None)
        s["round"] += 1
        GAME.secret = None
        if mode == "human_draws":
            s["suggestions"] = random.sample(WORD_BANK, 3)
        GAME.emit("human", "mode", mode=mode)
    elif g == "drawguess" and action == "pick_word":
        word = str(d.get("word", "")).strip()[:12]
        if not word:
            raise ValueError("先选一个词")
        GAME.secret = word
        s["word_len"] = len(word)
        s["my_word"] = word   # only shown to the human page
        GAME.touch()
    elif g == "drawguess" and action == "submit_drawing":
        if not GAME.secret:
            raise ValueError("先选一个要画的词")
        data = str(d.get("image", ""))
        if "," in data:
            data = data.split(",", 1)[1]
        raw = base64.b64decode(data)
        GAME.drawings.mkdir(parents=True, exist_ok=True)
        s["image_id"] += 1
        path = GAME.drawings / f"drawing-{int(now())}-{s['image_id']}.png"
        path.write_bytes(raw)
        s["image_path"] = str(path)
        s["phase"] = "guessing"
        GAME.emit("human", "drawing", image=str(path), word_len=s["word_len"])
    elif g == "drawguess" and action == "guess":
        if s.get("mode") != "ai_draws" or s.get("phase") != "guessing":
            raise ValueError("现在不是猜的时候")
        guess = str(d.get("text", "")).strip()[:20]
        s["guesses"].append(guess)
        if GAME.secret and norm(guess) and norm(guess) == norm(GAME.secret):
            s.update(solved=True, revealed=GAME.secret, phase="done")
            GAME.emit("human", "guess", text=guess, correct=True)
        else:
            GAME.emit("human", "guess", text=guess, correct=False)
    elif g == "drawguess" and action == "giveup":
        if s.get("phase") == "guessing" and s.get("mode") == "ai_draws":
            s.update(revealed=GAME.secret, phase="done")
            GAME.emit("human", "giveup", word=GAME.secret)
    elif g in EXTRA:
        EXTRA[g]["human"](action, d, s)
    else:
        raise ValueError(f"现在不能这样操作：{action}")


def handle_agent(action, d):
    g, s = GAME.game, GAME.state
    if action == "say":
        text = str(d.get("text", "")).strip()[:1000]
        mood = d.get("mood")
        if mood in MOODS:
            GAME.mood = mood
        if text:
            GAME.unanswered = []
            alias = str(d.get("as") or "").strip()[:12]
            msg = GAME.add_chat("agent", text, **({"name": alias} if alias else {}))
            GAME.emit("agent", "chat", text=text, chat_id=msg["id"])
        else:
            GAME.touch()
    elif action == "play":
        GAME.start_game(d.get("game"), "agent")
    elif action == "rename":
        GAME.agent_name = txt(d, "name", 12)
        save_name(GAME.agent_name)
        GAME.emit("agent", "rename", name=GAME.agent_name)
    elif action == "lobby":
        GAME.to_lobby("agent")
    elif g == "gomoku" and action == "move":
        if s["winner"]:
            raise ValueError("这局已经结束了，用 `game.py play gomoku` 开新局")
        if s["turn"] != "agent":
            raise ValueError("还没轮到你，继续 `game.py wait`")
        x, y = parse_pos(d.get("pos", ""))
        place(x, y, "agent")
    elif g == "drawguess" and action == "draw":
        if s.get("mode") != "ai_draws":
            raise ValueError("现在不是你作画的回合（模式需要是 ai_draws）")
        word = str(d.get("word", "")).strip()
        if not word:
            raise ValueError("需要 --word 指定答案（对方看不到）")
        paths = clean_paths(d.get("paths"))
        GAME.secret = word
        s.update(paths=paths, phase="guessing", word_len=len(word), guesses=[],
                 solved=False, revealed=None, hint=None)
        s["draw_id"] += 1
        GAME.emit("agent", "draw", strokes=len(paths))
    elif g == "drawguess" and action == "add_paths":
        if s.get("mode") != "ai_draws" or s.get("phase") != "guessing":
            raise ValueError("现在不能补笔")
        s["paths"] = s["paths"] + clean_paths(d.get("paths"))
        s["draw_id"] += 1
        GAME.emit("agent", "draw", strokes=len(s["paths"]), added=True)
    elif g == "drawguess" and action == "hint":
        s["hint"] = str(d.get("text", ""))[:60]
        GAME.emit("agent", "hint", text=s["hint"])
    elif g == "drawguess" and action == "guess":
        if s.get("mode") != "human_draws" or s.get("phase") != "guessing":
            raise ValueError("现在不是你猜的时候")
        guess = str(d.get("text", "")).strip()[:20]
        s["guesses"].append(guess)
        correct = bool(GAME.secret) and norm(guess) == norm(GAME.secret)
        if correct:
            s.update(solved=True, revealed=GAME.secret, phase="done")
        GAME.emit("agent", "guess", text=guess, correct=correct)
        return {"correct": correct}
    elif g == "drawguess" and action == "reveal":
        s.update(revealed=GAME.secret, phase="done")
        GAME.emit("agent", "reveal", word=GAME.secret)
    elif g == "soup" and action == "soup":
        s.update(title=str(d.get("title", "海龟汤"))[:40], story=str(d.get("story", ""))[:1500],
                 answers={}, revealed=None, count=0)
        GAME.emit("agent", "soup", title=s["title"])
    elif g == "soup" and action == "answer":
        kind = d.get("kind")
        if kind not in ("yes", "no", "irrelevant", "partly"):
            raise ValueError("answer 只能是 yes / no / irrelevant / partly")
        target = next((m for m in reversed(GAME.chat) if m["who"] == "human"), None)
        if target:
            s["answers"][str(target["id"])] = kind
        s["count"] += 1
        note = str(d.get("text", "")).strip()
        if note:
            GAME.add_chat("agent", note)
        GAME.emit("agent", "answer", kind=kind, chat_id=target["id"] if target else None, text=note)
    elif g == "soup" and action == "reveal":
        s["revealed"] = str(d.get("text", ""))[:2000]
        GAME.emit("agent", "reveal", text=s["revealed"])
    elif g in EXTRA:
        return EXTRA[g]["agent"](action, d, s) or {}
    else:
        raise ValueError(f"当前游戏（{g or '大厅'}）不支持 {action}")
    return {}


def clean_paths(paths):
    if isinstance(paths, str):
        paths = json.loads(paths)
    if isinstance(paths, dict):
        paths = paths.get("paths", [])
    out = []
    for p in paths or []:
        if isinstance(p, str):
            p = {"d": p}
        dpath = str(p.get("d", ""))[:4000]
        if not dpath:
            continue
        out.append({"d": dpath, "color": str(p.get("color", "#4a3b52"))[:20],
                    "width": max(1, min(20, float(p.get("width", 4)))),
                    "fill": str(p.get("fill", "none"))[:20]})
    if not out:
        raise ValueError("paths 为空。格式：[{\"d\": \"M10 10 L50 50\", \"color\": \"#333\"}]，画布 400x300")
    return out[:80]


def agent_events(cursor):
    evs = [e for e in GAME.log if e["seq"] > cursor and e["who"] != "agent"]
    lines = []
    for e in evs:
        t = e["type"]
        if t == "chat":
            lines.append(f"对方说：{e['text']}")
        elif t == "move":
            lines.append(f"对方落子 {e['pos']}")
        elif t == "game_over":
            w = {"human": "对方赢了", "agent": "你赢了", "draw": "平局"}[e["winner"]]
            lines.append(f"对局结束：{w}")
        elif t == "game_started":
            lines.append(f"对方开始了新游戏：{GAMES[e['game']]}。先读 games/{e['game']}.md 的规则。")
        elif t == "lobby":
            lines.append("对方回到了游戏大厅")
        elif t == "mode":
            lines.append(f"对方选择：{MODE_CN.get(e['mode'], '')}（{e['mode']}）")
        elif t == "drawing":
            lines.append(f"对方画好了！图片在 {e['image']}，请打开看图后猜（{e['word_len']} 个字）")
        elif t == "guess":
            lines.append(f"对方猜：{e['text']} → {'猜对了！' if e['correct'] else '不对'}")
        elif t == "giveup":
            lines.append(f"对方放弃了，答案 {e['word']} 已公布")
        elif t in EVENT_TEXT:
            lines.append(EVENT_TEXT[t](e))
        else:
            lines.append(json.dumps(e, ensure_ascii=False))
    return evs, lines


# ---- extra games: guesswho / idiom / emoji / story -----------------------
ANSWER_CN = {"yes": "是", "no": "不是", "unknown": "不知道", "partly": "部分是", "irrelevant": "无关"}


def txt(d, key="text", limit=200):
    v = str(d.get(key, "")).strip()[:limit]
    if not v:
        raise ValueError("内容不能为空")
    return v


def is_cjk(word):
    return all("一" <= ch <= "鿿" for ch in word)


# 猜人物 ---------------------------------------------------------------
def gw_reset(s, mode):
    s.update(mode=mode, phase="setup", questions=[], category=None, guesses=[],
             revealed=None, solved=False)
    s["round"] += 1
    GAME.secret = None


def gw_pending(s, who):
    return next((q for q in reversed(s["questions"]) if q["who"] == who and q["answer"] is None), None)


def gw_human(action, d, s):
    if action == "mode":
        if d.get("mode") not in ("ai_thinks", "human_thinks"):
            raise ValueError("未知模式")
        gw_reset(s, d["mode"])
        GAME.emit("human", "mode", mode=d["mode"])
    elif action == "set_secret":
        if s["mode"] != "human_thinks" or s["phase"] != "setup":
            raise ValueError("现在不能设置答案")
        GAME.secret = txt(d, "secret", 20)
        s["my_secret"] = GAME.secret
        s["category"] = str(d.get("category", "")).strip()[:20] or None
        s["phase"] = "playing"
        GAME.emit("human", "secret_set", category=s["category"])
    elif action == "ask":
        if s["mode"] != "ai_thinks" or s["phase"] != "playing":
            raise ValueError("现在还不能提问")
        if len(s["questions"]) >= s["max"]:
            raise ValueError(f"{s['max']} 个问题用完啦，直接猜吧")
        q = {"id": len(s["questions"]) + 1, "who": "human", "text": txt(d, "text", 120), "answer": None}
        s["questions"].append(q)
        GAME.emit("human", "question", text=q["text"], n=q["id"])
    elif action == "guess":
        if s["mode"] != "ai_thinks" or s["phase"] != "playing":
            raise ValueError("现在不能猜")
        g = txt(d, "text", 20)
        s["guesses"].append(g)
        ok = norm(g) == norm(GAME.secret)
        if ok:
            s.update(solved=True, revealed=GAME.secret, phase="done")
        GAME.emit("human", "guess", text=g, correct=ok)
    elif action == "answer":
        kind = d.get("kind")
        if kind not in ANSWER_CN:
            raise ValueError("未知回答")
        q = gw_pending(s, "agent")
        if not q:
            raise ValueError("TA 还没提问呢")
        q["answer"] = kind
        if q.get("guess") and kind == "yes":
            s.update(solved=True, revealed=GAME.secret, phase="done")
        GAME.emit("human", "answer", kind=kind, question=q["text"], solved=s["solved"])
    elif action in ("giveup", "reveal"):
        if s["phase"] != "playing":
            raise ValueError("现在不能揭晓")
        s.update(revealed=GAME.secret, phase="done")
        GAME.emit("human", "giveup", word=GAME.secret)
    else:
        raise ValueError(f"猜人物里不能 {action}")


def gw_agent(action, d, s):
    if action == "think":
        if s["mode"] != "ai_thinks" or s["phase"] != "setup":
            raise ValueError("现在不是你出题的时候（需要对方先选“TA 想我猜”）")
        GAME.secret = txt(d, "secret", 20)
        s["category"] = str(d.get("category", "")).strip()[:20] or None
        s["phase"] = "playing"
        GAME.emit("agent", "think", category=s["category"])
    elif action == "answer":
        kind = d.get("kind")
        if kind not in ANSWER_CN:
            raise ValueError("answer 只能是 yes / no / unknown / partly / irrelevant")
        q = gw_pending(s, "human")
        if not q:
            raise ValueError("对方没有待回答的问题")
        q["answer"] = kind
        note = str(d.get("text", "")).strip()
        if note:
            q["note"] = note[:80]
        GAME.emit("agent", "answer", kind=kind)
    elif action == "accept":
        if s["mode"] != "ai_thinks" or not s["guesses"]:
            raise ValueError("对方还没猜")
        s.update(solved=True, revealed=GAME.secret, phase="done")
        GAME.emit("agent", "accept")
    elif action == "reveal":
        s.update(revealed=GAME.secret, phase="done")
        GAME.emit("agent", "reveal", word=GAME.secret)
    elif action in ("ask", "guess"):
        if s["mode"] != "human_thinks" or s["phase"] != "playing":
            raise ValueError("现在不是你提问的时候（需要“我想 TA 猜”模式，且对方已经想好）")
        if gw_pending(s, "agent"):
            raise ValueError("上一个问题对方还没回答，继续 `game.py wait`")
        text = txt(d, "text", 120)
        if action == "guess":
            if norm(text) == norm(GAME.secret):
                s["questions"].append({"id": len(s["questions"]) + 1, "who": "agent", "guess": True,
                                       "text": f"是「{text}」吗？", "answer": "yes"})
                s.update(solved=True, revealed=GAME.secret, phase="done")
                GAME.emit("agent", "guess", text=text, correct=True)
                return {"correct": True}
            s["questions"].append({"id": len(s["questions"]) + 1, "who": "agent", "guess": True,
                                   "text": f"是「{text}」吗？", "answer": None})
        else:
            s["questions"].append({"id": len(s["questions"]) + 1, "who": "agent", "text": text, "answer": None})
        GAME.emit("agent", "question", text=text)
    else:
        raise ValueError(f"猜人物里不能 {action}")


def gw_view(s):
    out = [f"模式：{s['mode'] or '未选'}，阶段：{s['phase']}，分类：{s['category'] or '未说明'}"]
    if s["phase"] == "pick":
        out.append("等对方选模式：ai_thinks（你想人物对方猜）或 human_thinks（对方想你猜）。")
    elif s["mode"] == "ai_thinks":
        if s["phase"] == "setup":
            out.append("轮到你想一个人物/角色 → `game.py think --secret <答案> --category <分类>`")
        elif s["phase"] == "playing":
            left = s["max"] - len(s["questions"])
            q = gw_pending(s, "human")
            out.append(f"对方还能问 {left} 个问题。已猜：{', '.join(s['guesses']) or '无'}")
            if q:
                out.append(f"待回答：「{q['text']}」 → `game.py answer yes|no|unknown|partly|irrelevant [补充]`")
            out.append("对方猜的是同一个人只是叫法不同 → `game.py accept`；想公布 → `game.py reveal`")
        else:
            out.append(f"本轮结束，答案：{s['revealed']}。")
    else:
        if s["phase"] == "setup":
            out.append("对方正在想人物，继续 `game.py wait`。")
        elif s["phase"] == "playing":
            hist = [f"{q['text']} → {ANSWER_CN.get(q['answer'], '待回答')}" for q in s["questions"] if q["who"] == "agent"]
            out.append("你已问过：" + ("；".join(hist) if hist else "还没问"))
            if gw_pending(s, "agent"):
                out.append("等对方回答，继续 `game.py wait`。")
            else:
                out.append("继续问 → `game.py ask \"是真实存在的人吗？\"`；有把握了 → `game.py guess <人物>`")
        else:
            out.append(f"本轮结束，答案：{s['revealed']}。")
    return out


# 成语接龙 -------------------------------------------------------------
def idiom_play(s, who, word):
    if s["winner"]:
        raise ValueError("这局已经结束啦")
    if s["turn"] != who:
        raise ValueError("还没轮到你" if who == "agent" else "还没轮到你哦")
    word = word.strip()
    if not (2 <= len(word) <= 8) or not is_cjk(word):
        raise ValueError("请输入汉字成语（一般是四个字）")
    if s["need"] and word[0] != s["need"]:
        raise ValueError(f"要以「{s['need']}」开头哦")
    if any(c["word"] == word for c in s["chain"]):
        raise ValueError(f"「{word}」已经用过啦")
    s["chain"].append({"who": who, "word": word})
    s["need"] = word[-1]
    s["turn"] = "agent" if who == "human" else "human"
    s["notice"] = None
    GAME.emit(who, "word", word=word)


def idiom_lose_heart(s, who):
    s["hearts"][who] -= 1
    if s["hearts"][who] <= 0:
        s["winner"] = "agent" if who == "human" else "human"
        GAME.emit("system", "game_over", winner=s["winner"])


def idiom_human(action, d, s):
    if action == "word":
        idiom_play(s, "human", txt(d, "text", 10))
    elif action == "pass":
        if s["winner"] or s["turn"] != "human":
            raise ValueError("还没轮到你哦")
        idiom_lose_heart(s, "human")
        s.update(need=None, turn="agent", notice="你接不上，扣一颗心，由 TA 重新起头")
        GAME.emit("human", "pass")
    elif action == "hint":
        GAME.emit("human", "hint_request", need=s["need"])
    else:
        raise ValueError(f"成语接龙里不能 {action}")


def idiom_agent(action, d, s):
    if action == "word":
        idiom_play(s, "agent", txt(d, "text", 10))
    elif action == "pass":
        if s["winner"] or s["turn"] != "agent":
            raise ValueError("还没轮到你")
        idiom_lose_heart(s, "agent")
        s.update(need=None, turn="human", notice="TA 接不上，扣一颗心，由你重新起头")
        GAME.emit("agent", "pass")
    elif action == "reject":
        if s["turn"] != "agent" or not s["chain"] or s["chain"][-1]["who"] != "human":
            raise ValueError("只能在轮到你时否决对方刚接的词")
        bad = s["chain"].pop()["word"]
        s["need"] = s["chain"][-1]["word"][-1] if s["chain"] else None
        s["turn"] = "human"
        reason = str(d.get("text", "")).strip()[:80]
        s["notice"] = f"「{bad}」不算成语：{reason}" if reason else f"「{bad}」不算成语"
        idiom_lose_heart(s, "human")
        GAME.emit("agent", "reject", word=bad, text=reason)
    else:
        raise ValueError(f"成语接龙里不能 {action}")


def idiom_view(s):
    tail = " → ".join(c["word"] for c in s["chain"][-8:]) or "（还没开始）"
    out = [f"最近的接龙：{tail}",
           f"剩余的心：对方 {s['hearts']['human']}，你 {s['hearts']['agent']}"]
    if s["winner"]:
        out.append("对局结束：" + ("你赢了" if s["winner"] == "agent" else "对方赢了") + "。问对方要不要再来。")
    elif s["turn"] == "agent":
        last = s["chain"][-1] if s["chain"] else None
        if last and last["who"] == "human":
            out.append(f"先检查对方的「{last['word']}」是不是真成语，不是就 `game.py reject \"理由\"`。")
        need = f"以「{s['need']}」开头的" if s["need"] else "任意"
        out.append(f"轮到你接 {need}成语 → `game.py word <成语>`；实在接不上 → `game.py pass`")
    else:
        out.append("轮到对方，继续 `game.py wait`。")
    return out


# Emoji 猜词 -----------------------------------------------------------
def emoji_reset(s, mode):
    s.update(mode=mode, phase="setup", puzzle=None, category=None, hint=None, guesses=[],
             revealed=None, solved=False, word_len=None)
    s.pop("my_answer", None)
    s["round"] += 1
    GAME.secret = None


def emoji_human(action, d, s):
    if action == "mode":
        if d.get("mode") not in ("ai_sets", "human_sets"):
            raise ValueError("未知模式")
        emoji_reset(s, d["mode"])
        GAME.emit("human", "mode", mode=d["mode"])
    elif action == "set_puzzle":
        if s["mode"] != "human_sets" or s["phase"] != "setup":
            raise ValueError("现在不能出题")
        GAME.secret = txt(d, "answer", 20)
        s.update(puzzle=txt(d, "puzzle", 60), category=str(d.get("category", "")).strip()[:20] or None,
                 word_len=len(GAME.secret), phase="guessing", my_answer=GAME.secret)
        GAME.emit("human", "puzzle_set", puzzle=s["puzzle"], category=s["category"], word_len=s["word_len"])
    elif action == "guess":
        if s["mode"] != "ai_sets" or s["phase"] != "guessing":
            raise ValueError("现在不能猜")
        g = txt(d, "text", 20)
        s["guesses"].append(g)
        ok = norm(g) == norm(GAME.secret)
        if ok:
            s.update(solved=True, revealed=GAME.secret, phase="done")
            s["score"]["human"] += 1
        GAME.emit("human", "guess", text=g, correct=ok)
    elif action in ("giveup", "reveal"):
        if s["phase"] != "guessing":
            raise ValueError("现在不能揭晓")
        s.update(revealed=GAME.secret, phase="done")
        GAME.emit("human", "giveup", word=GAME.secret)
    else:
        raise ValueError(f"Emoji 猜词里不能 {action}")


def emoji_agent(action, d, s):
    if action == "emoji":
        if s["mode"] != "ai_sets" or s["phase"] != "setup":
            raise ValueError("现在不是你出题的时候（需要对方先选“TA 出题”）")
        GAME.secret = txt(d, "answer", 20)
        s.update(puzzle=txt(d, "puzzle", 60), category=str(d.get("category", "")).strip()[:20] or None,
                 word_len=len(GAME.secret), phase="guessing")
        GAME.emit("agent", "emoji_set")
    elif action == "hint":
        s["hint"] = txt(d, "text", 60)
        GAME.emit("agent", "hint", text=s["hint"])
    elif action == "accept":
        if s["mode"] != "ai_sets" or not s["guesses"] or s["phase"] != "guessing":
            raise ValueError("对方还没猜")
        s.update(solved=True, revealed=GAME.secret, phase="done")
        s["score"]["human"] += 1
        GAME.emit("agent", "accept")
    elif action == "reveal":
        s.update(revealed=GAME.secret, phase="done")
        GAME.emit("agent", "reveal", word=GAME.secret)
    elif action == "guess":
        if s["mode"] != "human_sets" or s["phase"] != "guessing":
            raise ValueError("现在不是你猜的时候")
        g = txt(d, "text", 20)
        s["guesses"].append(g)
        ok = norm(g) == norm(GAME.secret)
        if ok:
            s.update(solved=True, revealed=GAME.secret, phase="done")
            s["score"]["agent"] += 1
        GAME.emit("agent", "guess", text=g, correct=ok)
        return {"correct": ok}
    else:
        raise ValueError(f"Emoji 猜词里不能 {action}")


def emoji_view(s):
    out = [f"模式：{s['mode'] or '未选'}，阶段：{s['phase']}，比分：对方 {s['score']['human']} : 你 {s['score']['agent']}"]
    if s["phase"] == "pick":
        out.append("等对方选模式：ai_sets（你出题对方猜）或 human_sets（对方出题你猜）。")
    elif s["mode"] == "ai_sets":
        if s["phase"] == "setup":
            out.append("轮到你出题 → `game.py emoji --answer <答案> --puzzle <emoji串> --category <分类>`")
        elif s["phase"] == "guessing":
            out.append(f"题目 {s['puzzle']}，对方已猜：{', '.join(s['guesses']) or '无'}")
            out.append("可以 `game.py hint`；对方说法不同但意思对 → `game.py accept`；公布 → `game.py reveal`")
        else:
            out.append(f"本轮结束，答案：{s['revealed']}。")
    else:
        if s["phase"] == "setup":
            out.append("对方正在出题，继续 `game.py wait`。")
        elif s["phase"] == "guessing":
            out.append(f"题目：{s['puzzle']}（分类：{s['category'] or '未说明'}，{s['word_len']} 个字）。"
                       f"你已猜：{', '.join(s['guesses']) or '无'} → `game.py guess <答案>`")
        else:
            out.append(f"本轮结束，答案：{s['revealed']}。")
    return out


# 故事接龙 -------------------------------------------------------------
def story_human(action, d, s):
    if action == "theme":
        if s["phase"] != "theme":
            raise ValueError("故事已经开始啦")
        s["theme"] = txt(d, "text", 30)
        GAME.emit("human", "theme", text=s["theme"])
    elif action == "line":
        if s["phase"] != "writing" or s["turn"] != "human":
            raise ValueError("还没轮到你写哦")
        s["lines"].append({"who": "human", "text": txt(d, "text", 150)})
        s["turn"] = "agent"
        GAME.emit("human", "line", text=s["lines"][-1]["text"])
    elif action == "request_end":
        if s["phase"] != "writing":
            raise ValueError("故事还没开始")
        s["end_requested"] = True
        GAME.emit("human", "end_request")
    else:
        raise ValueError(f"故事接龙里不能 {action}")


def story_agent(action, d, s):
    if action == "story":
        if s["phase"] != "theme":
            raise ValueError("故事已经开始了")
        s.update(title=txt(d, "title", 30), lines=[{"who": "agent", "text": txt(d, "opening", 300)}],
                 phase="writing", turn="human")
        GAME.emit("agent", "story", title=s["title"])
    elif action == "line":
        if s["phase"] != "writing" or s["turn"] != "agent":
            raise ValueError("还没轮到你，继续 `game.py wait`")
        s["lines"].append({"who": "agent", "text": txt(d, "text", 300)})
        s["turn"] = "human"
        GAME.emit("agent", "line")
    elif action == "end":
        if s["phase"] != "writing":
            raise ValueError("故事还没开始")
        s["ending"] = txt(d, "text", 600)
        if d.get("paths"):
            s["cover"] = clean_paths(d["paths"])
        s.update(phase="done", turn=None)
        GAME.emit("agent", "end")
    else:
        raise ValueError(f"故事接龙里不能 {action}")


def story_view(s):
    if s["phase"] == "theme":
        return [f"对方选的主题：{s['theme'] or '还没选（可以先等，或直接开始）'}",
                "开篇 → `game.py story --title <标题> --opening <开头一两句>`"]
    out = [f"《{s['title']}》，已写 {len(s['lines'])} 段："]
    out += [f"  {'对方' if l['who'] == 'human' else '你'}：{l['text']}" for l in s["lines"][-6:]]
    if s["phase"] == "done":
        out.append("故事已完结。问对方要不要再写一个。")
    elif s["end_requested"]:
        out.append("对方希望收尾了 → `game.py end --text <结局> [--paths 封面笔画]`")
    elif s["turn"] == "agent":
        tip = "（已经很长了，可以考虑写结局 `game.py end`）" if len(s["lines"]) >= 16 else ""
        out.append(f"轮到你续写一两句 → `game.py line \"...\"`{tip}")
    else:
        out.append("轮到对方写，继续 `game.py wait`。")
    return out


# 谁是卧底 -------------------------------------------------------------
WORD_PAIRS = [
    ("牛奶", "豆浆"), ("饺子", "包子"), ("眼镜", "墨镜"), ("火锅", "麻辣烫"), ("可乐", "雪碧"),
    ("蝴蝶", "蜜蜂"), ("雨伞", "雨衣"), ("口红", "唇膏"), ("面条", "米线"), ("钢琴", "电子琴"),
    ("西瓜", "哈密瓜"), ("警察", "保安"), ("微信", "QQ"), ("电影院", "剧场"), ("橙子", "橘子"),
    ("自行车", "电动车"), ("月饼", "汤圆"), ("老虎", "狮子"), ("枕头", "抱枕"), ("奶茶", "咖啡"),
    ("烤鸭", "烧鹅"), ("沙发", "椅子"), ("围巾", "领带"), ("篮球", "排球"), ("台灯", "手电筒"),
    ("饼干", "面包"), ("油条", "麻花"), ("闹钟", "手表"), ("冰箱", "空调"), ("图书馆", "书店"),
]
UC_BOTS = ["阿喵", "豆豆", "布丁"]


def uc_alive(s):
    return [p for p in s["players"] if p["alive"]]


def uc_find(s, name):
    p = next((p for p in s["players"] if p["name"] == str(name).strip()), None)
    if not p:
        raise ValueError(f"没有叫「{name}」的玩家，可选：{'、'.join(x['name'] for x in s['players'])}")
    return p


def uc_new(s):
    civ, spy = random.choice(WORD_PAIRS)
    if random.random() < .5:
        civ, spy = spy, civ
    names = ["你"] + UC_BOTS
    spy_i = random.randrange(len(names))
    s.update(players=[{"name": n, "human": n == "你", "alive": True, "spy": i == spy_i,
                       "word": spy if i == spy_i else civ} for i, n in enumerate(names)],
             round=1, phase="describe", descs=[], votes={}, order=[], turn=None, winner=None,
             history=[], last_out=None, words={"civilian": civ, "spy": spy})
    uc_start_round(s)


def uc_start_round(s):
    alive = [p["name"] for p in uc_alive(s)]
    k = (s["round"] - 1) % len(alive)
    s.update(order=alive[k:] + alive[:k], descs=[], votes={}, phase="describe")
    s["turn"] = s["order"][0]


def uc_describe(s, name, text):
    if s["phase"] != "describe":
        raise ValueError("现在不是描述环节")
    if s["turn"] != name:
        raise ValueError(f"现在轮到「{s['turn']}」描述")
    s["descs"].append({"name": name, "text": text})
    done = len(s["descs"])
    if done >= len(s["order"]):
        s.update(phase="vote", turn=None)
    else:
        s["turn"] = s["order"][done]


def uc_vote(s, voter, target):
    if s["phase"] != "vote":
        raise ValueError("现在不是投票环节")
    v, t = uc_find(s, voter), uc_find(s, target)
    if not v["alive"] or not t["alive"]:
        raise ValueError("出局的玩家不能投票，也不能被投")
    if v is t:
        raise ValueError("不能投自己")
    if v["name"] in s["votes"]:
        raise ValueError(f"「{v['name']}」已经投过了")
    s["votes"][v["name"]] = t["name"]
    if len(s["votes"]) >= len(uc_alive(s)):
        uc_tally(s)


def uc_tally(s):
    count = {}
    for t in s["votes"].values():
        count[t] = count.get(t, 0) + 1
    top = max(count.values())
    leaders = [n for n, c in count.items() if c == top]
    record = {"round": s["round"], "descs": s["descs"], "votes": dict(s["votes"]), "out": None}
    if len(leaders) == 1:
        p = uc_find(s, leaders[0])
        p["alive"] = False
        record["out"] = p["name"]
        s["last_out"] = {"name": p["name"], "spy": p["spy"]}
    else:
        s["last_out"] = {"name": None, "tie": leaders}
    s["history"].append(record)
    spy_alive = any(p["spy"] and p["alive"] for p in s["players"])
    if not spy_alive:
        s["winner"] = "civilian"
    elif len(uc_alive(s)) <= 2:
        s["winner"] = "spy"
    if s["winner"]:
        s["phase"] = "done"
        GAME.emit("system", "uc_over", winner=s["winner"], out=record["out"])
    else:
        s["round"] += 1
        uc_start_round(s)
        GAME.emit("system", "uc_result", out=record["out"], tie=s["last_out"].get("tie"))


def uc_human(action, d, s):
    me = s["players"][0]
    if action == "describe":
        uc_describe(s, "你", txt(d, "text", 40))
        GAME.emit("human", "describe", text=s["descs"][-1]["text"])
    elif action == "vote":
        if not me["alive"]:
            raise ValueError("你已经出局啦，看大家继续吧")
        uc_vote(s, "你", d.get("target"))
        GAME.emit("human", "uc_vote", target=d.get("target"))
    else:
        raise ValueError(f"谁是卧底里不能 {action}")


def uc_agent(action, d, s):
    if action == "describe":
        name = str(d.get("name", "")).strip()
        p = uc_find(s, name)
        if p["human"]:
            raise ValueError("你只能替 AI 玩家描述")
        uc_describe(s, p["name"], txt(d, "text", 40))
        GAME.emit("agent", "describe", name=p["name"])
    elif action == "vote":
        v = uc_find(s, d.get("name", ""))
        if v["human"]:
            raise ValueError("你只能替 AI 玩家投票")
        uc_vote(s, v["name"], d.get("target"))
        GAME.emit("agent", "uc_vote", name=v["name"])
    else:
        raise ValueError(f"谁是卧底里不能 {action}")


def uc_view(s):
    out = [f"第 {s['round']} 轮。你扮演的 AI 玩家和他们拿到的词（对方看不到）："]
    for p in s["players"][1:]:
        out.append(f"  {p['name']}：「{p['word']}」{'' if p['alive'] else '（已出局）'}")
    out.append("“你”这个玩家是真人对方。每个 AI 只能根据自己的词发言和推理，不要利用你同时知道几个人的词这件事。")
    if s["descs"]:
        out.append("本轮描述：" + "；".join(f"{x['name']}：{x['text']}" for x in s["descs"]))
    for h_ in s["history"][-2:]:
        out.append(f"第 {h_['round']} 轮投票：" + "，".join(f"{a}→{b}" for a, b in h_["votes"].items())
                   + (f"，{h_['out']} 出局" if h_["out"] else "，平票无人出局"))
    if s["phase"] == "done":
        out.append(f"游戏结束：{'平民' if s['winner'] == 'civilian' else '卧底'}获胜。平民词「{s['words']['civilian']}」，卧底词「{s['words']['spy']}」。")
    elif s["phase"] == "describe":
        t = uc_find(s, s["turn"])
        if t["human"]:
            out.append("轮到对方描述，继续 `game.py wait`。")
        else:
            out.append(f"轮到 {t['name']} 描述 → `game.py describe {t['name']} \"一句话描述（不能说出词本身）\"`")
    else:
        todo = [p["name"] for p in uc_alive(s) if not p["human"] and p["name"] not in s["votes"]]
        if todo:
            out.append("投票环节，还没投的 AI：" + "、".join(todo) + " → `game.py vote <投票者> <被投者>`")
        else:
            out.append("AI 都投完了，等对方投票，继续 `game.py wait`。")
    return out


# 骰子冒险 -------------------------------------------------------------
CLASSES = {"战士": ("力量", 14, "⚔️"), "法师": ("智力", 9, "🔮"), "盗贼": ("敏捷", 11, "🗡️"), "吟游诗人": ("魅力", 10, "🎻")}
SKILLS = ("力量", "敏捷", "智力", "魅力")


def adv_log(s, kind, text, **extra):
    s["log"].append({"kind": kind, "text": text, **extra})
    s["log"] = s["log"][-80:]


def adv_human(action, d, s):
    if action == "hero":
        if s["phase"] != "create":
            raise ValueError("角色已经创建好了")
        cls = d.get("cls")
        if cls not in CLASSES:
            raise ValueError("请选择职业")
        skill, hp, icon = CLASSES[cls]
        s["hero"] = {"name": str(d.get("name", "")).strip()[:12] or "无名勇者", "cls": cls, "icon": icon,
                     "skill": skill, "hp": hp, "maxhp": hp, "gold": 5, "items": ["面包", "火把"]}
        s["phase"] = "intro"
        GAME.emit("human", "hero_created", name=s["hero"]["name"], cls=cls)
    elif action == "act":
        if s["phase"] != "play":
            raise ValueError("冒险还没开始或已经结束")
        if s["check"]:
            raise ValueError("先掷骰子吧")
        text = txt(d, "text", 120)
        adv_log(s, "action", text)
        s["choices"] = []
        GAME.emit("human", "action", text=text)
    elif action == "roll":
        c = s["check"]
        if not c:
            raise ValueError("现在不需要掷骰子")
        die = random.randint(1, 20)
        bonus = 3 if c["skill"] == s["hero"]["skill"] else 0
        total = die + bonus
        ok = die == 20 or (die != 1 and total >= c["dc"])
        s["roll"] = {"die": die, "bonus": bonus, "total": total, "dc": c["dc"], "ok": ok,
                     "skill": c["skill"], "n": s["roll"]["n"] + 1 if s["roll"] else 1}
        adv_log(s, "roll", f"{c['reason']}：{c['skill']}检定，掷出 {die}{f' +{bonus}' if bonus else ''} = {total}（需要 {c['dc']}）→ {'成功' if ok else '失败'}",
                ok=ok)
        s["check"] = None
        GAME.emit("human", "roll", die=die, bonus=bonus, total=total, dc=c["dc"], ok=ok, reason=c["reason"])
    else:
        raise ValueError(f"骰子冒险里不能 {action}")


def adv_agent(action, d, s):
    if action == "scene":
        if s["phase"] not in ("intro", "play"):
            raise ValueError("等对方创建好角色再开始" if s["phase"] == "create" else "冒险已经结束了")
        title = str(d.get("title", "")).strip()[:30]
        text = txt(d, "text", 800)
        if title:
            s["scene"] = title
        s["choices"] = [str(c).strip()[:40] for c in (d.get("choices") or []) if str(c).strip()][:4]
        adv_log(s, "scene", text, title=title)
        s["phase"] = "play"
        GAME.emit("agent", "scene")
    elif action == "check":
        if s["phase"] != "play":
            raise ValueError("冒险还没开始")
        skill = d.get("skill")
        if skill not in SKILLS:
            raise ValueError("skill 只能是 力量/敏捷/智力/魅力")
        dc = int(d.get("dc", 12))
        s["check"] = {"skill": skill, "dc": max(2, min(25, dc)), "reason": str(d.get("reason", "检定")).strip()[:40]}
        s["choices"] = []
        GAME.emit("agent", "check")
    elif action == "hero":
        h_ = s["hero"]
        if not h_:
            raise ValueError("还没有角色")
        notes = []
        if d.get("hp"):
            h_["hp"] = max(0, min(h_["maxhp"], h_["hp"] + int(d["hp"])))
            notes.append(f"生命 {int(d['hp']):+d}")
        if d.get("gold"):
            h_["gold"] = max(0, h_["gold"] + int(d["gold"]))
            notes.append(f"金币 {int(d['gold']):+d}")
        for it in d.get("add") or []:
            h_["items"].append(str(it)[:12])
            notes.append(f"获得 {it}")
        for it in d.get("remove") or []:
            if it in h_["items"]:
                h_["items"].remove(it)
                notes.append(f"失去 {it}")
        if notes:
            adv_log(s, "change", "，".join(notes))
        if h_["hp"] <= 0 and s["phase"] != "done":
            s.update(phase="done", result="lose")
            adv_log(s, "end", f"{h_['name']} 倒下了……")
            GAME.emit("system", "adv_over", result="lose")
        else:
            GAME.emit("agent", "hero_change")
    elif action == "end":
        result = d.get("result") or "win"
        s.update(phase="done", result=result if result in ("win", "lose") else "win", check=None, choices=[])
        adv_log(s, "end", txt(d, "text", 800))
        GAME.emit("agent", "end")
    else:
        raise ValueError(f"骰子冒险里不能 {action}")


def adv_view(s):
    h_ = s["hero"]
    if s["phase"] == "create":
        return ["等对方创建角色（选职业、起名字），继续 `game.py wait`。"]
    out = [f"主角：{h_['name']}（{h_['cls']}，擅长{h_['skill']}），生命 {h_['hp']}/{h_['maxhp']}，金币 {h_['gold']}，"
           f"背包：{'、'.join(h_['items']) or '空'}"]
    recent = [e for e in s["log"] if e["kind"] in ("scene", "action", "roll")][-4:]
    for e in recent:
        out.append(f"  [{ {'scene': '旁白', 'action': '对方行动', 'roll': '检定'}[e['kind']] }] {e['text'][:120]}")
    if s["phase"] == "intro":
        out.append("角色创建好了 → `game.py scene --title 场景名 --text \"开场描述\" --choice 选项1 --choice 选项2`")
    elif s["phase"] == "done":
        out.append("冒险结束了。问对方要不要再来一次（`game.py play adventure`）。")
    elif s["check"]:
        out.append(f"等对方掷骰子（{s['check']['skill']}，难度 {s['check']['dc']}），继续 `game.py wait`。")
    else:
        out.append("等对方选择或行动。收到行动后：需要碰运气就 `game.py check`，否则直接 `game.py scene` 描述结果；"
                   "加减生命/金币/物品用 `game.py hero`。")
    return out


def uc_public(st):
    done = st.get("phase") == "done"
    st = dict(st)
    st["players"] = [{"name": p["name"], "human": p["human"], "alive": p["alive"],
                      "word": p["word"] if (p["human"] or done) else None,
                      "spy": p["spy"] if (done or not p["alive"]) else None} for p in st.get("players", [])]
    if not done:
        st.pop("words", None)
    return st


EXTRA = {
    "guesswho": {"human": gw_human, "agent": gw_agent, "view": gw_view},
    "idiom": {"human": idiom_human, "agent": idiom_agent, "view": idiom_view},
    "emoji": {"human": emoji_human, "agent": emoji_agent, "view": emoji_view},
    "story": {"human": story_human, "agent": story_agent, "view": story_view},
    "undercover": {"human": uc_human, "agent": uc_agent, "view": uc_view},
    "adventure": {"human": adv_human, "agent": adv_agent, "view": adv_view},
}

EVENT_TEXT = {
    "secret_set": lambda e: f"对方想好了一个人物（分类：{e['category'] or '未说明'}），开始提问吧",
    "question": lambda e: f"对方提问（第 {e['n']} 个）：{e['text']}",
    "answer": lambda e: f"对方回答「{e['question']}」：{ANSWER_CN[e['kind']]}" + ("，你猜中了！" if e.get("solved") else ""),
    "word": lambda e: f"对方接了：{e['word']}",
    "pass": lambda e: "对方接不上，扣了一颗心，轮到你重新起头",
    "hint_request": lambda e: f"对方想要提示（要以「{e['need']}」开头），用 say 给个小提示，别直接说答案",
    "puzzle_set": lambda e: f"对方出题：{e['puzzle']}（分类：{e['category'] or '未说明'}，{e['word_len']} 个字），猜猜看",
    "theme": lambda e: f"对方选了故事主题：{e['text']}",
    "line": lambda e: f"对方续写：{e['text']}",
    "end_request": lambda e: "对方希望故事收尾了，请写结局",
    "rename": lambda e: f"对方把你的名字设为「{e['name']}」，并说自己叫「{e['human_name']}」。之后用新名字自称、用对方的昵称称呼对方，可以 say 一句打招呼",
    "describe": lambda e: f"对方（玩家“你”）描述：{e['text']}",
    "uc_vote": lambda e: f"对方投票给了：{e['target']}",
    "uc_result": lambda e: (f"投票结果：{e['out']} 出局，进入下一轮" if e["out"] else f"投票平票（{'、'.join(e['tie'])}），无人出局，进入下一轮"),
    "uc_over": lambda e: f"游戏结束，{'平民' if e['winner'] == 'civilian' else '卧底'}获胜" + (f"（{e['out']} 出局）" if e["out"] else ""),
    "hero_created": lambda e: f"对方创建了角色：{e['name']}（{e['cls']}）。先读 games/adventure.md，然后开场",
    "action": lambda e: f"对方行动：{e['text']}",
    "roll": lambda e: f"对方掷骰（{e['reason']}）：🎲{e['die']}" + (f"+{e['bonus']}" if e["bonus"] else "") + f" = {e['total']}，难度 {e['dc']} → {'成功' if e['ok'] else '失败'}。请描述结果",
    "adv_over": lambda e: "主角生命归零，冒险失败。用 say 安慰一下，问要不要再来",
}

class Handler(BaseHTTPRequestHandler):
    server_version = "AIGameBox/1.0"

    def log_message(self, *args):
        pass

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 8 * 1024 * 1024:
            raise ValueError("请求太大")
        return json.loads(self.rfile.read(n) or b"{}")

    def authed(self, role, q):
        tok = self.headers.get("X-Token") or (q.get("k") or [""])[0]
        return secrets.compare_digest(tok, TOKENS[role])

    def do_GET(self):
        GAME.last_request = now()
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path.startswith("/api/"):
            return self.api_get(u.path, q)
        rel = "index.html" if u.path in ("/", "") else u.path.lstrip("/")
        f = (WEB_DIR / rel).resolve()
        if WEB_DIR.resolve() not in f.parents or not f.is_file():
            self.send_error(404)
            return
        ctype = {".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                 ".svg": "image/svg+xml", ".png": "image/png"}.get(f.suffix, "application/octet-stream")
        data = f.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def api_get(self, path, q):
        if path == "/api/state":
            if not self.authed("web", q):
                return self.send_json({"error": "bad token"}, 403)
            since = int((q.get("v") or ["0"])[0])
            deadline = now() + 25
            with GAME.lock:
                while GAME.version <= since and now() < deadline:
                    GAME.lock.wait(deadline - now())
                return self.send_json(GAME.snapshot())
        if path == "/api/agent/wait":
            if not self.authed("agent", q):
                return self.send_json({"error": "bad token"}, 403)
            timeout = min(float((q.get("timeout") or ["45"])[0]), 110)
            deadline = now() + timeout
            with GAME.lock:
                GAME.agent_waiting += 1
                GAME.agent_last_seen = now()
                GAME.touch()
                try:
                    while True:
                        evs, lines = agent_events(GAME.agent_cursor)
                        if evs or now() >= deadline:
                            break
                        GAME.lock.wait(deadline - now())
                finally:
                    GAME.agent_waiting -= 1
                    GAME.agent_last_seen = now()
                if evs:
                    GAME.agent_cursor = evs[-1]["seq"]
                GAME.agent_cursor = max(GAME.agent_cursor, GAME.seq)
                GAME.touch()
                return self.send_json({"events": lines, "timeout": not evs, "view": GAME.agent_view()})
        if path == "/api/agent/state":
            if not self.authed("agent", q):
                return self.send_json({"error": "bad token"}, 403)
            with GAME.lock:
                return self.send_json({"view": GAME.agent_view()})
        self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        GAME.last_request = now()
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            d = self.body()
            if u.path == "/api/human":
                if not self.authed("web", q):
                    return self.send_json({"error": "bad token"}, 403)
                with GAME.lock:
                    handle_human(d.get("action"), d)
                    return self.send_json({"ok": True})
            if u.path == "/api/agent":
                if not self.authed("agent", q):
                    return self.send_json({"error": "bad token"}, 403)
                with GAME.lock:
                    GAME.agent_last_seen = now()
                    extra = handle_agent(d.get("action"), d) or {}
                    return self.send_json({"ok": True, **extra, "view": GAME.agent_view()})
            if u.path == "/api/stop":
                if not self.authed("agent", q):
                    return self.send_json({"error": "bad token"}, 403)
                self.send_json({"ok": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
            self.send_json({"error": "not found"}, 404)
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as e:
            self.send_json({"error": str(e)}, 400)


def idle_watch(httpd):
    while True:
        time.sleep(60)
        if now() - GAME.last_request > IDLE_EXIT_SECONDS:
            httpd.shutdown()
            return


def main():
    global GAME
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=0)
    ap.add_argument("--agent-name", default="小伙伴")
    ap.add_argument("--human-name", default="你")
    ap.add_argument("--game", default="")
    ap.add_argument("--ready-file", required=True)
    a = ap.parse_args()
    prof = load_profile()
    GAME = Game(a.agent_name, prof.get("human_name") or a.human_name)
    GAME.setup_done = bool(prof.get("setup_done"))
    if prof.get("agent_look") in LOOKS:
        GAME.agent_look = prof["agent_look"]
    TOKENS["agent"] = secrets.token_urlsafe(16)
    TOKENS["web"] = secrets.token_urlsafe(16)
    if a.game:
        with GAME.lock:
            GAME.start_game(a.game, "agent")
            GAME.agent_cursor = GAME.seq
    httpd = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    httpd.daemon_threads = True
    port = httpd.server_address[1]
    Path(a.ready_file).write_text(json.dumps({
        "port": port, "pid": os.getpid(),
        "agent_token": TOKENS["agent"], "web_token": TOKENS["web"],
        "url": f"http://127.0.0.1:{port}/?k={TOKENS['web']}",
    }), encoding="utf-8")
    threading.Thread(target=idle_watch, args=(httpd,), daemon=True).start()
    try:
        httpd.serve_forever()
    finally:
        # only clean up our own session file; a newer server may already own the path
        try:
            if json.loads(Path(a.ready_file).read_text(encoding="utf-8")).get("pid") == os.getpid():
                os.remove(a.ready_file)
        except (OSError, ValueError):
            pass


if __name__ == "__main__":
    sys.exit(main())
