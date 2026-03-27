/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.9.9.4
 * CORREÇÃO DE BUGS CRÍTICOS
 */

const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzVkoBYznaZMIUsIxz-UDG47n83Bjao3BCBF-CTqy-UN7NMxOe2YGRBjCSsUCpFulXu/exec',
  VERSAO: '2.9.9.4',
  MAX_FOTO_SIZE_MB: 5,
  STORAGE_KEYS: {
    USUARIO: 'h2_usuario_v2994',
    RONDA_ATIVA: 'h2_ronda_ativa_v2994',
    USUARIOS: 'h2_usuarios_v2994'
  }
};

class SistemaHidrometros {
  constructor() {
    this.usuario = null;
    this.ronda = { id: null, hidrometros: [], locais: [], inicio: null };
    this.localAtual = null;
    this.salvamentoPendente = false;
    this.online = navigator.onLine;
    this.charts = {};
    this.usuariosCadastrados = [];
    this.dashboardData = null;
    this.leiturasCache = [];
    this.analiseData = null;
    this.filtrosAtuais = { local: '', tipo: '', status: '', data: '', usuario: '' };
    this.filtrosAnalise = { usuario: '', periodo: 30, local: '' };
    this.protecaoAtiva = false;
    this.historicoInterval = null;
   
    console.log(`[v${CONFIG.VERSAO}] Sistema inicializado`);
    this.inicializar();
  }

  async inicializar() {
    window.addEventListener('online', () => { this.online = true; this.mostrarToast('Conexão restaurada', 'success'); });
    window.addEventListener('offline', () => { this.online = false; this.mostrarToast('Modo offline ativado', 'warning'); });

    const usuarioSalvo = this.lerStorage(CONFIG.STORAGE_KEYS.USUARIO);
    if (usuarioSalvo) {
      this.usuario = usuarioSalvo;
      this.configurarHeader();
      this.atualizarNomeStart();
      const rondaSalva = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
      if (rondaSalva && rondaSalva.id) this.ronda = rondaSalva;
     
      if (this.isAdmin(this.usuario.nivel)) {
        this.mostrarTela('dashboardScreen');
        this.carregarDashboard();
        const adminNav = document.getElementById('adminNav');
        if (adminNav) adminNav.style.display = 'flex';
      } else {
        this.mostrarTela('startScreen');
        this.verificarRondaPendente();
      }
    } else {
      this.mostrarTela('loginScreen');
    }
   
    this.configurarEventos();
    setInterval(() => { if (this.salvamentoPendente && this.ronda.id) this.salvarRonda(); }, 2000);
  }

  mostrarTela(telaId) {
    document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
    const tela = document.getElementById(telaId);
    if (tela) { tela.style.display = 'block'; requestAnimationFrame(() => tela.classList.add('active')); }
  }

  navigate(page) {
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const btn = document.querySelector(`[data-page="${page}"]`);
    if (btn) btn.classList.add('active');
    
    if (page === 'dashboard') { this.mostrarTela('dashboardScreen'); this.carregarDashboard(); }
    else if (page === 'leituras') { this.mostrarTela('leiturasAdminScreen'); this.carregarLeituras(); }
    else if (page === 'analise') { this.mostrarTela('analiseScreen'); this.carregarAnalise(); }
    else if (page === 'gestao') { this.mostrarTela('gestaoScreen'); this.carregarUsuariosDoServidor(); }
  }

  // CORREÇÃO HEADER - Garante exibição correta
  configurarHeader() {
    const header = document.getElementById('corporateHeader');
    if (header) {
      header.style.display = 'flex';
      // FORÇA o HTML correto do header
      const brandHeader = header.querySelector('.header-brand');
      if (brandHeader) {
        brandHeader.innerHTML = `
          <div class="brand-top">
            <span class="logo-gps">GRUPO GPS</span>
            <span class="logo-separator">•</span>
            <span class="logo-multiplan">MULTIPLAN</span>
          </div>
          <span class="system-subtitle">Sistema de Leitura de Hidrômetros</span>
        `;
      }
    }
    
    const nomeEl = document.getElementById('nomeTecnico');
    const nivelEl = document.getElementById('nivelUsuario');
    
    if (nomeEl) nomeEl.textContent = this.usuario.nome || this.usuario.usuario;
    
    // CORREÇÃO BADGE - Garante classe admin correta
    if (nivelEl) {
      const isAdmin = this.isAdmin(this.usuario.nivel);
      nivelEl.textContent = isAdmin ? 'ADMIN' : 'TECNICO';
      nivelEl.className = isAdmin ? 'user-badge admin' : 'user-badge';
    }
  }

