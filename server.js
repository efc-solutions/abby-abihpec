// Abby — Agente IA ABIHPEC
// Servidor Express: serve o front-end e expõe /api/chat e /api/sources.
// Mesma stack do RadarVisa: Node.js + Render + API da Anthropic.

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY; // protege quem pode editar a base de conhecimento
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD; // senha única pra liberar o acesso à Abby (gate de e-mail + senha)
const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL; // Web App do Apps Script que grava o uso na planilha
const DATA_FILE = path.join(__dirname, 'data', 'sources.json');
const MAX_KB_CHARS = 50000;
const MAX_SOURCE_CHARS = 6000;

// Só deixa adicionar/remover fontes quem manda o cabeçalho x-admin-key
// correto. Sem essa checagem, qualquer visitante da URL pública poderia
// editar a base.
function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) {
    return res.status(500).json({ error: 'ADMIN_KEY não configurada no servidor — edição bloqueada por segurança.' });
  }
  if (req.get('x-admin-key') !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Chave de administrador inválida ou ausente.' });
  }
  next();
}

// ---------- Persistência simples em arquivo JSON ----------
// Aviso: em hospedagem com disco efêmero (ex: Render free tier), este
// arquivo pode ser resetado a cada novo deploy. Para produção de verdade,
// trocar por um banco (ex: Postgres no Render, ou MongoDB Atlas free tier).
function readSources() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}
function writeSources(sources) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(sources, null, 2), 'utf-8');
}

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}

// ---------- Log de uso — vai direto pra planilha, não fica salvo na Abby ----------
// Dispara em segundo plano (não trava a resposta do chat) e nunca deixa um
// erro de rede/planilha derrubar a conversa — só loga no console do Render.
function logUsageToSheet(entry) {
  if (!SHEETS_WEBHOOK_URL) return;
  fetch(SHEETS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(err => console.error('Falha ao enviar uso pra planilha:', err));
}

// ---------- Prompt da Abby ----------
const SYSTEM_RULES = [
  "Você é a Abby, a assistente de IA da ABIHPEC, especializada em Inovação e Regulatório do",
  "setor de Higiene Pessoal, Perfumaria e Cosméticos (HPPC).",
  "",
  "Responda SOMENTE com base no CONTEÚDO DE REFERÊNCIA fornecido abaixo. Se a resposta não",
  "estiver nele, diga claramente que não encontrou a informação nas fontes disponíveis — não",
  "complete com conhecimento geral não verificado.",
  "",
  "Regras:",
  "- Sempre indique a fonte de cada informação usada (o nome/origem exatamente como aparece",
  "  no cabeçalho \"[Fonte: ...]\" de cada trecho).",
  "- Se a informação vier de mais de uma fonte, cite todas.",
  "- Não responda sobre medicamentos ou qualquer tema fora do setor HPPC (incluindo saneantes),",
  "  mesmo que a informação esteja disponível no conteúdo de referência ou no seu conhecimento geral.",
  "- Se estiver fora de escopo, diga que você é especializada em Inovação e Regulatório HPPC.",
  "- Tom institucional, claro, objetivo e cordial — público inclui perfis técnicos e não técnicos.",
  "- Fale na primeira pessoa como Abby, sem exagerar na personalidade; você é uma assistente",
  "  técnica confiável, não uma mascote engraçadinha."
].join("\n");

function buildKbBlock(sources) {
  let acc = [];
  let total = 0;
  const ordered = [...sources].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  for (const s of ordered) {
    const block = `[Fonte: ${s.title} — ${s.origin} (${s.category})]\n${s.content}\n`;
    if (total + block.length > MAX_KB_CHARS) continue;
    acc.push(block);
    total += block.length;
  }
  return acc.join("\n---\n\n");
}

// ---------- Rotas de fontes (CRUD simples) ----------
app.get('/api/sources', (req, res) => {
  res.json(readSources());
});

app.post('/api/sources', requireAdmin, (req, res) => {
  const { title, origin, category, content } = req.body || {};
  if (!title || !content) {
    return res.status(400).json({ error: 'Título e conteúdo são obrigatórios.' });
  }
  const sources = readSources();
  const doc = {
    id: crypto.randomUUID(),
    title: String(title).slice(0, 200),
    origin: origin ? String(origin).slice(0, 300) : '(sem origem informada)',
    category: ['Anvisa', 'Inmetro', 'ABIHPEC', 'Outro'].includes(category) ? category : 'Outro',
    content: String(content).slice(0, MAX_SOURCE_CHARS),
    addedAt: Date.now(),
  };
  sources.unshift(doc);
  writeSources(sources);
  res.status(201).json(doc);
});

app.delete('/api/sources/:id', requireAdmin, (req, res) => {
  const sources = readSources().filter(s => s.id !== req.params.id);
  writeSources(sources);
  res.status(204).end();
});

// ---------- Rota de acesso (gate por e-mail + senha única) ----------
// Não confere o e-mail contra nenhuma lista — só serve pra identificar quem
// está usando (aparece no painel de uso). Quem entra é validado só pela senha.
app.post('/api/access/verify', (req, res) => {
  if (!ACCESS_PASSWORD) {
    return res.status(500).json({ allowed: false, error: 'ACCESS_PASSWORD não configurada no servidor.' });
  }
  const email = normalizeEmail((req.body || {}).email);
  const password = String((req.body || {}).password || '');
  if (!email || !email.includes('@')) {
    return res.status(400).json({ allowed: false, error: 'Informe um e-mail válido.' });
  }
  const allowed = password === ACCESS_PASSWORD;
  res.json({ allowed });
});

// ---------- Rota de chat ----------
app.post('/api/chat', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' });
  }
  const { message, history } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Campo "message" é obrigatório.' });
  }
  const userEmail = normalizeEmail(req.get('x-user-email'));

  const sources = readSources();
  const kbBlock = buildKbBlock(sources);
  const fullInstruction = `${SYSTEM_RULES}\n\n=== CONTEÚDO DE REFERÊNCIA ===\n${kbBlock || "(nenhuma fonte cadastrada ainda)"}\n=== FIM DO CONTEÚDO DE REFERÊNCIA ===`;

  const turns = [{ role: 'user', content: fullInstruction }];
  const recent = Array.isArray(history) ? history.slice(-6) : [];
  for (const h of recent) {
    if (h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string') {
      turns.push({ role: h.role, content: h.content });
    }
  }
  turns.push({ role: 'user', content: message });

  // Mescla turnos consecutivos do mesmo papel (a API exige alternância)
  const merged = [];
  for (const t of turns) {
    if (merged.length && merged[merged.length - 1].role === t.role) {
      merged[merged.length - 1].content += '\n\n' + t.content;
    } else {
      merged.push({ ...t });
    }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: merged,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Erro da API Anthropic:', response.status, errText);
      return res.status(502).json({ error: 'Erro ao consultar a IA. Tente novamente.' });
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    const usage = data.usage || {};
    logUsageToSheet({
      email: userEmail || null,
      timestamp: Date.now(),
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
    });

    res.json({ text });
  } catch (err) {
    console.error('Erro de rede ao chamar a Anthropic API:', err);
    res.status(500).json({ error: 'Erro de conexão ao consultar a IA.' });
  }
});

app.listen(PORT, () => {
  console.log(`Abby rodando em http://localhost:${PORT}`);
});
