/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.9.9.1
 * FRONTEND - JavaScript Puro
 * DATA: 25/03/2026
 * 
 * CHANGELOG / LOG DE ATUALIZAÇÃO:
 * 
 * v2.9.9.1 (25/03/2026)
 * - [CORREÇÃO] Erro "mostrarTela is not a function" - método restaurado
 * - [CORREÇÃO] Tratamento específico para erro de permissão do Google Drive ao finalizar ronda
 * - [MELHORIA] Compressão automática de fotos antes do upload (limite 1280px, qualidade 0.8)
 * - [ADIÇÃO] Filtro por usuário/técnico na Dashboard, Histórico e Análise
 * - [MELHORIA] Header redesenhado com melhor espaçamento
 * 
 * v2.9.9.0 (Anterior)
 * - Versão base estável
 */

const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzIN1dI0LDY0SIGeTIg8V3s_2dyYuryYjp9GD_q_j_2gEMf25L0Q2b6CaQbk2W0I2bz/exec',
  VERSAO: '2.9.9.1',
  MAX_FOTO_SIZE_MB: 5,
  STORAGE_KEYS: {
    USUARIO: 'h2_usuario_v2991',
    RONDA_ATIVA: 'h2_ronda_ativa_v2991',
    BACKUP_RONDA: 'h2_backup_ronda_v2991',
    USUARIOS: 'h2_usuarios_v2991'
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
    this.filtrosAnalise = { usuario: '' };
   
    console.log(`[v${CONFIG.VERSAO}] Sistema inicializado`);
    this.injectStyles();
    this.inicializar();
  }

  injectStyles() {
    if (document.getElementById('app-styles-v2991')) return;
    
    const style = document.createElement('style');
    style.id = 'app-styles-v2991';
    style.textContent = `
      .corporate-header {
        background: linear-gradient(135deg, #003366 0%, #004080 100%);
        color: white;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        border-bottom: 3px solid #ffc107;
      }
      
      .header-container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 0.75rem 1.5rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      
      .header-brand {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      
      .brand-top {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-weight: 700;
      }
      
      .logo-gps { font-size: 1.25rem; letter-spacing: 1px; text-transform: uppercase; }
      .logo-separator { color: #ffc107; font-size: 1.1rem; }
      .logo-multiplan { font-size: 1.1rem; letter-spacing: 2px; text-transform: uppercase; color: #e0f2fe; }
      
      .system-subtitle {
        font-size: 0.75rem;
        color: #94a3b8;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      
      .header-center {
        display: none;
      }
      
      @media (min-width: 768px) {
        .header-center {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(255,255,255,0.1);
          padding: 0.5rem 1rem;
          border-radius: 9999px;
          border: 1px solid rgba(255,255,255,0.2);
        }
      }
      
      .header-user {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      
      .status-wrapper {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: rgba(255,255,255,0.1);
        padding: 0.375rem 0.75rem;
        border-radius: 9999px;
        border: 1px solid rgba(255,255,255,0.2);
      }
      
      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #22c55e;
        box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3);
        animation: pulse-status 2s infinite;
      }
      
      .status-indicator.offline {
        background: #ef4444;
        box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3);
        animation: none;
      }
      
      @keyframes pulse-status {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.1); }
      }
      
      .status-text {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .user-info {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.125rem;
      }
      
      .user-name {
        font-size: 0.875rem;
        font-weight: 600;
        color: white;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .user-badge {
        font-size: 0.65rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 0.125rem 0.5rem;
        border-radius: 4px;
        background: #ffc107;
        color: #003366;
      }
      
      .btn-logout {
        background: rgba(255,255,255,0.15);
        border: 1px solid rgba(255,255,255,0.3);
        color: white;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 1rem;
      }
      
      .btn-logout:hover { background: rgba(255,255,255,0.25); transform: scale(1.05); }
      
      @media (max-width: 640px) {
        .header-container { padding: 0.5rem 1rem; }
        .logo-gps { font-size: 1rem; }
        .logo-multiplan { font-size: 0.9rem; }
        .system-subtitle { display: none; }
        .user-name { max-width: 80px; font-size: 0.8rem; }
        .status-text { display: none; }
      }
      
      .hidrometro-card.sem-foto {
        border: 2px solid #f59e0b !important;
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
        width: 100%;
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
      
      @media (max-width: 768px) {
        .filters-grid { grid-template-columns: 1fr; }
        .filter-actions { grid-column: 1; }
      }
      
      .toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 400px;
      }
      
      .toast {
        padding: 16px 20px;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        display: flex;
        align-items: flex-start;
        gap: 12px;
        animation: slideIn 0.3s ease;
        font-size: 0.95rem;
        line-height: 1.4;
      }
      
      .toast-success { background: #22c55e; color: white; border-left: 4px solid #16a34a; }
      .toast-error { 
        background: linear-gradient(135deg, #dc3545, #c82333); 
        color: white; 
        border-left: 4px solid #ffc107;
      }
      .toast-warning { background: #ffc107; color: #000; border-left: 4px solid #f59e0b; }
      .toast-info { background: #17a2b8; color: white; border-left: 4px solid #0d8a9e; }
      
      .toast strong {
        display: block;
        margin-bottom: 4px;
        font-weight: 700;
      }
      
      .toast small {
        display: block;
        opacity: 0.9;
        font-size: 0.85rem;
        margin-top: 4px;
      }
      
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      #corporateHeader .status-badge:not(.header-status),
      header .status-badge:not(.header-status) { 
        display: none !important; 
      }
    `;
    document.head.appendChild(style);
  }

  async inicializar() {
    window.addEventListener('online', () => {
      this.online = true;
      this.atualizarStatusUI();
      this.mostrarToast('Conexão restaurada', 'success');
    });
   
    window.addEventListener('offline', () => {
      this.online = false;
      this.atualizarStatusUI();
      this.mostrarToast('Modo offline ativado', 'warning');
    });

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
    
    setInterval(() => {
      if (this.salvamentoPendente && this.ronda.id) this.salvarRonda();
    }, 2000);
  }

  // ========== NAVEGAÇÃO E TELAS ==========

  mostrarTela(telaId) {
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
      this.mostrarTela('gestaoScreen');
      this.carregarUsuariosDoServidor();
    }
  }

  configurarHeader() {
    const header = document.getElementById('corporateHeader');
    if (!header) return;
    
    header.style.display = 'block';
    this.atualizarStatusUI();
    this.limparBadgesHeader();
    
    const nomeEl = document.getElementById('nomeTecnico');
    const nivelEl = document.getElementById('nivelUsuario');
    
    if (nomeEl) {
      nomeEl.textContent = this.usuario.nome || this.usuario.usuario;
      nomeEl.className = 'user-name';
    }
    
    if (nivelEl) {
      nivelEl.textContent = this.normalizarNivel(this.usuario.nivel);
      nivelEl.className = 'user-badge';
    }
  }

  atualizarStatusUI() {
    const indicator = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');
    const wrapper = document.getElementById('statusWrapper');
    
    if (!indicator || !text) return;
    
    if (this.online) {
      indicator.className = 'status-indicator online';
      text.textContent = 'Online';
      if (wrapper) {
        wrapper.style.background = 'rgba(34, 197, 94, 0.2)';
        wrapper.style.borderColor = 'rgba(34, 197, 94, 0.4)';
      }
    } else {
      indicator.className = 'status-indicator offline';
      text.textContent = 'Offline';
      if (wrapper) {
        wrapper.style.background = 'rgba(239, 68, 68, 0.2)';
        wrapper.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      }
    }
  }

  limparBadgesHeader() {
    const header = document.getElementById('corporateHeader');
    if (!header) return;
    
    const badgesSoltos = header.querySelectorAll('.status-badge:not(#headerStatus):not(.header-status)');
    badgesSoltos.forEach(badge => badge.remove());
  }

  // ========== AUTENTICAÇÃO ==========

  async login(e) {
    e.preventDefault();
    const username = document.getElementById('username')?.value.trim() || '';
    const password = document.getElementById('password')?.value.trim() || '';
    
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

  // ========== RONDA E LEITURAS ==========

  async iniciarLeitura() {
    if (!this.usuario) return;
    this.mostrarLoading(true, 'Carregando hidrômetros...');
    
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
        <input type="number" step="0.01" class="input-leitura" id="input-${h.id}" 
               placeholder="Digite a leitura atual" 
               oninput="app.calcularPreview('${h.id}')" 
               onblur="app.salvarLeitura('${h.id}')">
        <span class="unidade">m³</span>
      </div>
      <div class="info-consumo" id="info-${h.id}">
        <span class="placeholder">Aguardando leitura...</span>
      </div>
      <div class="alertas" id="alertas-${h.id}"></div>
      <div class="justificativa-container" id="just-container-${h.id}" style="display:none;">
        <textarea class="input-justificativa" id="just-${h.id}" 
                  placeholder="Descreva o motivo da divergência..." 
                  onblur="app.salvarJustificativa('${h.id}')"></textarea>
      </div>
      <div class="foto-container">
        <label class="btn-foto" id="btn-foto-${h.id}">
          <input type="file" accept="image/*" capture="environment" 
                 onchange="app.processarFoto('${h.id}', this.files[0])" style="display:none">
          <span>📷 Adicionar foto</span>
        </label>
        <div class="foto-obrigatoria" id="foto-obg-${h.id}">
          ⚠️ Foto obrigatória para concluir
        </div>
        <img id="preview-${h.id}" class="preview-foto" style="display:none;max-width:100%;margin-top:10px;border-radius:8px;">
      </div>
    `;
    
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
      info.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>Consumo:</span><strong>${consumoDia.toFixed(2)} m³/dia</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:0.9rem;">
          <span>Variação:</span><span>${(variacao >= 0 ? '+' : '') + Math.abs(variacao).toFixed(1)}%</span>
        </div>
      `;
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
        const textos = { 
          'NORMAL': '✓ OK', 
          'ALERTA_VARIACAO': '⚠️ ALERTA', 
          'VAZAMENTO': '🚨 VAZAMENTO', 
          'ANOMALIA_NEGATIVO': '❌ ERRO', 
          'CONSUMO_BAIXO': 'ℹ️ BAIXO' 
        };
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
      info.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>Consumo:</span><strong>${h.consumoDia.toFixed(2)} m³/dia</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:0.9rem;">
          <span>Variação:</span><span class="variacao ${varClass}">${(h.variacao >= 0 ? '+' : '') + Math.abs(h.variacao).toFixed(1)}%</span>
        </div>
      `;
    }
    
    if (alertas) {
      let html = '';
      if (h.status === 'ANOMALIA_NEGATIVO') html = '<div class="alerta danger"><span>⚠️</span><span>Leitura menor que anterior</span></div>';
      else if (h.status === 'VAZAMENTO') html = '<div class="alerta critico"><span>🚨</span><span>POSSÍVEL VAZAMENTO!</span></div>';
      else if (h.status === 'ALERTA_VARIACAO') html = '<div class="alerta warning"><span>⚠️</span><span>Variação de ' + Math.abs(h.variacao).toFixed(1) + '%</span></div>';
      alertas.innerHTML = html;
    }
    
    if (justContainer) {
      justContainer.style.display = (h.status !== 'NORMAL' && h.status !== 'CONSUMO_BAIXO') ? 'block' : 'none';
    }
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
    
    if (!arquivo.type.startsWith('image/')) {
      this.mostrarToast('Arquivo deve ser uma imagem', 'error');
      return;
    }
    
    const tamanhoMB = arquivo.size / (1024 * 1024);
    if (tamanhoMB > CONFIG.MAX_FOTO_SIZE_MB) {
      this.mostrarToast(`Imagem muito grande (${tamanhoMB.toFixed(1)}MB). Máximo: ${CONFIG.MAX_FOTO_SIZE_MB}MB`, 'error');
      return;
    }

    this.mostrarLoading(true, 'Processando foto...');
    
    try {
      const comprimida = await this.comprimirImagem(arquivo);
      
      if (!comprimida || comprimida.length < 100) {
        throw new Error('Falha na compressão da imagem');
      }

      const h = this.ronda.hidrometros.find(h => h.id === id);
      if (!h) throw new Error('Hidrômetro não encontrado');
      
      h.foto = comprimida;
      this.salvamentoPendente = true;
      
      const preview = document.getElementById('preview-' + id);
      const btn = document.getElementById('btn-foto-' + id);
      
      if (preview) { 
        preview.src = comprimida; 
        preview.style.display = 'block'; 
      }
      
      if (btn) { 
        btn.innerHTML = '<span>✓ Foto adicionada</span>'; 
        btn.classList.add('tem-foto'); 
      }
      
      const cardEl = document.getElementById('card-' + id);
      if (cardEl) cardEl.classList.remove('sem-foto');
      
      const fotoObg = document.getElementById('foto-obg-' + id);
      if (fotoObg) fotoObg.style.display = 'none';
      
      this.atualizarUI(id);
      this.atualizarProgresso();
      this.popularSelectLocais();
      this.salvarRonda();
      
      this.mostrarLoading(false);
      this.mostrarToast('✓ Foto adicionada com sucesso', 'success');
      
    } catch (error) {
      this.mostrarLoading(false);
      console.error('[Processar Foto] Erro:', error);
      this.mostrarToast('Erro ao processar foto. Tente novamente.', 'error');
    }
  }

  comprimirImagem(arquivo, maxWidth = 1280, qualidade = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) { 
              height = Math.round((maxWidth / width) * height); 
              width = maxWidth; 
            }
            
            canvas.width = width; 
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas não suportado');
            
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/jpeg', qualidade);
            resolve(dataUrl);
            
          } catch (err) {
            reject(new Error('Erro na compressão: ' + err.message));
          }
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
    
    const anomaliasSemJust = this.ronda.hidrometros.filter(h => 
      h.status !== 'NORMAL' && 
      h.status !== 'CONSUMO_BAIXO' && 
      (!h.justificativa || h.justificativa.length < 10)
    );
    
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
        body: JSON.stringify({ 
          action: 'salvarLeituras', 
          leituras: leituras, 
          usuario: this.usuario.usuario, 
          rondaId: this.ronda.id 
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        if (data.aviso && data.aviso.includes('Drive')) {
          this.mostrarToast('Atenção: Ronda salva, mas fotos não foram salvas (Drive não autorizado). Contate o administrador.', 'warning', 8000);
        } else {
          this.mostrarToast('Ronda finalizada com sucesso!', 'success');
        }
        
        this.ronda = { id: null, hidrometros: [], locais: [], inicio: null };
        this.localAtual = null;
        localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
        
        this.mostrarLoading(false);
        this.mostrarTela('startScreen');
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      this.mostrarLoading(false);
      
      const erroMsg = error.toString().toLowerCase();
      if (erroMsg.includes('drive') || erroMsg.includes('permissão') || erroMsg.includes('permission')) {
        this.mostrarToast('Erro de permissão do Google Drive! Contate o administrador.', 'error', 10000);
      } else {
        this.mostrarToast('Erro ao finalizar: ' + error.message, 'error');
      }
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

  // ========== DASHBOARD E ANÁLISE ==========

  async carregarDashboard() {
    if (!this.online) {
      this.mostrarToast('Sem conexão - Dashboard indisponível offline', 'warning');
      return;
    }
    
    this.mostrarLoading(true, 'Carregando estatísticas...');
    
    try {
      const [resDashboard, resLeituras] = await Promise.all([
        fetch(CONFIG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'getDashboard', periodo: 30 })
        }).then(r => r.json()),
        fetch(CONFIG.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'getLeituras', limite: 1000 })
        }).then(r => r.json())
      ]);
      
      let data = resDashboard;
      let leiturasCompletas = [];
      
      if (resLeituras.success && resLeituras.leituras) {
        leiturasCompletas = resLeituras.leituras;
      } else if (data.ultimas) {
        leiturasCompletas = data.ultimas;
      }
      
      if (data.success) {
        data.ultimas = leiturasCompletas;
        this.dashboardData = data;
        
        this.renderizarDashboard(data);
        this.popularFiltroLocais(data);
        this.popularFiltroTipos(data);
        this.popularFiltroUsuarios(leiturasCompletas, 'filtroUsuario');
        
        if (Object.values(this.filtrosAtuais).some(f => f !== '')) {
          this.aplicarFiltros(false);
        }
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('[Dashboard] Erro:', error);
      this.mostrarToast('Erro ao carregar dashboard: ' + error.message, 'error');
    } finally {
      this.mostrarLoading(false);
    }
  }

  popularFiltroUsuarios(dados, elementId) {
    const select = document.getElementById(elementId);
    if (!select || !dados) return;
    
    const usuarios = [...new Set(dados.map(l => l.tecnico || l.usuario).filter(u => u))].sort();
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">Todos os usuários</option>' +
      usuarios.map(u => `<option value="${u}">${u}</option>`).join('');
    
    if (currentValue && usuarios.includes(currentValue)) {
      select.value = currentValue;
    }
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
      
      this.filtrosAtuais = { 
        local: filtroLocal, 
        tipo: filtroTipo, 
        status: filtroStatus, 
        data: filtroData,
        usuario: filtroUsuario
      };
      
      let filtradas = [...this.dashboardData.ultimas];
      
      if (filtroLocal) filtradas = filtradas.filter(l => l.local === filtroLocal);
      if (filtroTipo) filtradas = filtradas.filter(l => l.tipo === filtroTipo);
      if (filtroStatus) filtradas = filtradas.filter(l => l.status === filtroStatus);
      if (filtroUsuario) filtradas = filtradas.filter(l => l.tecnico === filtroUsuario);
      
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
        this.mostrarToast(filtradas.length + ' leituras filtradas', 'success');
      }
    } catch (e) {
      console.error('[Filtros] Erro:', e);
      this.mostrarToast('Erro ao aplicar filtros', 'error');
    }
  }

  limparFiltros() {
    ['filtroLocal', 'filtroTipo', 'filtroStatus', 'filtroData', 'filtroUsuario'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    
    this.filtrosAtuais = { local: '', tipo: '', status: '', data: '', usuario: '' };
    if (this.dashboardData) this.renderizarDashboard(this.dashboardData);
    this.mostrarToast('Filtros limpos', 'info');
  }

  renderizarDashboard(data, dadosFiltrados) {
    const dadosParaKPI = dadosFiltrados || data.ultimas || [];
    const kpi = this.calcularKPI(dadosParaKPI);
    
    this.animarNumero('kpiTotal', kpi.total);
    this.animarNumero('kpiAlertas', kpi.alertas);
    this.animarNumero('kpiVazamentos', kpi.vazamentos);
    this.animarNumero('kpiNormal', kpi.normal);
    
    const dadosLocais = dadosFiltrados 
      ? this.agruparPorLocal(dadosFiltrados)
      : (data.graficos?.porLocal || this.agruparPorLocal(dadosParaKPI));
    this.renderizarGraficoLocais(dadosLocais);
    
    const dadosDias = dadosFiltrados
      ? this.agruparPorDia(dadosFiltrados)
      : (data.graficos?.porDia || this.agruparPorDia(dadosParaKPI));
    this.renderizarGraficoDias(dadosDias);
    
    const dadosOrdenados = [...dadosParaKPI].sort((a, b) => 
      new Date(b.data || b.timestamp || 0) - new Date(a.data || a.timestamp || 0)
    );
    
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
      locais[l.local] = (locais[l.local] || 0) + (parseFloat(l.consumoDia) || 0);
    });
    return Object.entries(locais).sort((a, b) => b[1] - a[1]);
  }

  agruparPorDia(leituras) {
    const dias = {};
    leituras.forEach(l => {
      if (!l.data) return;
      const dia = new Date(l.data).toISOString().split('T')[0];
      dias[dia] = (dias[dia] || 0) + 1;
    });
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
      const valorAtual = Math.floor(valorInicial + (valorFinal - valorInicial) * progresso);
      el.textContent = valorAtual;
      
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
      data: {
        labels: dados.map(d => d[0]),
        datasets: [{
          label: 'Consumo Total (m³)',
          data: dados.map(d => d[1]),
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
          y: {
            beginAtZero: true,
            ticks: { callback: (val) => val.toFixed(1) + ' m³' }
          },
          x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 } }
        }
      }
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
      data: {
        labels: ultimosDados.map(d => {
          const date = new Date(d[0]);
          return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        }),
        datasets: [{
          label: 'Leituras',
          data: ultimosDados.map(d => d[1]),
          borderColor: '#003366',
          backgroundColor: 'rgba(0, 51, 102, 0.1)',
          borderWidth: 3,
          pointBackgroundColor: '#003366',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 5,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true },
          x: { ticks: { maxRotation: 45, minRotation: 45 } }
        }
      }
    });
  }

  renderizarUltimasLeituras(leituras) {
    const tbody = document.getElementById('ultimasLeituras');
    if (!tbody) return;
    
    if (leituras.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#666;">Nenhuma leitura encontrada</td></tr>';
      return;
    }
    
    tbody.innerHTML = leituras.map(l => {
      const data = new Date(l.data || l.timestamp);
      const dataStr = data.toLocaleDateString('pt-BR') + ' ' + 
                     data.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
      
      let statusClass = 'badge-normal';
      if (l.status === 'VAZAMENTO') statusClass = 'badge-danger';
      else if (l.status === 'ALERTA_VARIACAO') statusClass = 'badge-warning';
      else if (l.status === 'ANOMALIA_NEGATIVO') statusClass = 'badge-danger';
      
      return `
        <tr>
          <td>${dataStr}</td>
          <td>${l.local || '-'}</td>
          <td>${l.tecnico || '-'}</td>
          <td>${parseFloat(l.leitura || l.leituraAtual || 0).toFixed(2)} m³</td>
          <td><strong>${(parseFloat(l.consumoDia) || 0).toFixed(2)} m³</strong></td>
          <td><span class="badge ${statusClass}">${l.status}</span></td>
          <td>${(parseFloat(l.variacao) || 0).toFixed(1)}%</td>
        </tr>
      `;
    }).join('');
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
        this.popularFiltroUsuarios(data.leituras, 'filtroUsuarioLeituras');
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      this.mostrarToast('Erro ao carregar histórico: ' + error.message, 'error');
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
    
    tbody.innerHTML = leituras.slice().reverse().map(l => {
      const data = new Date(l.data);
      const dataStr = data.toLocaleDateString('pt-BR') + ' ' + 
                     data.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
      
      let statusClass = 'badge-normal';
      if (l.status === 'VAZAMENTO') statusClass = 'badge-danger';
      else if (l.status === 'ALERTA_VARIACAO') statusClass = 'badge-warning';
      
      return `
        <tr>
          <td>${l.rondaId ? l.rondaId.substring(0, 20) + '...' : '--'}</td>
          <td>${dataStr}</td>
          <td>${l.tecnico}</td>
          <td>${l.local}</td>
          <td><span class="badge ${statusClass}">${l.status}</span></td>
          <td style="text-align:center;">
            <button onclick="app.verDetalhesLeitura('${l.id}')" 
                    style="padding:4px 8px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">
              Ver
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  popularFiltrosLeituras(leituras) {
    const selectLocal = document.getElementById('filtroLocalLeituras');
    if (!selectLocal) return;
    
    const locais = [...new Set(leituras.map(l => l.local))].filter(l => l).sort();
    selectLocal.innerHTML = '<option value="">Todos</option>' +
      locais.map(l => `<option value="${l}">${l}</option>`).join('');
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
    ['filtroLocalLeituras', 'filtroStatusLeituras', 'filtroUsuarioLeituras'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    
    const dataInicio = document.getElementById('filtroDataInicio');
    const dataFim = document.getElementById('filtroDataFim');
    if (dataInicio) dataInicio.value = '';
    if (dataFim) dataFim.value = '';
    
    if (this.leiturasCache.length) this.renderizarTabelaLeituras(this.leiturasCache);
  }

  verDetalhesLeitura(id) {
    const leitura = this.leiturasCache.find(l => l.id === id);
    if (!leitura) return;
    
    const consumo = parseFloat(leitura.consumoDia) || (leitura.leituraAtual - leitura.leituraAnterior);
    alert(`Detalhes da Leitura:
📍 Local: ${leitura.local}
🔧 Hidrômetro: ${leitura.hidrometroId} (${leitura.tipo})
📊 Leitura Atual: ${leitura.leituraAtual} m³
📊 Leitura Anterior: ${leitura.leituraAnterior} m³
💧 Consumo: ${consumo.toFixed(2)} m³
📈 Variação: ${(leitura.variacao ? leitura.variacao.toFixed(2) : '0')}%
⚠️ Status: ${leitura.status}
👤 Técnico: ${leitura.tecnico}
📝 Justificativa: ${leitura.justificativa || 'Nenhuma'}
📅 Data: ${new Date(leitura.data).toLocaleString('pt-BR')}`);
  }

  async carregarAnalise() {
    if (!this.online) {
      this.mostrarToast('Sem conexão - Análise indisponível offline', 'warning');
      return;
    }
    
    this.mostrarLoading(true, 'Gerando análise comparativa...');
    
    try {
      const [resAtual, resAnterior] = await Promise.all([
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

      if (resAtual.success && resAnterior.success) {
        this.analiseData = { 
          atual: resAtual, 
          anterior: resAnterior,
          ultimas: [...(resAtual.ultimas || []), ...(resAnterior.ultimas || [])]
        };
        
        this.popularFiltroUsuarios(this.analiseData.ultimas, 'filtroUsuarioAnalise');
        this.renderizarAnalise(resAtual, resAnterior);
      } else {
        throw new Error('Erro ao carregar dados');
      }
    } catch (error) {
      this.mostrarToast('Erro ao carregar análise: ' + error.message, 'error');
    } finally {
      this.mostrarLoading(false);
    }
  }

  aplicarFiltrosAnalise() {
    if (!this.analiseData) return;
    
    const filtroUsuario = document.getElementById('filtroUsuarioAnalise')?.value || '';
    this.filtrosAnalise.usuario = filtroUsuario;
    
    let dadosAtual = [...this.analiseData.atual.ultimas];
    let dadosAnterior = [...this.analiseData.anterior.ultimas];
    
    if (filtroUsuario) {
      dadosAtual = dadosAtual.filter(l => l.tecnico === filtroUsuario);
      dadosAnterior = dadosAnterior.filter(l => l.tecnico === filtroUsuario);
    }
    
    const resAtualFiltrado = { ...this.analiseData.atual, ultimas: dadosAtual };
    const resAnteriorFiltrado = { ...this.analiseData.anterior, ultimas: dadosAnterior };
    
    this.renderizarAnalise(resAtualFiltrado, resAnteriorFiltrado);
    this.mostrarToast(`Análise filtrada: ${filtroUsuario || 'Todos'}`, 'success');
  }

  renderizarAnalise(dadosAtual, dadosAnterior) {
    const consumoAtual = dadosAtual.ultimas.reduce((acc, l) => acc + (parseFloat(l.consumoDia) || 0), 0);
    const consumoAnterior = dadosAnterior.ultimas.reduce((acc, l) => acc + (parseFloat(l.consumoDia) || 0), 0);
    const variacaoConsumo = consumoAnterior > 0 ? ((consumoAtual - consumoAnterior) / consumoAnterior) * 100 : 0;
    
    const container = document.getElementById('analiseContainer');
    if (!container) return;
    
    container.innerHTML = `
      <div class="analise-grid">
        <div class="analise-card ${variacaoConsumo > 20 ? 'alerta' : 'normal'}">
          <h4>Variação de Consumo</h4>
          <div class="analise-valor">${(variacaoConsumo > 0 ? '+' : '') + variacaoConsumo.toFixed(1)}%</div>
          <p>Comparativo período anterior</p>
          <small>Atual: ${consumoAtual.toFixed(2)} m³ | Anterior: ${consumoAnterior.toFixed(2)} m³</small>
        </div>
        <div class="analise-card">
          <h4>Total de Leituras</h4>
          <div class="analise-valor">${dadosAtual.ultimas.length}</div>
          <p>Últimos 30 dias</p>
        </div>
        <div class="analise-card">
          <h4>Média por Leitura</h4>
          <div class="analise-valor">${(consumoAtual / (dadosAtual.ultimas.length || 1)).toFixed(2)} m³</div>
          <p>Consumo médio diário</p>
        </div>
      </div>
      
      <div class="analise-section" style="background:white;padding:20px;border-radius:12px;margin-top:20px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <h3>Detalhamento por Local</h3>
        <div id="detalhesAnaliseLocais"></div>
      </div>
    `;
  }

  // ========== GESTÃO DE USUÁRIOS ==========

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
        throw new Error(data.message);
      }
    } catch (error) {
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
          <button onclick="app.alternarNivel('${u.usuario}', '${proximoNivel}')" 
                  style="background:${corBotaoNivel};color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">
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
    if (!confirm(`Deseja alterar ${usuario} para ${nivelTexto}?`)) return;
    
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
        this.mostrarToast(`Nível de ${usuario} alterado!`, 'success');
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
    const nome = document.getElementById('novoNome')?.value.trim() || '';
    const usuario = document.getElementById('novoUsuario')?.value.trim() || '';
    const senha = document.getElementById('novoSenha')?.value.trim() || '';
    const nivel = document.getElementById('novoNivel')?.value || 'tecnico';
    
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
    const novaSenha = prompt(`Nova senha para ${usuario}:`);
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

  // ========== UTILITÁRIOS ==========

  isAdmin(nivel) {
    if (!nivel) return false;
    const n = nivel.toString().toLowerCase().trim();
    return n === 'admin' || n === 'op' || n === 'adm' || n === 'administrador';
  }

  normalizarNivel(nivel) {
    if (!nivel) return 'TECNICO';
    return this.isAdmin(nivel) ? 'ADMIN' : 'TECNICO';
  }

  atualizarNomeStart() {
    const span = document.getElementById('nomeTecnicoStart');
    if (span && this.usuario) {
      span.textContent = this.usuario.nome || 'Técnico';
    }
  }

  mostrarLoading(mostrar, texto) {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `
        <div class="spinner"></div>
        <div class="loading-text">Carregando...</div>
      `;
      document.body.appendChild(overlay);
    }
    
    overlay.style.display = mostrar ? 'flex' : 'none';
    if (mostrar) {
      const textEl = overlay.querySelector('.loading-text');
      if (textEl) textEl.textContent = texto || 'Carregando...';
    }
  }

  mostrarToast(mensagem, tipo, duracao) {
    tipo = tipo || 'info';
    duracao = duracao || 3000;
    
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = mensagem;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duracao);
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

  lerStorage(chave) {
    try { 
      return JSON.parse(localStorage.getItem(chave)); 
    } catch(e) { 
      return null; 
    }
  }

  salvarStorage(chave, valor) {
    try { 
      localStorage.setItem(chave, JSON.stringify(valor)); 
    } catch(e) {}
  }

  salvarRonda() {
    if (!this.ronda.id) return;
    localStorage.setItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA, JSON.stringify(this.ronda));
    this.salvamentoPendente = false;
  }

  limparElementosFantasmas() {
    document.querySelectorAll('.status-badge:not(#headerStatus):not(.header-status)').forEach(el => {
      if (!el.closest('.hidrometro-card')) el.remove();
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

  exportarDados() {
    // Implementação básica de exportação
    if (this.leiturasCache.length === 0 && (!this.dashboardData || !this.dashboardData.ultimas)) {
      this.mostrarToast('Nenhum dado disponível para exportar', 'error');
      return;
    }
    
    const dados = this.leiturasCache.length > 0 ? this.leiturasCache : this.dashboardData.ultimas;
    const csv = this.converterParaCSV(dados);
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `leituras_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    this.mostrarToast('Arquivo CSV baixado!', 'success');
  }

  converterParaCSV(dados) {
    if (!dados || dados.length === 0) return '';
    
    const headers = Object.keys(dados[0]).join(';');
    const rows = dados.map(row => {
      return Object.values(row).map(val => {
        if (val === null || val === undefined) return '""';
        return '"' + String(val).replace(/"/g, '""') + '"';
      }).join(';');
    }).join('\n');
    
    return '\ufeff' + headers + '\n' + rows;
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new SistemaHidrometros();
});
