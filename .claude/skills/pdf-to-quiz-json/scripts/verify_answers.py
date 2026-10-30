"""執行題庫中每題的 python 程式碼，比對輸出與選項，確認標示的答案。

用法：
  python3 -I verify_answers.py data/banks/<id>.json [--from Q.011] [--to Q.020]

狀態：
  OK        執行結果等於標示答案
  MISMATCH  執行結果等於另一個選項，或標示答案不符
  NO_MATCH  執行結果不等於任何選項，且標示答案不是「以上皆非」
  SKIP      無法直接執行(填空、問複雜度、沒有 print…)，需要人工推理
"""
import argparse
import json
import re
import subprocess
import sys

OPTION_KEYS = 'ABCDEFGHIJ'
ERROR_WORDS = ('執行錯誤', 'Error')
NONE_WORDS = ('以上皆非',)


def normalize(text):
    """忽略沒有分隔作用的空白：list / tuple 內 ',' 後面與括號旁的空白，以及前後空白。"""
    text = text.strip()
    text = re.sub(r'\s*,\s*', ',', text)
    text = re.sub(r'([\[(])\s+', r'\1', text)
    text = re.sub(r'\s+([\])])', r'\1', text)
    text = re.sub(r'[ \t]+', ' ', text)
    return text


def option_text(option):
    if isinstance(option, str):
        return option
    return ' '.join(block.get('text') or block.get('code') or '' for block in option)


def run_code(code, stdin):
    try:
        proc = subprocess.run(
            [sys.executable, '-I', '-c', code],
            input=stdin, capture_output=True, text=True, timeout=5,
        )
    except subprocess.TimeoutExpired:
        return None, 'timeout'
    if proc.returncode != 0:
        last = proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else 'error'
        return None, last
    return proc.stdout, None


def check(question):
    stem = question.get('stem', [])
    codes = [b['code'] for b in stem if b.get('type') == 'code' and b.get('lang', 'python') == 'python'
             and b.get('role') != 'stdin']
    stdin = '\n'.join(b['code'] for b in stem if b.get('role') == 'stdin')
    if stdin:
        stdin += '\n'
    if len(codes) != 1:
        return 'SKIP', f'python 程式碼區塊有 {len(codes)} 個'
    code = codes[0]
    if '___' in code:
        return 'SKIP', '填空題'
    if 'print' not in code:
        return 'SKIP', '程式沒有 print，題目問的不是輸出'

    output, error = run_code(code, stdin)
    texts = [option_text(o) for o in question['options']]
    answer_index = OPTION_KEYS.index(question['answer'])
    answer_text = texts[answer_index]

    if error:
        matched = [i for i, t in enumerate(texts) if any(w in t for w in ERROR_WORDS)]
        actual = f'執行錯誤({error})'
    else:
        matched = [i for i, t in enumerate(texts)
                   if normalize(t) == normalize(output) or (normalize(output) == '' and '空字串' in t)]
        actual = repr(output.rstrip('\n'))

    if answer_index in matched:
        return 'OK', actual
    if matched:
        keys = ','.join(OPTION_KEYS[i] for i in matched)
        return 'MISMATCH', f'實際 {actual} 對應選項 {keys}，但標示答案是 {question["answer"]}「{answer_text}」'
    if any(w in answer_text for w in NONE_WORDS):
        return 'OK', f'{actual}(不在選項中，標示答案為以上皆非)'
    return 'NO_MATCH', f'實際 {actual} 不在選項中，標示答案是 {question["answer"]}「{answer_text}」'


def ref_number(question):
    match = re.search(r'\d+', question.get('sourceRef') or question['id'])
    return int(match.group()) if match else 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('bank')
    parser.add_argument('--from', dest='start', help='起始題號，例如 Q.011')
    parser.add_argument('--to', dest='end', help='結束題號，例如 Q.020')
    args = parser.parse_args()

    with open(args.bank, encoding='utf-8') as f:
        bank = json.load(f)
    start = int(re.search(r'\d+', args.start).group()) if args.start else 0
    end = int(re.search(r'\d+', args.end).group()) if args.end else 10 ** 9

    counts = {}
    for question in bank['questions']:
        if not start <= ref_number(question) <= end:
            continue
        status, detail = check(question)
        counts[status] = counts.get(status, 0) + 1
        print(f'{status:9} {question.get("sourceRef", question["id"]):8} {detail}')
    print('\n# ' + '  '.join(f'{k}={v}' for k, v in sorted(counts.items())))
    return 1 if counts.get('MISMATCH') or counts.get('NO_MATCH') else 0


if __name__ == '__main__':
    sys.exit(main())
