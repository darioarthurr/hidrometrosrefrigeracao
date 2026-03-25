/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.9.9.1
 * FRONTEND - JavaScript Puro
 * DATA: 25/03/2026
 * 
 * CHANGELOG / LOG DE ATUALIZAÇÃO:
 * 
 * v2.9.9.1 (25/03/2026)
 * - [CORREÇÃO] Tratamento específico para erro de permissão do Google Drive ao finalizar ronda
 * - [CORREÇÃO] Mensagens amigáveis ao usuário quando Drive não está autorizado
 * - [MELHORIA] Compressão automática de fotos antes do upload (limite 1280px, qualidade 0.8)
 * - [MELHORIA] Validação de tamanho máximo de foto (5MB) para evitar timeouts
 * - [ADIÇÃO] Filtro por usuário/técnico na Dashboard
 * - [ADIÇÃO] Filtro por usuário/técnico no Histórico de Leituras  
 * - [ADIÇÃO] Filtro por usuário/técnico na Análise Comparativa
 * - [ADIÇÃO] Função popularFiltroUsuarios() para carregar dinamicamente lista de técnicos
 * - [MELHORIA] Header redesenhado com melhor espaçamento e organização visual
 * - [MELHORIA] Indicador de status online/offline mais discreto e profissional
 * - [CORREÇÃO] Remoção de badges fantasmas no header
 * - [MELHORIA] Suporte a resposta do backend com avisos (salvamento sem fotos quando Drive indisponível)
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
    this.filtrosAnalise = { usuario: '', periodo: 30, tipo: 'consumo' };
   
    console.log(`[v${CONFIG.VERSAO}] Sistema inicializado`);
    this.injectStyles();
    this.inicializar();
  }

  /**
   * Estilos CSS injetados dinamicamente para garantir consistência
   */
  injectStyles() {
    if (document.getElementById('app-styles-v2991')) return;
    
    const style = document.createElement('style');
    style.id = 'app-styles-v2991';
    style.textContent = `
      /* HEADER MODERNO E ESPAÇOSO */
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
      .logo-multiplan { 
        font-size: 1.1rem; 
        letter-spacing: 2px; 
        text-transform: uppercase; 
        color: #e0f2fe; 
      }
      
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
        .header-icon { font-size: 1.25rem; }
        .header-title-text { font-size: 0.95rem; font-weight: 600; letter-spacing: 0.5px; }
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
      
      /* CARDS E ELEMENTOS */
      .hidrometro-card { 
        position: relative; 
        overflow: visible; 
        contain: layout style paint; 
        transition: all 0.3s ease;
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
      
      /* FILTROS PREMIUM */
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
      
      /* TOASTS E ALERTAS */
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
      
      /* REMOVE BADGES FANTASMAS */
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
    
    // Auto-save a cada 2 segundos se houver alterações pendentes
    setInterval(() => {
      if (this.salvamentoPendente && this.ronda.id) this.salvarRonda();
    }, 2000);
  }

  /**
   * Configura o header com estrutura moderna e limpa
   */
  configurarHeader() {
    const header = document.getElementById('corporateHeader');
    if (!header) return;
    
    // Reestrutura o header se necessário (garante que está usando o novo layout)
    header.style.display = 'block';
    this.atualizarStatusUI();
    this.limparBadgesHeader();
    
    // Atualiza informações do usuário
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
    // Remove qualquer badge solto no header que não seja o status principal
    const header = document.getElementById('corporateHeader');
    if (!header) return;
    
    const badgesSoltos = header.querySelectorAll('.status-badge:not(#headerStatus):not(.header-status)');
    badgesSoltos.forEach(badge => badge.remove());
  }

  /**
   * FINALIZAR RONDA COM TRATAMENTO DE ERRO DO DRIVE
   * Captura especificamente erro de permissão e orienta o usuário
   */
  async finalizarRonda() {
    const semFoto = this.ronda.hidrometros.filter(h => !h.foto);
    if (semFoto.length > 0) {
      this.mostrarToast(`${semFoto.length} hidrômetro(s) sem foto. Foto é obrigatória!`, 'error');
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

    this.mostrarLoading(true, 'Enviando dados para o servidor...');
    
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
        // Verifica se houve aviso sobre fotos não salvas (Drive não autorizado)
        if (data.aviso && data.aviso.includes('Drive')) {
          this.mostrarToast(`
            <strong>Ronda salva, mas sem fotos!</strong>
            <small>${data.aviso}. ${data.instrucoes ? data.instrucoes[0] : ''}</small>
          `, 'error', 8000); // Toast maior para ler instruções
          
          // Opcional: mostrar modal com instruções detalhadas
          if (data.instrucoes && data.instrucoes.length > 0) {
            console.log('Instruções para autorizar Drive:', data.instrucoes);
          }
        } else {
          this.mostrarToast(`
            <strong>Ronda finalizada com sucesso!</strong>
            <small>${data.estatisticas ? data.estatisticas.leiturasSalvas : ''} leituras salvas</small>
          `, 'success');
        }
        
        // Limpa ronda local
        this.ronda = { id: null, hidrometros: [], locais: [], inicio: null };
        this.localAtual = null;
        localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
        
        this.mostrarLoading(false);
        this.mostrarTela('startScreen');
      } else {
        throw new Error(data.message || 'Erro desconhecido ao salvar');
      }
    } catch (error) {
      this.mostrarLoading(false);
      
      // Detecta especificamente erro de permissão do Drive
      const erroMsg = error.toString().toLowerCase();
      if (erroMsg.includes('drive') || 
          erroMsg.includes('permissão') || 
          erroMsg.includes('permission') ||
          erroMsg.includes('authorization')) {
        
        this.mostrarToast(`
          <strong>Erro de permissão do Google Drive!</strong>
          <small>As leituras não puderam ser salvas. Contate o administrador para autorizar o acesso ao Drive no Apps Script.</small>
        `, 'error', 10000);
      } else {
        this.mostrarToast('Erro ao finalizar: ' + error.message, 'error');
      }
      
      console.error('[Finalizar Ronda] Erro:', error);
    }
  }

  /**
   * PROCESSAR FOTO COM VALIDAÇÃO DE TAMANHO E COMPRESSÃO
   */
  async processarFoto(id, arquivo) {
    if (!arquivo) return;
    
    // Validação de tipo
    if (!arquivo.type.startsWith('image/')) {
      this.mostrarToast('Arquivo deve ser uma imagem', 'error');
      return;
    }
    
    // Validação de tamanho (5MB)
    const tamanhoMB = arquivo.size / (1024 * 1024);
    if (tamanhoMB > CONFIG.MAX_FOTO_SIZE_MB) {
      this.mostrarToast(`Imagem muito grande (${tamanhoMB.toFixed(1)}MB). Máximo: ${CONFIG.MAX_FOTO_SIZE_MB}MB`, 'error');
      return;
    }

    this.mostrarLoading(true, 'Processando foto...');
    
    try {
      // Compressão automática
      const comprimida = await this.comprimirImagem(arquivo);
      
      // Verifica se a compressão resultou em imagem válida
      if (!comprimida || comprimida.length < 100) {
        throw new Error('Falha na compressão da imagem');
      }

      const h = this.ronda.hidrometros.find(h => h.id === id);
      if (!h) throw new Error('Hidrômetro não encontrado');
      
      h.foto = comprimida;
      this.salvamentoPendente = true;
      
      // Atualiza UI
      const preview = document.getElementById('preview-' + id);
      const btn = document.getElementById('btn-foto-' + id);
      
      if (preview) { 
        preview.src = comprimida; 
        preview.style.display = 'block'; 
        preview.onload = () => this.mostrarLoading(false);
      } else {
        this.mostrarLoading(false);
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
      
      this.mostrarToast('✓ Foto adicionada com sucesso', 'success');
      
    } catch (error) {
      this.mostrarLoading(false);
      console.error('[Processar Foto] Erro:', error);
      
      // Mensagens específicas para erros comuns
      if (error.toString().includes('compressão')) {
        this.mostrarToast('Erro ao comprimir foto. Tente uma imagem menor.', 'error');
      } else if (error.toString().includes('tamanho')) {
        this.mostrarToast('Foto muito grande. Limite: 5MB', 'error');
      } else {
        this.mostrarToast('Erro ao processar foto. Tente novamente.', 'error');
      }
    }
  }

  /**
   * Comprime imagem para reduzir tamanho do upload
   */
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
            
            // Redimensiona se necessário
            if (width > maxWidth) { 
              height = Math.round((maxWidth / width) * height); 
              width = maxWidth; 
            }
            
            canvas.width = width; 
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas não suportado');
            
            // Desenha com suavização
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            // Converte para JPEG com qualidade reduzida
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

  /**
   * POPULAR FILTRO DE USUÁRIOS NOS SELECTS
   */
  popularFiltroUsuarios(dados, elementId) {
    const select = document.getElementById(elementId);
    if (!select || !dados) return;
    
    // Extrai usuários únicos dos dados
    const usuarios = [...new Set(
      dados.map(l => l.tecnico || l.usuario).filter(u => u)
    )].sort();
    
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">Todos os usuários</option>' +
      usuarios.map(u => `<option value="${u}">${u}</option>`).join('');
    
    // Restaura seleção anterior se ainda válida
    if (currentValue && usuarios.includes(currentValue)) {
      select.value = currentValue;
    }
  }

  /**
   * CARREGAR DASHBOARD COM SUPORTE A FILTROS (incluindo usuário)
   */
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
        
        // Aplica filtros ativos se existirem
        if (Object.values(this.filtrosAtuais).some(f => f !== '')) {
          this.aplicarFiltros(false);
        }
      } else {
        throw new Error(data.message || 'Erro ao carregar dashboard');
      }
    } catch (error) {
      console.error('[Dashboard] Erro:', error);
      this.mostrarToast('Erro ao carregar dashboard: ' + error.message, 'error');
    } finally {
      this.mostrarLoading(false);
    }
  }

  /**
   * APLICAR FILTROS NA DASHBOARD (incluindo usuário)
   */
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
        this.mostrarToast(`${filtradas.length} leituras filtradas`, 'success');
      }
    } catch (e) {
      console.error('[Filtros] Erro:', e);
      this.mostrarToast('Erro ao aplicar filtros', 'error');
    }
  }

  /**
   * CARREGAR LEITURAS (HISTÓRICO) COM FILTRO DE USUÁRIO
   */
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
        throw new Error(data.message || 'Erro ao carregar histórico');
      }
    } catch (error) {
      console.error('[Histórico] Erro:', error);
      this.mostrarToast('Erro ao carregar histórico: ' + error.message, 'error');
    } finally {
      this.mostrarLoading(false);
    }
  }

  /**
   * APLICAR FILTROS NO HISTÓRICO (incluindo usuário)
   */
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
    this.mostrarToast(`${filtradas.length} leituras encontradas`, 'success');
  }

  /**
   * LIMPAR FILTROS DO HISTÓRICO (incluindo usuário)
   */
  limparFiltrosLeituras() {
    const selects = [
      'filtroLocalLeituras',
      'filtroStatusLeituras', 
      'filtroUsuarioLeituras'
    ];
    
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    
    const dataInicio = document.getElementById('filtroDataInicio');
    const dataFim = document.getElementById('filtroDataFim');
    if (dataInicio) dataInicio.value = '';
    if (dataFim) dataFim.value = '';
    
    if (this.leiturasCache.length) this.renderizarTabelaLeituras(this.leiturasCache);
  }

  /**
   * CARREGAR ANÁLISE COM FILTRO DE USUÁRIO
   */
  async carregarAnalise() {
    if (!this.online) {
      this.mostrarToast('Sem conexão - Análise indisponível offline', 'warning');
      return;
    }
    
    this.mostrarLoading(true, 'Gerando análise comparativa...');
    
    try {
      // Busca dados dos últimos 60 dias para comparativo
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
        
        // Popula filtro de usuários com todos os dados disponíveis
        this.popularFiltroUsuarios(this.analiseData.ultimas, 'filtroUsuarioAnalise');
        
        this.renderizarAnalise(resAtual, resAnterior);
      } else {
        throw new Error('Erro ao carregar dados da análise');
      }
    } catch (error) {
      console.error('[Análise] Erro:', error);
      this.mostrarToast('Erro ao carregar análise: ' + error.message, 'error');
    } finally {
      this.mostrarLoading(false);
    }
  }

  /**
   * APLICAR FILTROS NA ANÁLISE
   */
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

  // ========== MÉTODOS AUXILIARES (mantidos da versão anterior) ==========

  atualizarNomeStart() {
    const span = document.getElementById('nomeTecnicoStart');
    if (span && this.usuario) {
      span.textContent = this.usuario.nome || 'Técnico';
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

  popularFiltroLocais(data) {
    const select = document.getElementById('filtroLocal');
    if (!select || !data.ultimas) return;
    
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

  popularFiltrosLeituras(leituras) {
    const selectLocal = document.getElementById('filtroLocalLeituras');
    if (!selectLocal) return;
    
    const locais = [...new Set(leituras.map(l => l.local))].filter(l => l).sort();
    selectLocal.innerHTML = '<option value="">Todos</option>' +
      locais.map(l => `<option value="${l}">${l}</option>`).join('');
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
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.parsed.y.toFixed(2) + ' m³'
            }
          }
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
      
      const consumo = parseFloat(l.consumoDia) || 0;
      const variacao = parseFloat(l.variacao) || 0;
      
      return `
        <tr>
          <td>${dataStr}</td>
          <td>${l.local || '-'}</td>
          <td>${l.tecnico || '-'}</td>
          <td>${parseFloat(l.leitura || l.leituraAtual || 0).toFixed(2)} m³</td>
          <td><strong>${consumo.toFixed(2)} m³</strong></td>
          <td><span class="badge ${statusClass}">${l.status}</span></td>
          <td>${(variacao > 0 ? '+' : '') + variacao.toFixed(1)}%</td>
        </tr>
      `;
    }).join('');
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

  renderizarAnalise(dadosAtual, dadosAnterior) {
    const consumoAtual = dadosAtual.ultimas.reduce((acc, l) => acc + (parseFloat(l.consumoDia) || 0), 0);
    const consumoAnterior = dadosAnterior.ultimas.reduce((acc, l) => acc + (parseFloat(l.consumoDia) || 0), 0);
    const variacaoConsumo = consumoAnterior > 0 ? ((consumoAtual - consumoAnterior) / consumoAnterior) * 100 : 0;
    
    const container = document.getElementById('analiseContainer');
    if (!container) return;
    
    // HTML da análise (simplificado para exemplo)
    container.innerHTML = `
      <div class="analise-grid">
        <div class="analise-card ${variacaoConsumo > 20 ? 'alerta' : 'normal'}">
          <h4>Variação de Consumo</h4>
          <div class="analise-valor">${(variacaoConsumo > 0 ? '+' : '') + variacaoConsumo.toFixed(1)}%</div>
          <p>Comparativo período anterior</p>
        </div>
        <div class="analise-card">
          <h4>Total de Leituras</h4>
          <div class="analise-valor">${dadosAtual.ultimas.length}</div>
          <p>Últimos 30 dias</p>
        </div>
      </div>
    `;
  }

  // ========== UTILITÁRIOS ==========

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
    
    // Suporta HTML na mensagem
    toast.innerHTML = mensagem;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duracao);
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

  // ... (mantém outros métodos existentes como login, navegação, etc.)

  limparElementosFantasmas() {
    document.querySelectorAll('.status-badge:not(#headerStatus):not(.header-status)').forEach(el => {
      if (!el.closest('.hidrometro-card')) el.remove();
    });
  }
}

// Inicialização global
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new SistemaHidrometros();
});
