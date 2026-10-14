#!/usr/bin/env python3
"""Command-line entry point the agent uses to play. Standard library only.

  game.py start [游戏] [--name 名字]   启动本地游戏桌并打开网页
  game.py wait [--timeout 秒]          等对方行动（会挂起，直到对方出招或说话）
  game.py say "文字" [--mood 表情]      在网页聊天框说话
  game.py play <游戏>                  开一局新游戏：gomoku / drawguess / soup
  game.py state                        查看当前局面
  game.py stop                         关闭游戏桌
  game.py rename 新名字                改自己在游戏里的名字

五子棋：  game.py move H8
你画我猜：game.py draw --word 苹果 --paths 文件.json|-   （- 表示从标准输入读）
          game.py add-paths --paths ...   game.py hint "水果"   game.py guess 苹果   game.py reveal
海龟汤：  game.py soup --title 标题 --story 汤面
          game.py answer yes|no|irrelevant|partly ["补充"]   game.py reveal "汤底"
猜人物：  game.py think --secret 孙悟空 --category 神话人物   game.py answer yes|no|unknown|partly
          game.py accept   game.py ask "是真实存在的人吗？"   game.py guess 孙悟空
成语接龙：game.py word 一心一意   game.py reject "理由"   game.py pass
Emoji：   game.py emoji --answer 守株待兔 --puzzle 🌳🧍⏳🐇 --category 成语   game.py guess 词
故事接龙：game.py story --title 标题 --opening 开头   game.py line "续写"   game.py end --text 结局 [--paths 封面]
谁是卧底：game.py describe 阿喵 "描述"   game.py vote 阿喵 你   game.py say "..." --as 阿喵
骰子冒险：game.py scene --title 场景 --text 描述 --choice 选项 --choice 选项   game.py check --skill 力量 --dc 12 --reason 推门
          game.py hero --hp -2 --gold 5 --add 钥匙 --remove 火把   game.py end --text 结局 --result win|lose
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
HOME = Path(os.environ.get("AI_GAMEBOX_HOME", Path.home() / ".ai-gamebox"))
SESSION = HOME / "session.json"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def die(msg):
    print(f"错误：{msg}")
    sys.exit(1)


def load_session():
    if not SESSION.exists():
        return None
    try:
        return json.loads(SESSION.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def call(sess, method, path, data=None, timeout=15):
    url = f"http://127.0.0.1:{sess['port']}{path}"
    req = urllib.request.Request(url, method=method, headers={
        "X-Token": sess["agent_token"], "Content-Type": "application/json"})
    if data is not None:
        req.data = json.dumps(data, ensure_ascii=False).encode()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read())
        except ValueError:
            return {"error": f"HTTP {e.code}"}


def alive(sess):
    try:
        return "view" in call(sess, "GET", "/api/agent/state", timeout=3)
    except (OSError, ValueError):
        return False


def need():
    sess = load_session()
    if not sess or not alive(sess):
        die("游戏桌没有在运行，先执行 `game.py start`。")
    return sess


def show(res):
    if res.get("error"):
        die(res["error"])
    for line in res.get("events") or []:
        print("• " + line)
    if res.get("timeout"):
        print("（对方还在想，没有新动作。直接再运行一次 `game.py wait`。）")
    if "correct" in res:
        print("猜对了！" if res["correct"] else "没猜中。")
    view = res.get("view")
    if view:
        print("—— 局面 ——")
        print("\n".join(view))
        if view[0].startswith("【先回复聊天】"):
            # repeated at the very end: agents often only read the tail of long output
            print("—— 别忘了 ——")
            print(view[0])


def cmd_start(a):
    HOME.mkdir(parents=True, exist_ok=True)
    sess = load_session()
    if sess and alive(sess):
        if a.game:
            show(call(sess, "POST", "/api/agent", {"action": "play", "game": a.game}))
        print(f"游戏桌已经在运行：{sess['url']}")
        if not a.no_open:
            webbrowser.open(sess["url"])
        return
    if not a.name:
        try:
            a.name = json.loads((HOME / "profile.json").read_text(encoding="utf-8")).get("agent_name", "")
        except (OSError, ValueError):
            a.name = ""
        a.name = a.name or "小伙伴"
    ready = HOME / "session.json"
    ready.unlink(missing_ok=True)
    args = [sys.executable, str(HERE / "server.py"), "--ready-file", str(ready),
            "--agent-name", a.name, "--port", str(a.port)]
    if a.game:
        args += ["--game", a.game]
    log = open(HOME / "server.log", "ab")
    kw = {"stdout": log, "stderr": log, "stdin": subprocess.DEVNULL, "cwd": str(HOME)}
    if os.name == "nt":
        kw["creationflags"] = 0x00000008 | 0x00000200  # DETACHED_PROCESS | NEW_PROCESS_GROUP
    else:
        kw["start_new_session"] = True
    subprocess.Popen(args, **kw)
    for _ in range(100):
        if ready.exists():
            break
        time.sleep(0.1)
    sess = load_session()
    if not sess:
        die(f"游戏桌启动失败，看看日志 {HOME / 'server.log'}")
    print(f"游戏桌已启动：{sess['url']}")
    if not a.no_open:
        try:
            webbrowser.open(sess["url"])
        except Exception:
            pass
    print("把这个网址发给对方（如果浏览器没自动打开）。接下来运行 `game.py wait` 等对方行动。")
    show(call(sess, "GET", "/api/agent/state"))


def cmd_wait(a):
    sess = need()
    try:
        res = call(sess, "GET", f"/api/agent/wait?timeout={a.timeout}", timeout=a.timeout + 10)
    except (OSError, ValueError):
        die("连接游戏桌失败，再试一次 `game.py wait`。")
    show(res)


def post(action, **data):
    sess = need()
    show(call(sess, "POST", "/api/agent", {"action": action, **data}))


def read_paths(src):
    if src == "-":
        text = sys.stdin.read()
    elif src.lstrip().startswith(("[", "{")):
        text = src
    else:
        text = Path(src).read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except ValueError as e:
        die(f"paths 不是合法 JSON：{e}")


def cmd_stop(a):
    sess = load_session()
    if sess and alive(sess):
        call(sess, "POST", "/api/stop", {})
        print("游戏桌已关闭，下次见！")
    else:
        print("游戏桌本来就没在运行。")
    SESSION.unlink(missing_ok=True)


def main():
    ap = argparse.ArgumentParser(description="和 agent 一起玩小游戏")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("start")
    p.add_argument("game", nargs="?", default="", help="soup / drawguess / gomoku / guesswho / idiom / emoji / story / undercover / adventure")
    p.add_argument("--name", default=None, help="你在游戏里的名字（默认用上次对方给你起的名字）")
    p.add_argument("--port", type=int, default=0)
    p.add_argument("--no-open", action="store_true")
    p = sub.add_parser("wait")
    p.add_argument("--timeout", type=int, default=45)
    p = sub.add_parser("say")
    p.add_argument("text", nargs="?", default="")
    p.add_argument("--mood", default=None,
                   help="happy / smug / sad / surprised / thinking / love / normal")
    p.add_argument("--as", dest="alias", default=None, help="以某个 AI 角色的名字说话（谁是卧底）")
    p = sub.add_parser("play")
    p.add_argument("game")
    sub.add_parser("lobby")
    sub.add_parser("rename").add_argument("name")
    sub.add_parser("state")
    sub.add_parser("stop")
    p = sub.add_parser("move")
    p.add_argument("pos")
    for name in ("draw", "add-paths"):
        p = sub.add_parser(name)
        if name == "draw":
            p.add_argument("--word", required=True)
        p.add_argument("--paths", required=True)
    p = sub.add_parser("hint")
    p.add_argument("text")
    p = sub.add_parser("guess")
    p.add_argument("text")
    p = sub.add_parser("reveal")
    p.add_argument("text", nargs="?", default="")
    p = sub.add_parser("soup")
    p.add_argument("--title", required=True)
    p.add_argument("--story", required=True)
    p = sub.add_parser("answer")
    p.add_argument("kind", choices=["yes", "no", "irrelevant", "partly", "unknown"])
    p.add_argument("text", nargs="?", default="")
    p = sub.add_parser("think")
    p.add_argument("--secret", required=True)
    p.add_argument("--category", default="")
    sub.add_parser("accept")
    sub.add_parser("pass")
    for name in ("ask", "word", "line"):
        sub.add_parser(name).add_argument("text")
    p = sub.add_parser("reject")
    p.add_argument("text", nargs="?", default="")
    p = sub.add_parser("emoji")
    p.add_argument("--answer", required=True)
    p.add_argument("--puzzle", required=True)
    p.add_argument("--category", default="")
    p = sub.add_parser("story")
    p.add_argument("--title", required=True)
    p.add_argument("--opening", required=True)
    p = sub.add_parser("end")
    p.add_argument("--text", required=True)
    p.add_argument("--paths", default=None)
    p.add_argument("--result", choices=["win", "lose"], default=None)
    p = sub.add_parser("describe")
    p.add_argument("name")
    p.add_argument("text")
    p = sub.add_parser("vote")
    p.add_argument("name")
    p.add_argument("target")
    p = sub.add_parser("scene")
    p.add_argument("--title", default="")
    p.add_argument("--text", required=True)
    p.add_argument("--choice", action="append", default=[])
    p = sub.add_parser("check")
    p.add_argument("--skill", required=True, choices=["力量", "敏捷", "智力", "魅力"])
    p.add_argument("--dc", type=int, default=12)
    p.add_argument("--reason", default="检定")
    p = sub.add_parser("hero")
    p.add_argument("--hp", type=int, default=0)
    p.add_argument("--gold", type=int, default=0)
    p.add_argument("--add", action="append", default=[])
    p.add_argument("--remove", action="append", default=[])
    a = ap.parse_args()

    if a.cmd == "start":
        cmd_start(a)
    elif a.cmd == "wait":
        cmd_wait(a)
    elif a.cmd == "stop":
        cmd_stop(a)
    elif a.cmd == "state":
        show(call(need(), "GET", "/api/agent/state"))
    elif a.cmd == "say":
        post("say", text=a.text, mood=a.mood, **({"as": a.alias} if a.alias else {}))
    elif a.cmd == "play":
        post("play", game=a.game)
    elif a.cmd == "lobby":
        post("lobby")
    elif a.cmd == "rename":
        post("rename", name=a.name)
    elif a.cmd == "move":
        post("move", pos=a.pos)
    elif a.cmd == "draw":
        post("draw", word=a.word, paths=read_paths(a.paths))
    elif a.cmd == "add-paths":
        post("add_paths", paths=read_paths(a.paths))
    elif a.cmd == "reveal":
        post("reveal", text=a.text)
    elif a.cmd in ("hint", "guess"):
        post(a.cmd, text=a.text)
    elif a.cmd == "soup":
        post("soup", title=a.title, story=a.story)
    elif a.cmd == "answer":
        post("answer", kind=a.kind, text=a.text)
    elif a.cmd == "think":
        post("think", secret=a.secret, category=a.category)
    elif a.cmd in ("accept", "pass"):
        post(a.cmd)
    elif a.cmd in ("ask", "word", "line", "reject"):
        post(a.cmd, text=a.text)
    elif a.cmd == "emoji":
        post("emoji", answer=a.answer, puzzle=a.puzzle, category=a.category)
    elif a.cmd == "story":
        post("story", title=a.title, opening=a.opening)
    elif a.cmd == "end":
        post("end", text=a.text, paths=read_paths(a.paths) if a.paths else None, result=a.result)
    elif a.cmd == "describe":
        post("describe", name=a.name, text=a.text)
    elif a.cmd == "vote":
        post("vote", name=a.name, target=a.target)
    elif a.cmd == "scene":
        post("scene", title=a.title, text=a.text, choices=a.choice)
    elif a.cmd == "check":
        post("check", skill=a.skill, dc=a.dc, reason=a.reason)
    elif a.cmd == "hero":
        post("hero", hp=a.hp, gold=a.gold, add=a.add, remove=a.remove)


if __name__ == "__main__":
    main()
