'use strict';

/* =========================================================
   Agenda — versão web (roda 100% no navegador)
   Os dados ficam no localStorage do aparelho.
   Mesma lógica do programa em C++: clientes, agendamentos,
   aviso de horário ocupado, busca por nome/telefone, etc.
   ========================================================= */

const CHAVE = 'agenda_dados_v1';
const CHAVE_BACKUP = 'agenda_ultimo_backup';
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/* ---------- utilidades ---------- */

const $ = (sel, raiz = document) => raiz.querySelector(sel);

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// minúsculas e sem acentos, para buscar e comparar nomes
function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function somenteDigitos(s) { return String(s ?? '').replace(/\D/g, ''); }
function pad2(n) { return String(n).padStart(2, '0'); }
function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
function capitalizar(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function inicial(nome) { return (String(nome).trim().charAt(0) || '?').toUpperCase(); }

function lerLS(chave) { try { return localStorage.getItem(chave); } catch (e) { return null; } }
function gravarLS(chave, valor) { try { localStorage.setItem(chave, valor); return true; } catch (e) { return false; } }

/* ---------- datas ---------- */

function paraISO(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function hojeISO() { return paraISO(new Date()); }
function dataDeISO(iso) { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); }
function somarDias(iso, n) { const d = dataDeISO(iso); d.setDate(d.getDate() + n); return paraISO(d); }
function dataBR(iso) { const [a, m, d] = iso.split('-'); return d + '/' + m + '/' + a; }
function diaDaSemana(iso) { return DIAS_SEMANA[dataDeISO(iso).getDay()]; }

function dataValida(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = dataDeISO(iso);
  const ano = d.getFullYear();
  return paraISO(d) === iso && ano >= 1900 && ano <= 2100;
}

function rotuloRelativo(iso) {
  const hoje = hojeISO();
  if (iso === hoje) return 'Hoje';
  if (iso === somarDias(hoje, 1)) return 'Amanhã';
  if (iso === somarDias(hoje, -1)) return 'Ontem';
  return '';
}

/* ---------- valores em dinheiro (guardados em centavos) ---------- */

// Aceita: 50   50,00   50.5   R$ 35,50   1.250,00
function interpretarValor(entrada) {
  let t = String(entrada ?? '').replace(/\s/g, '').replace(/^r\$/i, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const m = t.match(/^(\d*)(?:\.(\d{0,2}))?$/);
  if (!m) return null;
  const inteira = m[1] || '';
  const fracao = m[2] || '';
  if (!inteira && !fracao) return null;
  if (inteira.length > 9) return null;
  return parseInt(inteira || '0', 10) * 100 + parseInt(fracao.padEnd(2, '0'), 10);
}

function formatarValor(centavos) {
  const reais = String(Math.floor(centavos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'R$ ' + reais + ',' + pad2(centavos % 100);
}

function valorParaCampo(centavos) {
  return (centavos / 100).toFixed(2).replace('.', ',');
}

/* ---------- dados ---------- */

function dadosVazios() {
  return { clientes: [], agendamentos: [], proximoIdCliente: 1, proximoIdAgendamento: 1 };
}

function ordenarTudo(d) {
  d.clientes.sort((a, b) => cmp(normalizar(a.nome), normalizar(b.nome)) || a.id - b.id);
  d.agendamentos.sort((a, b) => cmp(a.data, b.data) || cmp(a.horario, b.horario) || a.id - b.id);
}

// Confere (e limpa) um objeto de dados vindo do disco ou de um arquivo de backup.
function validarDados(obj) {
  if (!obj || !Array.isArray(obj.clientes) || !Array.isArray(obj.agendamentos)) return null;
  const d = dadosVazios();
  const idsClientes = new Set();
  const idsAgs = new Set();

  for (const c of obj.clientes) {
    const id = Number(c && c.id);
    const nome = String((c && c.nome) ?? '').trim();
    if (!Number.isInteger(id) || id <= 0 || !nome || idsClientes.has(id)) continue;
    idsClientes.add(id);
    d.clientes.push({
      id,
      nome,
      telefone: String(c.telefone ?? '').trim(),
      anotacoes: String(c.anotacoes ?? '').trim()
    });
  }

  for (const a of obj.agendamentos) {
    if (!a) continue;
    const id = Number(a.id);
    const clienteId = Number(a.clienteId);
    const valor = Number(a.valorCentavos);
    if (!Number.isInteger(id) || id <= 0 || idsAgs.has(id)) continue;
    if (!dataValida(String(a.data)) || !/^\d{2}:\d{2}$/.test(String(a.horario))) continue;
    if (!Number.isInteger(valor) || valor < 0) continue;
    idsAgs.add(id);
    d.agendamentos.push({
      id,
      clienteId: Number.isInteger(clienteId) ? clienteId : 0,
      data: a.data,
      horario: a.horario,
      servico: String(a.servico ?? '').trim(),
      valorCentavos: valor
    });
  }

  d.proximoIdCliente = Math.max(Number(obj.proximoIdCliente) || 1, ...d.clientes.map((c) => c.id + 1));
  d.proximoIdAgendamento = Math.max(Number(obj.proximoIdAgendamento) || 1, ...d.agendamentos.map((a) => a.id + 1));
  ordenarTudo(d);
  return d;
}

function carregar() {
  const bruto = lerLS(CHAVE);
  if (bruto) {
    try {
      const d = validarDados(JSON.parse(bruto));
      if (d) return d;
    } catch (e) { /* dados corrompidos: começa vazio */ }
  }
  return dadosVazios();
}

let dados = carregar();

const ui = {
  aba: 'agenda',       // agenda | clientes | backup
  modo: 'dia',         // dia | todos
  filtro: 'proximos',  // proximos | passados | todos (no modo "todos")
  dia: hojeISO(),
  busca: ''
};

let ultimoHoje = hojeISO();

function salvar() {
  if (!gravarLS(CHAVE, JSON.stringify(dados))) {
    toast('Não foi possível salvar os dados!', 'erro');
    return false;
  }
  return true;
}

/* ---------- consultas ---------- */

const acharCliente = (id) => dados.clientes.find((c) => c.id === id) || null;
const acharAg = (id) => dados.agendamentos.find((a) => a.id === id) || null;
const nomeDoCliente = (id) => { const c = acharCliente(id); return c ? c.nome : '(cliente removido)'; };
const contarAgDoCliente = (id) => dados.agendamentos.filter((a) => a.clienteId === id).length;
const somaValores = (lista) => lista.reduce((t, a) => t + a.valorCentavos, 0);

function buscarClientes(termo) {
  const t = normalizar(termo);
  const dig = somenteDigitos(termo);
  if (!t) return [];
  return dados.clientes
    .filter((c) => normalizar(c.nome).includes(t) || (dig && somenteDigitos(c.telefone).includes(dig)))
    .map((c) => c.id);
}

function acharConflito(data, hora, ignorarId) {
  return dados.agendamentos.find((a) => a.id !== ignorarId && a.data === data && a.horario === hora) || null;
}

/* =========================================================
   Aviso rápido e diálogo de confirmação
   ========================================================= */

let timerToast = 0;
function toast(msg, tipo) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (tipo === 'erro' ? ' erro-t' : '');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('show'), 2600);
}

function confirmar({ titulo, texto, ok = 'Confirmar', cancelar = 'Cancelar', perigo = false }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'dialog-wrap';
    el.innerHTML =
      '<div class="dialog" role="alertdialog" aria-modal="true">' +
      '<h3>' + esc(titulo) + '</h3>' +
      '<p>' + esc(texto) + '</p>' +
      '<div class="dialog-bt">' +
      '<button type="button" class="btn sec" data-r="0">' + esc(cancelar) + '</button>' +
      '<button type="button" class="btn ' + (perigo ? 'perigo-cheio' : 'prim') + '" data-r="1">' + esc(ok) + '</button>' +
      '</div></div>';
    const fechar = (resp) => { el.remove(); resolve(resp); };
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-r]');
      if (b) fechar(b.dataset.r === '1');
      else if (ev.target === el) fechar(false);
    });
    document.body.appendChild(el);
  });
}

