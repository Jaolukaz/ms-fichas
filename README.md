# Fichas de treino · Matheus Scaldini (versão 2.0)

Aplicação para montar as fichas de treino de cada aluno e gerar o PDF A4, no celular (iPhone e Android) e no computador. Funciona sem internet depois da primeira abertura, e os dados ficam somente no aparelho de quem usa.

É a evolução da versão 1 (arquivo `ficha.html` único), com o mesmo formulário e o mesmo desenho de documento, na arquitetura dos apps da Lab-4 (Avaliação Funcional e Treino Individual).

## O que mudou em relação à versão 1

O PDF passou a ser desenhado por um motor vetorial próprio (pdf-lib), e não mais por captura de tela (html2pdf) ou pela impressão do Chrome. O texto sai real e nítido em qualquer ampliação, as fotos entram na resolução original, os QR codes são vetoriais e clicáveis, e o resultado é idêntico no iPhone, no Android e no computador. A prévia na tela e o PDF são desenhados a partir da mesma lista de elementos, então o que aparece na prévia é exatamente o que sai no arquivo.

O aparelho guarda vários alunos (menu **Alunos**), cada um com o seu planejamento. A identidade do documento (logo, nome, título, CREF, contato, tipo de capa e legenda) é única e vale para todos.

Em vídeos, é possível escolher uma foto como capa quando o aparelho não consegue extrair um quadro do arquivo (acontece com vídeos HEVC de iPhone em alguns Android), e o botão **Liberar espaço** apaga o arquivo de vídeo mantendo o quadro e o link usados no PDF.

## Como o Matheus usa

- **iPhone:** abrir o link no Safari, tocar em Compartilhar e depois em "Adicionar à Tela de Início".
- **Android:** abrir no Chrome e tocar em "Instalar" no aviso da própria aplicação, ou no menu do navegador.

A instalação é importante no iPhone: o Safari apaga dados de sites após sete dias sem uso, mas apps instalados na tela de início ficam isentos dessa limpeza.

O PDF é gerado pelo botão **Gerar PDF**. No celular, **Compartilhar** abre a folha nativa do aparelho, de onde o arquivo vai direto para o WhatsApp, o e-mail ou o app Arquivos.

Para trazer os dados da versão 1: no arquivo antigo, use **Mais › Exportar backup**; no app novo, **Menu › Importar backup**. O formato é o mesmo nos dois sentidos (vídeos não entram no backup, os quadros usados no PDF sim).

## Publicar no GitHub Pages

1. Crie o repositório `ms-fichas` e envie o conteúdo desta pasta para a branch `main` (inclusive `package.json`, `package-lock.json` e as pastas `src`, `public`, `tests` e `.github`).
2. Em **Settings > Pages**, escolha **Source: GitHub Actions**.
3. A cada push, o workflow `.github/workflows/deploy.yml` roda os testes, compila e publica. O endereço fica em `https://jaolukaz.github.io/ms-fichas/`.

A versão de computador (arquivo único) fica disponível para download na página de cada execução do workflow, com o nome `versao-desktop`.

Os apps da Lab-4 e este ficam na mesma origem (`jaolukaz.github.io`), mas não se misturam: cada um tem o próprio banco de dados (este usa `ms-fichas-app`), o próprio escopo de instalação e o próprio ícone. Um repositório público expõe apenas o código; nenhum dado de aluno passa pelo servidor.

## Desenvolvimento

É necessário Node.js 20 ou superior.

```bash
npm install
npm run dev          # servidor local com recarga automática
npm test             # testes do motor de PDF (Node, sem navegador)
npm run build        # gera dist/ (PWA) e dist-single/index.html (arquivo único)
npm run preview      # serve dist/ localmente para testar o PWA
```

Para testar no celular durante o desenvolvimento, rode `npx vite --host` e abra o endereço de rede no aparelho, na mesma rede Wi-Fi. Service worker e compartilhamento de arquivos só funcionam por HTTPS ou em `localhost`, então essa parte deve ser validada no endereço publicado.

## Arquitetura

