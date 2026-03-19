/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.9.8.2
 * CORREÇÕES CRÍTICAS:
 * - Fix: Status Online/Offline agora aparece em todas as telas
 * - Fix: Dashboard funcional com dados reais do backend
 * - Fix: Filtros do dashboard implementados
 * - Fix: Admin mostrado corretamente (normalização de nível)
 * - Fix: Listagem de usuários funcional
 */

const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbw7MWdp3JtZbCrxmmBi0gUb8MT6AW5no22AivtYVWzKCXNGRE2Dv89gKczGtcw6N_tt/exec',
  VERSAO: '2.9.8.2',
  STORAGE_KEYS: {
    USUARIO: 'h2_usuario_v2982',
    RONDA_ATIVA: 'h2_ronda_ativa_v2982',
    BACKUP_RONDA: 'h2_backup_ronda_v2982',
    USUARIOS: 'h2_usuarios_v2982'
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
    
    console.log(`[v${CONFIG.VERSAO}] Inicializando...`);
    this.criarStatusRede(); // Criar elemento de status imediatamente
    this.limparElementosFantasmas();
    this.inicializar();
  }

  // ==================== STATUS DE REDE ====================
  
  criarStatusRede() {
    let el = document.getElementById('statusRede');
    if (!el) {
      el = document.createElement('div');
      el.id = 'statusRede';
      el.style.cssText = 'position:fixed;top:10px;right:10px;padding:6px 12px;border-radius:4px;font-size:0.85rem;z-index:9999;color:white;transition:all 0.3s;';
      document.body.appendChild(el);
    }
    this.atualizarStatusRede();
  }

  atualizarStatusRede() {
    const el = document.getElementById('statusRede');
    if (!el) return;
    
    if (this.online) {
      el.textContent = '🟢 Online';
      el.style.backgroundColor = '#28a745';
      el.style.boxShadow = '0 2px 5px rgba(40,167,69,0.3)';
    } else {
      el.textContent = '🔴 Offline';
      el.style.backgroundColor = '#dc3545';
      el.style.boxShadow = '0 2px 5px rgba(220,53,69,0.3)';
    }
  }

  // ==================== INICIALIZAÇÃO ====================

  async inicializar() {
    // Configurar listeners de rede primeiro
    window.addEventListener('online', () => {
      this.online = true;
      console.log('[Rede] Online');
      this.atualizarStatusRede();
      this.mostrarToast('Conexão restaurada', 'success');
    });
    
    window.addEventListener('offline', () => {
      this.online = false;
      console.log('[Rede] Offline');
      this.atualizarStatusRede();
      this.mostrarToast('Modo offline ativado', 'warning');
    });

    const usuarioSalvo = this.lerStorage(CONFIG.STORAGE_KEYS.USUARIO);
    
    if (usuarioSalvo) {
      this.usuario = usuarioSalvo;
      console.log(`[Sessão] Restaurada: ${this.usuario.nome} (${this.usuario.nivel})`);
      
      this.atualizarHeaderUsuario();
      
      const rondaSalva = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
      if (rondaSalva && rondaSalva.id) {
        this.ronda = rondaSalva;
      }
      
      if (this.isAdmin(this.usuario.nivel)) {
        this.mostrarTela('dashboardScreen');
        this.carregarDashboard(); // Carregar dados reais
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
    
    // Auto-salvamento periódico
    setInterval(() => {
      if (this.salvamentoPendente && this.ronda.id) {
        this.salvarRonda();
      }
    }, 2000);
  }

  isAdmin(nivel) {
    if (!nivel) return false;
    const n = nivel.toString().toLowerCase().trim();
    return n === 'admin' || n === 'op' || n === 'adm' || n === 'administrador';
  }

  normalizarNivel(nivel) {
    if (!nivel) return 'TECNICO';
    const n = nivel.toString().toLowerCase().trim();
    if (this.isAdmin(n)) return 'ADMIN';
    return 'TECNICO';
  }

  atualizarHeaderUsuario() {
    const header = document.getElementById('corporateHeader');
    if (header) header.style.display = 'flex';
    
    const nomeTecnico = document.getElementById('nomeTecnico');
    if (nomeTecnico) nomeTecnico.textContent = this.usuario.nome;
    
    const nivelSpan = document.getElementById('nivelUsuario');
    if (nivelSpan) {
      nivelSpan.textContent = this.normalizarNivel(this.usuario.nivel);
      // Estilo diferente para admin
      if (this.isAdmin(this.usuario.nivel)) {
        nivelSpan.style.backgroundColor = '#dc3545';
      } else {
        nivelSpan.style.backgroundColor = '#007bff';
      }
    }
  }

  // ==================== DASHBOARD (CORRIGIDO) ====================

  async carregarDashboard() {
    console.log('[Dashboard] Carregando dados...');
    
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
          periodo: 30 
        })
      });
      
      const data = await response.json();
      console.log('[Dashboard] Dados recebidos:', data);
      
      if (data.success) {
        this.dashboardData = data;
        this.renderizarDashboard(data);
      } else {
        throw new Error(data.message || 'Erro ao carregar dashboard');
      }
    } catch (error) {
      console.error('[Dashboard] Erro:', error);
      this.mostrarToast('Erro ao carregar dashboard: ' + error.message, 'error');
      this.renderizarDashboardVazio();
    } finally {
      this.mostrarLoading(false);
    }
  }

  renderizarDashboard(data) {
    // Atualizar KPIs
    const kpi = data.kpi || { total: 0, alertas: 0, vazamentos: 0, normal: 0 };
    
    this.atualizarElemento('kpiTotal', kpi.total);
    this.atualizarElemento('kpiAlertas', kpi.alertas);
    this.atualizarElemento('kpiVazamentos', kpi.vazamentos);
    this.atualizarElemento('kpiNormal', kpi.normal);

    // Renderizar gráficos se tiver dados
    if (data.graficos && data.graficos.porLocal && data.graficos.porLocal.length > 0) {
      this.renderizarGraficoLocais(data.graficos.porLocal);
    }
    
    if (data.graficos && data.graficos.porDia && data.graficos.porDia.length > 0) {
      this.renderizarGraficoDias(data.graficos.porDia);
    }

    // Renderizar tabela de últimas leituras
    if (data.ultimas && data.ultimas.length > 0) {
      this.renderizarUltimasLeituras(data.ultimas);
    }
  }

  renderizarDashboardVazio() {
    this.atualizarElemento('kpiTotal', 0);
    this.atualizarElemento('kpiAlertas', 0);
    this.atualizarElemento('kpiVazamentos', 0);
    this.atualizarElemento('kpiNormal', 0);
    
    const container = document.getElementById('ultimasLeituras');
    if (container) {
      container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#666;">Nenhuma leitura registrada</td></tr>';
    }
  }

  atualizarElemento(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  }

  renderizarGraficoLocais(dados) {
    const canvas = document.getElementById('chartLocais');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (this.charts.locais) {
      this.charts.locais.destroy();
    }
    
    const labels = dados.map(d => d[0]);
    const values = dados.map(d => d[1]);
    
    this.charts.locais = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Leituras',
          data: values,
          backgroundColor: '#007bff',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  }

  renderizarGraficoDias(dados) {
    const canvas = document.getElementById('chartDias');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (this.charts.dias) {
      this.charts.dias.destroy();
    }
    
    // Pegar últimos 7 dias apenas
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
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true }
        }
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
      
      return `
        <tr>
          <td>${dataStr}</td>
          <td>${l.local}</td>
          <td>${l.tecnico}</td>
          <td>${l.leitura} m³</td>
          <td><span class="badge ${statusClass}">${l.status}</span></td>
          <td>${l.variacao > 0 ? '+' : ''}${l.variacao.toFixed(1)}%</td>
        </tr>
      `;
    }).join('');
  }

  // ==================== FILTROS DO DASHBOARD (NOVO) ====================

  aplicarFiltros() {
    console.log('[Dashboard] Aplicando filtros...');
    
    const filtroLocal = document.getElementById('filtroLocal')?.value || '';
    const filtroStatus = document.getElementById('filtroStatus')?.value || '';
    const filtroData = document.getElementById('filtroData')?.value || '';
    
    if (!this.dashboardData || !this.dashboardData.ultimas) return;
    
    let filtradas = [...this.dashboardData.ultimas];
    
    if (filtroLocal) {
      filtradas = filtradas.filter(l => l.local === filtroLocal);
    }
    
    if (filtroStatus) {
      filtradas = filtradas.filter(l => l.status === filtroStatus);
    }
    
    if (filtroData) {
      const dataFiltro = new Date(filtroData);
      filtradas = filtradas.filter(l => {
        const dataLeitura = new Date(l.data);
        return dataLeitura.toDateString() === dataFiltro.toDateString();
      });
    }
    
    this.renderizarUltimasLeituras(filtradas);
    
    // Atualizar KPIs baseados nos filtros
    const total = filtradas.length;
    const alertas = filtradas.filter(l => l.status !== 'NORMAL').length;
    
    this.atualizarElemento('kpiTotal', total);
    this.atualizarElemento('kpiAlertas', alertas);
  }

  limparFiltros() {
    document.getElementById('filtroLocal').value = '';
    document.getElementById('filtroStatus').value = '';
    document.getElementById('filtroData').value = '';
    
    if (this.dashboardData) {
      this.renderizarDashboard(this.dashboardData);
    }
  }

  // ==================== RESTO DO SISTEMA ====================

  configurarEventos() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.login(e));
    }
    
    const localSelect = document.getElementById('localSelect');
    if (localSelect) {
      localSelect.addEventListener('change', (e) => this.carregarHidrometros(e.target.value));
    }
    
    window.addEventListener('beforeunload', () => {
      if (this.salvamentoPendente && this.ronda.id) {
        this.salvarRonda();
      }
    });
    
    console.log('[UI] Eventos configurados');
  }

  mudarLocal(valor) {
    this.carregarHidrometros(valor);
  }

  navigate(page) {
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-page="${page}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    if (page === 'dashboard') {
      this.mostrarTela('dashboardScreen');
      this.carregarDashboard();
    } else if (page === 'leituras') {
      this.mostrarTela('leiturasAdminScreen');
    } else if (page === 'analise') {
      this.mostrarTela('dashboardScreen');
      this.carregarDashboard();
    } else if (page === 'gestao') {
      this.mostrarGestao();
    }
  }

  exportarDados() {
    if (!this.ronda.hidrometros || this.ronda.hidrometros.length === 0) {
      this.mostrarToast('Nenhuma leitura para exportar', 'error');
      return;
    }
    
    const csvRows = [["ID","Local","Tipo","Leitura Anterior","Leitura Atual","Consumo (m³)","Variação %","Status","Justificativa","Foto"]];
    this.ronda.hidrometros.forEach(h => {
      csvRows.push([
        h.id,
        h.local || '',
        h.tipo || '',
        h.leituraAnterior || 0,
        h.leituraAtual || 0,
        h.consumoDia || 0,
        h.variacao || 0,
        h.status || '',
        h.justificativa || '',
        h.foto ? 'Sim' : 'Não'
      ]);
    });
    
    const csvContent = csvRows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Ronda_${this.ronda.id || 'Atual'}_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    
    this.mostrarToast('✅ Arquivo CSV baixado com sucesso!', 'success');
  }

  // ==================== GESTÃO DE USUÁRIOS ====================

  mostrarGestao() {
    this.mostrarTela('leiturasAdminScreen');
    const container = document.getElementById('leiturasAdminScreen');
    if (!container) return;
    
    const html = `
      <div style="padding:25px;max-width:800px;margin:0 auto;">
        <div class="card" style="margin-bottom:20px;">
          <h3 style="margin-top:0;color:#003366;">👤 Criar Novo Usuário</h3>
          <div style="display:grid;gap:15px;">
            <input type="text" id="novoNome" placeholder="Nome completo" style="padding:12px;border:1px solid #ddd;border-radius:6px;font-size:1rem;">
            <input type="text" id="novoUsuario" placeholder="Usuário (login)" style="padding:12px;border:1px solid #ddd;border-radius:6px;font-size:1rem;">
            <input type="password" id="novoSenha" placeholder="Senha" style="padding:12px;border:1px solid #ddd;border-radius:6px;font-size:1rem;">
            <select id="novoNivel" style="padding:12px;border:1px solid #ddd;border-radius:6px;font-size:1rem;background:white;">
              <option value="tecnico">Técnico</option>
              <option value="admin">Administrador</option>
            </select>
            <button onclick="app.criarUsuario()" style="padding:12px 24px;background:#28a745;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">
              Criar Usuário
            </button>
          </div>
        </div>
        
        <div class="card">
          <h3 style="margin-top:0;color:#003366;">👥 Usuários Cadastrados</h3>
          <div id="listaUsuarios" style="min-height:100px;">
            <p style="color:#666;text-align:center;padding:20px;">Carregando usuários...</p>
          </div>
          <button onclick="app.carregarUsuariosDoServidor()" style="margin-top:15px;padding:8px 16px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.9rem;">
            🔄 Atualizar Lista
          </button>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    this.carregarUsuariosDoServidor();
  }

  async carregarUsuariosDoServidor() {
    const div = document.getElementById('listaUsuarios');
    if (div) div.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">Carregando...</p>';
    
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
        throw new Error(data.message || 'Erro ao carregar usuários');
      }
    } catch (error) {
      console.error('[Carregar Usuários] Erro:', error);
      // Fallback para localStorage
      const salvos = this.lerStorage(CONFIG.STORAGE_KEYS.USUARIOS) || [];
      this.usuariosCadastrados = salvos;
      this.atualizarListaUsuarios();
      
      if (div) div.innerHTML += '<p style="color:#dc3545;font-size:0.9rem;text-align:center;">Usando dados offline</p>';
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
        body: JSON.stringify({
          action: 'criarUsuario',
          nome: nome,
          usuario: usuario,
          senha: senha,
          nivel: nivel
        })
      });
      
      const data = await response.json();
      this.mostrarLoading(false);
      
      if (data.success) {
        this.mostrarToast(`Usuário ${usuario} criado com sucesso!`, 'success');
        
        // Limpar campos
        document.getElementById('novoNome').value = '';
        document.getElementById('novoUsuario').value = '';
        document.getElementById('novoSenha').value = '';
        
        // Recarregar lista
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
    const novaSenha = prompt(`Digite a nova senha para ${usuario}:`);
    if (!novaSenha || novaSenha.trim() === '') return;
    
    this.mostrarLoading(true, 'Atualizando senha...');
    
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'trocarSenha',
          usuario: usuario,
          novaSenha: novaSenha.trim()
        })
      });
      
      const data = await response.json();
      this.mostrarLoading(false);
      
      if (data.success) {
        this.mostrarToast(`Senha de ${usuario} alterada!`, 'success');
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      this.mostrarLoading(false);
      this.mostrarToast('Erro: ' + error.message, 'error');
    }
  }

  atualizarListaUsuarios() {
    const div = document.getElementById('listaUsuarios');
    if (!div) return;
    
    const usuarios = this.usuariosCadastrados;
    
    if (usuarios.length === 0) {
      div.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">Nenhum usuário cadastrado</p>';
      return;
    }
    
    let html = '<table style="width:100%;border-collapse:collapse;">';
    html += '<thead><tr style="background:#f8f9fa;">';
    html += '<th style="padding:12px;text-align:left;border-bottom:2px solid #dee2e6;">Nome</th>';
    html += '<th style="padding:12px;text-align:left;border-bottom:2px solid #dee2e6;">Login</th>';
    html += '<th style="padding:12px;text-align:center;border-bottom:2px solid #dee2e6;">Nível</th>';
    html += '<th style="padding:12px;text-align:center;border-bottom:2px solid #dee2e6;">Ação</th>';
    html += '</tr></thead><tbody>';
    
    usuarios.forEach(u => {
      const isAdmin = this.isAdmin(u.nivel);
      const badgeStyle = isAdmin ? 
        'background:#dc3545;color:white;padding:4px 8px;border-radius:4px;font-size:0.85rem;' : 
        'background:#007bff;color:white;padding:4px 8px;border-radius:4px;font-size:0.85rem;';
      
      html += `
        <tr style="border-bottom:1px solid #dee2e6;">
          <td style="padding:12px;">${u.nome}</td>
          <td style="padding:12px;">${u.usuario}</td>
          <td style="padding:12px;text-align:center;">
            <span style="${badgeStyle}">${this.normalizarNivel(u.nivel)}</span>
          </td>
          <td style="padding:12px;text-align:center;">
            <button onclick="app.trocarSenha('${u.usuario}')" style="padding:6px 12px;background:#6c757d;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.85rem;">
              🔑 Trocar Senha
            </button>
          </td>
        </tr>
      `;
    });
    
    html += '</tbody></table>';
    div.innerHTML = html;
  }

  // ==================== LOGIN E AUTENTICAÇÃO ====================

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
      
      if (!data.success) {
        throw new Error(data.message || 'Credenciais inválidas');
      }
      
      // Normalizar nível imediatamente
      data.nivel = (data.nivel || 'tecnico').toString().toLowerCase().trim();
      this.usuario = data;
      
      this.salvarStorage(CONFIG.STORAGE_KEYS.USUARIO, data);
      this.atualizarHeaderUsuario();
      
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
      
      this.mostrarToast(`Bem-vindo, ${data.nome}!`, 'success');
      
    } catch (error) {
      console.error('[Login] Erro:', error);
      this.mostrarLoading(false);
      this.mostrarErro(error.message);
    }
  }

  logout() {
    this.encerrarSessao();
  }

  iniciarLeitura() {
    this.iniciarRonda();
  }

  continuarRonda() {
    this.entrarModoLeitura();
  }

  pausarRonda() {
    this.salvarRonda();
    this.mostrarToast('Ronda pausada. Você pode continuar depois.', 'info');
    this.mostrarTela('startScreen');
    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) bottomBar.style.display = 'none';
    this.verificarRondaPendente();
  }

  async iniciarRonda() {
    if (!this.usuario) {
      this.mostrarToast('Usuário não autenticado', 'error');
      return;
    }
    
    this.mostrarLoading(true, 'Carregando hidrômetros...');
    
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'iniciar', usuario: this.usuario.usuario })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Erro ao carregar hidrômetros');
      }
      
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
      
      console.log(`[Ronda] ${this.ronda.hidrometros.length} hidrômetros carregados`);
      this.salvarRonda();
      this.mostrarLoading(false);
      this.entrarModoLeitura();
      this.mostrarToast(`Ronda iniciada: ${this.ronda.hidrometros.length} hidrômetros`, 'success');
      
    } catch (error) {
      console.error('[Ronda] Erro:', error);
      this.mostrarLoading(false);
      this.mostrarToast('Erro ao iniciar ronda: ' + error.message, 'error');
    }
  }

  entrarModoLeitura() {
    this.mostrarTela('leituraScreen');
    this.limparElementosFantasmas();
    
    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) bottomBar.style.display = 'flex';
    
    this.popularSelectLocais();
    
    if (this.ronda.locais.length > 0) {
      const select = document.getElementById('localSelect');
      if (select) {
        select.value = this.ronda.locais[0];
        this.carregarHidrometros(this.ronda.locais[0]);
      }
    }
    
    this.atualizarProgresso();
    this.bloquearVoltarQuandoNaLeitura();
  }

  popularSelectLocais() {
    const select = document.getElementById('localSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">Selecione o local...</option>';
    
    this.ronda.locais.forEach(local => {
      const hidrosNoLocal = this.ronda.hidrometros.filter(h => h.local === local);
      const lidos = hidrosNoLocal.filter(h => h.leituraAtual > 0).length;
      const total = hidrosNoLocal.length;
      
      const option = document.createElement('option');
      option.value = local;
      option.textContent = `${local} (${lidos}/${total})`;
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
    
    hidros.forEach((h) => {
      const card = this.criarCardHidrometro(h);
      container.appendChild(card);
      
      if (h.leituraAtual) this.atualizarUI(h.id);
      if (h.foto) this.restaurarFoto(h.id);
      if (h.justificativa) this.restaurarJustificativa(h.id);
    });
    
    this.atualizarProgresso();
    this.popularSelectLocais();
    
    const select = document.getElementById('localSelect');
    if (select) select.value = local;
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
        <textarea class="input-justificativa" id="just-${h.id}" placeholder="Descreva o motivo da divergência (mín. 10 caracteres)..." onblur="app.salvarJustificativa('${h.id}')"></textarea>
      </div>
      <div class="foto-container">
        <label class="btn-foto" id="btn-foto-${h.id}">
          <input type="file" accept="image/*" capture="environment" onchange="app.processarFoto('${h.id}', this.files[0])" style="display:none">
          <span>📷 Adicionar foto</span>
        </label>
        <img id="preview-${h.id}" class="preview-foto" style="display:none; max-width:100%; margin-top:10px; border-radius:8px;">
      </div>
    `;
    return div;
  }

  calcularPreview(id) {
    const input = document.getElementById(`input-${id}`);
    if (!input) return;
    
    const valor = parseFloat(input.value);
    if (isNaN(valor) || valor <= 0) {
      const info = document.getElementById(`info-${id}`);
      if (info) info.innerHTML = '<span class="placeholder">Aguardando leitura...</span>';
      return;
    }
    
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (!h) return;
    
    const leituraAnterior = parseFloat(h.leituraAnterior) || 0;
    const consumoDia = valor - leituraAnterior;
    const consumoAnterior = parseFloat(h.consumoAnterior) || 0;
    
    let variacao = 0;
    if (consumoAnterior > 0) {
      variacao = ((consumoDia - consumoAnterior) / consumoAnterior) * 100;
    } else if (consumoDia > 0) {
      variacao = 100;
    }
    
    const info = document.getElementById(`info-${id}`);
    if (info) {
      const varAbs = Math.abs(variacao);
      const varSinal = variacao >= 0 ? '+' : '-';
      info.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>Consumo:</span>
          <strong>${consumoDia.toFixed(2)} m³/dia</strong>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px; font-size:0.9rem;">
          <span>Variação:</span>
          <span>${varSinal} ${varAbs.toFixed(1)}%</span>
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
    
    let variacao = 0;
    if (consumoAnterior > 0) {
      variacao = ((consumoDia - consumoAnterior) / consumoAnterior) * 100;
    } else if (consumoDia > 0) {
      variacao = 100;
    }
    
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
    
    const card = document.getElementById(`card-${id}`);
    const badge = document.getElementById(`badge-${id}`);
    const input = document.getElementById(`input-${id}`);
    const info = document.getElementById(`info-${id}`);
    const alertas = document.getElementById(`alertas-${id}`);
    const justContainer = document.getElementById(`just-container-${id}`);
    
    if (input) input.value = h.leituraAtual;
    
    if (badge) {
      const statusText = {
        'NORMAL': '✓ OK',
        'ALERTA_VARIACAO': '⚠️ ALERTA',
        'VAZAMENTO': '🚨 VAZAMENTO',
        'ANOMALIA_NEGATIVO': '❌ ERRO',
        'CONSUMO_BAIXO': 'ℹ️ BAIXO',
        'PENDENTE': '⏳ PENDENTE'
      };
      badge.textContent = statusText[h.status] || h.status;
      badge.className = 'status-badge ' + (h.status === 'NORMAL' ? 'completo' : 'pendente');
    }
    
    if (card) {
      card.className = (h.status === 'NORMAL' || h.status === 'CONSUMO_BAIXO') ? 'hidrometro-card completo' : 'hidrometro-card anomalia';
    }
    
    if (info) {
      const varAbs = Math.abs(h.variacao);
      const varSinal = h.variacao >= 0 ? '+' : '-';
      const varClass = Math.abs(h.variacao) > 20 ? 'alta' : 'normal';
      info.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>Consumo:</span>
          <strong>${h.consumoDia.toFixed(2)} m³/dia</strong>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px; font-size:0.9rem;">
          <span>Variação:</span>
          <span class="variacao ${varClass}">${varSinal} ${varAbs.toFixed(1)}%</span>
        </div>
      `;
    }
    
    if (alertas) {
      let alertaHTML = '';
      if (h.status === 'ANOMALIA_NEGATIVO') alertaHTML += '<div class="alerta danger"><span class="icone">⚠️</span><span>Leitura menor que anterior</span></div>';
      else if (h.status === 'VAZAMENTO') alertaHTML += '<div class="alerta critico"><span class="icone">🚨</span><span>POSSÍVEL VAZAMENTO - Consumo muito alto!</span></div>';
      else if (h.status === 'ALERTA_VARIACAO') {
        const varText = h.variacao > 0 ? 'aumento' : 'redução';
        alertaHTML += `<div class="alerta warning"><span class="icone">⚠️</span><span>Variação de ${Math.abs(h.variacao).toFixed(1)}% de ${varText}</span></div>`;
      } else if (h.status === 'CONSUMO_BAIXO') alertaHTML += '<div class="alerta info"><span class="icone">ℹ️</span><span>Consumo abaixo do esperado</span></div>';
      alertas.innerHTML = alertaHTML;
    }
    
    if (justContainer) {
      justContainer.style.display = (h.status !== 'NORMAL' && h.status !== 'CONSUMO_BAIXO') ? 'block' : 'none';
    }
  }

  salvarJustificativa(id) {
    const input = document.getElementById(`just-${id}`);
    if (!input) return;
    
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (h) {
      h.justificativa = input.value.trim();
      this.salvamentoPendente = true;
      this.salvarRonda();
      console.log(`[Justificativa] Salva para ${id}`);
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
        if (preview) {
          preview.src = comprimida;
          preview.style.display = 'block';
        }
        
        const btn = document.getElementById(`btn-foto-${id}`);
        if (btn) {
          btn.innerHTML = '<span>✓ Foto adicionada</span>';
          btn.classList.add('tem-foto');
        }
        
        this.salvarRonda();
      }
      
      this.mostrarLoading(false);
    } catch (error) {
      console.error('[Foto] Erro:', error);
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
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', qualidade);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('Erro ao carregar imagem'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsDataURL(arquivo);
    });
  }

  restaurarFoto(id) {
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (!h || !h.foto) return;
    
    const preview = document.getElementById(`preview-${id}`);
    const btn = document.getElementById(`btn-foto-${id}`);
    
    if (preview) {
      preview.src = h.foto;
      preview.style.display = 'block';
    }
    
    if (btn) {
      btn.innerHTML = '<span>✓ Foto adicionada</span>';
      btn.classList.add('tem-foto');
    }
  }

  restaurarJustificativa(id) {
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (!h || !h.justificativa) return;
    
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
    if (progressBar) progressBar.style.width = `${percentual}%`;
    
    const btnFinalizar = document.getElementById('btnFinalizar');
    if (btnFinalizar) {
      if (percentual === 100) {
        btnFinalizar.classList.add('pronto');
        btnFinalizar.textContent = '✓ Finalizar Ronda';
        btnFinalizar.disabled = false;
      } else {
        btnFinalizar.classList.remove('pronto');
        btnFinalizar.textContent = `Finalizar (${percentual}%)`;
        btnFinalizar.disabled = true;
      }
    }
  }

  async finalizarRonda() {
    const semLeitura = this.ronda.hidrometros.filter(h => !h.leituraAtual);
    if (semLeitura.length > 0) {
      if (!confirm(`${semLeitura.length} hidrômetro(s) sem leitura. Finalizar mesmo assim?`)) return;
    }
    
    const anomaliasSemJust = this.ronda.hidrometros.filter(h => 
      h.status !== 'NORMAL' && h.status !== 'CONSUMO_BAIXO' && (!h.justificativa || h.justificativa.length < 10)
    );
    
    if (anomaliasSemJust.length > 0) {
      this.mostrarToast('Preencha a justificativa para todas as divergências', 'error');
      return;
    }
    
    this.mostrarLoading(true, 'Enviando dados para o Google Drive...');
    
    const leituras = this.ronda.hidrometros
      .filter(h => h.leituraAtual > 0)
      .map(h => ({
        id: h.id,
        local: h.local,
        tipo: h.tipo,
        leituraAnterior: h.leituraAnterior,
        leituraAtual: h.leituraAtual,
        consumoAnterior: h.consumoAnterior,
        justificativa: h.justificativa,
        foto: h.foto
      }));
    
    const payload = {
      action: 'salvarLeituras',
      leituras: leituras,
      usuario: this.usuario.usuario,
      rondaId: this.ronda.id,
      timestamp: new Date().toISOString()
    };
    
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.ronda = { id: null, hidrometros: [], locais: [], inicio: null };
        localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
        this.mostrarLoading(false);
        this.mostrarToast('Ronda finalizada e salva no Google Drive!', 'success');
        this.mostrarTela('startScreen');
      } else {
        throw new Error(data.message || 'Erro desconhecido no servidor');
      }
    } catch (error) {
      console.error('[FINALIZAR] ERRO:', error);
      this.mostrarLoading(false);
      this.mostrarToast('Erro ao salvar no Drive: ' + error.message, 'error');
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
    
    this.bloquearVoltarQuandoNaLeitura();
  }

  verificarRondaPendente() {
    const ronda = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
    if (ronda && ronda.id && ronda.hidrometros.length > 0) {
      const btnContinuar = document.getElementById('btnContinuarRonda');
      if (btnContinuar) {
        btnContinuar.style.display = 'flex';
        const lidos = ronda.hidrometros.filter(h => h.leituraAtual > 0).length;
        const span = btnContinuar.querySelector('span:last-child');
        if (span) span.textContent = `Continuar Ronda (${lidos}/${ronda.hidrometros.length})`;
      }
    }
  }

  salvarRonda() {
    if (!this.ronda.id) return;
    
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA, JSON.stringify(this.ronda));
      this.salvamentoPendente = false;
      console.log('[SALVAR LOCAL] Ronda salva');
    } catch (e) {
      console.error('[SALVAR LOCAL] Erro:', e);
    }
  }

  lerStorage(chave) {
    try {
      const item = localStorage.getItem(chave);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      console.error('[STORAGE] Erro ao ler:', e);
      return null;
    }
  }

  salvarStorage(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) {
      console.error('[STORAGE] Erro ao salvar:', e);
    }
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
      overlay.innerHTML = `
        <div class="loading-content">
          <div class="spinner"></div>
          <div class="loading-text">${texto}</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    
    if (mostrar) {
      overlay.classList.add('show');
      overlay.querySelector('.loading-text').textContent = texto;
    } else {
      overlay.classList.remove('show');
    }
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
    toast.className = `toast ${tipo}`;
    toast.style.cssText = `
      background:${tipo === 'success' ? '#28a745' : tipo === 'error' ? '#dc3545' : tipo === 'warning' ? '#ffc107' : '#17a2b8'};
      color:${tipo === 'warning' ? '#000' : '#fff'};
      padding:12px 20px;
      border-radius:6px;
      box-shadow:0 4px 12px rgba(0,0,0,0.15);
      display:flex;
      align-items:center;
      gap:10px;
      min-width:250px;
      animation:slideIn 0.3s ease;
    `;
    toast.innerHTML = `
      <span style="font-size:1.2rem;">${tipo === 'success' ? '✓' : tipo === 'error' ? '✗' : tipo === 'warning' ? '⚠' : 'ℹ'}</span>
      <span style="font-weight:500;">${mensagem}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  mostrarErro(mensagem) {
    const erroDiv = document.getElementById('loginError');
    if (erroDiv) {
      erroDiv.textContent = mensagem;
      erroDiv.style.display = 'block';
      erroDiv.style.color = '#dc3545';
      erroDiv.style.marginTop = '10px';
      erroDiv.style.textAlign = 'center';
      setTimeout(() => erroDiv.style.display = 'none', 5000);
    } else {
      this.mostrarToast(mensagem, 'error');
    }
  }

  limparElementosFantasmas() {
    const elementosParaRemover = [
      '#modalFotoAmpliada',
      '.modal-overlay:not(.permantente)',
      '[id*="detalhe"]:not([id*="Container"])',
      '.detalhes-leitura',
      'img.preview-foto:not([id])',
      '.foto-container img:not([id*="preview-"])',
      'img[style*="position: fixed"], img[style*="position: absolute"]',
      '[style*="bottom: 0"][style*="left: 0"]',
      '[style*="bottom: 0"][style*="left: 0"] *',
      '.close, .btn-close, .fechar, [class*="close"], [onclick*="closeModal"], [onclick*="close"], [onclick*="Close"]',
      '.modal-backdrop', '.fade.show', '.modal-backdrop.fade.show',
      '[role="dialog"]', '[aria-modal="true"]'
    ];
    
    elementosParaRemover.forEach(seletor => {
      document.querySelectorAll(seletor).forEach(el => {
        el.remove();
      });
    });
  }

  bloquearVoltarQuandoNaLeitura() {
    if (document.getElementById('leituraScreen')?.style.display === 'block') {
      history.pushState(null, null, window.location.href);
      window.addEventListener('popstate', this.bloquearPopstate);
    } else {
      window.removeEventListener('popstate', this.bloquearPopstate);
    }
  }

  bloquearPopstate(event) {
    event.preventDefault();
    history.pushState(null, null, window.location.href);
    if (app) app.mostrarToast('Volte usando o botão "Pausar Ronda" para não perder dados', 'warning');
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new SistemaHidrometros();
});