/* =========================================================
   Folhas (bottom sheets) empilháveis
   ========================================================= */

const pilha = [];

function abrirSheet({ titulo, corpo, aoAbrir }) {
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.innerHTML =
    '<div class="backdrop" data-action="fechar-sheet"></div>' +
    '<section class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(titulo) + '">' +
    '<header class="sheet-h"><button type="button" class="link" data-action="fechar-sheet">Fechar</button>' +
    '<h2>' + esc(titulo) + '</h2><span></span></header>' +
    '<div class="sheet-b">' + corpo + '</div></section>';
  $('#sheetRoot').appendChild(el);
  pilha.push(el);
  document.body.classList.add('travado');
  void el.offsetWidth; // força o navegador a registrar o estado inicial antes da animação
  el.classList.add('aberto');
  if (aoAbrir) aoAbrir(el);
  return el;
}

function fecharSheet() {
  const el = pilha.pop();
  if (!el) return;
  el.classList.remove('aberto');
  setTimeout(() => el.remove(), 280);
  if (!pilha.length) {
    document.body.classList.remove('travado');
    render();
  }
}

function fecharTudo() {
  if (!pilha.length) { render(); return; }
  while (pilha.length) fecharSheet();
}

/* =========================================================
   Telas principais
   ========================================================= */

function atualizarTopo() {
  const titulos = { agenda: 'Agenda', clientes: 'Clientes', backup: 'Backup' };
  $('#titulo').textContent = titulos[ui.aba];
  let sub = '';
  if (ui.aba === 'agenda') {
    const hoje = hojeISO();
    const n = dados.agendamentos.filter((a) => a.data === hoje).length;
    sub = 'Hoje (' + dataBR(hoje) + '): ' + plural(n, 'agendamento', 'agendamentos');
  } else if (ui.aba === 'clientes') {
    sub = plural(dados.clientes.length, 'cliente cadastrado', 'clientes cadastrados');
  } else {
    sub = 'Salve uma cópia dos seus dados';
  }
  $('#subtitulo').textContent = sub;
}

