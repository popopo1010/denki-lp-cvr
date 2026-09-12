#!/usr/bin/env python3
"""シェルの構文検査（2026-09-04。2026-09-12 に対象を拡張）。

背景: deploy.yml の Verify staging に足した1行で閉じ引用符が落ち（`echo "--- ... ---`）、
rsync が終わった後の検証ステップだけが "unexpected EOF" で落ちた（STG run #511）。
ローカルの静的チェックは HTML/CSS/JS しか見ておらず、YAML の中のシェルは誰も読んでいなかった。

検査する対象は3つ:
  1. 全ワークフローの全 `run:` ブロック（${{ }} は空文字に置換してから）
  2. `scripts/*.sh` 本体 —— ここが 2026-09-12 までノーチェックだった。
     とくに apply-wp-root-redirects.sh は **WPドキュメントルートの .htaccess を
     SSH越しに書き換える**のに、deploy.yml の本番限定ステップからしか呼ばれない
     ＝ ci.yml が走らない経路にあり、壊れても本番で初めて分かる状態だった。
  3. 上記の中にある **ヒアドキュメント本文のうち、bash/sh に流し込むもの**。
     `bash -n` はクォート付きヒアドキュメント（<<'EOF'）の中身をデータとして
     読み飛ばすため、`ssh host "bash -s" <<'REMOTE'` の本文は 1 も 2 も素通りする。
     実測で確認済み（壊れた if 文を入れても exit 0 になる）。
     そこが deploy.yml の `rm -rf` を実行するリモートスクリプトなので、
     一番危ないブロックにだけ検査が届いていなかった。
     python/node へ流すヒアドキュメント（PYEOF 等）は shell ではないので対象外。
"""
import glob, os, re, subprocess, sys, tempfile
import yaml  # ubuntu-latest / macOS の python3 に同梱（無ければ pip install pyyaml）

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bad = 0; total = 0

# `bash -s` / `sh -s` / `| bash` のように **シェルに流し込む** ヒアドキュメントだけを拾う。
# `cat >> .htaccess <<'EOF'`（ただのデータ）や `python3 - <<'PYEOF'` は対象外。
HEREDOC_START = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
SHELL_CMD = re.compile(r"(^|[|;&\s\"'])(ba)?sh\b")


def heredoc_shell_bodies(script):
    """シェルに流し込むヒアドキュメントの本文を取り出す。"""
    out = []
    lines = script.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        m = HEREDOC_START.search(line)
        if m and SHELL_CMD.search(line[:m.start()]):
            delim = m.group(2)
            body = []
            i += 1
            while i < len(lines) and lines[i].strip() != delim:
                body.append(lines[i])
                i += 1
            out.append("\n".join(body))
        i += 1
    return out


def check(script, label):
    """bash -n にかける。戻り値: 問題があれば True。"""
    global bad, total
    total += 1
    with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False, encoding="utf-8") as t:
        t.write(script); tmp = t.name
    r = subprocess.run(["bash", "-n", tmp], capture_output=True, text=True)
    os.unlink(tmp)
    if r.returncode != 0:
        bad += 1
        print(f"✗ {label}\n    {r.stderr.strip()}")
        return True
    return False


def check_with_heredocs(script, label):
    check(script, label)
    for n, body in enumerate(heredoc_shell_bodies(script), 1):
        # ヒアドキュメント本文は bash -n が読み飛ばすので、切り出して単体で検査する
        check(body, f"{label} / ヒアドキュメント#{n}（シェルに流し込む本文）")


for path in sorted(glob.glob(os.path.join(ROOT, ".github", "workflows", "*.yml"))):
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    rel = os.path.relpath(path, ROOT)
    for job_name, job in (doc.get("jobs") or {}).items():
        for i, step in enumerate(job.get("steps") or []):
            run = step.get("run")
            if not isinstance(run, str):
                continue
            script = re.sub(r"\$\{\{[^}]*\}\}", "", run)
            label = step.get("name") or f"step#{i + 1}"
            check_with_heredocs(script, f"{rel} / {job_name} / {label}")

# scripts/*.sh 本体（2026-09-12 追加）
for path in sorted(glob.glob(os.path.join(ROOT, "scripts", "*.sh"))):
    rel = os.path.relpath(path, ROOT)
    with open(path, encoding="utf-8") as f:
        script = f.read()
    check_with_heredocs(script, rel)

if bad:
    print(f"--- シェル構文エラー {bad} 件（{total} ブロック中） ---"); sys.exit(1)
print(f"✓ シェル {total} ブロック（ワークフロー run / scripts/*.sh / ヒアドキュメント）: 構文OK")
