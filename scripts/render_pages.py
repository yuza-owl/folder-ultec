"""Gera páginas e miniaturas do PDF. Dependência: pip install pymupdf."""

from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parent.parent


def main():
    pages = ROOT / 'pages'
    thumbnails = pages / 'thumbs'
    thumbnails.mkdir(parents=True, exist_ok=True)
    with pymupdf.open(ROOT / 'ulteck folder.pdf') as document:
        if len(document) != 8:
            raise ValueError('Atualize TOTAL_PAGES no app.js antes de usar um PDF com outra quantidade de páginas.')
        for number, page in enumerate(document, start=1):
            for directory, width, quality in [(pages, 2000, 90), (thumbnails, 280, 80)]:
                scale = width / page.rect.width
                pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), colorspace=pymupdf.csRGB, alpha=False)
                destination = directory / f'page-{number}.jpg'
                pixmap.save(destination, jpg_quality=quality)
                print(f'{destination.relative_to(ROOT)}: {pixmap.width} × {pixmap.height}, {destination.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