function atualizarTabs() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.aba === ui.aba));
  document.body.classList.toggle('sem-fab', ui.aba === 'backup');
}

function render() {
  atualizarTopo();
  const view = $('#view');
  if (ui.aba === 'agenda') {
    view.innerHTML = htmlAgenda();
    if (ui.modo === 'dia') pintarDia();
  } else if (ui.aba === 'clientes') {
    view.innerHTML = htmlClientes();
    $('#busca').value = ui.busca;
    atualizarListaClientes();
  } else {
    view.innerHTML = htmlBackup();
  }
  atualizarTabs();
}

/* ---------- aba Agenda ---------- */

function bannerBackup() {
  if (dados.agendamentos.length < 3) return '';
  const ult = Number(lerLS(CHAVE_BACKUP)) || 0;
  if (ult && Date.now() - ult < 7 * 86400000) return '';
  const msg = ult ? 'Já faz mais de 7 dias do seu último backup.' : 'Você ainda não fez backup dos seus dados.';
  return '<button type="button" class="banner" data-action="ir-backup">' + msg + ' <b>Fazer agora ›</b></button>';
}

function htmlAgenda() {
  const segmento =
    '<div class="seg">' +
    '<button type="button" class="' + (ui.modo === 'dia' ? 'on' : '') + '" data-action="modo" data-modo="dia">Dia</button>' +
    '<button type="button" class="' + (ui.modo === 'todos' ? 'on' : '') + '" data-action="modo" data-modo="todos">Todos</button>' +
    '</div>';
  return bannerBackup() + segmento + (ui.modo === 'dia' ? htmlDia() : htmlTodos());
}

function htmlDia() {
  return (
    '<div class="datanav">' +
    '<button type="button" class="icon-btn" data-action="dia-ant" aria-label="Dia anterior">‹</button>' +
    '<label class="datacentro"><span class="d1" id="d1"></span><span class="d2" id="d2"></span>' +
    '<input type="date" id="inputDia" min="1900-01-01" max="2100-12-31" aria-label="Escolher data"></label>' +
    '<button type="button" class="icon-btn" data-action="dia-prox" aria-label="Próximo dia">›</button>' +
    '</div>' +
    '<div id="diaCorpo"></div>'
  );
}

// Atualiza só o conteúdo do dia (sem recriar o campo de data, que pode estar aberto).
function pintarDia() {
  const d1 = $('#d1');
  if (!d1) return;
  const rel = rotuloRelativo(ui.dia);
  const sem = diaDaSemana(ui.dia);
  d1.textContent = rel || capitalizar(sem);
  $('#d2').textContent = (rel ? capitalizar(sem) + ', ' : '') + dataBR(ui.dia);
  const inp = $('#inputDia');
  if (inp.value !== ui.dia) inp.value = ui.dia;

  const lista = dados.agendamentos.filter((a) => a.data === ui.dia);
  let h = '';
  if (ui.dia !== hojeISO()) {
    h += '<button type="button" class="chip solto" data-action="hoje">Voltar para hoje</button>';
  }
  if (!lista.length) {
    h += '<div class="vazio"><p class="vazio-t">Nenhum agendamento</p><p>Toque no + para agendar um horário.</p></div>';
  } else {
    h += '<div class="resumo"><span><strong>' + plural(lista.length, 'agendamento', 'agendamentos') +
      '</strong></span><span>Total: ' + esc(formatarValor(somaValores(lista))) + '</span></div>';
    h += lista.map((a) => htmlItemAg(a)).join('');
  }
  $('#diaCorpo').innerHTML = h;
}

function htmlTodos() {
  const hoje = hojeISO();
  let lista;
  if (ui.filtro === 'proximos') lista = dados.agendamentos.filter((a) => a.data >= hoje);
  else if (ui.filtro === 'passados') lista = dados.agendamentos.filter((a) => a.data < hoje);
  else lista = dados.agendamentos.slice();

  const grupos = [];
  for (const a of lista) {
    const g = grupos[grupos.length - 1];
    if (g && g.data === a.data) g.itens.push(a);
    else grupos.push({ data: a.data, itens: [a] });
  }
  if (ui.filtro === 'passados') grupos.reverse();

  const chips = [['proximos', 'Próximos'], ['passados', 'Passados'], ['todos', 'Todos']]
    .map(([k, r]) => '<button type="button" class="chip ' + (ui.filtro === k ? 'on' : '') +
      '" data-action="filtro" data-filtro="' + k + '">' + r + '</button>')
    .join('');
  let h = '<div class="chips">' + chips + '</div>';

  if (!lista.length) {
    const msgs = {
      proximos: 'Nenhum agendamento a partir de hoje.',
      passados: 'Nenhum agendamento anterior a hoje.',
      todos: 'Nenhum agendamento cadastrado ainda.'
    };
    return h + '<div class="vazio"><p class="vazio-t">Nada por aqui</p><p>' + msgs[ui.filtro] + '</p></div>';
  }

  h += '<div class="resumo"><span><strong>' + plural(lista.length, 'agendamento', 'agendamentos') +
    '</strong></span><span>Total: ' + esc(formatarValor(somaValores(lista))) + '</span></div>';

  for (const g of grupos) {
    const rel = rotuloRelativo(g.data);
    h += '<div class="grupo-h"><span>' + esc((rel ? rel + ' · ' : '') + capitalizar(diaDaSemana(g.data)) + ', ' + dataBR(g.data)) +
      '</span><small>' + esc(formatarValor(somaValores(g.itens))) + '</small></div>';
    h += g.itens.map((a) => htmlItemAg(a)).join('');
  }
  return h;
}

