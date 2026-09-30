# Summit Diretora — Revista Digital

Leitor interativo para o arquivo `ulteck folder.pdf`, com 8 páginas em `pages/page-1.jpg` até `pages/page-8.jpg`.

## Abrir localmente

Você pode abrir o arquivo `index.html` diretamente no navegador. Não é necessário instalar dependências nem estar conectado à internet.

Se preferir executar por um servidor local:

```bash
python3 -m http.server 8000
```

Depois, acesse `http://localhost:8000`.

O leitor possui navegação em formato de revista, miniaturas, zoom, tela cheia, download e suporte a teclado e gestos no celular.

## Qualidade das páginas

As páginas são geradas diretamente do PDF em RGB, com 2.000 pixels de largura. As miniaturas em `pages/thumbs/` têm 280 pixels de largura para reduzir o tráfego do menu de navegação.

Para gerar novamente as imagens após substituir o PDF:

```bash
python3 -m pip install pymupdf
python3 scripts/render_pages.py
```

Depois atualize `PAGE_ASSET_VERSION` no `app.js` e a versão do script no `index.html` para renovar o cache do navegador. Se mudar a quantidade de páginas, ajuste também `TOTAL_PAGES`, o contador e o limite do progresso no HTML.
