# Agenda

Agenda de clientes e agendamentos que roda 100% no navegador (feita para o iPhone).
Não precisa de servidor: os dados ficam salvos no próprio aparelho.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub e envie **todos** os arquivos e a pasta `icons/` para a raiz dele.
2. No repositório, vá em **Settings > Pages**.
3. Em **Source**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e salve.
4. Em um ou dois minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Como instalar no iPhone

1. Abra o endereço acima no **Safari**.
2. Toque em **Compartilhar** (quadrado com seta para cima).
3. Toque em **Adicionar à Tela de Início**.

Use sempre pelo ícone da Tela de Início. O app instalado tem armazenamento separado
do Safari, então dados cadastrados em um não aparecem no outro.

## Seus dados

- Tudo fica no armazenamento do aparelho. Se você limpar os dados do Safari ou apagar o app, os dados somem.
- Na aba **Backup** dá para exportar um arquivo `.json` e restaurá-lo depois (também serve para passar os dados para outro aparelho).
- Faça backup de vez em quando.

## Atualizando o site

Se você mudar algum arquivo, troque o número da versão em `sw.js` (`VERSAO = 'agenda-v2'`, por exemplo)
para o iPhone baixar a versão nova.