function htmlItemAg(a, historico = false) {
  const pill = historico
    ? '<span class="hora dupla"><b>' + esc(a.horario) + '</b><small>' + esc(dataBR(a.data).slice(0, 6) + a.data.slice(2, 4)) + '</small></span>'
    : '<span class="hora">' + esc(a.horario) + '</span>';
  const principal = historico ? a.servico : nomeDoCliente(a.clienteId);
  const sub = historico ? '' : '<span class="sub">' + esc(a.servico) + '</span>';
  return '<button type="button" class="item" data-action="ver-ag" data-id="' + a.id + '">' + pill +
    '<span class="info"><span class="nome">' + esc(principal) + '</span>' + sub + '</span>' +
    '<span class="valor">' + esc(formatarValor(a.valorCentavos)) + '</span></button>';
}

/* ---------- aba Clientes ---------- */

function htmlClientes() {
  return (
    '<input type="search" id="busca" class="busca" placeholder="Buscar por nome ou telefone" ' +
    'autocomplete="off" autocapitalize="off" autocorrect="off" enterkeyhint="search">' +
    '<p class="contagem" id="contagem"></p>' +
    '<div id="listaClientes"></div>'
  );
}

function atualizarListaClientes() {
  const caixa = $('#listaClientes');
  if (!caixa) return;
  const termo = ui.busca.trim();
  const ids = termo ? buscarClientes(termo) : dados.clientes.map((c) => c.id);
  const lista = ids.map((id) => acharCliente(id)).filter(Boolean);

  $('#contagem').textContent = termo ? plural(lista.length, 'resultado', 'resultados') : '';
  if (!lista.length) {
    caixa.innerHTML = termo
      ? '<div class="vazio"><p class="vazio-t">Nenhum cliente encontrado</p><p>Confira o nome ou o telefone.</p></div>'
      : '<div class="vazio"><p class="vazio-t">Nenhum cliente ainda</p><p>Toque no + para cadastrar o primeiro.</p></div>';
    return;
  }
  caixa.innerHTML = lista.map((c) => htmlItemCli(c)).join('');
}

function htmlItemCli(c) {
  return '<button type="button" class="item" data-action="ver-cli" data-id="' + c.id + '">' +
    '<span class="avatar">' + esc(inicial(c.nome)) + '</span>' +
    '<span class="info"><span class="nome">' + esc(c.nome) + '</span><span class="sub">' + esc(c.telefone) + '</span></span>' +
    '<span class="badge" title="Agendamentos">' + contarAgDoCliente(c.id) + '</span></button>';
}

/* ---------- aba Backup ---------- */

function htmlBackup() {
  const ult = Number(lerLS(CHAVE_BACKUP)) || 0;
  let txtUlt = 'nunca';
  if (ult) {
    const d = new Date(ult);
    txtUlt = dataBR(paraISO(d)) + ' às ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  const instalado = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  let h =
    '<div class="card"><h3>Seus dados</h3>' +
    '<p>' + plural(dados.clientes.length, 'cliente', 'clientes') + ' · ' + plural(dados.agendamentos.length, 'agendamento', 'agendamentos') + '</p>' +
    '<p class="suave">Último backup: ' + txtUlt + '</p></div>' +

    '<div class="card"><h3>Backup</h3>' +
    '<p class="suave">Os dados ficam guardados só neste aparelho. Se você limpar os dados do Safari ou apagar o app, eles somem. ' +
    'Exporte um arquivo de vez em quando e guarde em um lugar seguro (Arquivos, iCloud, WhatsApp...).</p>' +
    '<div class="pilha">' +
    '<button type="button" class="btn prim bloco" data-action="exportar">Exportar backup</button>' +
    '<button type="button" class="btn sec bloco" data-action="importar">Restaurar backup</button>' +
    '</div></div>';

  if (!instalado) {
    h += '<div class="card"><h3>Instalar no iPhone</h3>' +
      '<ol class="suave"><li>Abra esta página no Safari.</li>' +
      '<li>Toque em Compartilhar (quadrado com uma seta).</li>' +
      '<li>Escolha “Adicionar à Tela de Início”.</li></ol>' +
      '<p class="suave">Depois use sempre pelo ícone. O app instalado tem armazenamento separado do Safari, ' +
      'então faça o backup antes de trocar de um para o outro.</p></div>';
  }

  h += '<div class="card"><h3>Zona de risco</h3>' +
    '<button type="button" class="btn perigo bloco" data-action="apagar-tudo">Apagar todos os dados</button></div>';
  return h;
}

function marcarBackup() {
  gravarLS(CHAVE_BACKUP, String(Date.now()));
  if (ui.aba === 'backup') render();
  toast('Backup exportado!');
}

async function exportarBackup() {
  const conteudo = JSON.stringify(
    { app: 'agenda', versao: 1, exportadoEm: new Date().toISOString(), ...dados },
    null, 2
  );
  const nome = 'agenda-backup-' + hojeISO() + '.json';

  // No iPhone, abre a folha de compartilhamento (Salvar em Arquivos, WhatsApp, etc.)
  try {
    const arquivo = new File([conteudo], nome, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: 'Backup da agenda' });
      marcarBackup();
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // a pessoa cancelou
  }

  // Alternativa: baixar o arquivo
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  marcarBackup();
}

