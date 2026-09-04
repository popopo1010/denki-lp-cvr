#!/usr/bin/env python3
"""GitHub Actions ワークフロー内の `run:` シェルを bash -n で構文検査する（2026-09-04）。

背景: deploy.yml の Verify staging に足した1行で閉じ引用符が落ち（`echo "--- ... ---`）、
rsync が終わった後の検証ステップだけが "unexpected EOF" で落ちた（STG run #511）。
ローカルの静的チェックは HTML/CSS/JS しか見ておらず、YAML の中のシェルは誰も読んでいなかった。
ここで全ワークフローの全 run ブロックを bash -n にかける。${{ }} は空文字に置き換えてから検査する。
"""
import glob, os, re, subprocess, sys, tempfile
import yaml  # ubuntu-latest / macOS の python3 に同梱（無ければ pip install pyyaml）

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bad = 0; total = 0
for path in sorted(glob.glob(os.path.join(ROOT, ".github", "workflows", "*.yml"))):
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    for job_name, job in (doc.get("jobs") or {}).items():
        for i, step in enumerate(job.get("steps") or []):
            run = step.get("run")
            if not isinstance(run, str):
                continue
            total += 1
            script = re.sub(r"\$\{\{[^}]*\}\}", "", run)
            with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False, encoding="utf-8") as t:
                t.write(script); tmp = t.name
            r = subprocess.run(["bash", "-n", tmp], capture_output=True, text=True)
            os.unlink(tmp)
            if r.returncode != 0:
                bad += 1
                label = step.get("name") or f"step#{i + 1}"
                print(f"✗ {os.path.relpath(path, ROOT)} / {job_name} / {label}\n    {r.stderr.strip()}")
if bad:
    print(f"--- ワークフロー内シェルの構文エラー {bad} 件（{total} ブロック中） ---"); sys.exit(1)
print(f"✓ ワークフロー内シェル {total} ブロック: 構文OK")
