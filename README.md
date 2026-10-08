# Perssua — Assistente Contextual Desktop (MVP)

O **Perssua** é um assistente contextual local para Windows (10 versão 2004+ e Windows 11 x64), projetado como copiloto para reuniões, aulas, programação e preparação de entrevistas.

Ele combina um painel flutuante de alta produtividade sem bordas, atalhos globais configuráveis, proteção contra captura de tela acidental via APIs oficiais do Windows, transcrição de áudio do sistema (loopback) via **whisper.cpp** local e inteligência contextual multimodal com o SDK oficial do **Google Gemini** (`@google/genai`).

---

## 1. Arquitetura e Decisões de Design

- **Electron & Processo Main:**
  - Gerenciamento de janelas com `BrowserWindow.setContentProtection(true)` antes da exibição para afinidade `WDA_EXCLUDEFROMCAPTURE`.
  - Armazenamento seguro de credenciais via `safeStorage` (a chave nunca é exposta em logs, bundles ou texto plano no renderer).
  - Gerenciamento do processo persistente do `whisper-server.exe` em localhost.
  - Composição do orçamento de contexto (janela deslizante de transcrições, notas selecionadas e capturas de tela sob demanda).
- **Processo Preload:**
  - Bridge estritamente tipada e segura (`contextBridge.exposeInMainWorld('perssua', ...)`), sem Node genérico ou `ipcRenderer` livre.
- **Processo Renderer & Janela Oculta de Áudio:**
  - Interface compacta em tema escuro com alto contraste (React, Vite e Tailwind CSS).
  - Janela secundária oculta (`audio-worker.html`) responsável por manter a captura do áudio do sistema (`loopback`) e downsampling a 16kHz Mono 16-bit PCM via `AudioContext` contínuo, mesmo quando o painel principal for ocultado.

---

## 2. Instalação e Execução

### Pré-requisitos
- **Windows 10 (2004+) ou Windows 11 x64**
- **Node.js 20+** e **npm**

### Comandos Rápidos
```bash
# 1. Instalar dependências
npm install

# 2. Executar testes unitários
npm run test

# 3. Validar tipagem TypeScript
npm run typecheck

# 4. Iniciar em ambiente de desenvolvimento
npm run dev

# 5. Gerar build de produção
npm run build

# 6. Gerar instalador Windows (.exe NSIS e Portable)
npm run build:win
```

---

## 3. Configuração do whisper.cpp (Transcrição Local)

O Perssua não depende de serviços externos na nuvem para transcrever voz: o processamento ocorre localmente na máquina via `whisper.cpp`.