function lerArquivoTexto(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsText(arquivo);
  });
}

async function restaurarBackup(arquivo) {
  let novo = null;
  try {
    novo = validarDados(JSON.parse(await lerArquivoTexto(arquivo)));
  } catch (e) { novo = null; }
  if (!novo) { toast('Arquivo de backup inválido.', 'erro'); return; }

  const ok = await confirmar({
    titulo: 'Restaurar backup?',
    texto: 'Os dados atuais serão substituídos por ' + plural(novo.clientes.length, 'cliente', 'clientes') +
      ' e ' + plural(novo.agendamentos.length, 'agendamento', 'agendamentos') + '.',
    ok: 'Restaurar',
    perigo: true
  });
  if (!ok) return;

  dados = novo;
  salvar();
  fecharTudo();
  toast('Backup restaurado!');
}

async function apagarTudo() {
  const ok = await confirmar({
    titulo: 'Apagar tudo?',
    texto: 'Todos os clientes e agendamentos serão apagados deste aparelho. Isso não pode ser desfeito.',
    ok: 'Apagar tudo',
    perigo: true
  });
  if (!ok) return;
  dados = dadosVazios();
  salvar();
  render();
  toast('Dados apagados.');
}

/* =========================================================
   Detalhes
   ========================================================= */

function htmlContato(c) {
  if (!c) return '';
  const dig = somenteDigitos(c.telefone);
  if (!dig) return '';
  let wa = dig.replace(/^0+/, '');
  if (!(wa.startsWith('55') && wa.length >= 12)) wa = '55' + wa; // assume Brasil
  return '<div class="dupla-bt">' +
    '<a class="btn sec" href="tel:' + esc(dig) + '">Ligar</a>' +
    '<a class="btn sec" href="https://wa.me/' + esc(wa) + '" target="_blank" rel="noopener">WhatsApp</a></div>';
}

function abrirDetalheAg(id) {
  const a = acharAg(id);
  if (!a) return;
  const c = acharCliente(a.clienteId);
  abrirSheet({
    titulo: 'Agendamento',
    corpo:
      '<div class="det-topo"><div class="det-hora">' + esc(a.horario) + '</div>' +
      '<div class="det-data">' + esc(capitalizar(diaDaSemana(a.data)) + ', ' + dataBR(a.data)) + '</div></div>' +
      '<dl class="det">' +
      '<div><dt>Cliente</dt><dd>' + esc(c ? c.nome : '(cliente removido)') + '</dd></div>' +
      (c ? '<div><dt>Telefone</dt><dd>' + esc(c.telefone) + '</dd></div>' : '') +
      '<div><dt>Serviço</dt><dd>' + esc(a.servico) + '</dd></div>' +
      '<div><dt>Valor</dt><dd>' + esc(formatarValor(a.valorCentavos)) + '</dd></div></dl>' +
      htmlContato(c) +
      '<div class="acoes">' +
      '<button type="button" class="btn sec" data-action="editar-ag" data-id="' + a.id + '">Editar</button>' +
      '<button type="button" class="btn perigo" data-action="excluir-ag" data-id="' + a.id + '">Excluir</button></div>'
  });
}

function abrirDetalheCli(id) {
  const c = acharCliente(id);
  if (!c) return;
  const hist = dados.agendamentos
    .filter((a) => a.clienteId === id)
    .sort((x, y) => cmp(y.data + y.horario, x.data + x.horario) || y.id - x.id);

  abrirSheet({
    titulo: 'Cliente',
    corpo:
      '<div class="cli-topo"><span class="avatar grande">' + esc(inicial(c.nome)) + '</span>' +
      '<div><div class="cli-nome">' + esc(c.nome) + '</div><div class="cli-tel">' + esc(c.telefone) + '</div></div></div>' +
      (c.anotacoes ? '<div class="notas">' + esc(c.anotacoes) + '</div>' : '') +
      htmlContato(c) +
      '<button type="button" class="btn prim bloco" data-action="novo-ag-cli" data-id="' + c.id + '">Novo agendamento</button>' +
      '<div class="acoes">' +
      '<button type="button" class="btn sec" data-action="editar-cli" data-id="' + c.id + '">Editar</button>' +
      '<button type="button" class="btn perigo" data-action="excluir-cli" data-id="' + c.id + '">Excluir</button></div>' +
      '<div class="sec-t"><span>Histórico</span><small>' +
      (hist.length ? plural(hist.length, 'agendamento', 'agendamentos') + ' · ' + esc(formatarValor(somaValores(hist))) : 'vazio') +
      '</small></div>' +
      (hist.length
        ? hist.map((a) => htmlItemAg(a, true)).join('')
        : '<div class="vazio"><p>Nenhum agendamento para este cliente.</p></div>')
  });
}

