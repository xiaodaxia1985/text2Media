"""校验 specs.ts 里每镜的屏幕大字是不是该镜台词的逐字前缀。

规则（用户定的红线）：台词一字不改；屏幕大字只能是这一镜台词的连续前缀。
判法：去掉标点后比对 startswith。不匹配就列出来，人工改 head 或改台词。

    python audit-heads.py
"""
import json
import re
from pathlib import Path

ROOT = Path(r'E:\works\New Journal\个人商业实战')
SPEC = ROOT / 'video' / 'dankoe-2027' / 'remotion' / 'src' / 'specs.ts'
TIMING = ROOT / 'video' / 'dankoe-2027' / 'remotion' / 'src' / 'timing.json'

STRIP = re.compile(r"[，。、：；！？…「」『』\"'“”‘’\s（）()·—\-]")

def norm(s):
    return STRIP.sub('', s)

text = SPEC.read_text(encoding='utf-8')
timing = json.loads(TIMING.read_text(encoding='utf-8'))
lines = {s['id']: s.get('line', '') for s in timing['scenes']}

# 逐条 spec：'NN': {beats: [ ... ]}
spec_blocks = re.findall(r"'([0-9]{2})':\s*\{beats:\s*\[(.?)\]", text, re.S)
heads = {}
for sid, body in re.findall(r"'([0-9]{2})':\s*\{beats:\s*\[(.+?)\]\s*\}\s*,?\n", text, re.S):
    hs = re.findall(r"head:\s*\{s:\s*'(.+?)'", body)
    if hs:
        heads[sid] = hs

fails = []
for sid, hs in sorted(heads.items()):
    line = lines.get(sid, '')
    if not line:
        continue
    nl = norm(line)
    for h in hs:
        nh = norm(h)
        if not nh:
            continue
        if not nl.startswith(nh):
            fails.append((sid, h, line))

for f in fails:
    print('FAIL', f[0], '大字「%s」不是台词开头：「%s」' % (f[1], f[2]))
print('\n%d 镜有 head，%d 处不匹配' % (len(heads), len(fails)))
