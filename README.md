# Royal Barber

Site responsivo da Royal Barber, em português, com catálogo persistente e painel administrativo. Identidade visual inspirada nos materiais fornecidos: azul-marinho, preto, dourado, coroas e tipografia clássica.

## O que está incluído

- Página inicial, apresentação da barbearia, serviços, planos mensais, cursos, perguntas frequentes e contato.
- Agendamento e adesão aos planos pelo WhatsApp **(81) 98103-8416**, com mensagens específicas para cada opção.
- Instagram **[@royalbarber_rec](https://www.instagram.com/royalbarber_rec/)** e rota no Google Maps.
- Endereço: **Rua Santo Elias, 344 — Cajueiro Seco, Jaboatão dos Guararapes — PE, 54330-230**.
- Planos dos anexos: Bronze **R$ 99,90**, Prata **R$ 119,90**, Ouro **R$ 139,90** e Diamante **R$ 159,90** por mês.
- Administração em `/admin`: criar, editar, ocultar e excluir serviços e planos; alterar preços e descrições.
- Banco SQLite em disco, senha com hash scrypt, sessão com cookie HttpOnly, proteção CSRF e limite de tentativas de login.

Os preços dos serviços avulsos, horários de funcionamento, carga horária e valores dos cursos não constavam nos anexos. O site orienta a consultar a equipe; esses dados não foram inventados. “Agendar” abre uma conversa: não reserva automaticamente um horário. O site não processa pagamentos nem cobra assinaturas.

## 1. Instalar e executar

Requisito: **Node.js 24 ou superior**. Não são necessários serviços externos ou dependências npm para executar a aplicação. O SQLite é fornecido pelo Node.

```bash
git clone https://github.com/cleitonkeliton/barbearia.git
cd barbearia
npm ci
npm start
```

Acesse `http://localhost:3000` no seu computador. Para desenvolvimento com reinício automático:

```bash
npm run dev
```

Opcionalmente, copie `.env.example` para `.env` e personalize a configuração. Os scripts carregam esse arquivo automaticamente. Nunca versione a senha ou o diretório `data/`.

| Variável   | Padrão          | Uso                                                                                |
| ---------- | --------------- | ---------------------------------------------------------------------------------- |
| `PORT`     | `3000`          | Porta HTTP                                                                         |
| `HOST`     | `0.0.0.0`       | Interface de escuta                                                                |
| `DATA_DIR` | `./data`        | Diretório persistente para banco e hash da senha; use caminho absoluto em produção |
| `NODE_ENV` | desenvolvimento | Use `production` quando servido por HTTPS para ativar cookie Secure                |

## 2. Configurar a administração

Não existe senha padrão. Na pasta do projeto, execute:

```bash
npm run admin:setup
```

Defina uma senha exclusiva de pelo menos 12 caracteres. O comando salva apenas o hash em `data/admin.json`. Reinicie o servidor se estiver trocando uma senha, para encerrar as sessões anteriores.

Em automação, o comando também aceita `ADMIN_PASSWORD` no ambiente. Injete a variável por um gerenciador de segredos, execute `npm run admin:setup` e remova a variável do ambiente do servidor. Não grave valores em scripts, README, argumentos de comandos ou commits.

1. Abra `/admin` e entre com a senha definida.
2. Para adicionar: preencha nome, categoria, descrição e preço; clique em **Salvar item**.
3. Para editar: clique em **Editar**, altere os campos e salve.
4. Deixe o preço vazio para exibir **Sob consulta**. Planos com preço informado mostram o valor **por mês**.
5. Desmarque **Publicar no site** para ocultar um item sem apagar seus dados.
6. **Excluir** remove definitivamente o item após confirmação.
7. Recarregue a página pública para conferir as alterações. A sessão expira em oito horas e também no reinício do servidor.

## 3. Testar

```bash
npm run check
npm test
```

Os testes iniciam um servidor real em porta aleatória e usam banco temporário. Verificam catálogo e preços iniciais, autenticação, cookies, CSRF, bloqueio de origem externa, validação, criação/edição/exclusão, ocultação, persistência após reinício, logout e bloqueio por excesso de tentativas. Não modificam o banco usado pelo site.

## 4. Publicar na internet

O envio ao GitHub publica o **código**. Para colocar o site no ar, use hospedagem com **Node 24+, processo HTTP e disco persistente** (por exemplo, um servidor ou plano de hospedagem que suporte volumes).

1. Conecte este repositório à hospedagem.
2. Configure instalação `npm ci` e inicialização `npm start`.
3. Monte um disco persistente e defina `DATA_DIR` com seu caminho absoluto. Banco e senha precisam permanecer no mesmo volume entre reinícios e novas versões.
4. Configure `NODE_ENV=production`. Use HTTPS no domínio público e um proxy reverso que preserve o cabeçalho `Host` do domínio.
5. Execute `npm run admin:setup` no ambiente de produção, com o mesmo `DATA_DIR` e uma senha nova. Não há credencial de demonstração publicada.
6. Confirme a página inicial, o acesso a `/admin` e a edição de um item. Reinicie e confira a persistência.
7. Configure backups do diretório de dados. Pare o processo antes de copiar todo o diretório ou use uma ferramenta de backup do SQLite compatível com WAL. Proteja o backup, pois ele contém o hash da senha.

**GitHub Pages não executa este backend**. Hospedagem somente estática, armazenamento efêmero ou múltiplas réplicas com bancos separados não suportam a administração persistente desta versão. Execute uma única instância; as sessões ficam na memória e exigem novo login após reinício. O limite de login é por IP da conexão; atrás de um proxy compartilhado, complemente com limitação no proxy.

Não foi contratado domínio nem publicado um serviço de hospedagem automaticamente. Esses passos dependem do provedor escolhido.

## Organização e personalização

```text
public/index.html   Página pública e informações da barbearia
public/styles.css   Identidade visual e layout responsivo
public/app.js       Catálogo e links de WhatsApp
public/admin.html   Interface administrativa
public/admin.js     Login e edição do catálogo
public/brand.svg    Emblema vetorial inspirado na identidade fornecida
server.js           Servidor HTTP, autenticação e SQLite
scripts/admin.js    Configuração ou troca da senha
test/server.test.js Testes de integração
```

O emblema é uma adaptação vetorial, não uma extração do logotipo original das capturas do Instagram. Para reprodução exata, substitua `public/brand.svg` por um arquivo oficial, mantendo as referências ou ajustando-as no HTML. Imagens decorativas representam o conceito visual e não devem ser apresentadas como fotografias reais do estabelecimento.

O painel controla serviços e planos. Endereço, telefone, cursos e textos institucionais estão no HTML. Para atualizar um plano, mantenha seus benefícios na descrição e seu valor no campo preço.

## Melhorias sugeridas

- Incluir fotos reais da fachada, ambiente, equipe e cortes, com autorização.
- Informar horários de funcionamento e regras detalhadas dos planos.
- Integrar agenda com disponibilidade real e confirmação automática.
- Adicionar pagamentos recorrentes somente após definir cancelamento, cobrança e termos.
- Ampliar o painel para horários, galeria, cursos e textos institucionais.
- Incluir avaliações verificadas e uma política de privacidade quando houver coleta de dados além do contato direto pelo WhatsApp.