/* =========================================================
   Formulários
   ========================================================= */

function abrirFormCliente({ cli = null, sugestaoNome = '', sugestaoTel = '', aoSalvar = null } = {}) {
  abrirSheet({
    titulo: cli ? 'Editar cliente' : 'Novo cliente',
    corpo:
      '<form id="formCli" novalidate autocomplete="off">' +
      '<div class="campo"><label for="cliNome">Nome</label>' +
      '<input id="cliNome" type="text" autocapitalize="words" enterkeyhint="next"></div>' +
      '<div class="campo"><label for="cliTel">Telefone</label>' +
      '<input id="cliTel" type="tel" inputmode="tel" placeholder="(00) 00000-0000" enterkeyhint="next"></div>' +
      '<div class="campo"><label for="cliNotas">Anotações (opcional)</label>' +
      '<textarea id="cliNotas" rows="3"></textarea></div>' +
      '<p class="erro" id="cliErro" hidden></p>' +
      '<button type="submit" class="btn prim grande">Salvar</button></form>',
    aoAbrir: (el) => {
      $('#cliNome', el).value = cli ? cli.nome : sugestaoNome;
      $('#cliTel', el).value = cli ? cli.telefone : sugestaoTel;
      $('#cliNotas', el).value = cli ? cli.anotacoes : '';

      let ocupado = false;
      $('#formCli', el).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (ocupado) return;
        const erro = $('#cliErro', el);
        const falha = (msg) => { erro.textContent = msg; erro.hidden = false; };
        const nome = $('#cliNome', el).value.trim();
        const tel = $('#cliTel', el).value.trim();
        const notas = $('#cliNotas', el).value.trim();
        if (!nome) return falha('Informe o nome.');
        if (!tel) return falha('Informe o telefone.');
        erro.hidden = true;

        ocupado = true;
        try {
          if (!cli) {
            const nomeNorm = normalizar(nome);
            const dig = somenteDigitos(tel);
            const parecido = dados.clientes.find((o) =>
              normalizar(o.nome) === nomeNorm || (dig && somenteDigitos(o.telefone) === dig));
            if (parecido) {
              const ok = await confirmar({
                titulo: 'Cadastro parecido',
                texto: 'Já existe: ' + parecido.nome + ' - ' + parecido.telefone + '. Cadastrar mesmo assim?',
                ok: 'Cadastrar'
              });
              if (!ok) return;
            }
          }

          let salvo;
          if (cli) {
            cli.nome = nome; cli.telefone = tel; cli.anotacoes = notas;
            salvo = cli;
          } else {
            salvo = { id: dados.proximoIdCliente++, nome, telefone: tel, anotacoes: notas };
            dados.clientes.push(salvo);
          }
          ordenarTudo(dados);
          salvar();

          if (cli) fecharTudo(); else fecharSheet();
          toast(cli ? 'Cliente atualizado!' : 'Cliente cadastrado!');
          if (aoSalvar) aoSalvar(salvo);
        } finally {
          ocupado = false;
        }
      });
    }
  });
}

// Lista para escolher (ou cadastrar na hora) o cliente de um agendamento.
function abrirPicker(aoEscolher) {
  abrirSheet({
    titulo: 'Escolher cliente',
    corpo:
      '<input type="search" id="pkBusca" class="busca" placeholder="Buscar por nome ou telefone" ' +
      'autocomplete="off" autocapitalize="off" autocorrect="off">' +
      '<button type="button" class="btn sec bloco" id="pkNovo" style="margin-bottom:12px">+ Cadastrar novo cliente</button>' +
      '<div id="pkLista"></div>',
    aoAbrir: (el) => {
      const lista = $('#pkLista', el);
      const busca = $('#pkBusca', el);

      const pintar = () => {
        const termo = busca.value.trim();
        const ids = termo ? buscarClientes(termo) : dados.clientes.map((c) => c.id);
        const itens = ids.map((id) => acharCliente(id)).filter(Boolean);
        lista.innerHTML = itens.length
          ? itens.map((c) =>
            '<button type="button" class="item" data-pick="' + c.id + '">' +
            '<span class="avatar">' + esc(inicial(c.nome)) + '</span>' +
            '<span class="info"><span class="nome">' + esc(c.nome) + '</span><span class="sub">' + esc(c.telefone) + '</span></span></button>'
          ).join('')
          : '<div class="vazio"><p class="vazio-t">Nenhum cliente encontrado</p><p>Use o botão acima para cadastrar.</p></div>';
      };
      busca.addEventListener('input', pintar);
      pintar();

      lista.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-pick]');
        if (!b) return;
        const id = Number(b.dataset.pick);
        fecharSheet();
        aoEscolher(id);
      });

      $('#pkNovo', el).addEventListener('click', () => {
        const t = busca.value.trim();
        const ehTelefone = t && somenteDigitos(t).length >= 4 && /^[\d\s()+-]+$/.test(t);
        abrirFormCliente({
          sugestaoNome: ehTelefone ? '' : t,
          sugestaoTel: ehTelefone ? t : '',
          aoSalvar: (c) => { fecharSheet(); aoEscolher(c.id); }
        });
      });
    }
  });
}

