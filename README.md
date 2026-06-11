# Assinaturas

Plataforma de assinaturas digitais. O usuário desenha ou fotografa sua assinatura e ela é salva para consulta futura.

## Funcionalidades

- **Desenhar** assinatura em canvas com suporte a mouse e toque
- **Fotografar** assinatura usando a câmera ou enviar imagem
- Listar todas as assinaturas com opção de exclusão via senha de 4 dígitos
- **Modo admin** (ativado via `enableDevMode()` no console) — download individual ou ZIP de todas as assinaturas
- Temas claro/escuro automáticos

## Tecnologias

- **Frontend:** React 19, TypeScript, Vite
- **Backend:** Express 5, TypeScript
- **Imagens:** Sharp (redimensionamento e compressão JPEG)
- **Armazenamento:** Arquivos locais (JSON + uploads)

## Como rodar

### Desenvolvimento (com hot reload)

```bash
npm run dev
```

Roda o servidor (porta 3001) e o Vite (porta 5173) simultaneamente com proxy automático.

### Produção (tudo numa porta)

```bash
npm start
```

Compila o frontend e sobe o servidor em `http://localhost:3001` servindo o app completo.

## Deploy

1. Crie um Web Service no [Render](https://render.com)
2. Conecte o repositório
3. Configure:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Pronto — o Render builda e serve o app completo na mesma URL
