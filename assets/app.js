/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.9.8.6
 * CORREÇÕES APLICADAS:
 * - Fix: statusRede agora sempre visível em TODAS as telas
 * - Fix: nome do técnico aparece na tela inicial startScreen
 * - Fix: togglePassword funciona no login
 * - Melhoria: mais verificações de nulidade
 */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzmn7102Jh_VzO8A8TDitjwqDlSk_zAWkfnzd7MbncJjQiQ8fA1j1Olktv8TBLGSZed/exec',
  VERSAO: '2.9.8.6',
  STORAGE_KEYS: {
    USUARIO: 'h2_usuario_v2984',
    RONDA_ATIVA: 'h2_ronda_ativa_v2984',
    BACKUP_RONDA: 'h2_backup_ronda_v2984',
    USUARIOS: 'h2_usuarios_v2984'
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
   
    console.log(`[v${CONFIG.VERSAO}] Inicializando...`);
    this.criarStatusRede();
    this.limparElementosFantasmas();
    this.inicializar();
  }
  criarStatusRede() {
    let el = document.getElementById('statusRede');
    if (!el) {
      el = document.createElement('div');
      el.id = 'statusRede';
      el.style.cssText = 'position:fixed;top:10px;right:10px;padding:6px 12px;border-radius:4px;font-size:0.85rem;z-index:9999;color:white;transition:all 0.3s;';
      document.body.appendChild(el);
    } else {
      // === CORREÇÃO v2.9.8.6: força posição fixed mesmo se o elemento já existir no HTML ===
      el.style.position = 'fixed';
      el.style.top = '10px';
      el.style.right = '10px';
      el.style.zIndex = '9999';
    }
    this.atualizarStatusRede();
  }
  atualizarStatusRede() {
    const el = document.getElementById('statusRede');
    if (!el) return;
    if (this.online) {
      el.textContent = '🟢 Online';
      el.style.backgroundColor = '#28a745';
    } else {
      el.textContent = '🔴 Offline';
      el.style.backgroundColor = '#dc3545';
    }
  }
  async inicializar() {
    window.addEventListener('online', () => {
      this.online = true;
      this.atualizarStatusRede();
      this.mostrarToast('Conexão restaurada', 'success');
    });
   
    window.addEventListener('offline', () => {
      this.online = false;
      this.atualizarStatusRede();
      this.mostrarToast('Modo offline ativado', 'warning');
    });
    const usuarioSalvo = this.lerStorage(CONFIG.STORAGE_KEYS.USUARIO);
    if (usuarioSalvo) {
      this.usuario = usuarioSalvo;
      this.atualizarHeaderUsuario();
      this.atualizarNomeStart(); // === CORREÇÃO v2.9.8.6: nome aparece na startScreen ===
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
    setInterval(() => {
      if (this.salvamentoPendente && this.ronda.id) this.salvarRonda();
    }, 2000);
  }
  // === CORREÇÃO v2.9.8.6: novo método para atualizar nome na tela inicial do técnico ===
  atualizarNomeStart() {
    const span = document.getElementById('nomeTecnicoStart');
    if (span && this.usuario && this.usuario.nome) {
      span.textContent = this.usuario.nome;
    } else if (span) {
      span.textContent = 'Técnico';
    }
  }
  isAdmin(nivel) {
    if (!nivel) return false;
    const n = nivel.toString().toLowerCase().trim();
    return n === 'admin' || n === 'op' || n === 'adm' || n === 'administrador';
  }
  normalizarNivel(nivel) {
    if (!nivel) return 'TECNICO';
    return this.isAdmin(nivel) ? 'ADMIN' : 'TECNICO';
  }
  atualizarHeaderUsuario() {
    const header = document.getElementById('corporateHeader');
    if (header) header.style.display = 'flex';
    const nomeTecnico = document.getElementById('nomeTecnico');
    if (nomeTecnico) nomeTecnico.textContent = this.usuario.nome;
    const nivelSpan = document.getElementById('nivelUsuario');
    if (nivelSpan) {
      nivelSpan.textContent = this.normalizarNivel(this.usuario.nivel);
      nivelSpan.style.backgroundColor = this.isAdmin(this.usuario.nivel) ? '#dc3545' : '#007bff';
      nivelSpan.style.color = 'white';
      nivelSpan.style.padding = '4px 8px';
      nivelSpan.style.borderRadius = '4px';
      nivelSpan.style.fontSize = '0.75rem';
      nivelSpan.style.fontWeight = 'bold';
    }
  }
  // ==================== NOVO: Atualizar Dashboard com Hoje/Ontem ====================
  async atualizarDashboard() {
    const periodo = document.getElementById('periodoDashboard')?.value;
   
    if (periodo === 'hoje' || periodo === 'ontem') {
      const hoje = new Date();
      const dataFiltro = periodo === 'hoje' ? hoje : new Date(hoje - 86400000);
      const dataStr = dataFiltro.toISOString().split('T')[0];
     
      await this.carregarDashboard();
     
      const filtroData = document.getElementById('filtroData');
      if (filtroData) {
        filtroData.value = dataStr;
        this.aplicarFiltros();
      }
      return;
    }
   
    await this.carregarDashboard();
  }
  // ==================== DASHBOARD ====================
  async carregarDashboard() {
    if (!this.online) {
      this.mostrarToast('Sem conexão - Dashboard indisponível offline', 'warning');
      return;
    }
    this.mostrarLoading(true, 'Carregando estatísticas...');
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'getDashboard',
          periodo: parseInt(document.getElementById('periodoDashboard')?.value) || 30
        })
      });
     
      const data = await response.json();
      if (data.success) {
        this.dashboardData = data;
        this.renderizarDashboard(data);
        this.popularFiltroLocais(data);
        this.popularFiltroTipos(data);
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('[Dashboard] Erro:', error);
      this.mostrarToast('Erro ao carregar dashboard', 'error');
    } finally {
      this.mostrarLoading(false);
    }
  }
  renderizarDashboard(data) {
    const kpi = data.kpi || { total: 0, alertas: 0, vazamentos: 0, normal: 0 };
    this.atualizarElemento('kpiTotal', kpi.total);
    this.atualizarElemento('kpiAlertas', kpi.alertas);
    this.atualizarElemento('kpiVazamentos', kpi.vazamentos);
    this.atualizarElemento('kpiNormal', kpi.normal);
    if (data.graficos?.porLocal?.length > 0) {
      this.renderizarGraficoLocais(data.graficos.porLocal);
    }
   
    if (data.graficos?.porDia?.length > 0) {
      this.renderizarGraficoDias(data.graficos.porDia);
    }
    if (data.ultimas?.length > 0) {
      this.renderizarUltimasLeituras(data.ultimas);
    }
  }
  renderizarGraficoLocais(dados) {
    const canvas = document.getElementById('chartLocais');
    if (!canvas) return;
   
    canvas.style.maxHeight = '300px';
    canvas.height = 300;
   
    const ctx = canvas.getContext('2d');
    if (this.charts.locais) this.charts.locais.destroy();
   
    const labels = dados.map(d => d[0]);
    const values = dados.map(d => d[1]);
   
    this.charts.locais = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Consumo Total (m³)',
          data: values,
          backgroundColor: '#007bff',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.parsed.y.toFixed(2) + ' m³';
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return value.toFixed(1) + ' m³';
              }
            }
          },
          x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 } }
        }
      }
    });
  }
  renderizarGraficoDias(dados) {
    const canvas = document.getElementById('chartDias');
    if (!canvas) return;
   
    canvas.style.maxHeight = '250px';
    canvas.height = 250;
   
    const ctx = canvas.getContext('2d');
    if (this.charts.dias) this.charts.dias.destroy();
   
    const ultimosDados = dados.slice(-7);
    const labels = ultimosDados.map(d => {
      const date = new Date(d[0]);
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    });
    const values = ultimosDados.map(d => d[1]);
   
    this.charts.dias = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Leituras/Dia',
          data: values,
          borderColor: '#28a745',
          backgroundColor: 'rgba(40,167,69,0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }
  renderizarUltimasLeituras(leituras) {
    const tbody = document.getElementById('ultimasLeituras');
    if (!tbody) return;
   
    tbody.innerHTML = leituras.map(l => {
      const data = new Date(l.data);
      const dataStr = data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
      let statusClass = 'badge-normal';
      if (l.status === 'VAZAMENTO') statusClass = 'badge-danger';
      else if (l.status === 'ALERTA_VARIACAO') statusClass = 'badge-warning';
      else if (l.status === 'ANOMALIA_NEGATIVO') statusClass = 'badge-danger';
     
      const consumo = l.consumoDia || (l.leitura - (l.leituraAnterior || 0));
     
      return `<tr>
        <td>${dataStr}</td>
        <td>${l.local}</td>
        <td>${l.tecnico}</td>
        <td>${l.leitura} m³</td>
        <td><strong>${consumo.toFixed(2)} m³</strong></td>
        <td><span class="badge ${statusClass}">${l.status}</span></td>
        <td>${l.variacao > 0 ? '+' : ''}${l.variacao.toFixed(1)}%</td>
      </tr>`;
    }).join('');
  }
  popularFiltroLocais(data) {
    const select = document.getElementById('filtroLocal');
    if (!select || !data.graficos?.porLocal) return;
   
    const locais = data.graficos.porLocal.map(l => l[0]);
    select.innerHTML = '<option value="">Todos os locais</option>' +
      locais.map(l => `<option value="${l}">${l}</option>`).join('');
  }
  popularFiltroTipos(data) {
    const select = document.getElementById('filtroTipo');
    if (!select || !data.ultimas) return;
   
    const tipos = [...new Set(data.ultimas.map(l => l.tipo).filter(t => t))].sort();
    select.innerHTML = '<option value="">Todos os tipos</option>' +
      tipos.map(t => `<option value="${t}">${t}</option>`).join('');
  }
  aplicarFiltros() {
    if (!this.dashboardData) return;
   
    try {
      const filtroLocal = document.getElementById('filtroLocal')?.value || '';
      const filtroTipo = document.getElementById('filtroTipo')?.value || '';
      const filtroStatus = document.getElementById('filtroStatus')?.value || '';
      const filtroData = document.getElementById('filtroData')?.value || '';
     
      let filtradas = [...this.dashboardData.ultimas];
     
      if (filtroLocal) filtradas = filtradas.filter(l => l.local === filtroLocal);
      if (filtroTipo) filtradas = filtradas.filter(l => l.tipo === filtroTipo);
      if (filtroStatus) filtradas = filtradas.filter(l => l.status === filtroStatus);
      if (filtroData) {
        const dataFiltro = new Date(filtroData);
        filtradas = filtradas.filter(l => {
          const dataLeitura = new Date(l.data);
          return dataLeitura.toDateString() === dataFiltro.toDateString();
        });
      }
     
      this.renderizarUltimasLeituras(filtradas);
     
      const total = filtradas.length;
      const alertas = filtradas.filter(l => l.status !== 'NORMAL').length;
      this.atualizarElemento('kpiTotal', total);
      this.atualizarElemento('kpiAlertas', alertas);
    } catch (e) {
      console.error('[Filtros] Erro ao aplicar:', e);
    }
  }
  limparFiltros() {
    const filtroLocal = document.getElementById('filtroLocal');
    const filtroTipo = document.getElementById('filtroTipo');
    const filtroStatus = document.getElementById('filtroStatus');
    const filtroData = document.getElementById('filtroData');
   
    if (filtroLocal) filtroLocal.value = '';
    if (filtroTipo) filtroTipo.value = '';
    if (filtroStatus) filtroStatus.value = '';
    if (filtroData) filtroData.value = '';
   
    if (this.dashboardData) this.renderizarDashboard(this.dashboardData);
  }
  async carregarAnalise() {
    if (!this.online) {
      this.mostrarToast('Sem conexão - Análise indisponível offline', 'warning');
      return;
    }
    this.mostrarLoading(true, 'Gerando análise comparativa...');
   
    try {
      const [atual, anterior] = await Promise.all([
        fetch(CONFIG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'getDashboard', periodo: 30 })
        }).then(r => r.json()),
       
        fetch(CONFIG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'getDashboard', periodo: 60 })
        }).then(r => r.json())
      ]);
      if (atual.success && anterior.success) {
        this.renderizarAnalise(atual, anterior);
      }
    } catch (error) {
      console.error('[Análise] Erro:', error);
      this.mostrarToast('Erro ao carregar análise', 'error');
    } finally {
      this.mostrarLoading(false);
    }
  }
  renderizarAnalise(dadosAtual, dadosAnterior) {
    const consumoAtual = dadosAtual.ultimas.reduce((acc, l) => acc + (l.consumoDia || 0), 0);
    const consumoAnterior = dadosAnterior.ultimas
      .filter(l => {
        const data = new Date(l.data);
        const diasAtras = (new Date() - data) / (1000 * 60 * 60 * 24);
        return diasAtras > 30 && diasAtras <= 60;
      })
      .reduce((acc, l) => acc + (l.consumoDia || 0), 0);
   
    const variacaoConsumo = consumoAnterior > 0 ? ((consumoAtual - consumoAnterior) / consumoAnterior) * 100 : 0;
    const eficienciaAtual = dadosAtual.kpi.total > 0 ?
      ((dadosAtual.kpi.total - dadosAtual.kpi.alertas) / dadosAtual.kpi.total) * 100 : 100;
    const locaisVariacao = {};
    dadosAtual.ultimas.forEach(l => {
      if (!locaisVariacao[l.local]) {
        locaisVariacao[l.local] = { total: 0, count: 0, alertas: 0 };
      }
      locaisVariacao[l.local].total += Math.abs(l.variacao || 0);
      locaisVariacao[l.local].count++;
      if (l.status !== 'NORMAL') locaisVariacao[l.local].alertas++;
    });
   
    const topVariacoes = Object.entries(locaisVariacao)
      .map(([local, dados]) => ({
        local,
        mediaVariacao: dados.total / dados.count,
        alertas: dados.alertas
      }))
      .sort((a, b) => b.mediaVariacao - a.mediaVariacao)
      .slice(0, 5);
    const container = document.getElementById('analiseContainer');
    if (container) {
      container.innerHTML = `
        <div class="analise-grid">
          <div class="analise-card ${variacaoConsumo > 20 ? 'alerta' : 'normal'}">
            <h4>Comparativo de Consumo</h4>
            <div class="analise-valor">${variacaoConsumo > 0 ? '+' : ''}${variacaoConsumo.toFixed(1)}%</div>
            <p>vs período anterior (30 dias)</p>
            <small>Atual: ${consumoAtual.toFixed(2)} m³ | Anterior: ${consumoAnterior.toFixed(2)} m³</small>
          </div>
         
          <div class="analise-card">
            <h4>Eficiência das Leituras</h4>
            <div class="analise-valor">${eficienciaAtual.toFixed(1)}%</div>
            <p>Leituras normais sem alerta</p>
            <small>${dadosAtual.kpi.alertas} alertas em ${dadosAtual.kpi.total} leituras</small>
          </div>
         
          <div class="analise-card">
            <h4>Média de Consumo por Leitura</h4>
            <div class="analise-valor">${(consumoAtual / (dadosAtual.kpi.total || 1)).toFixed(2)} m³</div>
            <p>Consumo médio diário</p>
          </div>
        </div>
       
        <div class="analise-section" style="background:white;padding:20px;border-radius:12px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <h3>Locais com Maior Instabilidade</h3>
          <table class="data-table" style="width:100%;border-collapse:collapse;margin-top:15px;">
            <thead>
              <tr style="background:#f8f9fa;">
                <th style="padding:12px;text-align:left;">Local</th>
                <th style="padding:12px;text-align:left;">Variação Média</th>
                <th style="padding:12px;text-align:left;">Alertas</th>
                <th style="padding:12px;text-align:left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${topVariacoes.map(item => `
                <tr>
                  <td style="padding:12px;border-bottom:1px solid #dee2e6;">${item.local}</td>
                  <td style="padding:12px;border-bottom:1px solid #dee2e6;">${item.mediaVariacao.toFixed(1)}%</td>
                  <td style="padding:12px;border-bottom:1px solid #dee2e6;">${item.alertas}</td>
                  <td style="padding:12px;border-bottom:1px solid #dee2e6;"><span class="badge ${item.alertas > 2 ? 'badge-danger' : item.alertas > 0 ? 'badge-warning' : 'badge-normal'}">
                    ${item.alertas > 2 ? 'Crítico' : item.alertas > 0 ? 'Atenção' : 'Estável'}
                  </span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
       
        <div class="analise-section" style="background:white;padding:20px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <h3>Tendência por Tipo de Hidrômetro</h3>
          <div style="height: 300px; position: relative;">
            <canvas id="chartAnaliseTipo"></canvas>
          </div>
        </div>
      `;
     
      this.renderizarGraficoAnaliseTipo(dadosAtual.ultimas);
    }
  }
  renderizarGraficoAnaliseTipo(leituras) {
    const canvas = document.getElementById('chartAnaliseTipo');
    if (!canvas) return;
   
    canvas.style.maxHeight = '300px';
    canvas.height = 300;
   
    const ctx = canvas.getContext('2d');
    if (this.charts.analiseTipo) this.charts.analiseTipo.destroy();
   
    const porTipo = {};
    leituras.forEach(l => {
      const tipo = l.tipo || 'Desconhecido';
      if (!porTipo[tipo]) porTipo[tipo] = { consumo: 0, count: 0 };
      porTipo[tipo].consumo += (l.consumoDia || 0);
      porTipo[tipo].count++;
    });
   
    const labels = Object.keys(porTipo);
    const consumos = labels.map(t => porTipo[t].consumo);
    const medias = labels.map(t => porTipo[t].consumo / porTipo[t].count);
   
    this.charts.analiseTipo = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Consumo Total (m³)',
            data: consumos,
            backgroundColor: '#007bff',
            yAxisID: 'y'
          },
          {
            label: 'Média por Leitura (m³)',
            data: medias,
            backgroundColor: '#28a745',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: { display: true, text: 'Consumo Total (m³)' }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Média (m³)' }
          }
        }
      }
    });
  }
  async carregarLeituras() {
    if (!this.online) {
      this.mostrarToast('Modo offline - Histórico indisponível', 'warning');
      return;
    }
    this.mostrarLoading(true, 'Carregando histórico...');
   
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'getLeituras' })
      });
     
      const data = await response.json();
      if (data.success && data.leituras) {
        this.leiturasCache = data.leituras;
        this.renderizarTabelaLeituras(data.leituras.slice(-50));
        this.popularFiltrosLeituras(data.leituras);
      }
    } catch (error) {
      this.mostrarToast('Erro ao carregar histórico', 'error');
    } finally {
      this.mostrarLoading(false);
    }
  }
  renderizarTabelaLeituras(leituras) {
    const tbody = document.getElementById('tabelaLeituras');
    if (!tbody) return;
   
    if (leituras.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Nenhuma leitura encontrada</td></tr>';
      return;
    }
   
    const recentes = leituras.slice().reverse();
   
    tbody.innerHTML = recentes.map(l => {
      const data = new Date(l.data);
      const dataStr = data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
     
      let statusClass = 'badge-normal';
      if (l.status === 'VAZAMENTO') statusClass = 'badge-danger';
      else if (l.status === 'ALERTA_VARIACAO') statusClass = 'badge-warning';
      else if (l.status === 'ANOMALIA_NEGATIVO') statusClass = 'badge-danger';
     
      return `<tr>
        <td style="padding:12px;border-bottom:1px solid #dee2e6;">${l.rondaId?.substring(0, 20) || '--'}...</td>
        <td style="padding:12px;border-bottom:1px solid #dee2e6;">${dataStr}</td>
        <td style="padding:12px;border-bottom:1px solid #dee2e6;">${l.tecnico}</td>
        <td style="padding:12px;border-bottom:1px solid #dee2e6;">${l.local}</td>
        <td style="padding:12px;border-bottom:1px solid #dee2e6;"><span class="badge ${statusClass}">${l.status}</span></td>
        <td style="padding:12px;border-bottom:1px solid #dee2e6;text-align:center;">
          <button onclick="app.verDetalhesLeitura('${l.id}')" style="padding:4px 8px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.85rem;">
            Ver
          </button>
        </td>
      </tr>`;
    }).join('');
  }
  popularFiltrosLeituras(leituras) {
    const locais = [...new Set(leituras.map(l => l.local))].filter(l => l).sort();
    const selectLocal = document.getElementById('filtroLocalLeituras');
    if (selectLocal) {
      selectLocal.innerHTML = '<option value="">Todos</option>' +
        locais.map(l => `<option value="${l}">${l}</option>`).join('');
    }
  }
  aplicarFiltrosLeituras() {
    if (!this.leiturasCache.length) return;
   
    const filtroLocal = document.getElementById('filtroLocalLeituras')?.value || '';
    const filtroStatus = document.getElementById('filtroStatusLeituras')?.value || '';
    const dataInicio = document.getElementById('filtroDataInicio')?.value || '';
    const dataFim = document.getElementById('filtroDataFim')?.value || '';
   
    let filtradas = [...this.leiturasCache];
   
    if (filtroLocal) filtradas = filtradas.filter(l => l.local === filtroLocal);
    if (filtroStatus) filtradas = filtradas.filter(l => l.status?.toLowerCase() === filtroStatus.toLowerCase());
   
    if (dataInicio) {
      const inicio = new Date(dataInicio);
      filtradas = filtradas.filter(l => new Date(l.data) >= inicio);
    }
   
    if (dataFim) {
      const fim = new Date(dataFim);
      filtradas = filtradas.filter(l => new Date(l.data) <= fim);
    }
   
    this.renderizarTabelaLeituras(filtradas);
    this.mostrarToast(`${filtradas.length} leituras encontradas`, 'success');
  }
  limparFiltrosLeituras() {
    document.getElementById('filtroLocalLeituras').value = '';
    document.getElementById('filtroStatusLeituras').value = '';
    document.getElementById('filtroDataInicio').value = '';
    document.getElementById('filtroDataFim').value = '';
    if (this.leiturasCache.length) this.renderizarTabelaLeituras(this.leiturasCache);
  }
  verDetalhesLeitura(id) {
    const leitura = this.leiturasCache.find(l => l.id === id);
    if (!leitura) return;
   
    const consumo = leitura.consumoDia || (leitura.leituraAtual - leitura.leituraAnterior);
   
    alert(`Detalhes da Leitura:
   
📍 Local: ${leitura.local}
🔧 Hidrômetro: ${leitura.hidrometroId} (${leitura.tipo})
📊 Leitura Atual: ${leitura.leituraAtual} m³
📊 Leitura Anterior: ${leitura.leituraAnterior} m³
💧 Consumo: ${consumo.toFixed(2)} m³
📈 Variação: ${leitura.variacao?.toFixed(2)}%
⚠️ Status: ${leitura.status}
👤 Técnico: ${leitura.tecnico}
📝 Justificativa: ${leitura.justificativa || 'Nenhuma'}
📅 Data: ${new Date(leitura.data).toLocaleString('pt-BR')}`);
  }
  exportarDados() {
    const telaAtiva = document.querySelector('.screen.active')?.id;
   
    let dados = [];
    let nomeArquivo = '';
   
    if (telaAtiva === 'leiturasAdminScreen' && this.leiturasCache.length > 0) {
      dados = this.leiturasCache;
      nomeArquivo = `Historico_Leituras_${new Date().toISOString().slice(0,10)}`;
     
      const csv = this.converterParaCSV(dados, [
        { key: 'data', label: 'Data/Hora', format: (v) => new Date(v).toLocaleString('pt-BR') },
        { key: 'rondaId', label: 'Ronda' },
        { key: 'tecnico', label: 'Técnico' },
        { key: 'local', label: 'Local' },
        { key: 'hidrometroId', label: 'Hidrômetro' },
        { key: 'leituraAnterior', label: 'Leitura Anterior (m³)' },
        { key: 'leituraAtual', label: 'Leitura Atual (m³)' },
        { key: 'consumoDia', label: 'Consumo (m³)', format: (v) => v?.toFixed(2) || '0.00' },
        { key: 'variacao', label: 'Variação (%)', format: (v) => v?.toFixed(2) || '0.00' },
        { key: 'status', label: 'Status' },
        { key: 'justificativa', label: 'Justificativa' }
      ]);
     
      this.baixarCSV(csv, nomeArquivo);
     
    } else if (telaAtiva === 'dashboardScreen' && this.dashboardData) {
      dados = this.dashboardData.ultimas;
      nomeArquivo = `Dashboard_${new Date().toISOString().slice(0,10)}`;
     
      const csv = this.converterParaCSV(dados, [
        { key: 'data', label: 'Data/Hora', format: (v) => new Date(v).toLocaleString('pt-BR') },
        { key: 'local', label: 'Local' },
        { key: 'tecnico', label: 'Técnico' },
        { key: 'leitura', label: 'Leitura (m³)' },
        { key: 'status', label: 'Status' },
        { key: 'variacao', label: 'Variação (%)', format: (v) => v?.toFixed(2) || '0.00' }
      ]);
     
      this.baixarCSV(csv, nomeArquivo);
     
    } else if (this.ronda.hidrometros.length > 0) {
      dados = this.ronda.hidrometros;
      nomeArquivo = `Ronda_${this.ronda.id || 'Atual'}_${new Date().toISOString().slice(0,10)}`;
     
      const csv = this.converterParaCSV(dados, [
        { key: 'id', label: 'ID' },
        { key: 'local', label: 'Local' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'leituraAnterior', label: 'Leitura Anterior (m³)' },
        { key: 'leituraAtual', label: 'Leitura Atual (m³)' },
        { key: 'consumoDia', label: 'Consumo (m³)', format: (v) => v?.toFixed(2) || '' },
        { key: 'variacao', label: 'Variação (%)', format: (v) => v?.toFixed(2) || '' },
        { key: 'status', label: 'Status' },
        { key: 'justificativa', label: 'Justificativa' }
      ]);
     
      this.baixarCSV(csv, nomeArquivo);
     
    } else {
      this.mostrarToast('Nenhum dado disponível para exportar', 'error');
    }
  }
  converterParaCSV(dados, colunas) {
    let csv = colunas.map(c => `"${c.label}"`).join(';') + '\n';
   
    dados.forEach(row => {
      const linha = colunas.map(col => {
        let valor = row[col.key];
        if (col.format && valor !== undefined) {
          valor = col.format(valor);
        }
        if (valor === null || valor === undefined) valor = '';
        valor = String(valor).replace(/"/g, '""');
        return `"${valor}"`;
      }).join(';');
      csv += linha + '\n';
    });
   
    return '\ufeff' + csv;
  }
  baixarCSV(conteudo, nomeArquivo) {
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${nomeArquivo}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
   
    this.mostrarToast('✅ Arquivo CSV baixado com sucesso!', 'success');
  }
  mostrarGestao() {
    this.mostrarTela('gestaoScreen');
    this.carregarUsuariosDoServidor();
  }
  async carregarUsuariosDoServidor() {
    const div = document.getElementById('listaUsuarios');
    if (!div) return;
   
    div.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">Carregando...</p>';
   
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'listarUsuarios' })
      });
     
      const data = await response.json();
      if (data.success && data.usuarios) {
        this.usuariosCadastrados = data.usuarios;
        this.salvarStorage(CONFIG.STORAGE_KEYS.USUARIOS, data.usuarios);
        this.atualizarListaUsuarios();
      } else {
        throw new Error(data.message || 'Erro ao carregar');
      }
    } catch (error) {
      console.error('[Gestão] Erro:', error);
      const salvos = this.lerStorage(CONFIG.STORAGE_KEYS.USUARIOS) || [];
      this.usuariosCadastrados = salvos;
      this.atualizarListaUsuarios();
      this.mostrarToast('Erro ao carregar usuários', 'error');
    }
  }
  atualizarListaUsuarios() {
    const div = document.getElementById('listaUsuarios');
    if (!div) return;
   
    if (this.usuariosCadastrados.length === 0) {
      div.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">Nenhum usuário cadastrado</p>';
      return;
    }
   
    let html = '<table class="users-table"><thead><tr>';
    html += '<th>Nome</th><th>Login</th><th>Nível</th><th>Ações</th></tr></thead><tbody>';
   
    this.usuariosCadastrados.forEach(u => {
      const isAdmin = this.isAdmin(u.nivel);
      const nivelClass = isAdmin ? 'level-admin' : 'level-tecnico';
      const nivelText = this.normalizarNivel(u.nivel);
     
      const proximoNivel = isAdmin ? 'tecnico' : 'admin';
      const textoBotaoNivel = isAdmin ? '↓ Tornar Técnico' : '↑ Tornar Admin';
      const corBotaoNivel = isAdmin ? '#6c757d' : '#dc3545';
     
      html += `<tr>
        <td>${u.nome}</td>
        <td>${u.usuario}</td>
        <td><span class="level-badge ${nivelClass}">${nivelText}</span></td>
        <td style="display:flex;gap:8px;">
          <button onclick="app.trocarSenha('${u.usuario}')" class="btn-sm btn-secondary-sm">🔑 Trocar Senha</button>
          <button onclick="app.alternarNivel('${u.usuario}', '${proximoNivel}')" class="btn-sm" style="background:${corBotaoNivel};color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">
            ${textoBotaoNivel}
          </button>
        </td>
      </tr>`;
    });
   
    html += '</tbody></table>';
    div.innerHTML = html;
  }
  async alternarNivel(usuario, novoNivel) {
    const nivelTexto = novoNivel === 'admin' ? 'ADMINISTRADOR' : 'TÉCNICO';
    if (!confirm(`Deseja realmente alterar ${usuario} para ${nivelTexto}?`)) return;
   
    this.mostrarLoading(true, 'Atualizando nível...');
   
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'alterarNivel', usuario, novoNivel })
      });
     
      const data = await response.json();
      this.mostrarLoading(false);
     
      if (data.success) {
        this.mostrarToast(`Nível de ${usuario} alterado para ${nivelTexto}!`, 'success');
        await this.carregarUsuariosDoServidor();
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      this.mostrarLoading(false);
      this.mostrarToast('Erro: ' + error.message, 'error');
    }
  }
  async criarUsuario() {
    const nome = document.getElementById('novoNome')?.value.trim();
    const usuario = document.getElementById('novoUsuario')?.value.trim();
    const senha = document.getElementById('novoSenha')?.value.trim();
    const nivel = document.getElementById('novoNivel')?.value;
   
    if (!nome || !usuario || !senha) {
      this.mostrarToast('Preencha todos os campos', 'error');
      return;
    }
   
    this.mostrarLoading(true, 'Criando usuário...');
   
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'criarUsuario', nome, usuario, senha, nivel })
      });
     
      const data = await response.json();
      this.mostrarLoading(false);
     
      if (data.success) {
        this.mostrarToast('Usuário criado com sucesso!', 'success');
        document.getElementById('novoNome').value = '';
        document.getElementById('novoUsuario').value = '';
        document.getElementById('novoSenha').value = '';
        await this.carregarUsuariosDoServidor();
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      this.mostrarLoading(false);
      this.mostrarToast('Erro: ' + error.message, 'error');
    }
  }
  async trocarSenha(usuario) {
    const novaSenha = prompt(`Nova senha para ${usuario}:`);
    if (!novaSenha?.trim()) return;
   
    this.mostrarLoading(true, 'Atualizando senha...');
   
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'trocarSenha', usuario, novaSenha: novaSenha.trim() })
      });
     
      const data = await response.json();
      this.mostrarLoading(false);
     
      if (data.success) {
        this.mostrarToast('Senha alterada!', 'success');
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      this.mostrarLoading(false);
      this.mostrarToast('Erro: ' + error.message, 'error');
    }
  }
  async login(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
   
    if (!username || !password) {
      this.mostrarErro('Preencha usuário e senha');
      return;
    }
   
    this.mostrarLoading(true, 'Autenticando...');
   
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'login', usuario: username, senha: password })
      });
     
      const data = await response.json();
     
      if (!data.success) throw new Error(data.message);
     
      data.nivel = (data.nivel || 'tecnico').toString().toLowerCase().trim();
      this.usuario = data;
      this.salvarStorage(CONFIG.STORAGE_KEYS.USUARIO, data);
      this.atualizarHeaderUsuario();
      this.atualizarNomeStart(); // === CORREÇÃO v2.9.8.6: nome na startScreen após login ===
     
      this.mostrarLoading(false);
     
      if (this.isAdmin(data.nivel)) {
        this.mostrarTela('dashboardScreen');
        this.carregarDashboard();
        document.getElementById('adminNav').style.display = 'flex';
      } else {
        this.mostrarTela('startScreen');
        this.verificarRondaPendente();
      }
     
    } catch (error) {
      this.mostrarLoading(false);
      this.mostrarErro(error.message);
    }
  }
  navigate(page) {
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
   
    if (page === 'dashboard') {
      this.mostrarTela('dashboardScreen');
      this.carregarDashboard();
    } else if (page === 'leituras') {
      this.mostrarTela('leiturasAdminScreen');
      this.carregarLeituras();
    } else if (page === 'analise') {
      this.mostrarTela('analiseScreen');
      this.carregarAnalise();
    } else if (page === 'gestao') {
      this.mostrarGestao();
    }
  }
  iniciarLeitura() {
    return this.iniciarRonda();
  }
  async iniciarRonda() {
    if (!this.usuario) return;
    this.mostrarLoading(true, 'Carregando...');
   
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'iniciar', usuario: this.usuario.usuario })
      });
     
      const data = await response.json();
      if (!data.success) throw new Error(data.message);
     
      this.ronda = {
        id: data.rondaId,
        hidrometros: data.hidrometros.map(h => ({
          ...h,
          leituraAtual: null,
          consumoDia: null,
          variacao: null,
          justificativa: '',
          foto: null,
          status: 'PENDENTE'
        })),
        locais: [...new Set(data.hidrometros.map(h => h.local))],
        inicio: new Date().toISOString()
      };
     
      this.salvarRonda();
      this.mostrarLoading(false);
      this.entrarModoLeitura();
     
    } catch (error) {
      this.mostrarLoading(false);
      this.mostrarToast('Erro: ' + error.message, 'error');
    }
  }
  entrarModoLeitura() {
    this.mostrarTela('leituraScreen');
    this.limparElementosFantasmas();
    document.getElementById('bottomBar').style.display = 'flex';
    this.popularSelectLocais();
    if (this.ronda.locais.length > 0) {
      document.getElementById('localSelect').value = this.ronda.locais[0];
      this.carregarHidrometros(this.ronda.locais[0]);
    }
    this.atualizarProgresso();
  }
  popularSelectLocais() {
    const select = document.getElementById('localSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione o local...</option>';
    this.ronda.locais.forEach(local => {
      const hidros = this.ronda.hidrometros.filter(h => h.local === local);
      const lidos = hidros.filter(h => h.leituraAtual > 0).length;
      const option = document.createElement('option');
      option.value = local;
      option.textContent = `${local} (${lidos}/${hidros.length})`;
      select.appendChild(option);
    });
  }
  carregarHidrometros(local) {
    if (!local) return;
    this.localAtual = local;
    this.limparElementosFantasmas();
    const container = document.getElementById('hidrometrosContainer');
    if (!container) return;
    container.innerHTML = '';
   
    const hidros = this.ronda.hidrometros.filter(h => h.local === local);
    hidros.forEach(h => {
      const card = this.criarCardHidrometro(h);
      container.appendChild(card);
      if (h.leituraAtual) this.atualizarUI(h.id);
      if (h.foto) this.restaurarFoto(h.id);
      if (h.justificativa) this.restaurarJustificativa(h.id);
    });
   
    this.atualizarProgresso();
    this.popularSelectLocais();
  }
  criarCardHidrometro(h) {
    const div = document.createElement('div');
    div.className = 'hidrometro-card';
    div.id = `card-${h.id}`;
    div.innerHTML = `
      <div class="card-header">
        <div class="info-principal">
          <span class="tipo">🔧 ${h.tipo || 'Hidrômetro'}</span>
          <span class="id">#${h.id}</span>
        </div>
        <span class="status-badge pendente" id="badge-${h.id}">PENDENTE</span>
      </div>
      <div class="leitura-anterior">
        <span>Leitura anterior</span>
        <strong>${parseFloat(h.leituraAnterior || 0).toFixed(2)} m³</strong>
      </div>
      <div class="campo-leitura">
        <input type="number" step="0.01" class="input-leitura" id="input-${h.id}" placeholder="Digite a leitura atual" oninput="app.calcularPreview('${h.id}')" onblur="app.salvarLeitura('${h.id}')">
        <span class="unidade">m³</span>
      </div>
      <div class="info-consumo" id="info-${h.id}">
        <span class="placeholder">Aguardando leitura...</span>
      </div>
      <div class="alertas" id="alertas-${h.id}"></div>
      <div class="justificativa-container" id="just-container-${h.id}" style="display:none;">
        <textarea class="input-justificativa" id="just-${h.id}" placeholder="Descreva o motivo da divergência..." onblur="app.salvarJustificativa('${h.id}')"></textarea>
      </div>
      <div class="foto-container">
        <label class="btn-foto" id="btn-foto-${h.id}">
          <input type="file" accept="image/*" capture="environment" onchange="app.processarFoto('${h.id}', this.files[0])" style="display:none">
          <span>📷 Adicionar foto</span>
        </label>
        <img id="preview-${h.id}" class="preview-foto" style="display:none;max-width:100%;margin-top:10px;border-radius:8px;">
      </div>
    `;
    return div;
  }
  calcularPreview(id) {
    const input = document.getElementById(`input-${id}`);
    if (!input) return;
    const valor = parseFloat(input.value);
    if (isNaN(valor) || valor <= 0) return;
   
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (!h) return;
   
    const leituraAnterior = parseFloat(h.leituraAnterior) || 0;
    const consumoDia = valor - leituraAnterior;
    const consumoAnterior = parseFloat(h.consumoAnterior) || 0;
    let variacao = consumoAnterior > 0 ? ((consumoDia - consumoAnterior) / consumoAnterior) * 100 : (consumoDia > 0 ? 100 : 0);
   
    const info = document.getElementById(`info-${id}`);
    if (info) {
      info.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>Consumo:</span><strong>${consumoDia.toFixed(2)} m³/dia</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:0.9rem;">
          <span>Variação:</span><span>${variacao >= 0 ? '+' : ''}${Math.abs(variacao).toFixed(1)}%</span>
        </div>
      `;
    }
  }
  salvarLeitura(id) {
    const input = document.getElementById(`input-${id}`);
    if (!input) return;
    const valor = parseFloat(input.value);
    if (isNaN(valor) || valor <= 0) return;
   
    const h = this.ronda.hidrometros.find(h => h.id === id);
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
   
    h.leituraAtual = valor;
    h.consumoDia = consumoDia;
    h.variacao = variacao;
    h.status = status;
   
    this.salvamentoPendente = true;
    this.atualizarUI(id);
    this.atualizarProgresso();
    this.popularSelectLocais();
    this.salvarRonda();
  }
  atualizarUI(id) {
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (!h || !h.leituraAtual) return;
   
    const badge = document.getElementById(`badge-${id}`);
    const card = document.getElementById(`card-${id}`);
    const info = document.getElementById(`info-${id}`);
    const alertas = document.getElementById(`alertas-${id}`);
    const justContainer = document.getElementById(`just-container-${id}`);
   
    if (badge) {
      const statusText = { 'NORMAL': '✓ OK', 'ALERTA_VARIACAO': '⚠️ ALERTA', 'VAZAMENTO': '🚨 VAZAMENTO', 'ANOMALIA_NEGATIVO': '❌ ERRO', 'CONSUMO_BAIXO': 'ℹ️ BAIXO', 'PENDENTE': '⏳ PENDENTE' };
      badge.textContent = statusText[h.status] || h.status;
      badge.className = 'status-badge ' + (h.status === 'NORMAL' ? 'completo' : 'pendente');
    }
   
    if (card) card.className = (h.status === 'NORMAL' || h.status === 'CONSUMO_BAIXO') ? 'hidrometro-card completo' : 'hidrometro-card anomalia';
   
    if (info) {
      const varClass = Math.abs(h.variacao) > 20 ? 'alta' : 'normal';
      info.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>Consumo:</span><strong>${h.consumoDia.toFixed(2)} m³/dia</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:0.9rem;">
          <span>Variação:</span><span class="variacao ${varClass}">${h.variacao >= 0 ? '+' : ''}${Math.abs(h.variacao).toFixed(1)}%</span>
        </div>
      `;
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
  salvarJustificativa(id) {
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (h) {
      h.justificativa = document.getElementById(`just-${id}`)?.value?.trim() || '';
      this.salvamentoPendente = true;
      this.salvarRonda();
    }
  }
  async processarFoto(id, arquivo) {
    if (!arquivo) return;
    this.mostrarLoading(true, 'Processando foto...');
   
    try {
      const comprimida = await this.comprimirImagem(arquivo);
      const h = this.ronda.hidrometros.find(h => h.id === id);
      if (h) {
        h.foto = comprimida;
        this.salvamentoPendente = true;
        const preview = document.getElementById(`preview-${id}`);
        if (preview) { preview.src = comprimida; preview.style.display = 'block'; }
        const btn = document.getElementById(`btn-foto-${id}`);
        if (btn) { btn.innerHTML = '<span>✓ Foto adicionada</span>'; btn.classList.add('tem-foto'); }
        this.salvarRonda();
      }
      this.mostrarLoading(false);
    } catch (error) {
      this.mostrarLoading(false);
      this.mostrarToast('Erro ao processar foto', 'error');
    }
  }
  comprimirImagem(arquivo, maxWidth = 1280, qualidade = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width, height = img.height;
          if (width > maxWidth) { height = (maxWidth / width) * height; width = maxWidth; }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', qualidade));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(arquivo);
    });
  }
  restaurarFoto(id) {
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (!h?.foto) return;
    const preview = document.getElementById(`preview-${id}`);
    const btn = document.getElementById(`btn-foto-${id}`);
    if (preview) { preview.src = h.foto; preview.style.display = 'block'; }
    if (btn) { btn.innerHTML = '<span>✓ Foto adicionada</span>'; btn.classList.add('tem-foto'); }
  }
  restaurarJustificativa(id) {
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (!h?.justificativa) return;
    const textarea = document.getElementById(`just-${id}`);
    const container = document.getElementById(`just-container-${id}`);
    if (textarea) textarea.value = h.justificativa;
    if (container) container.style.display = 'block';
  }
  atualizarProgresso() {
    const total = this.ronda.hidrometros.length;
    const lidos = this.ronda.hidrometros.filter(h => h.leituraAtual > 0).length;
    const percentual = total > 0 ? Math.round((lidos / total) * 100) : 0;
   
    const progressText = document.getElementById('progressText');
    if (progressText) progressText.textContent = `${lidos}/${total} (${percentual}%)`;
   
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.querySelector('.barra-preenchida').style.width = `${percentual}%`;
   
    const btnFinalizar = document.getElementById('btnFinalizar');
    if (btnFinalizar) {
      btnFinalizar.disabled = percentual < 100;
      btnFinalizar.textContent = percentual === 100 ? '✓ Finalizar Ronda' : `Finalizar (${percentual}%)`;
    }
  }
  async finalizarRonda() {
    const semLeitura = this.ronda.hidrometros.filter(h => !h.leituraAtual);
    if (semLeitura.length > 0 && !confirm(`${semLeitura.length} hidrômetro(s) sem leitura. Finalizar mesmo assim?`)) return;
   
    const anomaliasSemJust = this.ronda.hidrometros.filter(h => h.status !== 'NORMAL' && h.status !== 'CONSUMO_BAIXO' && (!h.justificativa || h.justificativa.length < 10));
    if (anomaliasSemJust.length > 0) {
      this.mostrarToast('Preencha justificativa para divergências', 'error');
      return;
    }
   
    this.mostrarLoading(true, 'Enviando dados...');
   
    const leituras = this.ronda.hidrometros.filter(h => h.leituraAtual > 0).map(h => ({
      id: h.id, local: h.local, tipo: h.tipo,
      leituraAnterior: h.leituraAnterior, leituraAtual: h.leituraAtual,
      consumoAnterior: h.consumoAnterior, justificativa: h.justificativa, foto: h.foto
    }));
   
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'salvarLeituras', leituras, usuario: this.usuario.usuario, rondaId: this.ronda.id })
      });
     
      const data = await response.json();
      if (data.success) {
        this.ronda = { id: null, hidrometros: [], locais: [], inicio: null };
        localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
        this.mostrarLoading(false);
        this.mostrarToast('Ronda finalizada!', 'success');
        this.mostrarTela('startScreen');
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      this.mostrarLoading(false);
      this.mostrarToast('Erro: ' + error.message, 'error');
    }
  }
  pausarRonda() {
    this.salvarRonda();
    this.mostrarToast('Ronda pausada', 'info');
    this.mostrarTela('startScreen');
    document.getElementById('bottomBar').style.display = 'none';
    this.verificarRondaPendente();
  }
  continuarRonda() {
    this.entrarModoLeitura();
  }
  verificarRondaPendente() {
    const ronda = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
    if (ronda?.id && ronda.hidrometros.length > 0) {
      const btn = document.getElementById('btnContinuarRonda');
      if (btn) {
        btn.style.display = 'flex';
        const lidos = ronda.hidrometros.filter(h => h.leituraAtual > 0).length;
        btn.querySelector('span:last-child').textContent = `Continuar Ronda (${lidos}/${ronda.hidrometros.length})`;
      }
    }
  }
  mostrarTela(telaId) {
    this.limparElementosFantasmas();
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
    });
    const tela = document.getElementById(telaId);
    if (tela) {
      tela.style.display = 'block';
      requestAnimationFrame(() => tela.classList.add('active'));
    }
  }
  atualizarElemento(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  }
  salvarRonda() {
    if (!this.ronda.id) return;
    localStorage.setItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA, JSON.stringify(this.ronda));
    this.salvamentoPendente = false;
  }
  lerStorage(chave) {
    try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; }
  }
  salvarStorage(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {}
  }
  logout() {
    this.encerrarSessao();
  }
  encerrarSessao() {
    if (confirm('Deseja realmente sair?')) {
      this.salvarRonda();
      localStorage.removeItem(CONFIG.STORAGE_KEYS.USUARIO);
      location.reload();
    }
  }
  mostrarLoading(mostrar, texto = 'Carregando...') {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `<div class="spinner"></div><div class="loading-text">${texto}</div>`;
      document.body.appendChild(overlay);
    }
    overlay.style.display = mostrar ? 'flex' : 'none';
    if (mostrar) overlay.querySelector('.loading-text').textContent = texto;
  }
  mostrarToast(mensagem, tipo = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;';
      document.body.appendChild(container);
    }
   
    const toast = document.createElement('div');
    toast.style.cssText = `background:${tipo === 'success' ? '#28a745' : tipo === 'error' ? '#dc3545' : tipo === 'warning' ? '#ffc107' : '#17a2b8'};color:${tipo === 'warning' ? '#000' : '#fff'};padding:12px 20px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);display:flex;align-items:center;gap:10px;min-width:250px;animation:slideIn 0.3s ease;`;
    toast.innerHTML = `<span>${tipo === 'success' ? '✓' : tipo === 'error' ? '✗' : tipo === 'warning' ? '⚠' : 'ℹ'}</span><span>${mensagem}</span>`;
   
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
  mostrarErro(mensagem) {
    const erroDiv = document.getElementById('loginError');
    if (erroDiv) {
      erroDiv.textContent = mensagem;
      erroDiv.style.display = 'block';
      setTimeout(() => erroDiv.style.display = 'none', 5000);
    } else {
      this.mostrarToast(mensagem, 'error');
    }
  }
  limparElementosFantasmas() {
    document.querySelectorAll('#modalFotoAmpliada, .modal-overlay:not(.permantente), .detalhes-leitura, img.preview-foto:not([id])').forEach(el => el.remove());
  }
  configurarEventos() {
    document.getElementById('loginForm')?.addEventListener('submit', (e) => this.login(e));
  }
  // === CORREÇÃO v2.9.8.6: método togglePassword adicionado (era chamado no HTML) ===
  togglePassword() {
    const input = document.getElementById('password');
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  }
}
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new SistemaHidrometros();
});