function abrirFormAg({ ag = null, clienteId = 0, data = null } = {}) {
  const edicao = !!ag;
  let cliSel = ag ? ag.clienteId : clienteId;
  const servicos = [...new Set(dados.agendamentos.map((a) => a.servico).filter(Boolean))]
    .sort((a, b) => cmp(normalizar(a), normalizar(b)));

  abrirSheet({
    titulo: edicao ? 'Editar agendamento' : 'Novo agendamento',
    corpo:
      '<form id="formAg" novalidate autocomplete="off">' +
      '<div class="campo"><span class="rot">Cliente</span><button type="button" class="seletor" id="btnCli"></button></div>' +
      '<div class="linha">' +
      '<div class="campo"><label for="agData">Data</label><input id="agData" type="date" min="1900-01-01" max="2100-12-31"></div>' +
      '<div class="campo"><label for="agHora">Horário</label><input id="agHora" type="time"></div></div>' +
      '<div class="campo"><label for="agServ">Serviço</label>' +
      '<input id="agServ" type="text" list="listaServ" autocapitalize="sentences" enterkeyhint="next"></div>' +
      '<datalist id="listaServ">' + servicos.map((s) => '<option value="' + esc(s) + '"></option>').join('') + '</datalist>' +
      '<div class="campo"><label for="agValor">Valor (R$)</label>' +
      '<input id="agValor" type="text" inputmode="decimal" placeholder="0,00"></div>' +
      '<p class="erro" id="agErro" hidden></p>' +
      '<button type="submit" class="btn prim grande">Salvar</button></form>',
    aoAbrir: (el) => {
      const btn = $('#btnCli', el);
      const campoData = $('#agData', el);
      const campoHora = $('#agHora', el);
      const campoServ = $('#agServ', el);
      const campoValor = $('#agValor', el);

      campoData.value = ag ? ag.data : (data && dataValida(data) ? data : hojeISO());
      campoHora.value = ag ? ag.horario : '';
      campoServ.value = ag ? ag.servico : '';
      campoValor.value = ag ? valorParaCampo(ag.valorCentavos) : '';

      const pintarCliente = () => {
        const c = acharCliente(cliSel);
        btn.innerHTML = c
          ? '<span class="nome">' + esc(c.nome) + '</span><span class="sub">' + esc(c.telefone) + '</span>'
          : '<span class="placeholder">Escolher cliente…</span>';
      };
      pintarCliente();

      btn.addEventListener('click', () => abrirPicker((id) => { cliSel = id; pintarCliente(); }));

      // Se o valor estiver vazio, sugere o último valor cobrado por esse mesmo serviço.
      campoServ.addEventListener('change', () => {
        if (campoValor.value.trim()) return;
        const nome = normalizar(campoServ.value);
        if (!nome) return;
        const anterior = dados.agendamentos.filter((a) => normalizar(a.servico) === nome).pop();
        if (anterior) campoValor.value = valorParaCampo(anterior.valorCentavos);
      });

      let ocupado = false;
      $('#formAg', el).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (ocupado) return;
        const erro = $('#agErro', el);
        const falha = (msg) => { erro.textContent = msg; erro.hidden = false; };

        const dia = campoData.value;
        const hora = campoHora.value;
        const servico = campoServ.value.trim();
        const valor = interpretarValor(campoValor.value);

        if (!cliSel || !acharCliente(cliSel)) return falha('Escolha o cliente.');
        if (!dataValida(dia)) return falha('Informe uma data válida.');
        if (!/^\d{2}:\d{2}$/.test(hora)) return falha('Informe o horário.');
        if (!servico) return falha('Informe o serviço.');
        if (valor === null) return falha('Valor inválido. Exemplos: 50   50,00   R$ 35,50');
        erro.hidden = true;

        ocupado = true;
        try {
          const conflito = acharConflito(dia, hora, edicao ? ag.id : 0);
          if (conflito) {
            const ok = await confirmar({
              titulo: 'Horário ocupado',
              texto: 'Já existe um agendamento em ' + dataBR(dia) + ' às ' + hora + ': ' +
                nomeDoCliente(conflito.clienteId) + ' (' + conflito.servico + '). Agendar mesmo assim?',
              ok: 'Agendar mesmo assim'
            });
            if (!ok) return;
          }

          if (edicao) {
            Object.assign(ag, { clienteId: cliSel, data: dia, horario: hora, servico, valorCentavos: valor });
          } else {
            dados.agendamentos.push({
              id: dados.proximoIdAgendamento++,
              clienteId: cliSel, data: dia, horario: hora, servico, valorCentavos: valor
            });
          }
          ordenarTudo(dados);
          salvar();

          ui.dia = dia; // já mostra o dia do agendamento que acabou de salvar
          fecharTudo();
          toast(edicao ? 'Agendamento atualizado!' : 'Agendamento salvo!');
        } finally {
          ocupado = false;
        }
      });
    }
  });
}

