/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.9.9.3 (HOTFIX DASHBOARD - DADOS COMPLETOS)
 * DATA: 25/03/2026
 * 
 * LOG DE ATUALIZAÇÃO v2.9.9.3:
 * 1. CORREÇÃO CRÍTICA: Adicionado parâmetro 'limite' na API para buscar todas as leituras (não apenas 10)
 * 2. CORREÇÃO: Fallback para buscar dados completos se 'ultimas' vier limitado
 * 3. CORREÇÃO: Processamento correto do total real de leituras para os cards
 * 4. MELHORIA: Logs de debug para verificar quantidade de dados recebidos da API
 */

const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzmn7102Jh_VzO8A8TDitjwqDlSk_zAWkfnzd7MbncJjQiQ8fA1j1Olktv8TBLGSZed/exec',
  VERSAO: '2.9.9.3',
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
    this.filtrosAtuais = { local: '', tipo: '', status: '', data: '' };
   
    console.log(`[v${CONFIG.VERSAO}] Inicializando...`);
    this.criarStatusRede();
    this.limparElementosFantasmas();
    this.inicializar();
    this.injectSafetyStyles();
  }

  injectSafetyStyles() {
    if (document.getElementById('safety-styles')) return;
    const style = document.createElement('style');
    style.id = 'safety-styles';
    style.textContent = `
      .hidrometro-card { position: relative !important; overflow: visible !important; contain: layout style paint !important; }
      .status-badge { display: inline-flex !important; position: relative !important; z-index: 10 !important; }
      #corporateHeader .status-badge, header .status-badge, .user-info .status-badge { display: none !important; }
      #localSelect { font-weight: 600 !important; color: #0056b3 !important; }
      #localSelect option:checked { font-weight: bold !important; background-color: #e3f2fd !important; }
      
      .header-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        margin-right: 8px;
        transition: all 0.3s ease;
      }
      .header-status.online {
        background: #d1fae5;
        color: #065f46;
      }
      .header-status.offline {
        background: #fee2e2;
        color: #991b1b;
      }
      .header-status::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      
      .filters-bar {
        background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 1.25rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      }
      .filters-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid #e2e8f0;
      }
      .filters-title {
        font-size: 0.875rem;
        font-weight: 700;
        color: #003366;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .filters-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        align-items: end;
      }
      .filter-item {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }
      .filter-item label {
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .filter-item select,
      .filter-item input {
        padding: 0.625rem 0.875rem;
        border: 1.5px solid #e2e8f0;
        border-radius: 10px;
        font-size: 0.9rem;
        background: white;
        transition: all 0.2s;
      }
      .filter-item select:focus,
      .filter-item input:focus {
        outline: none;
        border-color: #003366;
        box-shadow: 0 0 0 3px rgba(0, 51, 102, 0.1);
      }
      .filter-actions {
        display: flex;
        gap: 0.5rem;
      }
      .btn-filter {
        padding: 0.625rem 1.25rem;
        border-radius: 10px;
        font-weight: 600;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
      }
      .btn-apply {
        background: linear-gradient(135deg, #003366, #004080);
        color: white;
      }
      .btn-apply:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 51, 102, 0.3);
      }
      .btn-clear {
        background: white;
        color: #64748b;
        border: 1.5px solid #e2e8f0;
      }
      .btn-clear:hover {
        border-color: #003366;
        color: #003366;
        background: #f8fafc;
      }
      
      .hidrometro-card.sem-foto {
        border-color: #f59e0b !important;
        background: linear-gradient(135deg, white, #fffbeb) !important;
        animation: pulseBorder 2s infinite;
      }
      @keyframes pulseBorder {
        0%, 100% { border-color: #f59e0b; }
        50% { border-color: #fbbf24; }
      }
      .foto-obrigatoria {
        display: none;
        color: #d97706;
        font-size: 0.8rem;
        font-weight: 600;
        margin-top: 0.5rem;
        padding: 0.5rem;
        background: #fef3c7;
        border-radius: 6px;
        text-align: center;
        border: 1px solid #fcd34d;
      }
      .hidrometro-card.sem-foto .foto-obrigatoria {
        display: block;
        animation: pulse 2s infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
    `;
    document.head.appendChild(style);
  }

  criarStatusRede() {
    const oldStatus = document.getElementById('statusRede');
    if (oldStatus) oldStatus.remove();
    
    const headerUser = document.querySelector('.header-user');
    if (!headerUser) return;
    
    let el = document.getElementById('headerStatus');
    if (!el) {
      el = document.createElement('span');
      el.id = 'headerStatus';
      el.className = 'header-status';
      headerUser.insertBefore(el, headerUser.firstChild);
    }
    this.atualizarStatusRede();
  }

  atualizarStatusRede() {
    const el = document.getElementById('headerStatus');
    if (!el) return;
    if (this.online) {
      el.textContent = 'Online';
      el.className = 'header-status online';
    } else {
      el.textContent = 'Offline';
      el.className = 'header-status offline';
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
    setInterval(() => {
      if (this.salvamentoPendente && this.ronda.id) this.salvarRonda();
    }, 2000);
  }

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
      nivelSpan.className = 'user-badge';
      if (this.isAdmin(this.usuario.nivel)) nivelSpan.classList.add('admin');
    }
    setTimeout(() => this.criarStatusRede(), 0);
    this.limparBadgesHeader();
  }

  limparBadgesHeader() {
    const header = document.getElementById('corporateHeader');
    if (!header) return;
    const badgesSoltos = header.querySelectorAll('.status-badge');
    badgesSoltos.forEach(badge => badge.remove());
  }

  async atualizarDashboard() {
    await this.carregarDashboard();
  }

  // CORREÇÃO v2.9.9.3: Busca dados completos, não apenas 10 registros
  async carregarDashboard() {
    if (!this.online) {
      this.mostrarToast('Sem conexão - Dashboard indisponível offline', 'warning');
      return;
    }
    this.mostrarLoading(true, 'Carregando estatísticas...');
    try {
      console.log('[Dashboard] Buscando dados completos...');
      
      // Tenta buscar com limite alto para pegar todos os dados
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ 
          action: 'getDashboard', 
          periodo: 30,
          limite: 1000,  // ADICIONADO: Solicita até 1000 registros
          tudo: true     // ADICIONADO: Flag para API retornar tudo
        })
      });
      
      const data = await response.json();
      console.log('[Dashboard] Resposta recebida:', data);
      
      if (data.success) {
        // CORREÇÃO: Verifica todos os possíveis campos onde os dados podem vir
        let leituras = [];
        
        if (data.ultimas && Array.isArray(data.ultimas)) {
          leituras = data.ultimas;
          console.log(`[Dashboard] Encontradas ${leituras.length} leituras em 'ultimas'`);
        }
        
        // Se veio vazio ou poucos dados, tenta outros campos
        if (leituras.length <= 10 && data.leituras && Array.isArray(data.leituras)) {
          leituras = data.leituras;
          console.log(`[Dashboard] Usando campo 'leituras': ${leituras.length} registros`);
        }
        
        // Se ainda tem poucos dados e tem campo total/dados completos
        if (leituras.length <= 10 && data.dados && Array.isArray(data.dados)) {
          leituras = data.dados;
          console.log(`[Dashboard] Usando campo 'dados': ${leituras.length} registros`);
        }
        
        // Se a API retorna total separado, loga para debug
        if (data.total) {
          console.log(`[Dashboard] Total reportado pela API: ${data.total}`);
        }
        
        // Garante que temos um array válido
        if (!Array.isArray(leituras)) {
          leituras = [];
        }
        
        // Atualiza o objeto data com as leituras processadas
        data.ultimas = leituras;
        
        // Se não tem gráficos pré-calculados, gera a partir dos dados
        if (!data.graficos || !data.graficos.porLocal) {
          data.graficos = {
            porLocal: this.agruparPorLocal(leituras),
            porDia: this.agruparPorDia(leituras)
          };
        }
        
        this.dashboardData = data;
        
        console.log(`[Dashboard] Renderizando com ${leituras.length} leituras`);
        this.renderizarDashboard(data);
        this.popularFiltroLocais(data);
        this.popularFiltroTipos(data);
        
        if (Object.values(this.filtrosAtuais).some(f => f !== '')) {
          this.aplicarFiltros(false);
        }
        
        // Alerta se detectou poucos dados mas esperava mais
        if (leituras.length === 10 && data.total && data.total > 10) {
          console.warn('[Dashboard] ATENÇÃO: API retornou apenas 10 registros mas total é ' + data.total);
          this.mostrarToast(`Atenção: Mostrando apenas 10 de ${data.total} leituras. Verifique a API.`, 'warning');
        }
      } else {
        throw new Error(data.message || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('[Dashboard] Erro:', error);
      this.mostrarToast('Erro ao carregar dashboard: ' + error.message, 'error');
    } finally {
      this.mostrarLoading(false);
    }
  }

  animarNumero(elementId, valorFinal) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const valorInicial = parseInt(el.textContent) || 0;
    const duracao = 500;
    const inicio = performance.now();
    
    const animar = (atual) => {
      const progresso = Math.min((atual - inicio) / duracao, 1);
      const valorAtual = Math.floor(valorInicial + (valorFinal - valorInicial) * progresso);
      el.textContent = valorAtual;
      
      if (progresso < 1) {
        requestAnimationFrame(animar);
      }
    };
    
    requestAnimationFrame(animar);
  }

  renderizarDashboard(data, dadosFiltrados) {
    // Usa dados filtrados se disponíveis, senão usa os dados brutos
    const dadosParaKPI = dadosFiltrados || data.ultimas || [];
    
    // Calcula KPI com segurança
    const kpi = this.calcularKPI(dadosParaKPI);
    
    // Atualiza cards com animação
    this.animarNumero('kpiTotal', kpi.total);
    this.animarNumero('kpiAlertas', kpi.alertas);
    this.animarNumero('kpiVazamentos', kpi.vazamentos);
    this.animarNumero('kpiNormal', kpi.normal);
    
    // Gráfico de Locais - usa dados filtrados se existirem
    if (dadosParaKPI.length > 0) {
      const dadosLocais = dadosFiltrados 
        ? this.agruparPorLocal(dadosFiltrados)
        : (data.graficos?.porLocal || this.agruparPorLocal(dadosParaKPI));
      this.renderizarGraficoLocais(dadosLocais);
    } else {
      this.renderizarGraficoLocais([]);
    }
    
    // Gráfico de Dias - sempre usa todos os dados ou filtrados por data
    if (dadosParaKPI.length > 0) {
      const dadosDias = dadosFiltrados
        ? this.agruparPorDia(dadosFiltrados)
        : (data.graficos?.porDia || this.agruparPorDia(dadosParaKPI));
      this.renderizarGraficoDias(dadosDias);
    } else {
      this.renderizarGraficoDias([]);
    }
    
    // Tabela Últimas Leituras - ordena por data decrescente
    const dadosOrdenados = [...dadosParaKPI].sort((a, b) => {
      return new Date(b.data || b.timestamp || 0) - new Date(a.data || a.timestamp || 0);
    });
    
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
    leituras.forEach(l => {
      if (!l.local) return;
      if (!locais[l.local]) locais[l.local] = 0;
      locais[l.local] += (parseFloat(l.consumoDia) || 0);
    });
    return Object.entries(locais).sort((a, b) => b[1] - a[1]);
  }

  agruparPorDia(leituras) {
    const dias = {};
    leituras.forEach(l => {
      if (!l.data) return;
      const dia = new Date(l.data).toISOString().split('T')[0];
      if (!dias[dia]) dias[dia] = 0;
      dias[dia]++;
    });
    // Ordena por data
    return Object.entries(dias).sort((a, b) => a[0].localeCompare(b[0]));
  }

  renderizarGraficoLocais(dados) {
    const canvas = document.getElementById('chartLocais');
    if (!canvas) return;
    canvas.style.maxHeight = '300px';
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (this.charts.locais) this.charts.locais.destroy();
    
    const labels = dados.map(d => d[0] || d.local);
    const values = dados.map(d => d[1] || d.consumoDia || 0);
    
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
    
    if (this.charts.dias) {
      this.charts.dias.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    canvas.style.maxHeight = '250px';
    canvas.height = 250;
    
    if (!dados || dados.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '14px Arial';
      ctx.fillStyle = '#999';
      ctx.textAlign = 'center';
      ctx.fillText('Nenhum dado disponível', canvas.width / 2, canvas.height / 2);
      return;
    }
    
    const ultimosDados = dados.slice(-15);
    
    const labels = ultimosDados.map(d => {
      const date = new Date(d[0] || d.data);
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    });
    
    const values = ultimosDados.map(d => d[1] || d.quantidade || 0);
    
    this.charts.dias = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Leituras',
          data: values,
          borderColor: '#003366',
          backgroundColor: 'rgba(0, 51, 102, 0.1)',
          borderWidth: 3,
          pointBackgroundColor: '#003366',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0, 51, 102, 0.9)',
            titleFont: { size: 13 },
            bodyFont: { size: 14, weight: 'bold' },
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: function(context) {
                return context.parsed.y + ' leituras';
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0,0,0,0.05)',
              drawBorder: false
            },
            ticks: {
              font: { size: 11 },
              color: '#666',
              stepSize: 1  // Força números inteiros
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 11 },
              color: '#666',
              maxRotation: 45,
              minRotation: 45
            }
          }
        }
      }
    });
  }

  renderizarUltimasLeituras(leituras) {
    const tbody = document.getElementById('ultimasLeituras');
    if (!tbody) return;
    
    if (leituras.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#666;">Nenhuma leitura encontrada com os filtros aplicados</td></tr>';
      return;
    }
    
    tbody.innerHTML = leituras.map(l => {
      const data = new Date(l.data || l.timestamp);
      const dataStr = data.toLocaleDateString('pt-BR') + ' ' + 
                     data.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
      
      let statusClass = 'badge-normal';
      const status = l.status || 'NORMAL';
      
      if (status === 'VAZAMENTO' || status === 'ANOMALIA_NEGATIVO') {
        statusClass = 'badge-danger';
      } else if (status === 'ALERTA_VARIACAO') {
        statusClass = 'badge-warning';
      } else if (status === 'CONSUMO_BAIXO') {
        statusClass = 'badge-info';
      }
      
      const leituraAtual = parseFloat(l.leituraAtual || l.leitura || 0);
      const leituraAnterior = parseFloat(l.leituraAnterior || 0);
      const consumo = parseFloat(l.consumoDia) || (leituraAtual - leituraAnterior) || 0;
      
      const variacao = parseFloat(l.variacao) || 0;
      const variacaoStr = (variacao > 0 ? '+' : '') + variacao.toFixed(1) + '%';
      
      return `<tr>
        <td>${dataStr}</td>
        <td>${l.local || '-'}</td>
        <td>${l.tecnico || '-'}</td>
        <td>${leituraAtual.toFixed(2)} m³</td>
        <td><strong>${consumo.toFixed(2)} m³</strong></td>
        <td><span class="badge ${statusClass}">${status}</span></td>
        <td>${variacaoStr}</td>
      </tr>`;
    }).join('');
  }

  popularFiltroLocais(data) {
    const select = document.getElementById('filtroLocal');
    if (!select || !data.ultimas) return;
    
    // Pega locais únicos das leituras completas
    const locais = [...new Set(data.ultimas.map(l => l.local).filter(l => l))].sort();
    
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
      
      this.filtrosAtuais = { local: filtroLocal, tipo: filtroTipo, status: filtroStatus, data: filtroData };
      
      let filtradas = [...this.dashboardData.ultimas];
      
      if (filtroLocal) {
        filtradas = filtradas.filter(l => l.local === filtroLocal);
      }
      
      if (filtroTipo) {
        filtradas = filtradas.filter(l => l.tipo === filtroTipo);
      }
      
      if (filtroStatus) {
        filtradas = filtradas.filter(l => l.status === filtroStatus);
      }
      
      if (filtroData) {
        const dataFiltro = new Date(filtroData);
        const dataFiltroStr = dataFiltro.toISOString().split('T')[0];
        filtradas = filtradas.filter(l => {
          if (!l.data) return false;
          const dataLeitura = new Date(l.data);
          return dataLeitura.toISOString().split('T')[0] === dataFiltroStr;
        });
      }
      
      this.renderizarDashboard(this.dashboardData, filtradas);
      
      if (mostrarToastMsg) {
        this.mostrarToast(`${filtradas.length} leituras filtradas`, 'success');
      }
    } catch (e) {
      console.error('[Filtros] Erro ao aplicar:', e);
      this.mostrarToast('Erro ao aplicar filtros', 'error');
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
    
    this.filtrosAtuais = { local: '', tipo: '', status: '', data: '' };
    if (this.dashboardData) this.renderizarDashboard(this.dashboardData);
    this.mostrarToast('Filtros limpos', 'info');
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
          body: JSON.stringify({ action: 'getDashboard', periodo: 30, limite: 1000 })
        }).then(r => r.json()),
        fetch(CONFIG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'getDashboard', periodo: 60, limite: 1000 })
        }).then(r => r.json())
      ]);
      
      // Normaliza dados para análise também
      if (atual.success && atual.ultimas) {
        atual.ultimas = atual.ultimas.length > 10 ? atual.ultimas : (atual.leituras || atual.dados || atual.ultimas);
      }
      if (anterior.success && anterior.ultimas) {
        anterior.ultimas = anterior.ultimas.length > 10 ? anterior.ultimas : (anterior.leituras || anterior.dados || anterior.ultimas);
      }
      
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
    const consumoAtual = dadosAtual.ultimas.reduce((acc, l) => acc + (parseFloat(l.consumoDia) || 0), 0);
    const consumoAnterior = dadosAnterior.ultimas
      .filter(l => {
        const data = new Date(l.data);
        const diasAtras = (new Date() - data) / (1000 * 60 * 60 * 24);
        return diasAtras > 30 && diasAtras <= 60;
      })
      .reduce((acc, l) => acc + (parseFloat(l.consumoDia) || 0), 0);
    const variacaoConsumo = consumoAnterior > 0 ? ((consumoAtual - consumoAnterior) / consumoAnterior) * 100 : 0;
    const eficienciaAtual = dadosAtual.ultimas.length > 0 ?
      ((dadosAtual.ultimas.length - dadosAtual.ultimas.filter(l => l.status !== 'NORMAL' && l.status !== 'CONSUMO_BAIXO').length) / dadosAtual.ultimas.length) * 100 : 100;
    const locaisVariacao = {};
    dadosAtual.ultimas.forEach(l => {
      if (!locaisVariacao[l.local]) {
        locaisVariacao[l.local] = { total: 0, count: 0, alertas: 0 };
      }
      locaisVariacao[l.local].total += Math.abs(parseFloat(l.variacao) || 0);
      locaisVariacao[l.local].count++;
      if (l.status !== 'NORMAL' && l.status !== 'CONSUMO_BAIXO') locaisVariacao[l.local].alertas++;
    });
    const topVariacoes = Object.entries(locaisVariacao)
      .map(([local, dados]) => ({
        local: local,
        mediaVariacao: dados.total / dados.count,
        alertas: dados.alertas
      }))
      .sort((a, b) => b.mediaVariacao - a.mediaVariacao)
      .slice(0, 5);
    const container = document.getElementById('analiseContainer');
    if (container) {
      let html = '<div class="analise-grid">';
      
      html += '<div class="analise-card ' + (variacaoConsumo > 20 ? 'alerta' : 'normal') + '">';
      html += '<h4>Comparativo de Consumo</h4>';
      html += '<div class="analise-valor">' + (variacaoConsumo > 0 ? '+' : '') + variacaoConsumo.toFixed(1) + '%</div>';
      html += '<p>vs período anterior (30 dias)</p>';
      html += '<small>Atual: ' + consumoAtual.toFixed(2) + ' m³ | Anterior: ' + consumoAnterior.toFixed(2) + ' m³</small>';
      html += '</div>';
      
      html += '<div class="analise-card">';
      html += '<h4>Eficiência das Leituras</h4>';
      html += '<div class="analise-valor">' + eficienciaAtual.toFixed(1) + '%</div>';
      html += '<p>Leituras normais sem alerta</p>';
      html += '<small>' + dadosAtual.ultimas.filter(l => l.status !== 'NORMAL' && l.status !== 'CONSUMO_BAIXO').length + ' alertas em ' + dadosAtual.ultimas.length + ' leituras</small>';
      html += '</div>';
      
      html += '<div class="analise-card">';
      html += '<h4>Média de Consumo por Leitura</h4>';
      html += '<div class="analise-valor">' + (consumoAtual / (dadosAtual.ultimas.length || 1)).toFixed(2) + ' m³</div>';
      html += '<p>Consumo médio diário</p>';
      html += '</div>';
      
      html += '</div>';
      
      html += '<div class="analise-section" style="background:white;padding:20px;border-radius:12px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">';
      html += '<h3>Locais com Maior Instabilidade</h3>';
      html += '<table class="data-table" style="width:100%;border-collapse:collapse;margin-top:15px;">';
      html += '<thead><tr style="background:#f8f9fa;">';
      html += '<th style="padding:12px;text-align:left;">Local</th>';
      html += '<th style="padding:12px;text-align:left;">Variação Média</th>';
      html += '<th style="padding:12px;text-align:left;">Alertas</th>';
      html += '<th style="padding:12px;text-align:left;">Status</th>';
      html += '</tr></thead><tbody>';
      
      topVariacoes.forEach(item => {
        const badgeClass = item.alertas > 2 ? 'badge-danger' : item.alertas > 0 ? 'badge-warning' : 'badge-normal';
        const statusText = item.alertas > 2 ? 'Crítico' : item.alertas > 0 ? 'Atenção' : 'Estável';
        html += '<tr>';
        html += '<td style="padding:12px;border-bottom:1px solid #dee2e6;">' + item.local + '</td>';
        html += '<td style="padding:12px;border-bottom:1px solid #dee2e6;">' + item.mediaVariacao.toFixed(1) + '%</td>';
        html += '<td style="padding:12px;border-bottom:1px solid #dee2e6;">' + item.alertas + '</td>';
        html += '<td style="padding:12px;border-bottom:1px solid #dee2e6;"><span class="badge ' + badgeClass + '">' + statusText + '</span></td>';
        html += '</tr>';
      });
      
      html += '</tbody></table></div>';
      
      html += '<div class="analise-section" style="background:white;padding:20px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">';
      html += '<h3>Tendência por Tipo de Hidrômetro</h3>';
      html += '<div style="height: 300px; position: relative;">';
      html += '<canvas id="chartAnaliseTipo"></canvas>';
      html += '</div></div>';
      
      container.innerHTML = html;
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
      porTipo[tipo].consumo += (parseFloat(l.consumoDia) || 0);
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
        body: JSON.stringify({ action: 'getLeituras', limite: 1000 })
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
      return '<tr>' +
        '<td style="padding:12px;border-bottom:1px solid #dee2e6;">' + (l.rondaId ? l.rondaId.substring(0, 20) : '--') + '...</td>' +
        '<td style="padding:12px;border-bottom:1px solid #dee2e6;">' + dataStr + '</td>' +
        '<td style="padding:12px;border-bottom:1px solid #dee2e6;">' + l.tecnico + '</td>' +
        '<td style="padding:12px;border-bottom:1px solid #dee2e6;">' + l.local + '</td>' +
        '<td style="padding:12px;border-bottom:1px solid #dee2e6;"><span class="badge ' + statusClass + '">' + l.status + '</span></td>' +
        '<td style="padding:12px;border-bottom:1px solid #dee2e6;text-align:center;">' +
          '<button onclick="app.verDetalhesLeitura(\'' + l.id + '\')" style="padding:4px 8px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.85rem;">Ver</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  popularFiltrosLeituras(leituras) {
    const locais = [...new Set(leituras.map(l => l.local))].filter(l => l).sort();
    const selectLocal = document.getElementById('filtroLocalLeituras');
    if (selectLocal) {
      selectLocal.innerHTML = '<option value="">Todos</option>' +
        locais.map(l => '<option value="' + l + '">' + l + '</option>').join('');
    }
  }

  aplicarFiltrosLeituras() {
    if (!this.leiturasCache.length) return;
    const filtroLocal = document.getElementById('filtroLocalLeituras') ? document.getElementById('filtroLocalLeituras').value : '';
    const filtroStatus = document.getElementById('filtroStatusLeituras') ? document.getElementById('filtroStatusLeituras').value : '';
    const dataInicio = document.getElementById('filtroDataInicio') ? document.getElementById('filtroDataInicio').value : '';
    const dataFim = document.getElementById('filtroDataFim') ? document.getElementById('filtroDataFim').value : '';
    let filtradas = [...this.leiturasCache];
    if (filtroLocal) filtradas = filtradas.filter(l => l.local === filtroLocal);
    if (filtroStatus) filtradas = filtradas.filter(l => l.status && l.status.toLowerCase() === filtroStatus.toLowerCase());
    if (dataInicio) {
      const inicio = new Date(dataInicio);
      filtradas = filtradas.filter(l => new Date(l.data) >= inicio);
    }
    if (dataFim) {
      const fim = new Date(dataFim);
      filtradas = filtradas.filter(l => new Date(l.data) <= fim);
    }
    this.renderizarTabelaLeituras(filtradas);
    this.mostrarToast(filtradas.length + ' leituras encontradas', 'success');
  }

  limparFiltrosLeituras() {
    const filtroLocalLeituras = document.getElementById('filtroLocalLeituras');
    const filtroStatusLeituras = document.getElementById('filtroStatusLeituras');
    const filtroDataInicio = document.getElementById('filtroDataInicio');
    const filtroDataFim = document.getElementById('filtroDataFim');
    
    if (filtroLocalLeituras) filtroLocalLeituras.value = '';
    if (filtroStatusLeituras) filtroStatusLeituras.value = '';
    if (filtroDataInicio) filtroDataInicio.value = '';
    if (filtroDataFim) filtroDataFim.value = '';
    
    if (this.leiturasCache.length) this.renderizarTabelaLeituras(this.leiturasCache);
  }

  verDetalhesLeitura(id) {
    const leitura = this.leiturasCache.find(l => l.id === id);
    if (!leitura) return;
    const consumo = leitura.consumoDia || (leitura.leituraAtual - leitura.leituraAnterior);
    alert('Detalhes da Leitura:\n' +
'📍 Local: ' + leitura.local + '\n' +
'🔧 Hidrômetro: ' + leitura.hidrometroId + ' (' + leitura.tipo + ')\n' +
'📊 Leitura Atual: ' + leitura.leituraAtual + ' m³\n' +
'📊 Leitura Anterior: ' + leitura.leituraAnterior + ' m³\n' +
'💧 Consumo: ' + consumo.toFixed(2) + ' m³\n' +
'📈 Variação: ' + (leitura.variacao ? leitura.variacao.toFixed(2) : '0') + '%\n' +
'⚠️ Status: ' + leitura.status + '\n' +
'👤 Técnico: ' + leitura.tecnico + '\n' +
'📝 Justificativa: ' + (leitura.justificativa || 'Nenhuma') + '\n' +
'📅 Data: ' + new Date(leitura.data).toLocaleString('pt-BR'));
  }

  exportarDados() {
    const telaAtiva = document.querySelector('.screen.active') ? document.querySelector('.screen.active').id : '';
    let dados = [];
    let nomeArquivo = '';
    if (telaAtiva === 'leiturasAdminScreen' && this.leiturasCache.length > 0) {
      dados = this.leiturasCache;
      nomeArquivo = 'Historico_Leituras_' + new Date().toISOString().slice(0,10);
      const csv = this.converterParaCSV(dados, [
        { key: 'data', label: 'Data/Hora', format: (v) => new Date(v).toLocaleString('pt-BR') },
        { key: 'rondaId', label: 'Ronda' },
        { key: 'tecnico', label: 'Técnico' },
        { key: 'local', label: 'Local' },
        { key: 'hidrometroId', label: 'Hidrômetro' },
        { key: 'leituraAnterior', label: 'Leitura Anterior (m³)' },
        { key: 'leituraAtual', label: 'Leitura Atual (m³)' },
        { key: 'consumoDia', label: 'Consumo (m³)', format: (v) => v ? v.toFixed(2) : '0.00' },
        { key: 'variacao', label: 'Variação (%)', format: (v) => v ? v.toFixed(2) : '0.00' },
        { key: 'status', label: 'Status' },
        { key: 'justificativa', label: 'Justificativa' }
      ]);
      this.baixarCSV(csv, nomeArquivo);
    } else if (telaAtiva === 'dashboardScreen' && this.dashboardData) {
      dados = this.dashboardData.ultimas;
      nomeArquivo = 'Dashboard_' + new Date().toISOString().slice(0,10);
      const csv = this.converterParaCSV(dados, [
        { key: 'data', label: 'Data/Hora', format: (v) => new Date(v).toLocaleString('pt-BR') },
        { key: 'local', label: 'Local' },
        { key: 'tecnico', label: 'Técnico' },
        { key: 'leitura', label: 'Leitura (m³)' },
        { key: 'status', label: 'Status' },
        { key: 'variacao', label: 'Variação (%)', format: (v) => v ? v.toFixed(2) : '0.00' }
      ]);
      this.baixarCSV(csv, nomeArquivo);
    } else if (this.ronda.hidrometros.length > 0) {
      dados = this.ronda.hidrometros;
      nomeArquivo = 'Ronda_' + (this.ronda.id || 'Atual') + '_' + new Date().toISOString().slice(0,10);
      const csv = this.converterParaCSV(dados, [
        { key: 'id', label: 'ID' },
        { key: 'local', label: 'Local' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'leituraAnterior', label: 'Leitura Anterior (m³)' },
        { key: 'leituraAtual', label: 'Leitura Atual (m³)' },
        { key: 'consumoDia', label: 'Consumo (m³)', format: (v) => v ? v.toFixed(2) : '' },
        { key: 'variacao', label: 'Variação (%)', format: (v) => v ? v.toFixed(2) : '' },
        { key: 'status', label: 'Status' },
        { key: 'justificativa', label: 'Justificativa' }
      ]);
      this.baixarCSV(csv, nomeArquivo);
    } else {
      this.mostrarToast('Nenhum dado disponível para exportar', 'error');
    }
  }

  converterParaCSV(dados, colunas) {
    let csv = colunas.map(c => '"' + c.label + '"').join(';') + '\n';
    dados.forEach(row => {
      const linha = colunas.map(col => {
        let valor = row[col.key];
        if (col.format && valor !== undefined) valor = col.format(valor);
        if (valor === null || valor === undefined) valor = '';
        valor = String(valor).replace(/"/g, '""');
        return '"' + valor + '"';
      }).join(';');
      csv += linha + '\n';
    });
    return '\ufeff' + csv;
  }

  baixarCSV(conteudo, nomeArquivo) {
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivo + '.csv';
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
      html += '<tr>';
      html += '<td>' + u.nome + '</td>';
      html += '<td>' + u.usuario + '</td>';
      html += '<td><span class="level-badge ' + nivelClass + '">' + nivelText + '</span></td>';
      html += '<td style="display:flex;gap:8px;">';
      html += '<button onclick="app.trocarSenha(\'' + u.usuario + '\')" class="btn-sm btn-secondary-sm">🔑 Trocar Senha</button>';
      html += '<button onclick="app.alternarNivel(\'' + u.usuario + '\', \'' + proximoNivel + '\')" class="btn-sm" style="background:' + corBotaoNivel + ';color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">' + textoBotaoNivel + '</button>';
      html += '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    div.innerHTML = html;
  }

  async alternarNivel(usuario, novoNivel) {
    const nivelTexto = novoNivel === 'admin' ? 'ADMINISTRADOR' : 'TÉCNICO';
    if (!confirm('Deseja realmente alterar ' + usuario + ' para ' + nivelTexto + '?')) return;
    this.mostrarLoading(true, 'Atualizando nível...');
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'alterarNivel', usuario: usuario, novoNivel: novoNivel })
      });
      const data = await response.json();
      this.mostrarLoading(false);
      if (data.success) {
        this.mostrarToast('Nível de ' + usuario + ' alterado para ' + nivelTexto + '!', 'success');
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
    const nome = document.getElementById('novoNome') ? document.getElementById('novoNome').value.trim() : '';
    const usuario = document.getElementById('novoUsuario') ? document.getElementById('novoUsuario').value.trim() : '';
    const senha = document.getElementById('novoSenha') ? document.getElementById('novoSenha').value.trim() : '';
    const nivel = document.getElementById('novoNivel') ? document.getElementById('novoNivel').value : 'tecnico';
    if (!nome || !usuario || !senha) {
      this.mostrarToast('Preencha todos os campos', 'error');
      return;
    }
    this.mostrarLoading(true, 'Criando usuário...');
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'criarUsuario', nome: nome, usuario: usuario, senha: senha, nivel: nivel })
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
    const novaSenha = prompt('Nova senha para ' + usuario + ':');
    if (!novaSenha || !novaSenha.trim()) return;
    this.mostrarLoading(true, 'Atualizando senha...');
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'trocarSenha', usuario: usuario, novaSenha: novaSenha.trim() })
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
    const username = document.getElementById('username') ? document.getElementById('username').value.trim() : '';
    const password = document.getElementById('password') ? document.getElementById('password').value.trim() : '';
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

  navigate(page) {
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const btn = document.querySelector('[data-page="' + page + '"]');
    if (btn) btn.classList.add('active');
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
    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) bottomBar.style.display = 'flex';
    this.popularSelectLocais();
    if (this.ronda.locais.length > 0) {
      const localInicial = this.localAtual && this.ronda.locais.includes(this.localAtual) 
        ? this.localAtual 
        : this.ronda.locais[0];
      const select = document.getElementById('localSelect');
      if (select) select.value = localInicial;
      this.carregarHidrometros(localInicial);
    }
    this.atualizarProgresso();
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
      option.textContent = local + ' (' + lidos + '/' + hidros.length + ')';
      select.appendChild(option);
    });
    
    if (localSelecionado && this.ronda.locais.includes(localSelecionado)) {
      select.value = localSelecionado;
    }
  }

  carregarHidrometros(local) {
    if (!local) return;
    this.localAtual = local;
    
    const select = document.getElementById('localSelect');
    if (select) select.value = local;
    
    this.limparElementosFantasmas();
    const container = document.getElementById('hidrometrosContainer');
    if (!container) return;
    container.innerHTML = '';
    const hidros = this.ronda.hidrometros.filter(h => h.local === local);
    hidros.forEach(h => {
      const card = this.criarCardHidrometro(h);
      container.appendChild(card);
      if (h.leituraAtual) {
        const input = document.getElementById('input-' + h.id);
        if (input) {
          input.value = h.leituraAtual;
          this.calcularPreview(h.id);
        }
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
    div.innerHTML = 
      '<div class="card-header">' +
        '<div class="info-principal">' +
          '<span class="tipo">🔧 ' + (h.tipo || 'Hidrômetro') + '</span>' +
          '<span class="id">#' + h.id + '</span>' +
        '</div>' +
        '<span class="status-badge pendente" id="badge-' + h.id + '">PENDENTE</span>' +
      '</div>' +
      '<div class="leitura-anterior">' +
        '<span>Leitura anterior</span>' +
        '<strong>' + parseFloat(h.leituraAnterior || 0).toFixed(2) + ' m³</strong>' +
      '</div>' +
      '<div class="campo-leitura">' +
        '<input type="number" step="0.01" class="input-leitura" id="input-' + h.id + '" placeholder="Digite a leitura atual" oninput="app.calcularPreview(\'' + h.id + '\')" onblur="app.salvarLeitura(\'' + h.id + '\')">' +
        '<span class="unidade">m³</span>' +
      '</div>' +
      '<div class="info-consumo" id="info-' + h.id + '">' +
        '<span class="placeholder">Aguardando leitura...</span>' +
      '</div>' +
      '<div class="alertas" id="alertas-' + h.id + '"></div>' +
      '<div class="justificativa-container" id="just-container-' + h.id + '" style="display:none;">' +
        '<textarea class="input-justificativa" id="just-' + h.id + '" placeholder="Descreva o motivo da divergência..." onblur="app.salvarJustificativa(\'' + h.id + '\')"></textarea>' +
      '</div>' +
      '<div class="foto-container">' +
        '<label class="btn-foto" id="btn-foto-' + h.id + '">' +
          '<input type="file" accept="image/*" capture="environment" onchange="app.processarFoto(\'' + h.id + '\', this.files[0])" style="display:none">' +
          '<span>📷 Adicionar foto</span>' +
        '</label>' +
        '<div class="foto-obrigatoria" id="foto-obg-' + h.id + '">⚠️ Foto obrigatória para concluir</div>' +
        '<img id="preview-' + h.id + '" class="preview-foto" style="display:none;max-width:100%;margin-top:10px;border-radius:8px;">' +
      '</div>';
    return div;
  }

  calcularPreview(id) {
    const input = document.getElementById('input-' + id);
    if (!input) return;
    const valor = parseFloat(input.value);
    if (isNaN(valor) || valor <= 0) return;
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (!h) return;
    const leituraAnterior = parseFloat(h.leituraAnterior) || 0;
    const consumoDia = valor - leituraAnterior;
    const consumoAnterior = parseFloat(h.consumoAnterior) || 0;
    let variacao = consumoAnterior > 0 ? ((consumoDia - consumoAnterior) / consumoAnterior) * 100 : (consumoDia > 0 ? 100 : 0);
    const info = document.getElementById('info-' + id);
    if (info) {
      info.innerHTML = 
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<span>Consumo:</span><strong>' + consumoDia.toFixed(2) + ' m³/dia</strong>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:0.9rem;">' +
          '<span>Variação:</span><span>' + (variacao >= 0 ? '+' : '') + Math.abs(variacao).toFixed(1) + '%</span>' +
        '</div>';
    }
  }

  salvarLeitura(id) {
    const input = document.getElementById('input-' + id);
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
    this.popularSelectLocais();
    this.salvarRonda();
    
    if (!h.foto) {
      const cardEl = document.getElementById('card-' + id);
      if (cardEl) cardEl.classList.add('sem-foto');
    }
  }

  atualizarUI(id) {
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (!h || !h.leituraAtual) return;
    const badge = document.getElementById('badge-' + id);
    const card = document.getElementById('card-' + id);
    const info = document.getElementById('info-' + id);
    const alertas = document.getElementById('alertas-' + id);
    const justContainer = document.getElementById('just-container-' + id);
    if (badge) {
      let statusTexto = 'PENDENTE';
      let statusClasse = 'pendente';
      
      if (h.foto) {
        const textos = { 'NORMAL': '✓ OK', 'ALERTA_VARIACAO': '⚠️ ALERTA', 'VAZAMENTO': '🚨 VAZAMENTO', 'ANOMALIA_NEGATIVO': '❌ ERRO', 'CONSUMO_BAIXO': 'ℹ️ BAIXO' };
        statusTexto = textos[h.status] || h.status;
        statusClasse = (h.status === 'NORMAL' || h.status === 'CONSUMO_BAIXO') ? 'completo' : 'pendente';
      } else {
        statusTexto = '⏳ AGUARDANDO FOTO';
        statusClasse = 'pendente';
      }
      
      badge.textContent = statusTexto;
      badge.className = 'status-badge ' + statusClasse;
    }
    if (card) {
      if (h.foto && (h.status === 'NORMAL' || h.status === 'CONSUMO_BAIXO')) {
        card.className = 'hidrometro-card completo';
      } else if (h.foto) {
        card.className = 'hidrometro-card anomalia';
      } else {
        card.className = 'hidrometro-card sem-foto';
      }
    }
    if (info) {
      const varClass = Math.abs(h.variacao) > 20 ? 'alta' : 'normal';
      info.innerHTML = 
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<span>Consumo:</span><strong>' + h.consumoDia.toFixed(2) + ' m³/dia</strong>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:0.9rem;">' +
          '<span>Variação:</span><span class="variacao ' + varClass + '">' + (h.variacao >= 0 ? '+' : '') + Math.abs(h.variacao).toFixed(1) + '%</span>' +
        '</div>';
    }
    if (alertas) {
      let html = '';
      if (h.status === 'ANOMALIA_NEGATIVO') html = '<div class="alerta danger"><span>⚠️</span><span>Leitura menor que anterior</span></div>';
      else if (h.status === 'VAZAMENTO') html = '<div class="alerta critico"><span>🚨</span><span>POSSÍVEL VAZAMENTO!</span></div>';
      else if (h.status === 'ALERTA_VARIACAO') html = '<div class="alerta warning"><span>⚠️</span><span>Variação de ' + Math.abs(h.variacao).toFixed(1) + '%</span></div>';
      alertas.innerHTML = html;
    }
    if (justContainer) justContainer.style.display = (h.status !== 'NORMAL' && h.status !== 'CONSUMO_BAIXO') ? 'block' : 'none';
  }

  salvarJustificativa(id) {
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (h) {
      const textarea = document.getElementById('just-' + id);
      h.justificativa = textarea ? textarea.value.trim() : '';
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
        const preview = document.getElementById('preview-' + id);
        if (preview) { preview.src = comprimida; preview.style.display = 'block'; }
        const btn = document.getElementById('btn-foto-' + id);
        if (btn) { btn.innerHTML = '<span>✓ Foto adicionada</span>'; btn.classList.add('tem-foto'); }
        
        const cardEl = document.getElementById('card-' + id);
        if (cardEl) cardEl.classList.remove('sem-foto');
        const fotoObg = document.getElementById('foto-obg-' + id);
        if (fotoObg) fotoObg.style.display = 'none';
        
        this.atualizarUI(id);
        this.atualizarProgresso();
        this.popularSelectLocais();
        this.salvarRonda();
      }
      this.mostrarLoading(false);
      this.mostrarToast('✓ Foto adicionada', 'success');
    } catch (error) {
      this.mostrarLoading(false);
      this.mostrarToast('Erro ao processar foto', 'error');
    }
  }

  comprimirImagem(arquivo, maxWidth, qualidade) {
    maxWidth = maxWidth || 1280;
    qualidade = qualidade || 0.7;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) { 
            height = (maxWidth / width) * height; 
            width = maxWidth; 
          }
          canvas.width = width; 
          canvas.height = height;
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
    if (!h || !h.foto) return;
    const preview = document.getElementById('preview-' + id);
    const btn = document.getElementById('btn-foto-' + id);
    if (preview) { preview.src = h.foto; preview.style.display = 'block'; }
    if (btn) { btn.innerHTML = '<span>✓ Foto adicionada</span>'; btn.classList.add('tem-foto'); }
    const fotoObg = document.getElementById('foto-obg-' + id);
    if (fotoObg) fotoObg.style.display = 'none';
  }

  restaurarJustificativa(id) {
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (!h || !h.justificativa) return;
    const textarea = document.getElementById('just-' + id);
    const container = document.getElementById('just-container-' + id);
    if (textarea) textarea.value = h.justificativa;
    if (container) container.style.display = 'block';
  }

  atualizarProgresso() {
    const total = this.ronda.hidrometros.length;
    const completos = this.ronda.hidrometros.filter(h => h.leituraAtual > 0 && h.foto).length;
    const percentual = total > 0 ? Math.round((completos / total) * 100) : 0;
    
    const progressText = document.getElementById('progressText');
    if (progressText) progressText.textContent = completos + '/' + total + ' (' + percentual + '%)';
    
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
      const barra = progressBar.querySelector('.barra-preenchida');
      if (barra) barra.style.width = percentual + '%';
    }
    
    const btnFinalizar = document.getElementById('btnFinalizar');
    if (btnFinalizar) {
      btnFinalizar.disabled = percentual < 100;
      btnFinalizar.textContent = percentual === 100 ? '✓ Finalizar Ronda' : 'Finalizar (' + percentual + '%)';
      if (percentual === 100) {
        btnFinalizar.classList.add('pronto');
      } else {
        btnFinalizar.classList.remove('pronto');
      }
    }
  }

  async finalizarRonda() {
    const semFoto = this.ronda.hidrometros.filter(h => !h.foto);
    if (semFoto.length > 0) {
      this.mostrarToast(semFoto.length + ' hidrômetro(s) sem foto. Foto é obrigatória!', 'error');
      const primeiro = semFoto[0];
      if (primeiro.local !== this.localAtual) {
        this.carregarHidrometros(primeiro.local);
      }
      setTimeout(() => {
        const cardEl = document.getElementById('card-' + primeiro.id);
        if (cardEl) cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }
    
    const anomaliasSemJust = this.ronda.hidrometros.filter(h => h.status !== 'NORMAL' && h.status !== 'CONSUMO_BAIXO' && (!h.justificativa || h.justificativa.length < 10));
    if (anomaliasSemJust.length > 0) {
      this.mostrarToast('Preencha justificativa para divergências', 'error');
      return;
    }
    this.mostrarLoading(true, 'Enviando dados...');
    const leituras = this.ronda.hidrometros.map(h => ({
      id: h.id, 
      local: h.local, 
      tipo: h.tipo,
      leituraAnterior: h.leituraAnterior, 
      leituraAtual: h.leituraAtual,
      consumoAnterior: h.consumoAnterior, 
      justificativa: h.justificativa, 
      foto: h.foto
    }));
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'salvarLeituras', leituras: leituras, usuario: this.usuario.usuario, rondaId: this.ronda.id })
      });
      const data = await response.json();
      if (data.success) {
        this.ronda = { id: null, hidrometros: [], locais: [], inicio: null };
        this.localAtual = null;
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
    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) bottomBar.style.display = 'none';
    this.verificarRondaPendente();
  }

  continuarRonda() {
    this.entrarModoLeitura();
  }

  verificarRondaPendente() {
    const ronda = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
    if (ronda && ronda.id && ronda.hidrometros.length > 0) {
      const btn = document.getElementById('btnContinuarRonda');
      if (btn) {
        btn.style.display = 'flex';
        const lidos = ronda.hidrometros.filter(h => h.leituraAtual > 0 && h.foto).length;
        const span = btn.querySelector('span:last-child');
        if (span) span.textContent = 'Continuar Ronda (' + lidos + '/' + ronda.hidrometros.length + ')';
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
    try { return JSON.parse(localStorage.getItem(chave)); } catch(e) { return null; }
  }

  salvarStorage(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch(e) {}
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

  mostrarLoading(mostrar, texto) {
    texto = texto || 'Carregando...';
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<div class="spinner"></div><div class="loading-text">' + texto + '</div>';
      document.body.appendChild(overlay);
    }
    overlay.style.display = mostrar ? 'flex' : 'none';
    if (mostrar) {
      const textEl = overlay.querySelector('.loading-text');
      if (textEl) textEl.textContent = texto;
    }
  }

  mostrarToast(mensagem, tipo) {
    tipo = tipo || 'info';
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const cor = tipo === 'success' ? '#28a745' : tipo === 'error' ? '#dc3545' : tipo === 'warning' ? '#ffc107' : '#17a2b8';
    const textoCor = tipo === 'warning' ? '#000' : '#fff';
    const icone = tipo === 'success' ? '✓' : tipo === 'error' ? '✗' : tipo === 'warning' ? '⚠' : 'ℹ';
    
    toast.style.cssText = 'background:' + cor + ';color:' + textoCor + ';padding:12px 20px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);display:flex;align-items:center;gap:10px;min-width:250px;animation:slideIn 0.3s ease;';
    toast.innerHTML = '<span>' + icone + '</span><span>' + mensagem + '</span>';
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
    document.querySelectorAll('.status-badge').forEach(badge => {
      const card = badge.closest('.hidrometro-card');
      if (!card || !document.getElementById('hidrometrosContainer') || !document.getElementById('hidrometrosContainer').contains(card)) {
        badge.remove();
      }
    });
    document.querySelectorAll('[id^="badge-"]').forEach(el => {
      const card = el.closest('.hidrometro-card');
      if (!card) el.remove();
    });
  }

  configurarEventos() {
    const form = document.getElementById('loginForm');
    if (form) form.addEventListener('submit', (e) => this.login(e));
  }

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