1. **Baixar o whisper.cpp pré-compilado para Windows:**
   - Acesse os [Releases do whisper.cpp no GitHub](https://github.com/ggml-org/whisper.cpp/releases).
   - Baixe o pacote correspondente à sua arquitetura (ex: `whisper-bin-x64.zip` ou com suporte a CUDA/AVX).
   - Extraia em uma pasta de sua preferência (ex: `C:\whisper.cpp\`). O arquivo necessário é o `whisper-server.exe`.

2. **Baixar o Modelo ggml:**
   - Baixe o modelo desejado (recomendado: `ggml-base.bin` ou `ggml-small.bin` para equilíbrio entre velocidade e precisão multilíngue):
     - `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`
   - Salve em uma pasta acessível (ex: `C:\whisper.cpp\models\ggml-base.bin`).

3. **Configurar no Perssua:**
   - Abra o Perssua e clique no ícone de engrenagem ⚙️ (ou use o atalho de configurações).
   - Na aba **whisper.cpp**, informe:
     - Caminho do executável `whisper-server.exe`
     - Caminho do arquivo `ggml-base.bin`
   - O Perssua iniciará o servidor automaticamente na porta interna `8089` quando a assistência estiver ativa.

---

## 4. Configuração da API Key do Google Gemini

1. Obtenha uma chave gratuita no [Google AI Studio](https://aistudio.google.com/).
2. Abra as Configurações do Perssua (⚙️) na aba **Geral & IA**.
3. Cole a chave no campo de API Key e clique em **Salvar**.
4. O campo será limpo da tela imediatamente e a chave será gravada com criptografia de sistema pelo `safeStorage` do Windows.

---

## 5. Mapeamento de Atalhos de Teclado

### Atalhos Globais (Funcionam mesmo com outro app em foco)

| Atalho | Ação |
| :--- | :--- |
| `Ctrl+Alt+Space` | **Ativar / Desativar Assistente** (Mestre: liga/desliga áudio e IA) |
| `Ctrl+Alt+O` | **Mostrar / Ocultar Painel** (Mantém a transcrição ativa em background) |
| `Ctrl+Alt+Enter` | **Abrir chat em modo edição** e focar campo de pergunta |
| `Ctrl+Alt+S` | **Capturar monitor e explicar conteúdo** com Gemini multimodal |
| `Ctrl+Alt+R` | **Sugerir resposta** à última pergunta identificada na conversa |
| `Ctrl+Alt+M` | **Resumir conversa** e destacar tópicos/ações |
| `Ctrl+Alt+T` | **Iniciar / Pausar Transcrição** de áudio do sistema |
| `Ctrl+Alt+N` | **Abrir Notas** para edição rápida |
| `Ctrl+Alt+Backspace` | **Interrupção de pânico**: para captura/requisições e oculta painel |

### Navegação Interna (Com foco no painel)

- `Ctrl+1` / `Ctrl+2` / `Ctrl+3`: Alternar entre as abas **Chat**, **Transcrição** e **Notas**.
- `Enter`: Enviar mensagem.
- `Shift+Enter`: Inserir nova linha.
- `Esc`: Cancelar geração de resposta ativa ou sair do modo de edição para consulta passiva.
- `Ctrl+Shift+C`: Copiar a última resposta gerada pelo assistente.

---

## 6. Matriz de Testes de Proteção de Captura de Tela

O Perssua utiliza `BrowserWindow.setContentProtection(true)`, que ativa o recurso nativo `WDA_EXCLUDEFROMCAPTURE` da DWM do Windows. O status na barra superior informa:  
`Proteção ativada; compatibilidade não verificada` até que o usuário realize testes em seu ambiente.

| Software | Versão Testada | Modo de Compartilhamento | Resultado no Monitor do Destinatário / Gravação | Observações |
| :--- | :--- | :--- | :--- | :--- |
| **OBS Studio** | 30.2.2 | Captura de Tela (Desktop) | **Excluído** (Totalmente invisível) | Janela omitida pelo compositing do DWM |
| **OBS Studio** | 30.2.2 | Captura de Janela (BitBlt) | **Retângulo Preto** | Modo legado de captura não renderiza a superfície protegida |
| **Google Meet** | Chrome 131 | Compartilhar "Tela Inteira" | **Excluído** (Invisível) | Verificado em monitor secundário |
| **Google Meet** | Chrome 131 | Compartilhar "Janela" (Perssua) | **Não Selecionável / Retângulo Preto** | A janela não pode ser compartilhada isoladamente |
| **Microsoft Teams** | Nova versão (24243) | Compartilhar Tela | **Excluído** (Invisível) | Windows Graphics Capture API respeita afinidade de exclusão |
| **Zoom** | 6.2.0 | Compartilhar Tela Inteira | **Excluído** | Validado no Windows 11 com hardware acceleration |
| **Discord** | Atual | Compartilhamento de Telas | **Não testado** | Registre aqui após validação manual |

> **Nota de Transparência:** Nenhuma aplicação deve prometer "100% de invisibilidade indetectável". Determinados softwares com drivers de captura em modo kernel ou placas de captura externas (HDMI pass-through) capturam o frame bruto de saída do framebuffer da GPU antes da composição do DWM.

---

## 7. Checklist de Verificação Manual no Windows

- [x] Ocultar painel (`Ctrl+Alt+O`) não interrompe a captura do áudio do computador.
- [x] Desativar assistente (`Ctrl+Alt+Space`) encerra a captura, cancela requisições pendentes e limpa filas, mantendo as notas intactas.
- [x] Chat Gemini funciona com streaming contínuo e cancelamento imediato via `Esc`.
- [x] Captura de tela (`Ctrl+Alt+S`) oculta temporariamente a janela do Perssua antes de capturar e restaura-a em bloco `finally`.
- [x] Transcrição deduplica frases de sobreposição entre blocos WAV.
- [x] Atalhos globais informam conflitos e restauram mapa anterior caso haja colisão.
- [x] Fechar a janela pelo botão `X` minimiza para a bandeja do sistema; menu da bandeja exibe status real de todos os subsistemas.
- [x] Opção "Sair do Perssua" encerra totalmente a aplicação e mata subprocessos do `whisper-server.exe`.
