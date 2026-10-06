#!/bin/zsh
# 一键自测：语法检查 → 单元测试 → 批量电脑对战
# 用法：tests/run.sh          （快速：每种难度 2 局）
#       tests/run.sh full     （完整：每种难度 6 局）
cd "$(dirname "$0")/.." || exit 1
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
[ -x "$JSC" ] || { echo "找不到 JavaScriptCore（jsc），本脚本只支持 macOS"; exit 1; }

step() { print "\n━━ $1 ━━"; }
fail=0

step "1/3 语法检查（全部源码模块）"
tmp=$(mktemp -t syn).js
print 'for (const f of arguments) { try { checkModuleSyntax(read(f)); } catch (e) { print("  ✗ " + f + "：" + e); throw e; } } print("  ✓ " + arguments.length + " 个文件语法正确");' > "$tmp"
$JSC "$tmp" -- $(find src -name '*.js' | sort) || fail=1
rm -f "$tmp"

step "2/3 单元测试"
$JSC -m tests/unit.js || fail=1

step "3/3 批量电脑对战（无界面，检查每局都能正常结束）"
n=2; [ "$1" = "full" ] && n=6
$JSC -m tests/sim_batch.js -- $n easy,normal,hard || fail=1

print ""
if [ $fail -eq 0 ]; then print "✅ 全部通过"; else print "❌ 有未通过的项目，见上方输出"; fi
exit $fail