```
src/
  core/config.js      sugestões dos campos, legenda da capa, limites de mídia, profissional padrão
  core/model.js       estado, normalização da v1, numeração (01, A1…), ordem das fichas, exemplo
  core/icons.js       ícones da interface e do PDF (mesmos desenhos)
  core/qr.js          QR code vetorial (interface, prévia e PDF)
  report/text.js      fontes, métricas, quebra de linha
  report/layout.js    motor de layout A4 e paginação: estado → lista de desenho em mm
  report/pdf.js       lista de desenho → PDF vetorial (pdf-lib, fontes em subconjunto, links)
  report/svg.js       lista de desenho → SVG da prévia
  report/engine.js    carga sob demanda do motor no navegador
  storage/db.js       IndexedDB, com alternativa em memória
  storage/repo.js     alunos, mídias, identidade, backup e migração da v1
  ui/editor.js        formulário (porta da versão 1)
  ui/media.js         imagens e quadros de vídeo processados no aparelho
  ui/*                diálogos, compartilhamento e PWA
  app.js              controlador (estado, salvamento automático, comandos)
  assets/fonts/       Oswald 500/600 e Inter 400/500/600/700 (estáticas, subconjunto latino)
tests/                testes automatizados do motor (node:test)
```

A decisão central é o **motor de layout único**. As medidas foram transcritas do CSS da versão 1 (rota de impressão): capa sem margens, páginas de ficha com 13 mm em cima, 15 mm embaixo e 12 mm nas laterais, rodapé com profissional, aluno e "Página X de Y". A largura do texto é medida com as próprias fontes, e não pelo navegador, o que torna o PDF idêntico em qualquer aparelho. As fontes não têm kerning nem ligaduras, para que tela e PDF coincidam.

Regras de paginação, verificadas pelos testes:

- cada ficha começa numa página nova, com a faixa da logo e o cabeçalho;
- um card de exercício nunca é dividido entre páginas;
- o título de seção fica sempre junto do exercício seguinte;
- o cabeçalho do super-set fica junto do primeiro card, e um super-set que atravessa páginas recebe a linha lateral em cada trecho;
- a capa se ajusta em etapas quando o resumo das fichas não cabe (linhas compactas, duas colunas, espaçamentos menores) e, no limite, o excedente vai para uma página de continuação;
- um bloco maior que uma página inteira é sinalizado na prévia e antes de gerar o PDF.

## Alterações mais comuns

| O que mudar | Onde |
|---|---|
| Sugestões dos campos (séries, repetições, carga…) | `SUGGESTIONS` em `src/core/config.js` |
| Textos da legenda da capa | `LEGEND` em `src/core/config.js` |
| Nome e título padrão do profissional | `DEFAULT_TRAINER` em `src/core/config.js` |
| Rótulos dos parâmetros no PDF (ex.: "Descanso") | `tiles` em `cardModel`, `src/report/layout.js` |
| Cores do documento | objeto `C` e `coverPalette`, `src/report/layout.js` |
| Espaçamentos e tamanhos de fonte do PDF | funções `*Model` de `src/report/layout.js` (valores em mm e pt, iguais aos do CSS da v1) |
| Exemplo do Arthur | `sample()` em `src/core/model.js` |
| Textos e campos do formulário | `src/ui/editor.js` |

Depois de alterar, rode `npm test` e confira a prévia com o exemplo carregado. Ao enviar ao GitHub, a publicação é automática; os aparelhos recebem o aviso "Há uma nova versão" e atualizam com um toque.

## Roteiro de testes em aparelhos reais

1. Abrir o link, instalar na tela de início e reabrir pelo ícone.
2. Carregar o exemplo, gerar o PDF e compartilhar pelo WhatsApp.
3. Enviar uma foto da galeria e outra tirada na hora pela câmera.
4. Enviar um vídeo gravado no próprio aparelho e conferir o quadro no PDF; se não aparecer, usar "Escolher capa".
5. Colar um link do YouTube ou Instagram e ler o QR do PDF com outro celular.
6. Ativar o modo avião, fechar e reabrir o app, editar e gerar o PDF.
7. Exportar um backup, importar em outro aparelho e conferir imagens e textos.
