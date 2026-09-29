# Abby — Agente IA ABIHPEC

Assistente de IA da ABIHPEC especializada em Inovação e Regulatório do setor
de Higiene Pessoal, Perfumaria e Cosméticos (HPPC). Mesma stack do RadarVisa:
Node.js + Express, hospedado no Render, com a API da Anthropic.

A base de conhecimento já vem carregada com as 32 fontes reunidas até agora
(`data/sources.json`) — cadernos regulatórios, manuais ABIHPEC, RDCs.

Identidade visual (Montserrat + paleta azul/creme da ABIHPEC) e avatar
animado da Abby já aplicados. Acesso é restrito por e-mail + senha — veja
"Liberando o acesso" abaixo.

## Liberando o acesso (e-mail + senha única)

A primeira tela que qualquer pessoa vê pede um e-mail e uma senha. A senha é
única pra todo mundo — não existe lista de e-mails cadastrados; qualquer
e-mail passa, desde que a senha esteja certa. O e-mail serve só pra
identificar quem usou (aparece no resumo de uso, útil pro reembolso).

Pra definir a senha:
1. Defina a variável de ambiente `ACCESS_PASSWORD` (veja `.env.example` e o
   passo a passo do Render abaixo).
2. Combine essa senha com quem você for divulgar o link (associados,
   convidados do Summit etc.) — por e-mail, WhatsApp, onde preferir.

Se quiser trocar a senha depois, basta atualizar `ACCESS_PASSWORD` no Render
e reiniciar o serviço — quem já tinha entrado antes continua com acesso no
próprio navegador (fica salvo ali) até limpar os dados do site ou clicar em
"trocar e-mail".

## Log de uso — direto numa planilha Google (não fica na Abby)

Cada pergunta feita gera uma linha numa planilha sua: e-mail de quem
perguntou, data/hora e tokens consumidos. Isso não aparece em nenhuma tela
da Abby — é só pra você acompanhar e basear o pedido de reembolso do custo
da API enquanto a conta é pessoal.

Mesmo esquema que você já usa no Louvor Central e no Stabilis (HTML/Node →
Google Apps Script → Google Sheets):

1. Crie uma planilha Google em branco (ex: "Abby — Uso").
2. Nela, vá em **Extensões → Apps Script**.
3. Apague o conteúdo padrão e cole o código de
   `google-apps-script/Code.gs` (está neste pacote).
4. Salve, depois **Deploy → Nova implantação → tipo "App da Web"**:
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
5. Autorize quando o Google pedir (é a sua própria planilha) e copie a URL
   do app da Web gerada.
6. No Render, adicione a variável de ambiente `SHEETS_WEBHOOK_URL` com essa
   URL.

A aba "Uso" e os cabeçalhos são criados sozinhos na planilha assim que a
primeira pergunta for feita — não precisa preparar nada nela antes. Se por
algum motivo o envio pra planilha falhar (rede, script fora do ar), o chat
continua funcionando normalmente — só aquela linha de uso não é registrada.

## Rodando localmente

```bash
npm install
cp .env.example .env
# edite o .env e preencha:
#  - ANTHROPIC_API_KEY  -> sua chave real da Anthropic
#  - ACCESS_PASSWORD    -> a senha que vai liberar o acesso à Abby (e-mail + senha)
#  - ADMIN_KEY          -> outra senha, só sua, para editar a base de conhecimento e ver o uso
npm start
```

Abra `http://localhost:3000`.

## Colocando no ar: Render + domínio próprio

### 1. Subir o código pro GitHub

```bash
cd abby-app
git init
git add .
git commit -m "Abby — versão inicial"
```

Crie um repositório novo no GitHub (pode ser privado) e suba:

```bash
git remote add origin https://github.com/SEU_USUARIO/abby-abihpec.git
git branch -M main
git push -u origin main
```

**Importante:** o `.gitignore` já exclui o `.env` — nunca suba sua chave real
da Anthropic pro GitHub.

### 2. Criar o Web Service no Render

