"""印出 PDF 指定頁的文字，或找出題號所在頁，並可把頁面存成 PNG 以便對照縮排。

用法：
  python3 -I extract_pdf.py <pdf> --find Q.011 --find Q.020
  python3 -I extract_pdf.py <pdf> --pages 6-8 [--render <out_dir>] [--dpi 110]
"""
import argparse
import os
import sys

import pymupdf


def parse_pages(spec, page_count):
    pages = []
    for part in spec.split(','):
        if '-' in part:
            start, end = part.split('-')
            pages.extend(range(int(start), int(end) + 1))
        else:
            pages.append(int(part))
    return [p for p in pages if 1 <= p <= page_count]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('pdf')
    parser.add_argument('--pages', help='頁碼(從 1 開始)，例如 3-5 或 3,7')
    parser.add_argument('--find', action='append', default=[], help='要找的文字，例如 Q.011')
    parser.add_argument('--render', help='把 --pages 指定的頁面存成 PNG 的資料夾')
    parser.add_argument('--dpi', type=int, default=110)
    args = parser.parse_args()

    doc = pymupdf.open(args.pdf)
    print(f'# {args.pdf}: {doc.page_count} 頁')

    for needle in args.find:
        hits = [i + 1 for i in range(doc.page_count) if needle in doc[i].get_text()]
        print(f'# "{needle}" 出現在第 {hits} 頁')

    if not args.pages:
        return
    pages = parse_pages(args.pages, doc.page_count)
    if args.render:
        os.makedirs(args.render, exist_ok=True)
    for page_no in pages:
        page = doc[page_no - 1]
        print(f'\n===== PAGE {page_no} =====')
        print(page.get_text())
        if page.get_images():
            print(f'# 這頁有 {len(page.get_images())} 張圖片')
        if args.render:
            path = os.path.join(args.render, f'page-{page_no:03d}.png')
            page.get_pixmap(dpi=args.dpi).save(path)
            print(f'# 已存成 {path}')


if __name__ == '__main__':
    sys.exit(main())
