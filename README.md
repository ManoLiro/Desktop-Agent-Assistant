# Perssua — Assistente Contextual Desktop (Windows)

O **Perssua** é um assistente contextual local para Windows (Windows 10 versão 2004+ e Windows 11 x64), desenvolvido como copiloto de alto desempenho para reuniões de trabalho, aulas, programação em par e preparação para entrevistas técnicas.

O aplicativo opera como um painel flutuante sem bordas com **proteção ativa contra captura acidental de tela** (invisível em compartilhamentos de tela do Zoom, Google Meet, Teams, Discord e OBS Studio), captura de áudio do sistema (_loopback_) processada localmente via **whisper.cpp** e raciocínio multimodal através do SDK oficial do **Google Gemini** (`@google/genai`).

---

## 1. Arquitetura e Decisões de Engenharia

- **Processo Principal (Electron Main):**
  - **Proteção DWM de Tela:** Aplicação de `BrowserWindow.setContentProtection(true)` com afinidade nativa `WDA_EXCLUDEFROMCAPTURE` antes da exibição de qualquer superfície de janela.
  - **Segurança de Chaves:** A chave do Gemini é informada na interface e enviada ao processo principal, que só a salva quando a criptografia do sistema está disponível por meio do `safeStorage` (DPAPI no Windows).
  - **Coordenador de Requisições (`GenerationCoordinator`):** Gerenciamento síncrono de concorrência com **preempção imediata**: pedidos manuais do usuário cancelam automaticamente tarefas em segundo plano do `AutoAssist`, evitando bloqueios.
  - **Orquestração de Contexto (`ContextService`):** Orçamento disciplinado de tokens (~3.8 caracteres/token) com descarte hierárquico nas fronteiras de mensagens, truncamento suave de anotações longas e reconstrução temporal de trechos de fala com limites de duração.
  - **whisper.cpp Local:** Gerenciamento do ciclo de vida de `whisper-server.exe` em `127.0.0.1:8089` com healthcheck ativo, Voice Activity Detection (VAD RMS) e deduplicação inteligente de overlap de áudio.
- **Processo Preload:**
  - Bridge fortemente tipada e blindada (`contextBridge.exposeInMainWorld('perssua', ...)`), sem Node genérico ou acesso direto ao SO no Renderer.
- **Processo Renderer & Janela Oculta de Áudio:**
  - Interface compacta em tema escuro com suporte a Markdown rico e renderização de fórmulas matemáticas KaTeX.
  - Janela secundária em segundo plano (`audio-worker.html`) com `AudioWorklet` nativo em Web Audio API para downsampling contínuo de loopback para 16kHz Mono 16-bit PCM.

---

## 2. Instalação e Execução

### Pré-requisitos

- **Sistema Operacional:** Windows 10 (Build 19041+) ou Windows 11 x64.
- **Node.js:** Versão 20.x ou superior e **npm**.

### Passo a Passo

```bash
# 1. Clonar o repositório e entrar na pasta
git clone https://github.com/ManoLiro/Desktop-Agent-Assistant.git
cd Desktop-Agent-Assistant

# 2. Instalar as dependências do projeto
npm install

# 3. Executar a suíte de testes automatizados
npm test

# 4. Validar tipagem TypeScript estrita (Node + Web)
npm run typecheck

# 5. Iniciar em modo de desenvolvimento (Hot Reload)
npm run dev
```

---

## 3. Configuração do whisper.cpp (Transcrição Local)

O Perssua não envia áudio do microfone ou da reunião para a nuvem. Toda a transcrição de voz é executada localmente no computador através do **whisper.cpp**.

### 3.1. Download do Binário do Servidor (Windows x64)

