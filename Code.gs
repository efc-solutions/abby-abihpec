// Abby — Log de uso direto na planilha (e-mail + tokens por pergunta).
//
// COMO USAR:
// 1. Crie uma planilha Google em branco (pode chamar de "Abby — Uso").
// 2. Extensões > Apps Script.
// 3. Apague o conteúdo do arquivo "Código.gs" e cole este arquivo inteiro.
// 4. Salve (ícone de disquete).
// 5. Deploy > Nova implantação > tipo "App da Web".
//    - Executar como: Eu (seu usuário)
//    - Quem tem acesso: Qualquer pessoa
// 6. Autorize o acesso quando o Google pedir (é a sua própria planilha).
// 7. Copie a URL do app da Web gerada.
// 8. No Render, cole essa URL na variável de ambiente SHEETS_WEBHOOK_URL
//    do serviço da Abby.
//
// A aba "Uso" é criada sozinha, com cabeçalho, na primeira mensagem
// registrada — não precisa criar nada manualmente na planilha.

const ABA_USO = "Uso";

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    registrarUso(dados);
    return responder({ status: "ok" });
  } catch (err) {
    return responder({ status: "erro", mensagem: String(err) });
  }
}

function doGet(e) {
  return responder({ status: "ok", info: "Abby — webhook de log de uso" });
}

function registrarUso(dados) {
  const aba = getOuCriarAba();
  const entrada = Number(dados.inputTokens) || 0;
  const saida = Number(dados.outputTokens) || 0;
  aba.appendRow([
    dados.email || "(sem e-mail)",
    new Date(dados.timestamp || Date.now()),
    entrada,
    saida,
    entrada + saida,
  ]);
}

function getOuCriarAba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(ABA_USO);
  if (!aba) {
    aba = ss.insertSheet(ABA_USO);
    aba.appendRow(["E-mail", "Data/Hora", "Tokens entrada", "Tokens saída", "Tokens total"]);
    aba.setFrozenRows(1);
    aba.autoResizeColumns(1, 5);
  }
  return aba;
}

function responder(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Função opcional pra testar manualmente pelo próprio editor do Apps Script
// (botão "Executar" com esta função selecionada) — cria uma linha de exemplo.
function testarRegistro() {
  registrarUso({
    email: "teste@abihpec.org.br",
    timestamp: Date.now(),
    inputTokens: 1200,
    outputTokens: 300,
  });
}