1. Acesse [render.com](https://render.com) e conecte sua conta do GitHub.
2. **New +** → **Web Service** → selecione o repositório `abby-abihpec`.
3. Configurações:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (pra começar) ou Starter (se quiser evitar o
     "hibernar" do plano gratuito — importante pro dia do Summit, veja
     aviso abaixo)
4. Em **Environment**, adicione as variáveis:
   - `ANTHROPIC_API_KEY` → sua chave real da Anthropic
   - `ACCESS_PASSWORD` → a senha que você vai combinar com quem for acessar
     a Abby (tela de e-mail + senha)
   - `ADMIN_KEY` → outra senha forte, só sua, pra editar a base de
     conhecimento
   - `SHEETS_WEBHOOK_URL` → a URL do Apps Script (veja a seção "Log de uso"
     acima) — opcional, mas sem ela nenhum uso fica registrado em lugar
     nenhum
5. **Create Web Service**. Em alguns minutos você terá uma URL tipo
   `abby-abihpec.onrender.com`.

### 3. Domínio próprio

No painel do serviço no Render: **Settings → Custom Domains → Add Custom
Domain**. Digite o domínio ou subdomínio que você quer usar (ex:
`abby.abihpec.org.br`), e o Render vai te dar um registro CNAME (ou A, se for
domínio raiz) pra cadastrar no DNS do domínio da ABIHPEC. Quem cuida do DNS da
ABIHPEC (provavelmente o mesmo time que cuida do site) precisa adicionar esse
registro. Depois de propagar (pode levar de minutos a algumas horas), o
Render emite certificado HTTPS automaticamente.

## Avisos importantes antes do Summit

- **Plano gratuito do Render "dorme" após 15 minutos sem uso** — a primeira
  pessoa a acessar depois disso espera ~30-50 segundos enquanto o servidor
  acorda. Para o dia da apresentação, considere upgradar temporariamente para
  o plano **Starter** (pago, mensal, mas cancelável), ou simplesmente acesse
  a página você mesma uns minutos antes de apresentar para "acordá-la".
- **Persistência de dados**: o arquivo `data/sources.json` funciona bem
  para o volume atual de fontes, mas em alguns provedores (inclusive Render,
  dependendo do plano) o disco pode ser resetado a cada novo deploy. Se isso
  acontecer, a base volta para as 32 fontes originais deste pacote — edições
  feitas depois do deploy inicial seriam perdidas no próximo deploy. Para uso
  contínuo de longo prazo, o próximo passo é trocar `data/sources.json` por
  um banco de verdade (Postgres do Render, ou MongoDB Atlas no plano
  gratuito) — posso te ajudar com isso depois do Summit.
- **Segurança da base**: adicionar/remover fontes agora exige a `ADMIN_KEY`
  (o navegador pede a senha na primeira tentativa e guarda só naquele
  dispositivo). Sem isso, qualquer pessoa que encontrasse a URL pública
  poderia alterar o que a Abby considera fonte confiável.
- **Senha de acesso não é por pessoa**: é uma senha só, compartilhada. Quem
  tiver a senha entra com qualquer e-mail — o e-mail é só identificação pro
  log de uso, não é verificado contra lista nenhuma.
- **Custo por pergunta**: diferente do protótipo no claude.ai (que usava seu
  próprio uso do Claude), aqui cada pergunta feita por QUALQUER visitante do
  site consome a sua chave de API da Anthropic — isso tem custo por token e
  não tem limite embutido de quantas perguntas alguém pode fazer. Para o
  Summit isso tende a ser tranquilo (poucas dezenas de perguntas), mas se o
  link viralizar ou ficar público por muito tempo, vale considerar um limite
  de perguntas por IP/dia — posso ajudar a adicionar isso se for preocupação.

## Estrutura do projeto

```
abby-app/
├── server.js                 # backend Express: /api/chat, /api/sources,
│                              # /api/access/verify (envia uso pro Sheets)
├── package.json
├── .env.example
├── data/
│   └── sources.json            # as fontes da base de conhecimento
├── google-apps-script/
│   └── Code.gs                 # cole isso numa planilha Google (ver "Log de uso")
└── public/
    ├── index.html              # front-end (gate + chat + base de conhecimento)
    └── assets/
        ├── abby-full.webp      # avatar completo (tela de entrada)
        ├── abby-head.webp      # avatar cabeça/ombros (header e chat)
        └── abihpec-logo.png    # logo ABIHPEC
```