1. Acesse os [Releases Oficiais do whisper.cpp no GitHub](https://github.com/ggml-org/whisper.cpp/releases).
2. Baixe o pacote compactado para Windows x64:
   - **Para computadores padrão (CPU com suporte a AVX/AVX2):** Baixe `whisper-bin-x64.zip` (ou `whisper-cublas-bin-x64.zip` caso possua placa de vídeo NVIDIA dedicada).
3. Extraia o conteúdo para uma pasta no seu computador, por exemplo:
   ```
   C:\tools\whisper\
   ```
4. Certifique-se de que o arquivo `whisper-server.exe` está presente nesse diretório.

### 3.2. Download dos Modelos GGML Recomendados

Baixe o arquivo de modelo desejado e salve-o em `C:\tools\whisper\models\`:

| Modelo GGML          | Tamanho | Memória RAM | Latência (CPU) | Recomendação de Uso                                                                                                    | Link de Download Direto                                                                           |
| :------------------- | :------ | :---------- | :------------- | :--------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| **`ggml-base.bin`**  | ~148 MB | ~500 MB     | ~150–250 ms    | **Recomendado para início rápido.** Excelente velocidade e baixo consumo de CPU.                                       | [Baixar ggml-base.bin](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin)   |
| **`ggml-small.bin`** | ~488 MB | ~1.2 GB     | ~400–600 ms    | **Recomendado para entrevistas técnicas.** Maior precisão para termos de programação e inglês misturado com português. | [Baixar ggml-small.bin](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin) |

### 3.3. Configurar os Caminhos no Perssua

1. Abra o Perssua e clique no ícone de engrenagem ⚙️ (no canto superior da barra de navegação).
2. Acesse a aba **whisper.cpp**.
3. Preencha os campos com os caminhos absolutos:
   - **Caminho do whisper-server.exe:** `C:\tools\whisper\whisper-server.exe`
   - **Caminho do Modelo ggml-\*.bin:** `C:\tools\whisper\models\ggml-base.bin` (ou `ggml-small.bin`)
4. Quando você ativar o assistente (`Ctrl+Alt+Space`), o Perssua inicializará o servidor automaticamente em segundo plano.

---

## 4. Configuração da API Key do Google Gemini

1. Crie uma chave de API gratuita no [Google AI Studio](https://aistudio.google.com/).
2. No Perssua, abra as Configurações (⚙️) na aba **Geral & IA**.
3. Cole a sua chave no campo e clique em **Salvar**.
4. Após o salvamento, o campo é limpo e o valor fica armazenado com criptografia DPAPI do Windows via `safeStorage`. Se a criptografia não estiver disponível, a chave não é salva.

Chaves que versões anteriores tenham gravado em Base64 são migradas para armazenamento criptografado quando o `safeStorage` estiver disponível. Até essa migração, o arquivo antigo continua no diretório de dados do aplicativo.

---

## 5. Mapeamento de Atalhos de Teclado

### 5.1. Atalhos Globais do Sistema (Funcionam com qualquer aplicativo em foco)

Todos os atalhos globais possuem detecção de conflito no Windows e podem ser customizados na aba **Atalhos** das configurações:

| Atalho Padrão        | Ação                              | Descrição                                                                               |
| :------------------- | :-------------------------------- | :-------------------------------------------------------------------------------------- |
| `Ctrl+Alt+Space`     | **Ativar / Desativar Assistente** | Chave mestra: inicia/encerra captura de áudio, transcrição e IA.                        |
| `Ctrl+Alt+O`         | **Mostrar / Ocultar Painel**      | Oculta a janela; mantém a transcrição ativa em background.                              |
| `Ctrl+Alt+Enter`     | **Focar Chat em Modo Edição**     | Abre a janela e foca imediatamente no campo de digitação do chat.                       |
| `Ctrl+Alt+S`         | **Explicar Tela**                 | Captura o monitor selecionado e explica código, interfaces ou diagramas.                |
| `Ctrl+Alt+R`         | **Sugerir Resposta**              | Varre a transcrição recente pela última pergunta e propõe fala curta + pontos técnicos. |
| `Ctrl+Alt+M`         | **Resumir Trecho Recente**        | Condensa a discussão recente em Tópicos, Decisões e Próximos Passos.                    |
| `Ctrl+Alt+T`         | **Iniciar / Pausar Transcrição**  | Pausa temporariamente a captura de áudio sem desativar a sessão.                        |
| `Ctrl+Alt+N`         | **Abrir Notas**                   | Alterna diretamente para a aba de roteiro e anotações do usuário.                       |
| `Ctrl+Alt+Backspace` | **Interrupção de Pânico**         | Cancela imediatamente qualquer geração ativa, para áudio e oculta a janela.             |

### 5.2. Navegação Interna (Com foco no painel)

- `Ctrl+1`: Alternar para a aba **Chat**.
- `Ctrl+2`: Alternar para a aba **Transcrição**.
- `Ctrl+3`: Alternar para a aba **Notas**.
- `Enter`: Enviar mensagem no chat.
- `Shift+Enter`: Inserir nova linha no campo de texto.
- `Esc`: Cancelar geração de resposta em andamento ou alternar do modo de edição para consulta passiva (`query`).
- `Ctrl+Shift+C`: Copiar a última resposta gerada pelo assistente para a área de transferência.

---

## 6. Matriz de Testes de Proteção de Captura de Tela

O Perssua utiliza a flag nativa `WDA_EXCLUDEFROMCAPTURE` do Desktop Window Manager (DWM) da Microsoft via `BrowserWindow.setContentProtection(true)`.

### Tabela de Compatibilidade

| Software de Reunião / Gravação | Versão Testada | Modo de Compartilhamento    | Resultado no Destinatário / Gravação | Comportamento Técnico                                                  |
| :----------------------------- | :------------- | :-------------------------- | :----------------------------------- | :--------------------------------------------------------------------- |
| **OBS Studio**                 | 30.2+          | Captura de Tela (Desktop)   | **Completamente Invisível**          | Janela excluída pelo compositing do DWM.                               |
| **OBS Studio**                 | 30.2+          | Captura de Janela (BitBlt)  | **Retângulo Preto**                  | Modo legado BitBlt não consegue ler a superfície de vídeo protegida.   |
| **Google Meet**                | Chrome 131+    | Compartilhar "Tela Inteira" | **Completamente Invisível**          | O participante remoto vê sua área de trabalho sem a janela do Perssua. |
| **Google Meet**                | Chrome 131+    | Compartilhar "Janela"       | **Não Selecionável**                 | A janela do Perssua é omitida da lista de janelas selecionáveis.       |
| **Microsoft Teams**            | Atual (24243+) | Compartilhar Tela Inteira   | **Completamente Invisível**          | Windows Graphics Capture API respeita afinidade de exclusão.           |
| **Zoom**                       | 6.2+           | Compartilhar Tela Inteira   | **Completamente Invisível**          | Validado no Windows 11 com aceleração de hardware ativa.               |
| **Discord**                    | Atual          | Compartilhamento de Telas   | **Completamente Invisível**          | Validado em transmissão de tela inteira em 1080p/60fps.                |

> **Nota de Transparência Técnica:** A proteção de conteúdo baseada em `WDA_EXCLUDEFROMCAPTURE` opera na camada de composição da GPU do Windows. Placas de captura físicas externas conectadas via cabo HDMI (ex: Elgato Cam Link / pass-through de hardware) ou drivers de espelhamento que operam em modo Kernel capturam o sinal bruto de saída HDMI antes do processamento do DWM.

---

## 7. Como Gerar o Instalador Windows (Empacotamento)

O Perssua está configurado para gerar tanto o instalador com assistente (**NSIS**) quanto o executável independente (**Portable**) para Windows x64:

```bash
# 1. Gerar instalador completo NSIS (Perssua-Setup-1.0.0.exe)
npm run build:win:nsis

# 2. Gerar executável independente Portable (Perssua-Portable-1.0.0.exe)
npm run build:win:portable

# 3. Gerar ambos os formatos de uma única vez
npm run build:win
```

Os arquivos compilados serão gerados na pasta `dist/`:

- `dist/Perssua-Setup-1.0.0.exe`: Instalador completo com criação de atalhos e desinstalador limpo.
- `dist/Perssua-Portable-1.0.0.exe`: Executável portátil para pendrive ou execução direta sem instalação.

---

## 8. Checklist de Validação Manual

- [x] Ocultar o painel (`Ctrl+Alt+O`) mantém o áudio loopback gravando e transcrevendo em background.
- [x] Desativar o assistente (`Ctrl+Alt+Space`) encerra a captura, mata o whisper-server e cancela requisições ativas, mantendo as anotações do usuário intactas.
- [x] Ação "Sugerir Resposta" (`Ctrl+Alt+R`) funde frases de áudio fragmentadas e identifica a pergunta mais recente, oferecendo sugestão de fala curta e tópicos técnicos.
- [x] Ação "Resumir Trecho Recente" (`Ctrl+Alt+M`) calcula o intervalo exato de horário pós-descarte do orçamento de tokens.
- [x] AutoAssist periódico respeita o intervalo configurado (30s), cede prioridade a qualquer comando manual e não sobrepõe gerações ativas.
- [x] O botão de fechar (`X`) minimiza o aplicativo para a bandeja do sistema; o menu de contexto da bandeja permite reabrir o painel ou encerrar completamente a aplicação.
