# UFABC Next Backend

Repositório que contém todo o código que se refere ao backend que mantém o site de pé!

## Ferramentas necessárias para rodar o projeto

- Runtime: [Nodejs](https://nodejs.org/en), v24
- Package Manager: [pnpm](https://pnpm.io/) v9
- Conteinerização: [Docker](https://www.docker.com/) v24 e [Docker Compose](https://docs.docker.com/engine/reference/commandline/compose/) v2
- Sistema Operacional: Pode usar o que preferir, garanto suporte a MacOS, Linux e WSL. Caso enfrente algum problema com Windows, clique [aqui](https://github.com/ufabc-next/ufabc-next-backend/issues/new) e descreva seu problema, para que possamos te auxiliar :)

## Rodando o projeto

Com as ferramentas necessárias instaladas, clone o repositório

```sh
# Clone o repositório
git clone https://github.com/ufabc-next/ufabc-next-backend.git

# Vá para o diretório do repo
cd ufabc-next-backend

# instale as dependências na raiz
pnpm i

# Rode o comando `build` para que o código tenha acesso as libs internas
pnpm build

# Realize a copia das variaveis de ambiente para o arquivo .env
cp -r apps/core/.env.example apps/core/.env.dev

# Para utilizar o localstack e persistir os logs, instale
https://github.com/localstack/awscli-local

Atenção: O `awscli-local` é um wrapper para o AWS CLI.
Certifique-se de que o AWS CLI original esteja instalado em seu sistema.
(Ao instalar o awscli-local da maneira recomendada, o awscli normalmente já é instalado)

# De `start` no projeto
pnpm dev


## O que temos no repo?

O projeto tem os seguintes packages e apps, cada um desenvolvido com 100% Typescript

### Apps
- `core`: Uma api [Fastify](https://fastify.dev/), que contém todas as rotas do backend.

### Packages

- `common`: funções utilitárias que podem ser consumidas por um ou mais packages, logger do app é configurado aqui
- `tsconfig`: `tsconfig.json`s utilizados ao longo do monorepo

### Utilities

Utilitários que o monorepo possui ja configurado
- [Turborepo](https://turborepo.org/) para gerenciamento do monorepo
- [TypeScript](https://www.typescriptlang.org/) para tipagem estática
- [Biome](https://biomejs.dev/) Lint & format
- [Node.js](https://nodejs.org/api/test.html) para realização de testes unitários
- [Renovate](https://docs.renovatebot.com/) para manter a saúde das dependências do projeto


🔐 Gerenciamento Seguro de .env.prod com git-secret via Docker

Este projeto utiliza o [git-secret](https://sobolevn.me/git-secret/?utm_source=chatgpt.com)
 para proteger o arquivo .env.prod e garantir que apenas membros autorizados da equipe tenham acesso a informações sensíveis.

📦 Atualização Segura do .env.prod

Para atualizar ou criptografar o arquivo .env.prod, utilizamos um container Docker com git-secret configurado. Isso evita a necessidade de instalar GPG ou git-secret na sua máquina local.

1. Build da imagem Docker
docker compose up -d

2. Entrar no container
docker run -it --rm -v $(pwd):/home/devuser/app git-secret-env


🔓 Como acessar o .env.prod

O arquivo .env.prod.secret pode ser descriptografado por qualquer pessoa que:

Tenha uma chave GPG adicionada via git secret tell.

Tenha a senha da chave privada correspondente.

❗ Solicitação de acesso

Se você é um novo contribuidor:

Gere uma chave GPG (ou use uma existente).

Envie sua chave pública GPG para um membro autorizado do projeto.

Um membro irá adicioná-lo com:

git secret tell email@seu-dominio.com


Após isso, você poderá rodar:

git secret reveal


e será solicitado a digitar sua senha da chave GPG privada.

✉️ Solicite acesso entrando em contato com um dos mantenedores do projeto.

🛠 Recomendações

Nunca commit o arquivo .env.prod diretamente.

Sempre use git secret hide após modificações no .env.prod.

Só compartilhe sua chave GPG pública, nunca a privada.

Garanta que sua chave GPG tenha uma senha forte e segura.
```