/* =========================================================
   Exclusões
   ========================================================= */

async function excluirAg(id) {
  const a = acharAg(id);
  if (!a) return;
  const ok = await confirmar({
    titulo: 'Excluir agendamento?',
    texto: nomeDoCliente(a.clienteId) + ' — ' + dataBR(a.data) + ' às ' + a.horario + '.',
    ok: 'Excluir',
    perigo: true
  });
  if (!ok) return;
  dados.agendamentos = dados.agendamentos.filter((x) => x.id !== id);
  salvar();
  fecharTudo();
  toast('Agendamento excluído.');
}

async function excluirCli(id) {
  const c = acharCliente(id);
  if (!c) return;
  const qtd = contarAgDoCliente(id);
  let texto = c.nome + ' será removido(a).';
  if (qtd === 1) texto = c.nome + ' tem 1 agendamento. Ele também será excluído.';
  else if (qtd > 1) texto = c.nome + ' tem ' + qtd + ' agendamentos. Todos eles também serão excluídos.';

  const ok = await confirmar({ titulo: 'Excluir cliente?', texto, ok: 'Excluir', perigo: true });
  if (!ok) return;
  dados.agendamentos = dados.agendamentos.filter((a) => a.clienteId !== id);
  dados.clientes = dados.clientes.filter((x) => x.id !== id);
  salvar();
  fecharTudo();
  toast('Cliente excluído.');
}

/* =========================================================
   Eventos
   ========================================================= */

document.addEventListener('click', (ev) => {
  const alvo = ev.target.closest('[data-action]');
  if (!alvo) return;
  const id = Number(alvo.dataset.id) || 0;

  switch (alvo.dataset.action) {
    case 'aba':
      ui.aba = alvo.dataset.aba;
      window.scrollTo(0, 0);
      render();
      break;
    case 'modo':
      ui.modo = alvo.dataset.modo;
      render();
      break;
    case 'filtro':
      ui.filtro = alvo.dataset.filtro;
      render();
      break;
    case 'dia-ant':
      ui.dia = somarDias(ui.dia, -1);
      pintarDia();
      break;
    case 'dia-prox':
      ui.dia = somarDias(ui.dia, 1);
      pintarDia();
      break;
    case 'hoje':
      ui.dia = hojeISO();
      pintarDia();
      break;
    case 'fab':
      if (ui.aba === 'clientes') abrirFormCliente();
      else abrirFormAg({ data: ui.modo === 'dia' ? ui.dia : hojeISO() });
      break;
    case 'ver-ag': abrirDetalheAg(id); break;
    case 'ver-cli': abrirDetalheCli(id); break;
    case 'fechar-sheet': fecharSheet(); break;
    case 'editar-ag': { const a = acharAg(id); if (a) abrirFormAg({ ag: a }); break; }
    case 'excluir-ag': excluirAg(id); break;
    case 'editar-cli': { const c = acharCliente(id); if (c) abrirFormCliente({ cli: c }); break; }
    case 'excluir-cli': excluirCli(id); break;
    case 'novo-ag-cli':
      abrirFormAg({ clienteId: id, data: ui.modo === 'dia' ? ui.dia : hojeISO() });
      break;
    case 'exportar': exportarBackup(); break;
    case 'importar': $('#arquivoImport').click(); break;
    case 'apagar-tudo': apagarTudo(); break;
    case 'ir-backup':
      ui.aba = 'backup';
      window.scrollTo(0, 0);
      render();
      break;
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'busca') {
    ui.busca = ev.target.value;
    atualizarListaClientes();
  }
});

document.addEventListener('change', (ev) => {
  if (ev.target.id === 'inputDia') {
    if (dataValida(ev.target.value)) {
      ui.dia = ev.target.value;
      pintarDia();
    }
  }
});

$('#arquivoImport').addEventListener('change', (ev) => {
  const arquivo = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (arquivo) restaurarBackup(arquivo);
});

// Ao voltar para o app (ex.: abriu de novo no iPhone), atualiza a tela e o "hoje".
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const hoje = hojeISO();
  if (hoje !== ultimoHoje) {
    if (ui.dia === ultimoHoje) ui.dia = hoje;
    ultimoHoje = hoje;
  }
  if (!pilha.length) render();
});

/* =========================================================
   Início
   ========================================================= */

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sem offline, tudo bem */ });
  });
}

// Pede ao navegador para não apagar os dados automaticamente.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