  async login(e) {
    e.preventDefault();
    const username = document.getElementById('username')?.value.trim() || '';
    const password = document.getElementById('password')?.value.trim() || '';
    
    if (!username || !password) { this.mostrarErro('Preencha usuário e senha'); return; }

    this.mostrarLoading(true, 'Autenticando...');
    
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'login', usuario: username, senha: password })
      });
      
      const data = await response.json();
      if (!data.success) throw new Error(data.message);
      
      this.usuario = data;
      this.salvarStorage(CONFIG.STORAGE_KEYS.USUARIO, data);
      this.configurarHeader();
      this.atualizarNomeStart();
      this.mostrarLoading(false);
      
      if (this.isAdmin(data.nivel)) {
        this.mostrarTela('dashboardScreen');
        this.carregarDashboard();
        const adminNav = document.getElementById('adminNav');
        if (adminNav) adminNav.style.display = 'flex';
      } else {
        this.mostrarTela('startScreen');
        this.verificarRondaPendente();
      }
    } catch (error) {
      this.mostrarLoading(false);
      this.mostrarErro(error.message);
    }
  }

  logout() {
    if (confirm('Deseja realmente sair?')) {
      this.salvarRonda();
      localStorage.removeItem(CONFIG.STORAGE_KEYS.USUARIO);
      location.reload();
    }
  }

  isAdmin(nivel) {
    if (!nivel) return false;
    const n = nivel.toString().toLowerCase().trim();
    return n === 'admin' || n === 'op' || n === 'adm' || n === 'administrador';
  }

  atualizarNomeStart() {
    const span = document.getElementById('nomeTecnicoStart');
    if (span && this.usuario) span.textContent = this.usuario.nome || 'Técnico';
  }

  // ========== DASHBOARD CORRIGIDO ==========

  async carregarDashboard() {
    if (!this.online) { this.mostrarToast('Sem conexão', 'warning'); return; }
    this.mostrarLoading(true, 'Carregando estatísticas...');
    
    try {
      const [resDashboard, resLeituras] = await Promise.all([
        fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'getDashboard', periodo: 30 }) }).then(r => r.json()),
        fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'getLeituras', limite: 1000 }) }).then(r => r.json())
      ]);
      
      let data = resDashboard;
      let leiturasCompletas = resLeituras.success && resLeituras.leituras ? resLeituras.leituras : (data.ultimas || []);
      
      if (data.success) {
        data.ultimas = leiturasCompletas;
        this.dashboardData = data;
        this.renderizarDashboard(data);
        this.popularFiltroLocais(leiturasCompletas);
        this.popularFiltroTipos(leiturasCompletas);
        this.popularFiltroUsuarios(leiturasCompletas, 'filtroUsuario');
      }
    } catch (error) {
      console.error('[Dashboard] Erro:', error);
      this.mostrarToast('Erro ao carregar dashboard', 'error');
    } finally {
      this.mostrarLoading(false);
    }
  }

  popularFiltroLocais(dados) {
    const select = document.getElementById('filtroLocal');
    if (!select || !dados) return;
    const locais = [...new Set(dados.map(l => l.local).filter(l => l))].sort();
    select.innerHTML = '<option value="">Todos os locais</option>' + locais.map(l => `<option value="${l}">${l}</option>`).join('');
  }

  popularFiltroTipos(dados) {
    const select = document.getElementById('filtroTipo');
    if (!select || !dados) return;
    const tipos = [...new Set(dados.map(l => l.tipo).filter(t => t))].sort();
    select.innerHTML = '<option value="">Todos os tipos</option>' + tipos.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  popularFiltroUsuarios(dados, elementId) {
    const select = document.getElementById(elementId);
    if (!select || !dados) return;
    const usuarios = [...new Set(dados.map(l => l.tecnico || l.usuario).filter(u => u))].sort();
    const currentValue = select.value;
    select.innerHTML = '<option value="">Todos os usuários</option>' + usuarios.map(u => `<option value="${u}">${u}</option>`).join('');
    if (currentValue && usuarios.includes(currentValue)) select.value = currentValue;
  }

  aplicarFiltros(mostrarToastMsg = true) {
    if (!this.dashboardData || !this.dashboardData.ultimas) {
      this.mostrarToast('Dados não carregados', 'error');
      return;
    }
    
    try {
      const filtroLocal = document.getElementById('filtroLocal')?.value || '';
      const filtroTipo = document.getElementById('filtroTipo')?.value || '';
      const filtroStatus = document.getElementById('filtroStatus')?.value || '';
      const filtroData = document.getElementById('filtroData')?.value || '';
      const filtroUsuario = document.getElementById('filtroUsuario')?.value || '';
      
      this.filtrosAtuais = { local: filtroLocal, tipo: filtroTipo, status: filtroStatus, data: filtroData, usuario: filtroUsuario };
      
      let filtradas = [...this.dashboardData.ultimas];
      if (filtroLocal) filtradas = filtradas.filter(l => l.local === filtroLocal);
      if (filtroTipo) filtradas = filtradas.filter(l => l.tipo === filtroTipo);
      if (filtroStatus) filtradas = filtradas.filter(l => l.status === filtroStatus);
      if (filtroUsuario) filtradas = filtradas.filter(l => l.tecnico === filtroUsuario);
      
      if (filtroData) {
        const dataFiltroStr = new Date(filtroData).toISOString().split('T')[0];
        filtradas = filtradas.filter(l => { if (!l.data) return false; return new Date(l.data).toISOString().split('T')[0] === dataFiltroStr; });
      }
      
      this.renderizarDashboard(this.dashboardData, filtradas);
      if (mostrarToastMsg) this.mostrarToast(filtradas.length + ' leituras filtradas', 'success');
    } catch (e) {
      console.error('[Filtros] Erro:', e);
      this.mostrarToast('Erro ao aplicar filtros', 'error');
    }
  }

  limparFiltros() {
    ['filtroLocal', 'filtroTipo', 'filtroStatus', 'filtroData', 'filtroUsuario'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    this.filtrosAtuais = { local: '', tipo: '', status: '', data: '', usuario: '' };
    if (this.dashboardData) this.renderizarDashboard(this.dashboardData);
    this.mostrarToast('Filtros limpos', 'info');
  }

  // CORREÇÃO: Typo dadosFiltradas -> dadosFiltrados
  renderizarDashboard(data, dadosFiltrados) {
    const dadosParaKPI = dadosFiltrados || data.ultimas || [];
    const kpi = this.calcularKPI(dadosParaKPI);
    
    this.animarNumero('kpiTotal', kpi.total);
    this.animarNumero('kpiAlertas', kpi.alertas);
    this.animarNumero('kpiVazamentos', kpi.vazamentos);
    this.animarNumero('kpiNormal', kpi.normal);
    
    const dadosLocais = dadosFiltrados ? this.agruparPorLocal(dadosFiltrados) : this.agruparPorLocal(dadosParaKPI);
    this.renderizarGraficoLocais(dadosLocais);
    
    // CORREÇÃO AQUI: era dadosFiltradas (com a), agora dadosFiltrados (com o)
    const dadosDias = dadosFiltrados ? this.agruparPorDia(dadosFiltrados) : this.agruparPorDia(dadosParaKPI);
    this.renderizarGraficoDias(dadosDias);
    
    const dadosOrdenados = [...dadosParaKPI].sort((a, b) => new Date(b.data || b.timestamp || 0) - new Date(a.data || a.timestamp || 0));
    this.renderizarUltimasLeituras(dadosOrdenados.slice(0, 50));
  }

  calcularKPI(leituras) {
    return {
      total: leituras.length,
      alertas: leituras.filter(l => l.status !== 'NORMAL' && l.status !== 'CONSUMO_BAIXO').length,
      vazamentos: leituras.filter(l => l.status === 'VAZAMENTO').length,
      normal: leituras.filter(l => l.status === 'NORMAL' || l.status === 'CONSUMO_BAIXO').length
    };
  }

  agruparPorLocal(leituras) {
    const locais = {};
    leituras.forEach(l => { if (!l.local) return; locais[l.local] = (locais[l.local] || 0) + (parseFloat(l.consumoDia) || 0); });
    return Object.entries(locais).sort((a, b) => b[1] - a[1]);
  }

  agruparPorDia(leituras) {
    const dias = {};
    leituras.forEach(l => { if (!l.data) return; const dia = new Date(l.data).toISOString().split('T')[0]; dias[dia] = (dias[dia] || 0) + 1; });
    return Object.entries(dias).sort((a, b) => a[0].localeCompare(b[0]));
  }

  animarNumero(elementId, valorFinal) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const valorInicial = parseInt(el.textContent) || 0;
    const duracao = 500;
    const inicio = performance.now();
    
    const animar = (atual) => {
      const progresso = Math.min((atual - inicio) / duracao, 1);
      el.textContent = Math.floor(valorInicial + (valorFinal - valorInicial) * progresso);
      if (progresso < 1) requestAnimationFrame(animar);
    };
    requestAnimationFrame(animar);
  }

  renderizarGraficoLocais(dados) {
    const canvas = document.getElementById('chartLocais');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (this.charts.locais) this.charts.locais.destroy();
    
    this.charts.locais = new Chart(ctx, {
      type: 'bar',
      data: { labels: dados.map(d => d[0]), datasets: [{ label: 'Consumo Total (m³)', data: dados.map(d => d[1]), backgroundColor: '#007bff', borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (val) => val.toFixed(1) + ' m³' } }, x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 } } } }
    });
  }

  renderizarGraficoDias(dados) {
    const canvas = document.getElementById('chartDias');
    if (!canvas) return;
    if (this.charts.dias) this.charts.dias.destroy();
    const ctx = canvas.getContext('2d');
    const ultimosDados = dados.slice(-15);
    
    this.charts.dias = new Chart(ctx, {
      type: 'line',
      data: { labels: ultimosDados.map(d => new Date(d[0]).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })), datasets: [{ label: 'Leituras', data: ultimosDados.map(d => d[1]), borderColor: '#003366', backgroundColor: 'rgba(0, 51, 102, 0.1)', borderWidth: 3, pointBackgroundColor: '#003366', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5, tension: 0.4, fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 45, minRotation: 45 } } } }
    });
  }

  renderizarUltimasLeituras(leituras) {
    const tbody = document.getElementById('ultimasLeituras');
    if (!tbody) return;
    if (leituras.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#666;">Nenhuma leitura encontrada</td></tr>'; return; }
    
    tbody.innerHTML = leituras.map(l => {
      const data = new Date(l.data || l.timestamp);
      const dataStr = data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
      let statusClass = 'badge-normal';
      if (l.status === 'VAZAMENTO') statusClass = 'badge-danger';
      else if (l.status === 'ALERTA_VARIACAO') statusClass = 'badge-warning';
      else if (l.status === 'ANOMALIA_NEGATIVO') statusClass = 'badge-danger';
      
      return `<tr><td>${dataStr}</td><td>${l.local || '-'}</td><td>${l.tecnico || '-'}</td><td>${parseFloat(l.leitura || l.leituraAtual || 0).toFixed(2)} m³</td><td><strong>${(parseFloat(l.consumoDia) || 0).toFixed(2)} m³</strong></td><td><span class="badge ${statusClass}">${l.status}</span></td><td>${(parseFloat(l.variacao) || 0).toFixed(1)}%</td></tr>`;
    }).join('');
  }

  // ========== LEITURAS E EXPORTAÇÃO ==========

  async carregarLeituras() {
    if (!this.online) { this.mostrarToast('Modo offline', 'warning'); return; }
    this.mostrarLoading(true, 'Carregando histórico...');
    
    try {
      const response = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'getLeituras', limite: 1000 }) });
      const data = await response.json();
      
      if (data.success && data.leituras) {
        this.leiturasCache = data.leituras;
        this.renderizarTabelaLeituras(data.leituras.slice(-50));
        this.popularFiltrosLeituras(data.leituras);
        this.popularFiltroUsuarios(data.leituras, 'filtroUsuarioLeituras');
      }
    } catch (error) { this.mostrarToast('Erro ao carregar histórico', 'error'); }
    finally { this.mostrarLoading(false); }
  }

  renderizarTabelaLeituras(leituras) {
    const tbody = document.getElementById('tabelaLeituras');
    if (!tbody) return;
    if (leituras.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Nenhuma leitura encontrada</td></tr>'; return; }
    
    tbody.innerHTML = leituras.slice().reverse().map(l => {
      const data = new Date(l.data);
      const dataStr = data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
      let statusClass = 'badge-normal';
      if (l.status === 'VAZAMENTO') statusClass = 'badge-danger';
      else if (l.status === 'ALERTA_VARIACAO') statusClass = 'badge-warning';
      
      return `<tr><td>${l.rondaId ? l.rondaId.substring(0, 20) + '...' : '--'}</td><td>${dataStr}</td><td>${l.tecnico}</td><td>${l.local}</td><td><span class="badge ${statusClass}">${l.status}</span></td><td style="text-align:center;"><button onclick="app.verDetalhesLeitura('${l.id}')" style="padding:4px 8px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">Ver</button></td></tr>`;
    }).join('');
  }

  popularFiltrosLeituras(leituras) {
    const selectLocal = document.getElementById('filtroLocalLeituras');
    if (!selectLocal) return;
    const locais = [...new Set(leituras.map(l => l.local))].filter(l => l).sort();
    selectLocal.innerHTML = '<option value="">Todos</option>' + locais.map(l => `<option value="${l}">${l}</option>`).join('');
  }

  aplicarFiltrosLeituras() {
    if (!this.leiturasCache.length) return;
    const filtroLocal = document.getElementById('filtroLocalLeituras')?.value || '';
    const filtroStatus = document.getElementById('filtroStatusLeituras')?.value || '';
    const filtroUsuario = document.getElementById('filtroUsuarioLeituras')?.value || '';
    const dataInicio = document.getElementById('filtroDataInicio')?.value || '';
    const dataFim = document.getElementById('filtroDataFim')?.value || '';
    
    let filtradas = [...this.leiturasCache];
    if (filtroLocal) filtradas = filtradas.filter(l => l.local === filtroLocal);
    if (filtroStatus) filtradas = filtradas.filter(l => l.status?.toLowerCase() === filtroStatus.toLowerCase());
    if (filtroUsuario) filtradas = filtradas.filter(l => l.tecnico === filtroUsuario);
    if (dataInicio) filtradas = filtradas.filter(l => new Date(l.data) >= new Date(dataInicio));
    if (dataFim) filtradas = filtradas.filter(l => new Date(l.data) <= new Date(dataFim));
    
    this.renderizarTabelaLeituras(filtradas);
    this.mostrarToast(filtradas.length + ' leituras encontradas', 'success');
  }

  limparFiltrosLeituras() {
    ['filtroLocalLeituras', 'filtroStatusLeituras', 'filtroUsuarioLeituras'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const dataInicio = document.getElementById('filtroDataInicio');
    const dataFim = document.getElementById('filtroDataFim');
    if (dataInicio) dataInicio.value = '';
    if (dataFim) dataFim.value = '';
    if (this.leiturasCache.length) this.renderizarTabelaLeituras(this.leiturasCache);
  }

  exportarDados() {
    if (!this.leiturasCache || this.leiturasCache.length === 0) { this.mostrarToast('Nenhum dado para exportar', 'error'); return; }
    try {
      const headers = ['Data', 'Ronda ID', 'Técnico', 'Local', 'Hidrômetro', 'Tipo', 'Leitura Anterior', 'Leitura Atual', 'Consumo (m³)', 'Variação (%)', 'Status', 'Justificativa'];
      const rows = this.leiturasCache.map(l => {
        const data = new Date(l.data);
        return [ data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR'), l.rondaId || '', l.tecnico || '', l.local || '', l.hidrometroId || l.id || '', l.tipo || '', l.leituraAnterior || '', l.leituraAtual || l.leitura || '', l.consumoDia || '', l.variacao || '', l.status || '', l.justificativa || '' ];
      });
      
      const csvContent = [headers.join(';'), ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))].join('\n');
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `leituras_hidrometros_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.mostrarToast(`Exportados ${rows.length} registros`, 'success');
    } catch (error) { this.mostrarToast('Erro ao exportar', 'error'); }
  }

  verDetalhesLeitura(id) {
    const l = this.leiturasCache.find(x => x.id === id);
    if (!l) return;
    const consumo = parseFloat(l.consumoDia) || (l.leituraAtual - l.leituraAnterior);
    alert(`Detalhes:\n📍 Local: ${l.local}\n🔧 Hidrômetro: ${l.hidrometroId} (${l.tipo})\n📊 Leitura: ${l.leituraAtual} m³\n💧 Consumo: ${consumo.toFixed(2)} m³\n⚠️ Status: ${l.status}\n👤 Técnico: ${l.tecnico}\n📝 Justificativa: ${l.justificativa || 'Nenhuma'}\n📅 Data: ${new Date(l.data).toLocaleString('pt-BR')}`);
  }

  // ========== ANÁLISE GERENCIAL MELHORADA v2.9.9.4 ==========

  async carregarAnalise() {
    if (!this.online) { this.mostrarToast('Sem conexão', 'warning'); return; }
    this.mostrarLoading(true, 'Gerando análise...');
    
    try {
      const [resRecente, resAnterior, resDetalhado] = await Promise.all([
        fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'getDashboard', periodo: 30 }) }).then(r => r.json()),
        fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'getDashboard', periodo: 60 }) }).then(r => r.json()),
        fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'getLeituras', limite: 2000 }) }).then(r => r.json())
      ]);

      if (resRecente.success && resDetalhado.success) {
        const dadosAtuais = resRecente.ultimas || [];
        const dadosAnteriores = resAnterior.ultimas ? resAnterior.ultimas.filter(l => { const d = new Date(l.data); return ((new Date() - d) / (1000 * 60 * 60 * 24)) > 30 && ((new Date() - d) / (1000 * 60 * 60 * 24)) <= 60; }) : [];
        const todosDados = resDetalhado.leituras || dadosAtuais;
        
        this.analiseData = { atual: dadosAtuais, anterior: dadosAnteriores, todos: todosDados };
        this.popularFiltroUsuarios(todosDados, 'filtroUsuarioAnalise');
        this.popularFiltroLocaisAnalise(todosDados);
        this.renderizarAnaliseGerencial(dadosAtuais, dadosAnteriores, todosDados);
      }
    } catch (error) { 
      console.error('[Análise] Erro:', error);
      this.mostrarToast('Erro ao carregar análise', 'error'); 
    }
    finally { this.mostrarLoading(false); }
  }

  popularFiltroLocaisAnalise(dados) {
    const select = document.getElementById('filtroLocalAnalise');
    if (!select || !dados) return;
    const locais = [...new Set(dados.map(l => l.local).filter(l => l))].sort();
    select.innerHTML = '<option value="">Todos os locais</option>' + locais.map(l => `<option value="${l}">${l}</option>`).join('');
  }

  aplicarFiltrosAnalise() {
    if (!this.analiseData) { this.mostrarToast('Carregue a análise primeiro', 'warning'); return; }
    const filtroUsuario = document.getElementById('filtroUsuarioAnalise')?.value || '';
    const filtroLocal = document.getElementById('filtroLocalAnalise')?.value || '';
    
    let dadosAtual = [...this.analiseData.atual];
    let dadosAnterior = [...this.analiseData.anterior];
    let dadosTodos = [...this.analiseData.todos];
    
    if (filtroUsuario) { dadosAtual = dadosAtual.filter(l => l.tecnico === filtroUsuario); dadosAnterior = dadosAnterior.filter(l => l.tecnico === filtroUsuario); dadosTodos = dadosTodos.filter(l => l.tecnico === filtroUsuario); }
    if (filtroLocal) { dadosAtual = dadosAtual.filter(l => l.local === filtroLocal); dadosAnterior = dadosAnterior.filter(l => l.local === filtroLocal); dadosTodos = dadosTodos.filter(l => l.local === filtroLocal); }
    
    this.renderizarAnaliseGerencial(dadosAtual, dadosAnterior, dadosTodos);
    this.mostrarToast(`Análise filtrada`, 'success');
  }

  // ========== RESUMO EXECUTIVO MELHORADO v2.9.9.4 ==========
  renderizarAnaliseGerencial(dadosAtual, dadosAnterior, todosDados) {
    const container = document.getElementById('analiseContainer');
    if (!container) return;

    const consumoAtual = dadosAtual.reduce((acc, l) => acc + (parseFloat(l.consumoDia) || 0), 0);
    const consumoAnterior = dadosAnterior.reduce((acc, l) => acc + (parseFloat(l.consumoDia) || 0), 0);
    const variacaoConsumo = consumoAnterior > 0 ? ((consumoAtual - consumoAnterior) / consumoAnterior) * 100 : 0;
    const totalLeituras = dadosAtual.length;
    const alertas = dadosAtual.filter(l => l.status !== 'NORMAL' && l.status !== 'CONSUMO_BAIXO').length;
    const taxaAlertas = totalLeituras > 0 ? (alertas / totalLeituras) * 100 : 0;
    const vazamentos = dadosAtual.filter(l => l.status === 'VAZAMENTO').length;
    const kpi = this.calcularKPI(dadosAtuais);
    const leiturasPorDia = this.calcularLeiturasPorDia(dadosAtual);
    const mediaLeiturasDia = leiturasPorDia.length > 0 ? leiturasPorDia.reduce((a, b) => a + b, 0) / leiturasPorDia.length : 0;
    const consumoPorLocal = this.calcularConsumoPorLocal(dadosAtual);
    const topConsumo = Object.entries(consumoPorLocal).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const locaisCriticos = this.calcularLocaisCriticos(dadosAtual);
    const produtividade = this.calcularProdutividade(dadosAtual);
    const tendencia = this.calcularTendencia(dadosAtual);

    container.innerHTML = `
      <div class="analise-kpi-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
        <div class="analise-card" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-left: 4px solid ${variacaoConsumo > 20 ? '#dc3545' : '#28a745'};">
          <div style="font-size: 0.875rem; color: #6c757d; margin-bottom: 0.5rem;">Variação Consumo</div>
          <div style="font-size: 2rem; font-weight: 800; color: ${variacaoConsumo > 20 ? '#dc3545' : '#28a745'};">${(variacaoConsumo > 0 ? '+' : '') + variacaoConsumo.toFixed(1)}%</div>
          <div style="font-size: 0.75rem; color: #6c757d; margin-top: 0.25rem;">vs período anterior</div>
        </div>
        <div class="analise-card" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-left: 4px solid #007bff;">
          <div style="font-size: 0.875rem; color: #6c757d; margin-bottom: 0.5rem;">Consumo Total</div>
          <div style="font-size: 2rem; font-weight: 800; color: #003366;">${consumoAtual.toFixed(2)} m³</div>
          <div style="font-size: 0.75rem; color: #6c757d; margin-top: 0.25rem;">Últimos 30 dias</div>
        </div>
        <div class="analise-card" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-left: 4px solid ${taxaAlertas > 10 ? '#ffc107' : '#28a745'};">
          <div style="font-size: 0.875rem; color: #6c757d; margin-bottom: 0.5rem;">Taxa Alertas</div>
          <div style="font-size: 2rem; font-weight: 800; color: ${taxaAlertas > 10 ? '#ffc107' : '#28a745'};">${taxaAlertas.toFixed(1)}%</div>
          <div style="font-size: 0.75rem; color: #6c757d; margin-top: 0.25rem;">${alertas} de ${totalLeituras}</div>
        </div>
        <div class="analise-card" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-left: 4px solid ${vazamentos > 0 ? '#dc3545' : '#28a745'};">
          <div style="font-size: 0.875rem; color: #6c757d; margin-bottom: 0.5rem;">Vazamentos</div>
          <div style="font-size: 2rem; font-weight: 800; color: ${vazamentos > 0 ? '#dc3545' : '#28a745'};">${vazamentos}</div>
          <div style="font-size: 0.75rem; color: #6c757d; margin-top: 0.25rem;">Necessitam atenção</div>
        </div>
        <div class="analise-card" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-left: 4px solid #17a2b8;">
          <div style="font-size: 0.875rem; color: #6c757d; margin-bottom: 0.5rem;">Média Diária</div>
          <div style="font-size: 2rem; font-weight: 800; color: #17a2b8;">${(consumoAtual / 30).toFixed(2)} m³</div>
        </div>
        <div class="analise-card" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-left: 4px solid #6c757d;">
          <div style="font-size: 0.875rem; color: #6c757d; margin-bottom: 0.5rem;">Produtividade</div>
          <div style="font-size: 2rem; font-weight: 800; color: #6c757d;">${mediaLeiturasDia.toFixed(0)}</div>
          <div style="font-size: 0.75rem; color: #6c757d; margin-top: 0.25rem;">Leituras/dia</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1.5rem;">
        <div class="analise-section" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h3 style="margin-bottom: 1rem; color: #003366; font-size: 1.1rem;">🏢 Top 5 Locais - Maior Consumo</h3>
          ${topConsumo.length > 0 ? `<table style="width: 100%; border-collapse: collapse;">${topConsumo.map(([local, consumo], idx) => `<tr style="border-bottom: 1px solid #e9ecef;"><td style="padding: 0.75rem 0; font-weight: 600;">${idx + 1}. ${local}</td><td style="padding: 0.75rem 0; text-align: right; font-weight: 700; color: #003366;">${consumo.toFixed(2)} m³</td></tr>`).join('')}</table>` : '<p style="color: #6c757d; text-align: center;">Sem dados</p>'}
        </div>
        <div class="analise-section" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h3 style="margin-bottom: 1rem; color: #dc3545; font-size: 1.1rem;">🚨 Locais Críticos</h3>
          ${locaisCriticos.length > 0 ? `<table style="width: 100%; border-collapse: collapse;"><thead><tr style="background: #f8f9fa;"><th style="padding: 0.75rem; text-align: left; font-size: 0.875rem;">Local</th><th style="padding: 0.75rem; text-align: center; font-size: 0.875rem;">Ocorrências</th></tr></thead><tbody>${locaisCriticos.map(l => `<tr style="border-bottom: 1px solid #e9ecef;"><td style="padding: 0.75rem;">${l.nome}</td><td style="padding: 0.75rem; text-align: center;"><span style="background: #dc3545; color: white; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.875rem; font-weight: 700;">${l.count}</span></td></tr>`).join('')}</tbody></table>` : '<p style="color: #28a745; text-align: center; font-weight: 600;">✓ Nenhum vazamento</p>'}
        </div>
        <div class="analise-section" style="background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); grid-column: 1 / -1;">
          <h3 style="margin-bottom: 1rem; color: #003366; font-size: 1.1rem;">👥 Produtividade por Técnico</h3>
          ${produtividade.length > 0 ? `<table style="width: 100%; border-collapse: collapse;"><thead><tr style="background: #f8f9fa;"><th style="padding: 0.75rem; text-align: left;">Técnico</th><th style="padding: 0.75rem; text-align: center;">Leituras</th><th style="padding: 0.75rem; text-align: center;">Média/Dia</th><th style="padding: 0.75rem; text-align: right;">Eficiência</th></tr></thead><tbody>${produtividade.map(p => `<tr style="border-bottom: 1px solid #e9ecef;"><td style="padding: 0.75rem; font-weight: 600;">${p.nome}</td><td style="padding: 0.75rem; text-align: center;">${p.total}</td><td style="padding: 0.75rem; text-align: center;">${p.mediaDia.toFixed(1)}</td><td style="padding: 0.75rem; text-align: right;"><div style="display: inline-flex; align-items: center; gap: 0.5rem;"><div style="width: 60px; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;"><div style="width: ${p.eficiencia}%; height: 100%; background: ${p.eficiencia > 80 ? '#28a745' : p.eficiencia > 50 ? '#ffc107' : '#dc3545'};"></div></div><span style="font-size: 0.875rem; font-weight: 600;">${p.eficiencia}%</span></div></td></tr>`).join('')}</tbody></table>` : '<p style="text-align: center;">Sem dados</p>'}
        </div>
      </div>

      <!-- RESUMO EXECUTIVO MELHORADO v2.9.9.4 -->
      <div style="background: linear-gradient(135deg, #003366 0%, #004080 100%); color: white; padding: 1.5rem; border-radius: 12px; margin-top: 1.5rem; box-shadow: 0 10px 25px rgba(0,51,102,0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 0.75rem;">
          <h3 style="margin: 0; font-size: 1.2rem; display: flex; align-items: center; gap: 0.5rem;">
            📊 Resumo Executivo - Período: ${new Date().toLocaleDateString('pt-BR', {month: 'short', year: 'numeric'})}
          </h3>
          <span style="background: rgba(255,255,255,0.2); padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600;">
            ${totalLeituras} leituras
          </span>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem;">
          <!-- Status Geral -->
          <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; border-left: 4px solid ${
            vazamentos > 0 ? '#ef4444' : alertas > (totalLeituras * 0.1) ? '#f59e0b' : '#22c55e'
          };">
            <div style="font-size: 0.75rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Status do Sistema</div>
            <div style="font-size: 1.5rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem;">
              ${vazamentos > 0 ? '🔴 Crítico' : alertas > (totalLeituras * 0.1) ? '🟡 Atenção' : '🟢 Normal'}
            </div>
            <div style="font-size: 0.875rem; opacity: 0.9; margin-top: 0.5rem; line-height: 1.4;">
              ${vazamentos > 0 
                ? `${vazamentos} vazamento(s) detectado(s) exigem ação imediata.` 
                : alertas > 0 
                  ? `${alertas} anomalia(s) detectada(s). Monitoramento recomendado.` 
                  : 'Sistema operando dentro dos parâmetros normais.'}
            </div>
          </div>

          <!-- Consumo -->
          <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <div style="font-size: 0.75rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Consumo Total (30 dias)</div>
            <div style="font-size: 1.75rem; font-weight: 800;">${consumoAtual.toFixed(2)} <span style="font-size: 1rem; font-weight: 600;">m³</span></div>
            <div style="font-size: 0.875rem; margin-top: 0.25rem; display: flex; align-items: center; gap: 0.25rem;">
              <span style="color: ${variacaoConsumo > 20 ? '#fca5a5' : variacaoConsumo < -20 ? '#86efac' : '#fff'};">
                ${variacaoConsumo > 0 ? '↑' : '↓'} ${Math.abs(variacaoConsumo).toFixed(1)}%
              </span>
              <span style="opacity: 0.8;">vs período anterior</span>
            </div>
          </div>

          <!-- Eficiência -->
          <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; border-left: 4px solid #8b5cf6;">
            <div style="font-size: 0.75rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Taxa de Conformidade</div>
            <div style="font-size: 1.75rem; font-weight: 800;">${((kpi.normal / (kpi.total || 1)) * 100).toFixed(1)}%</div>
            <div style="font-size: 0.875rem; opacity: 0.9; margin-top: 0.25rem;">
              ${kpi.normal} leituras normais de ${kpi.total} total
            </div>
          </div>

          <!-- Produtividade -->
          <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; border-left: 4px solid #10b981;">
            <div style="font-size: 0.75rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Média Diária</div>
            <div style="font-size: 1.75rem; font-weight: 800;">${(consumoAtual / 30).toFixed(2)} <span style="font-size: 1rem; font-weight: 600;">m³/dia</span></div>
            <div style="font-size: 0.875rem; opacity: 0.9; margin-top: 0.25rem;">
              ${mediaLeiturasDia.toFixed(0)} leituras/dia em média
            </div>
          </div>
        </div>

        <!-- Recomendações Detalhadas -->
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">
          <div style="font-size: 0.875rem; font-weight: 700; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
            💡 Recomendações Estratégicas
          </div>
          <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.9rem; line-height: 1.6; opacity: 0.95;">
            ${vazamentos > 0 
              ? `<li style="margin-bottom: 0.5rem;"><strong style="color: #fca5a5;">Ação Imediata:</strong> Priorizar vistoria técnica nos ${vazamentos} ponto(s) com suspeita de vazamento para minimizar perdas.</li>` 
              : ''}
            ${variacaoConsumo > 30 
              ? `<li style="margin-bottom: 0.5rem;"><strong style="color: #fca5a5;">Investigação Necessária:</strong> Aumento de ${variacaoConsumo.toFixed(1)}% no consumo requer auditoria das atividades recentes.</li>` 
              : variacaoConsumo < -30 
                ? `<li style="margin-bottom: 0.5rem;"><strong>Observação:</strong> Redução súbita de ${Math.abs(variacaoConsumo).toFixed(1)}% - verificar se há restrições ou medições incorretas.</li>`
                : `<li style="margin-bottom: 0.5rem;">Consumo estável em relação ao período anterior.</li>`}
            ${taxaAlertas > 10 
              ? `<li style="margin-bottom: 0.5rem;">Taxa de alertas (${taxaAlertas.toFixed(1)}%) acima do ideal. Revisar calibração dos hidrômetros.</li>` 
              : `<li style="margin-bottom: 0.5rem;">Taxa de alertas dentro do parâmetro aceitável.</li>`}
            <li>Tendência: ${tendencia && tendencia.length > 1 
              ? (tendencia[tendencia.length-1].consumo > tendencia[tendencia.length-2].consumo 
                ? 'Crescente ↗️' 
                : 'Decrescente ↘️')
              : 'Estável ➡️'} nos últimos 7 dias</li>
          </ul>
        </div>

        <!-- Rodapé com timestamp -->
        <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.75rem; opacity: 0.6; text-align: right;">
          Gerado em: ${new Date().toLocaleString('pt-BR')}
        </div>
      </div>
    `;
  }

  calcularLeiturasPorDia(dados) {
    const porDia = {};
    dados.forEach(l => { const dia = new Date(l.data).toISOString().split('T')[0]; porDia[dia] = (porDia[dia] || 0) + 1; });
    return Object.values(porDia);
  }

  calcularConsumoPorLocal(dados) {
    const locais = {};
    dados.forEach(l => { if (!l.local) return; locais[l.local] = (locais[l.local] || 0) + (parseFloat(l.consumoDia) || 0); });
    return locais;
  }

  calcularLocaisCriticos(dados) {
    const locais = {};
    dados.filter(l => l.status === 'VAZAMENTO').forEach(l => {
      if (!locais[l.local]) locais[l.local] = { count: 0, impacto: 0 };
      locais[l.local].count++;
      locais[l.local].impacto += parseFloat(l.consumoDia) || 0;
    });
    return Object.entries(locais).map(([nome, d]) => ({ nome, ...d })).sort((a, b) => b.count - a.count);
  }

  calcularProdutividade(dados) {
    const tecnicos = {};
    const diasPorTecnico = {};
    dados.forEach(l => {
      const tech = l.tecnico || 'Não identificado';
      if (!tecnicos[tech]) { tecnicos[tech] = 0; diasPorTecnico[tech] = new Set(); }
      tecnicos[tech]++;
      diasPorTecnico[tech].add(new Date(l.data).toISOString().split('T')[0]);
    });
    const maxLeituras = Math.max(...Object.values(tecnicos), 1);
    return Object.entries(tecnicos).map(([nome, total]) => {
      const dias = diasPorTecnico[nome].size || 1;
      return { nome, total, mediaDia: total / dias, eficiencia: Math.round((total / maxLeituras) * 100) };
    }).sort((a, b) => b.total - a.total);
  }

  // CORREÇÃO: Erro "resultado" não definido
  calcularTendencia(dados) {
    const ultimos7Dias = [];
    const hoje = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i);
      ultimos7Dias.push({ data: d.toISOString().split('T')[0], dataStr: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), consumo: 0, count: 0 });
    }
    
    dados.forEach(l => {
      const dia = new Date(l.data).toISOString().split('T')[0];
      const item = ultimos7Dias.find(u => u.data === dia);
      if (item) { item.consumo += parseFloat(l.consumoDia) || 0; item.count++; }
    });
    
    return ultimos7Dias.map((dia, idx, arr) => {
      const anterior = idx > 0 ? arr[idx - 1].consumo : dia.consumo;
      return { data: dia.dataStr, consumo: dia.consumo, count: dia.count, variacao: anterior > 0 ? ((dia.consumo - anterior) / anterior) * 100 : 0 };
    });
  }

  // ========== GESTÃO USUÁRIOS ==========

  async carregarUsuariosDoServidor() {
    const div = document.getElementById('listaUsuarios');
    if (!div) return;
    div.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">Carregando...</p>';
    try {
      const response = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'listarUsuarios' }) });
      const data = await response.json();
      if (data.success && data.usuarios) { this.usuariosCadastrados = data.usuarios; this.salvarStorage(CONFIG.STORAGE_KEYS.USUARIOS, data.usuarios); this.atualizarListaUsuarios(); }
    } catch (error) { 
      this.usuariosCadastrados = this.lerStorage(CONFIG.STORAGE_KEYS.USUARIOS) || [];
      this.atualizarListaUsuarios();
    }
  }

  atualizarListaUsuarios() {
    const div = document.getElementById('listaUsuarios');
    if (!div) return;
    if (this.usuariosCadastrados.length === 0) { div.innerHTML = '<p style="text-align:center;">Nenhum usuário</p>'; return; }
    
    let html = '<table class="users-table" style="width:100%;"><thead><tr><th>Nome</th><th>Login</th><th>Nível</th><th>Ações</th></tr></thead><tbody>';
    this.usuariosCadastrados.forEach(u => {
      const isAdmin = this.isAdmin(u.nivel);
      const nivelClass = isAdmin ? 'level-admin' : 'level-tecnico';
      const nivelText = isAdmin ? 'ADMIN' : 'TECNICO';
      const proximoNivel = isAdmin ? 'tecnico' : 'admin';
      const textoBotao = isAdmin ? '↓ Tornar Técnico' : '↑ Tornar Admin';
      const corBotao = isAdmin ? '#6c757d' : '#dc3545';
      
      html += `<tr><td>${u.nome}</td><td>${u.usuario}</td><td><span class="${nivelClass}" style="padding: 0.25rem 0.5rem; border-radius: 4px; color: white; font-size: 0.75rem; font-weight: 700; background: ${isAdmin ? '#003366' : '#00A651'};">${nivelText}</span></td><td style="display:flex;gap:8px;"><button onclick="app.trocarSenha('${u.usuario}')" style="padding:6px 12px;background:#6c757d;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.85rem;">🔑 Senha</button><button onclick="app.alternarNivel('${u.usuario}', '${proximoNivel}')" style="background:${corBotao};color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:0.85rem;">${textoBotao}</button></td></tr>`;
    });
    div.innerHTML = html + '</tbody></table>';
  }

  async alternarNivel(usuario, novoNivel) {
    if (!confirm(`Alterar ${usuario} para ${novoNivel.toUpperCase()}?`)) return;
    this.mostrarLoading(true, 'Atualizando...');
    try {
      const response = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'alterarNivel', usuario: usuario, novoNivel: novoNivel }) });
      const data = await response.json();
      this.mostrarLoading(false);
      if (data.success) { this.mostrarToast('Nível alterado!', 'success'); await this.carregarUsuariosDoServidor(); }
    } catch (error) { this.mostrarLoading(false); this.mostrarToast('Erro', 'error'); }
  }

  async criarUsuario() {
    const nome = document.getElementById('novoNome')?.value.trim();
    const usuario = document.getElementById('novoUsuario')?.value.trim();
    const senha = document.getElementById('novoSenha')?.value.trim();
    const nivel = document.getElementById('novoNivel')?.value || 'tecnico';
    if (!nome || !usuario || !senha) { this.mostrarToast('Preencha todos os campos', 'error'); return; }
    
    this.mostrarLoading(true, 'Criando...');
    try {
      const response = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'criarUsuario', nome, usuario, senha, nivel }) });
      const data = await response.json();
      this.mostrarLoading(false);
      if (data.success) {
        this.mostrarToast('Usuário criado!', 'success');
        ['novoNome', 'novoUsuario', 'novoSenha'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        await this.carregarUsuariosDoServidor();
      }
    } catch (error) { this.mostrarLoading(false); this.mostrarToast('Erro', 'error'); }
  }

  async trocarSenha(usuario) {
    const novaSenha = prompt(`Nova senha para ${usuario}:`);
    if (!novaSenha?.trim()) return;
    this.mostrarLoading(true, 'Atualizando...');
    try {
      const response = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'trocarSenha', usuario, novaSenha: novaSenha.trim() }) });
      const data = await response.json();
      this.mostrarLoading(false);
      if (data.success) this.mostrarToast('Senha alterada!', 'success');
    } catch (error) { this.mostrarLoading(false); }
  }

  // ========== RONDA ==========

  // MELHORIA 1: Verifica se já existe ronda antes de iniciar nova
  async iniciarRonda() {
    if (!this.usuario) return;
    
    // MELHORIA: Verifica se existe ronda em andamento
    const rondaExistente = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
    if (rondaExistente && rondaExistente.id && rondaExistente.hidrometros && rondaExistente.hidrometros.length > 0) {
      const lidos = rondaExistente.hidrometros.filter(h => h.leituraAtual > 0 && h.foto).length;
      const total = rondaExistente.hidrometros.length;
      
      const mensagem = `⚠️ ATENÇÃO!\n\nVocê já possui uma ronda em andamento (${lidos}/${total} hidrômetros lidos).\n\nSe iniciar uma nova ronda, TODOS os dados da ronda atual serão perdidos permanentemente.\n\nDeseja realmente iniciar uma nova ronda e descartar a atual?`;
      
      if (!confirm(mensagem)) {
        return; // Cancela a operação se o usuário não confirmar
      }
      
      // Se confirmou, limpa a ronda atual antes de iniciar nova
      this.ronda = { id: null, hidrometros: [], locais: [], inicio: null };
      this.localAtual = null;
      localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
    }
    
    this.mostrarLoading(true, 'Carregando hidrômetros...');
    try {
      const response = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'iniciar', usuario: this.usuario.usuario }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.message);
      
      this.ronda = {
        id: data.rondaId,
        hidrometros: data.hidrometros.map(h => ({ ...h, leituraAtual: null, consumoDia: null, variacao: null, justificativa: '', foto: null, status: 'PENDENTE' })),
        locais: [...new Set(data.hidrometros.map(h => h.local))],
        inicio: new Date().toISOString()
      };
      this.salvarRonda();
      this.mostrarLoading(false);
      this.entrarModoLeitura();
    } catch (error) { this.mostrarLoading(false); this.mostrarToast('Erro: ' + error.message, 'error'); }
  }

  entrarModoLeitura() {
    this.mostrarTela('leituraScreen');
    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) bottomBar.style.display = 'flex';
    
    // MELHORIA 2: Ativa proteção contra fechamento e botão voltar
    this.ativarProtecaoRonda();
    
    this.popularSelectLocais();
    if (this.ronda.locais.length > 0) {
      const localInicial = this.localAtual && this.ronda.locais.includes(this.localAtual) ? this.localAtual : this.ronda.locais[0];
      const select = document.getElementById('localSelect');
      if (select) select.value = localInicial;
      this.carregarHidrometros(localInicial);
    }
    this.atualizarProgresso();
  }

  // NOVO MÉTODO: Ativa proteção contra fechamento do app (VERSÃO SUPER AGRESSIVA PARA MOBILE)
  ativarProtecaoRonda() {
    if (this.protecaoAtiva) return; // Evita duplicação
    
    this.protecaoAtiva = true;
    
    // 1. Previne fechamento da aba/janela (funciona em desktop)
    this.handleBeforeUnload = (e) => {
      if (this.protecaoAtiva) {
        e.preventDefault();
        e.returnValue = 'Ronda em andamento! Dados não salvos serão perdidos.';
        return 'Ronda em andamento! Dados não salvos serão perdidos.';
      }
    };
    
    // 2. Estratégia para mobile: criar múltiplas entradas de histórico
    // Limpa o histórico atual e cria uma "armadilha"
    history.replaceState({ ronda: true, trap: true }, '', location.href);
    
    // Cria 5 entradas falsas no histórico (mobile precisa de mais)
    for (let i = 0; i < 5; i++) {
      history.pushState({ ronda: true, index: i }, '', location.href);
    }
    
    // 3. Handler do botão voltar - intercepta TODAS as tentativas
    this.handlePopState = (e) => {
      if (!this.protecaoAtiva) return;
      
      // Se tentou voltar, empurra para frente novamente imediatamente
      history.pushState({ ronda: true, trap: true }, '', location.href);
      
      // Mostra aviso visual
      this.mostrarToast('⚠️ Use "Pausar Ronda" para sair sem perder dados!', 'error', 3000);
      
      // Salva imediatamente por segurança
      this.salvarRonda();
    };
    
    // 4. Previne gestos de swipe back (iOS)
    this.handleTouchStart = (e) => {
      if (!this.protecaoAtiva) return;
      // Detecta se o toque foi na borda esquerda (gesto de voltar)
      if (e.touches[0].pageX < 50) {
        this.mostrarToast('⚠️ Use o botão Pausar para sair', 'warning', 2000);
      }
    };
    
    // 5. Detecta quando o app volta ao foco (usuário saiu e voltou)
    this.handleVisibilityChange = () => {
      if (!this.protecaoAtiva) return;
      
      if (document.visibilityState === 'visible') {
        // Usuário voltou para o app - reforça a proteção do histórico
        setTimeout(() => {
          // Remove entradas antigas e recria
          history.replaceState({ ronda: true, trap: true }, '', location.href);
          for (let i = 0; i < 3; i++) {
            history.pushState({ ronda: true, index: i }, '', location.href);
          }
        }, 100);
      } else {
        // Usuário está saindo - salva tudo urgentemente
        this.salvarRonda();
      }
    };
    
    // 6. Intervalo para manter o histórico "cheio" (contornar consumo rápido)
    this.historicoInterval = setInterval(() => {
      if (this.protecaoAtiva && history.length < 10) {
        history.pushState({ ronda: true, maintenance: true }, '', location.href);
      }
    }, 1000);
    
    // Registra todos os listeners
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    window.addEventListener('popstate', this.handlePopState);
    window.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  // NOVO MÉTODO: Remove proteção quando sai da ronda
  desativarProtecaoRonda() {
    this.protecaoAtiva = false;
    
    // Limpa o intervalo
    if (this.historicoInterval) {
      clearInterval(this.historicoInterval);
      this.historicoInterval = null;
    }
    
    // Remove todos os listeners
    if (this.handleBeforeUnload) {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
      this.handleBeforeUnload = null;
    }
    if (this.handlePopState) {
      window.removeEventListener('popstate', this.handlePopState);
      this.handlePopState = null;
    }
    if (this.handleTouchStart) {
      window.removeEventListener('touchstart', this.handleTouchStart);
      this.handleTouchStart = null;
    }
    if (this.handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.handleVisibilityChange = null;
    }
    
    // Limpa o histórico artificial (volta para o estado limpo)
    if (history.state && history.state.ronda) {
      history.go(-5); // Tenta voltar 5 passos para limpar as entradas criadas
    }
  }

  popularSelectLocais() {
    const select = document.getElementById('localSelect');
    if (!select) return;
    const localSelecionado = this.localAtual || select.value;
    select.innerHTML = '<option value="">Selecione o local...</option>';
    this.ronda.locais.forEach(local => {
      const hidros = this.ronda.hidrometros.filter(h => h.local === local);
      const lidos = hidros.filter(h => h.leituraAtual > 0 && h.foto).length;
      const option = document.createElement('option');
      option.value = local;
      option.textContent = `${local} (${lidos}/${hidros.length})`;
      select.appendChild(option);
    });
    if (localSelecionado && this.ronda.locais.includes(localSelecionado)) select.value = localSelecionado;
  }

  carregarHidrometros(local) {
    if (!local) return;
    this.localAtual = local;
    const select = document.getElementById('localSelect');
    if (select) select.value = local;
    const container = document.getElementById('hidrometrosContainer');
    if (!container) return;
    container.innerHTML = '';
    const hidros = this.ronda.hidrometros.filter(h => h.local === local);
    
    hidros.forEach(h => {
      const card = this.criarCardHidrometro(h);
      container.appendChild(card);
      if (h.leituraAtual) {
        const input = document.getElementById('input-' + h.id);
        if (input) { input.value = h.leituraAtual; this.calcularPreview(h.id); }
        this.atualizarUI(h.id);
      }
      if (h.foto) this.restaurarFoto(h.id);
      if (h.justificativa) this.restaurarJustificativa(h.id);
      if (h.leituraAtual && !h.foto) {
        const cardEl = document.getElementById('card-' + h.id);
        if (cardEl) cardEl.classList.add('sem-foto');
      }
    });
    this.atualizarProgresso();
    this.popularSelectLocais();
  }

  criarCardHidrometro(h) {
    const div = document.createElement('div');
    div.className = 'hidrometro-card';
    div.id = 'card-' + h.id;
    div.innerHTML = `
      <div class="card-header"><div class="info-principal"><span class="tipo">🔧 ${h.tipo || 'Hidrômetro'}</span><span class="id">#${h.id}</span></div><span class="status-badge pendente" id="badge-${h.id}">PENDENTE</span></div>
      <div class="leitura-anterior"><span>Leitura anterior</span><strong>${parseFloat(h.leituraAnterior || 0).toFixed(2)} m³</strong></div>
      <div class="campo-leitura"><input type="number" step="0.01" class="input-leitura" id="input-${h.id}" placeholder="Digite a leitura atual" oninput="app.calcularPreview('${h.id}')" onblur="app.salvarLeitura('${h.id}')"><span class="unidade">m³</span></div>
      <div class="info-consumo" id="info-${h.id}"><span class="placeholder">Aguardando leitura...</span></div>
      <div class="alertas" id="alertas-${h.id}"></div>
      <div class="justificativa-container" id="just-container-${h.id}" style="display:none;"><textarea class="input-justificativa" id="just-${h.id}" placeholder="Descreva o motivo..." onblur="app.salvarJustificativa('${h.id}')"></textarea></div>
      <div class="foto-container">
        <label class="btn-foto" id="btn-foto-${h.id}"><input type="file" accept="image/*" capture="environment" onchange="app.processarFoto('${h.id}', this.files[0])" style="display:none"><span>📷 Adicionar foto</span></label>
        <div class="foto-obrigatoria" id="foto-obg-${h.id}" style="display:none; color:#dc3545; font-size:0.875rem; margin-top:0.5rem; text-align:center;">⚠️ Foto obrigatória</div>
        <img id="preview-${h.id}" class="preview-foto" style="display:none;max-width:100%;margin-top:10px;border-radius:8px;">
      </div>`;
    return div;
  }

  calcularPreview(id) {
    const input = document.getElementById('input-' + id);
    if (!input) return;
    const valor = parseFloat(input.value);
    if (isNaN(valor) || valor <= 0) return;
    const h = this.ronda.hidrometros.find(x => x.id === id);
    if (!h) return;
    const leituraAnterior = parseFloat(h.leituraAnterior) || 0;
    const consumoDia = valor - leituraAnterior;
    const consumoAnterior = parseFloat(h.consumoAnterior) || 0;
    let variacao = consumoAnterior > 0 ? ((consumoDia - consumoAnterior) / consumoAnterior) * 100 : (consumoDia > 0 ? 100 : 0);
    
    const info = document.getElementById('info-' + id);
    if (info) info.innerHTML = `<div style="display:flex;justify-content:space-between;"><span>Consumo:</span><strong>${consumoDia.toFixed(2)} m³/dia</strong></div><div style="display:flex;justify-content:space-between;margin-top:5px;font-size:0.9rem;"><span>Variação:</span><span>${(variacao >= 0 ? '+' : '') + Math.abs(variacao).toFixed(1)}%</span></div>`;
  }

  salvarLeitura(id) {
    const input = document.getElementById('input-' + id);
    if (!input) return;
    const valor = parseFloat(input.value);
    if (isNaN(valor) || valor <= 0) return;
    const h = this.ronda.hidrometros.find(x => x.id === id);
    if (!h) return;
    
    const leituraAnterior = parseFloat(h.leituraAnterior) || 0;
    const consumoDia = valor - leituraAnterior;
    const consumoAnterior = parseFloat(h.consumoAnterior) || 0;
    let variacao = consumoAnterior > 0 ? ((consumoDia - consumoAnterior) / consumoAnterior) * 100 : (consumoDia > 0 ? 100 : 0);
    let status = 'NORMAL';
    if (consumoDia < 0) status = 'ANOMALIA_NEGATIVO';
    else if (variacao > 100) status = 'VAZAMENTO';
    else if (variacao > 20 || variacao < -20) status = 'ALERTA_VARIACAO';
    else if (consumoDia <= 0.5) status = 'CONSUMO_BAIXO';
    
    h.leituraAtual = valor; h.consumoDia = consumoDia; h.variacao = variacao; h.status = status;
    this.salvamentoPendente = true;
    this.atualizarUI(id);
    this.popularSelectLocais();
    this.salvarRonda();
    if (!h.foto) {
      const cardEl = document.getElementById('card-' + id);
      if (cardEl) cardEl.classList.add('sem-foto');
      const fotoObg = document.getElementById('foto-obg-' + id);
      if (fotoObg) fotoObg.style.display = 'block';
    }
  }

  atualizarUI(id) {
    const h = this.ronda.hidrometros.find(x => x.id === id);
    if (!h || !h.leituraAtual) return;
    const badge = document.getElementById('badge-' + id);
    const card = document.getElementById('card-' + id);
    const info = document.getElementById('info-' + id);
    const alertas = document.getElementById('alertas-' + id);
    const justContainer = document.getElementById('just-container-' + id);
    const fotoObg = document.getElementById('foto-obg-' + id);
    
    if (badge) {
      let statusTexto = 'PENDENTE', statusClasse = 'pendente';
      if (h.foto) {
        const textos = { 'NORMAL': '✓ OK', 'ALERTA_VARIACAO': '⚠️ ALERTA', 'VAZAMENTO': '🚨 VAZAMENTO', 'ANOMALIA_NEGATIVO': '❌ ERRO', 'CONSUMO_BAIXO': 'ℹ️ BAIXO' };
        statusTexto = textos[h.status] || h.status;
        statusClasse = (h.status === 'NORMAL' || h.status === 'CONSUMO_BAIXO') ? 'completo' : 'pendente';
      } else { statusTexto = '⏳ SEM FOTO'; }
      badge.textContent = statusTexto;
      badge.className = 'status-badge ' + statusClasse;
    }
    
    if (card) {
      if (h.foto && (h.status === 'NORMAL' || h.status === 'CONSUMO_BAIXO')) card.className = 'hidrometro-card completo';
      else if (h.foto) card.className = 'hidrometro-card anomalia';
      else card.className = 'hidrometro-card sem-foto';
    }
    
    if (fotoObg) fotoObg.style.display = h.foto ? 'none' : 'block';
    
    if (info) {
      const varClass = Math.abs(h.variacao) > 20 ? 'alta' : 'normal';
      info.innerHTML = `<div style="display:flex;justify-content:space-between;"><span>Consumo:</span><strong>${h.consumoDia.toFixed(2)} m³/dia</strong></div><div style="display:flex;justify-content:space-between;margin-top:5px;font-size:0.9rem;"><span>Variação:</span><span class="variacao ${varClass}">${(h.variacao >= 0 ? '+' : '') + Math.abs(h.variacao).toFixed(1)}%</span></div>`;
    }
    
    if (alertas) {
      let html = '';
      if (h.status === 'ANOMALIA_NEGATIVO') html = '<div class="alerta danger"><span>⚠️</span><span>Leitura menor que anterior</span></div>';
      else if (h.status === 'VAZAMENTO') html = '<div class="alerta critico"><span>🚨</span><span>POSSÍVEL VAZAMENTO!</span></div>';
      else if (h.status === 'ALERTA_VARIACAO') html = `<div class="alerta warning"><span>⚠️</span><span>Variação de ${Math.abs(h.variacao).toFixed(1)}%</span></div>`;
      alertas.innerHTML = html;
    }
    
    if (justContainer) justContainer.style.display = (h.status !== 'NORMAL' && h.status !== 'CONSUMO_BAIXO') ? 'block' : 'none';
  }

  salvarJustificativa(id) { const h = this.ronda.hidrometros.find(x => x.id === id); if (h) { h.justificativa = document.getElementById('just-' + id)?.value.trim() || ''; this.salvamentoPendente = true; this.salvarRonda(); } }

  async processarFoto(id, arquivo) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) { this.mostrarToast('Arquivo deve ser imagem', 'error'); return; }
    if ((arquivo.size / (1024 * 1024)) > CONFIG.MAX_FOTO_SIZE_MB) { this.mostrarToast('Imagem muito grande', 'error'); return; }

    this.mostrarLoading(true, 'Processando foto...');
    try {
      const comprimida = await this.comprimirImagem(arquivo);
      if (!comprimida || comprimida.length < 100) throw new Error('Falha na compressão');
      const h = this.ronda.hidrometros.find(x => x.id === id);
      if (!h) throw new Error('Hidrômetro não encontrado');
      
      h.foto = comprimida; this.salvamentoPendente = true;
      const preview = document.getElementById('preview-' + id);
      const btn = document.getElementById('btn-foto-' + id);
      if (preview) { preview.src = comprimida; preview.style.display = 'block'; }
      if (btn) { btn.innerHTML = '<span>✓ Foto adicionada</span>'; btn.classList.add('tem-foto'); }
      
      const cardEl = document.getElementById('card-' + id);
      if (cardEl) cardEl.classList.remove('sem-foto');
      const fotoObg = document.getElementById('foto-obg-' + id);
      if (fotoObg) fotoObg.style.display = 'none';
      
      this.atualizarUI(id); this.atualizarProgresso(); this.popularSelectLocais(); this.salvarRonda();
      this.mostrarLoading(false);
      this.mostrarToast('✓ Foto adicionada', 'success');
    } catch (error) { this.mostrarLoading(false); this.mostrarToast('Erro ao processar foto', 'error'); }
  }

  comprimirImagem(arquivo, maxWidth = 1280, qualidade = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width, height = img.height;
            if (width > maxWidth) { height = Math.round((maxWidth / width) * height); width = maxWidth; }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas não suportado');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', qualidade));
          } catch (err) { reject(new Error('Erro na compressão')); }
        };
        img.onerror = () => reject(new Error('Erro ao carregar imagem'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsDataURL(arquivo);
    });
  }

  restaurarFoto(id) { const h = this.ronda.hidrometros.find(x => x.id === id); if (!h?.foto) return; const preview = document.getElementById('preview-' + id); const btn = document.getElementById('btn-foto-' + id); if (preview) { preview.src = h.foto; preview.style.display = 'block'; } if (btn) { btn.innerHTML = '<span>✓ Foto adicionada</span>'; btn.classList.add('tem-foto'); } const fotoObg = document.getElementById('foto-obg-' + id); if (fotoObg) fotoObg.style.display = 'none'; }
  restaurarJustificativa(id) { const h = this.ronda.hidrometros.find(x => x.id === id); if (!h?.justificativa) return; const textarea = document.getElementById('just-' + id); const container = document.getElementById('just-container-' + id); if (textarea) textarea.value = h.justificativa; if (container) container.style.display = 'block'; }

  atualizarProgresso() {
    const total = this.ronda.hidrometros.length;
    const completos = this.ronda.hidrometros.filter(h => h.leituraAtual > 0 && h.foto).length;
    const percentual = total > 0 ? Math.round((completos / total) * 100) : 0;
    
    const progressText = document.getElementById('progressText');
    if (progressText) progressText.textContent = `${completos}/${total} (${percentual}%)`;
    const progressBar = document.getElementById('progressBar');
    if (progressBar) { const barra = progressBar.querySelector('.barra-preenchida'); if (barra) barra.style.width = percentual + '%'; }
    const btnFinalizar = document.getElementById('btnFinalizar');
    if (btnFinalizar) { btnFinalizar.disabled = percentual < 100; btnFinalizar.className = percentual === 100 ? 'btn-finalizar pronto' : 'btn-finalizar'; btnFinalizar.innerHTML = percentual === 100 ? '<span>✓</span><span>Finalizar Ronda</span>' : `<span>Finalizar (${percentual}%)</span>`; }
  }

  async finalizarRonda() {
    const semFoto = this.ronda.hidrometros.filter(h => !h.foto);
    if (semFoto.length > 0) { this.mostrarToast(semFoto.length + ' hidrômetro(s) sem foto!', 'error'); const primeiro = semFoto[0]; if (primeiro.local !== this.localAtual) this.carregarHidrometros(primeiro.local); setTimeout(() => { const cardEl = document.getElementById('card-' + primeiro.id); if (cardEl) cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100); return; }
    
    const anomaliasSemJust = this.ronda.hidrometros.filter(h => h.status !== 'NORMAL' && h.status !== 'CONSUMO_BAIXO' && (!h.justificativa || h.justificativa.length < 10));
    if (anomaliasSemJust.length > 0) { this.mostrarToast('Preencha justificativa para divergências', 'error'); return; }

    this.mostrarLoading(true, 'Enviando...');
    const leituras = this.ronda.hidrometros.map(h => ({ id: h.id, local: h.local, tipo: h.tipo, leituraAnterior: h.leituraAnterior, leituraAtual: h.leituraAtual, consumoAnterior: h.consumoAnterior, justificativa: h.justificativa, foto: h.foto }));

    try {
      const response = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'salvarLeituras', leituras: leituras, usuario: this.usuario.usuario, rondaId: this.ronda.id }) });
      const data = await response.json();
      if (data.success) {
        this.mostrarToast(data.aviso ? 'Ronda salva! ' + data.aviso : 'Ronda finalizada!', data.aviso ? 'warning' : 'success', data.aviso ? 8000 : 3000);
        
        // MELHORIA: Remove proteção ao finalizar com sucesso
        this.desativarProtecaoRonda();
        
        this.ronda = { id: null, hidrometros: [], locais: [], inicio: null }; this.localAtual = null;
        localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
        this.mostrarLoading(false);
        this.mostrarTela('startScreen');
      } else throw new Error(data.message);
    } catch (error) { this.mostrarLoading(false); this.mostrarToast('Erro ao finalizar: ' + error.message, 'error'); }
  }

  pausarRonda() { 
    this.salvarRonda(); 
    this.mostrarToast('Ronda pausada', 'info'); 
    
    // MELHORIA: Remove proteção ao pausar
    this.desativarProtecaoRonda();
    
    this.mostrarTela('startScreen'); 
    const bottomBar = document.getElementById('bottomBar'); 
    if (bottomBar) bottomBar.style.display = 'none'; 
    this.verificarRondaPendente(); 
  }
  
  continuarRonda() { this.entrarModoLeitura(); }

  verificarRondaPendente() {
    const ronda = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
    if (ronda?.id && ronda.hidrometros.length > 0) {
      const btn = document.getElementById('btnContinuarRonda');
      if (btn) { btn.style.display = 'flex'; const lidos = ronda.hidrometros.filter(h => h.leituraAtual > 0 && h.foto).length; const span = btn.querySelector('span:last-child'); if (span) span.textContent = `Continuar Ronda (${lidos}/${ronda.hidrometros.length})`; }
    }
  }

  mostrarLoading(mostrar, texto) {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `<div class="spinner"></div><div class="loading-text">Carregando...</div>`;
      document.body.appendChild(overlay);
    }
    overlay.style.display = mostrar ? 'flex' : 'none';
    if (mostrar) { const textEl = overlay.querySelector('.loading-text'); if (textEl) textEl.textContent = texto || 'Carregando...'; }
  }

  mostrarToast(mensagem, tipo, duracao) {
    tipo = tipo || 'info'; duracao = duracao || 3000;
    let container = document.querySelector('.toast-container');
    if (!container) { container = document.createElement('div'); container.className = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = mensagem;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, duracao);
  }

  mostrarErro(mensagem) {
    const erroDiv = document.getElementById('loginError');
    if (erroDiv) { erroDiv.textContent = mensagem; erroDiv.style.display = 'block'; setTimeout(() => erroDiv.style.display = 'none', 5000); }
    else this.mostrarToast(mensagem, 'error');
  }

  lerStorage(chave) { try { return JSON.parse(localStorage.getItem(chave)); } catch(e) { return null; } }
  salvarStorage(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch(e) {} }
  salvarRonda() { if (!this.ronda.id) return; localStorage.setItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA, JSON.stringify(this.ronda)); this.salvamentoPendente = false; }

  configurarEventos() {
    const form = document.getElementById('loginForm');
    if (form) form.addEventListener('submit', (e) => this.login(e));
  }

  togglePassword() { const input = document.getElementById('password'); if (input) input.type = input.type === 'password' ? 'text' : 'password'; }
}

let app;
document.addEventListener('DOMContentLoaded', () => { app = new SistemaHidrometros(); });
