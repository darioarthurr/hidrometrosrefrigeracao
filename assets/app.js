/** 
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.9.3 
 * CORREÇÕES: 
 * - Foto agora persiste ao trocar local e após F5/refresh
 * - Salvamento forçado antes de unload (F5)
 * - Limpeza reforçada de elementos fantasmas (incluindo imagem solta no canto inferior esquerdo)
 * - Status online/offline visível
 * - Nenhuma linha da v2.9.2 foi alterada ou removida
 */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbztb2Zp6RTJKfzlDrOIN1zAyWl0Tz9PSmotNKUk4qKPX0JbOtT0mcytauJIuiAiWW9l/exec',
  VERSAO: '2.9.3',
  STORAGE_KEYS: {
    USUARIO: 'h2_usuario_v28',
    RONDA_ATIVA: 'h2_ronda_ativa_v28',
    BACKUP_RONDA: 'h2_backup_ronda_v28'
  }
};

class SistemaHidrometros {
  constructor() {
    this.usuario = null;
    this.ronda = { id: null, hidrometros: [], locais: [], inicio: null };
    this.localAtual = null;
    this.salvamentoPendente = false;
    this.online = navigator.onLine;

    console.log(`[v${CONFIG.VERSAO}] Inicializando...`);

    this.limparElementosFantasmas();
    this.inicializar();
  }

  // ==================== NOVA FUNÇÃO 2.9.3 - RESTAURA FOTO ====================
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

  limparElementosFantasmas() {
    const elementosParaRemover = [
      '#modalFotoAmpliada',
      '.modal-overlay:not(.permantente)',
      '[id*="detalhe"]:not([id*="Container"])',
      '.detalhes-leitura',
      'img.preview-foto:not([id])',
      '.foto-container img:not([id*="preview-"])',
      'img[style*="position: fixed"], img[style*="position: absolute"]',
      '[style*="bottom: 0"][style*="left: 0"] img'
    ];
    elementosParaRemover.forEach(seletor => {
      document.querySelectorAll(seletor).forEach(el => {
        console.log('[Cleanup 2.9.3] Removendo elemento fantasma:', el.id || el.className);
        el.remove();
      });
    });
  }

  async inicializar() {
    const usuarioSalvo = this.lerStorage(CONFIG.STORAGE_KEYS.USUARIO);
    if (usuarioSalvo) {
      this.usuario = usuarioSalvo;
      console.log(`[Sessão] ${this.usuario.nome}`);
      const header = document.getElementById('corporateHeader');
      if (header) header.style.display = 'flex';
      const nomeTecnico = document.getElementById('nomeTecnico');
      if (nomeTecnico) nomeTecnico.textContent = this.usuario.nome;

      const rondaSalva = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
      if (rondaSalva && rondaSalva.id) {
        this.ronda = rondaSalva;
      }

      if (this.usuario.nivel === 'admin') {
        this.mostrarTela('dashboardScreen');
      } else {
        this.mostrarTela('startScreen');
        this.verificarRondaPendente();
      }
    } else {
      this.mostrarTela('loginScreen');
    }

    this.configurarEventos();
    this.atualizarStatusRede();

    setInterval(() => {
      if (this.salvamentoPendente && this.ronda.id) {
        this.salvarRonda();
      }
    }, 2000);
  }

  configurarEventos() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.login(e));
    }
    const localSelect = document.getElementById('localSelect');
    if (localSelect) {
      localSelect.addEventListener('change', (e) => this.carregarHidrometros(e.target.value));
    }

    window.addEventListener('online', () => {
      this.online = true;
      console.log('[Rede] Online');
      this.atualizarStatusRede();
    });
    window.addEventListener('offline', () => {
      this.online = false;
      console.log('[Rede] Offline');
      this.atualizarStatusRede();
    });

    // ==================== SALVAMENTO FORÇADO ANTES DE F5 (2.9.3) ====================
    window.addEventListener('beforeunload', () => {
      if (this.salvamentoPendente && this.ronda.id) {
        this.salvarRonda();
        console.log('[Save 2.9.3] Forçado antes do refresh (F5)');
      }
    });

    console.log('[UI] Eventos configurados');
  }

  // ==================== NOVA FUNÇÃO 2.9.3 - STATUS ONLINE/OFFLINE ====================
  atualizarStatusRede() {
    let el = document.getElementById('statusRede');
    if (!el) {
      el = document.createElement('div');
      el.id = 'statusRede';
      el.style.cssText = 'position:fixed;top:10px;right:10px;padding:6px 12px;border-radius:4px;font-size:0.85rem;z-index:9999;color:white;';
      document.body.appendChild(el);
    }
    if (this.online) {
      el.textContent = 'Online';
      el.style.backgroundColor = '#28a745';
    } else {
      el.textContent = 'Offline – salvando localmente';
      el.style.backgroundColor = '#dc3545';
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
      if (!data.success) {
        throw new Error(data.message || 'Credenciais inválidas');
      }
      this.usuario = data;
      this.salvarStorage(CONFIG.STORAGE_KEYS.USUARIO, data);
      this.mostrarLoading(false);
      document.getElementById('loginScreen').classList.remove('active');
      const header = document.getElementById('corporateHeader');
      if (header) header.style.display = 'flex';
      const nomeTecnico = document.getElementById('nomeTecnico');
      if (nomeTecnico) nomeTecnico.textContent = data.nome;
      if (data.nivel === 'admin') {
        this.mostrarTela('dashboardScreen');
      } else {
        this.mostrarTela('startScreen');
        this.verificarRondaPendente();
      }
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
    console.log('[UI] Continuando ronda...');
    this.entrarModoLeitura();
  }

  pausarRonda() {
    console.log('[UI] Pausando ronda...');
    this.salvarRonda();
    this.mostrarToast('Ronda pausada. Você pode continuar depois.', 'info');
    this.mostrarTela('startScreen');
    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) bottomBar.style.display = 'none';
    this.verificarRondaPendente();
  }

  async iniciarRonda() {
    console.log('[Ronda] Iniciando...');
    if (!this.usuario) {
      this.mostrarToast('Usuário não autenticado', 'error');
      return;
    }
    this.mostrarLoading(true, 'Carregando...');
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
      console.log(`[Ronda] ${this.ronda.hidrometros.length} hidrômetros`);
      this.salvarRonda();
      this.mostrarLoading(false);
      this.entrarModoLeitura();
      this.mostrarToast(`Ronda iniciada: ${this.ronda.hidrometros.length} hidrômetros`, 'success');
    } catch (error) {
      console.error('[Ronda] Erro:', error);
      this.mostrarLoading(false);
      this.mostrarToast('Erro: ' + error.message, 'error');
    }
  }

  entrarModoLeitura() {
    console.log('[UI] Modo leitura');
    this.mostrarTela('leituraScreen');
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
    this.limparElementosFantasmas();   // limpeza extra 2.9.3
    const container = document.getElementById('hidrometrosContainer');
    if (!container) return;
    container.innerHTML = '';
    const hidros = this.ronda.hidrometros.filter(h => h.local === local);
    hidros.forEach((h) => {
      const card = this.criarCardHidrometro(h);
      container.appendChild(card);
      if (h.leituraAtual) {
        this.atualizarUI(h.id);
      }
      if (h.foto) {
        this.restaurarFoto(h.id);   // CORREÇÃO FOTO 2.9.3
      }
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
    if (consumoDia < 0) {
      status = 'ANOMALIA_NEGATIVO';
    } else if (variacao > 100) {
      status = 'VAZAMENTO';
    } else if (variacao > 20 || variacao < -20) {
      status = 'ALERTA_VARIACAO';
    } else if (consumoDia <= 0.5) {
      status = 'CONSUMO_BAIXO';
    }
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
      if (h.status === 'NORMAL' || h.status === 'CONSUMO_BAIXO') {
        card.className = 'hidrometro-card completo';
      } else {
        card.className = 'hidrometro-card anomalia';
      }
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
      if (h.status === 'ANOMALIA_NEGATIVO') {
        alertaHTML += '<div class="alerta danger"><span class="icone">⚠️</span><span>Leitura menor que anterior</span></div>';
      } else if (h.status === 'VAZAMENTO') {
        alertaHTML += '<div class="alerta critico"><span class="icone">🚨</span><span>POSSÍVEL VAZAMENTO - Consumo muito alto!</span></div>';
      } else if (h.status === 'ALERTA_VARIACAO') {
        const varText = h.variacao > 0 ? 'aumento' : 'redução';
        alertaHTML += `<div class="alerta warning"><span class="icone">⚠️</span><span>Variação de ${Math.abs(h.variacao).toFixed(1)}% de ${varText} em relação ao consumo habitual</span></div>`;
      } else if (h.status === 'CONSUMO_BAIXO') {
        alertaHTML += '<div class="alerta info"><span class="icone">ℹ️</span><span>Consumo abaixo do esperado</span></div>';
      }
      alertas.innerHTML = alertaHTML;
    }
    if (justContainer) {
      if (h.status !== 'NORMAL' && h.status !== 'CONSUMO_BAIXO') {
        justContainer.style.display = 'block';
        const justInput = document.getElementById(`just-${id}`);
        if (justInput && h.justificativa) {
          justInput.value = h.justificativa;
        }
      } else {
        justContainer.style.display = 'none';
      }
    }
  }

  salvarJustificativa(id) {
    const input = document.getElementById(`just-${id}`);
    if (!input) return;
    const h = this.ronda.hidrometros.find(h => h.id === id);
    if (h) {
      h.justificativa = input.value;
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

  atualizarProgresso() {
    const total = this.ronda.hidrometros.length;
    const lidos = this.ronda.hidrometros.filter(h => h.leituraAtual > 0).length;
    const percentual = total > 0 ? Math.round((lidos / total) * 100) : 0;
    const progressText = document.getElementById('progressText');
    if (progressText) {
      progressText.textContent = `${lidos}/${total} (${percentual}%)`;
    }
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
      progressBar.style.width = `${percentual}%`;
    }
    const percentualElements = document.querySelectorAll('.progresso-percentual');
    percentualElements.forEach(el => {
      el.textContent = `${percentual}% concluído`;
    });
    const container = document.querySelector('.progresso-container');
    if (container) {
      const texto = container.querySelector('div:last-child');
      if (texto && texto.textContent.includes('%')) {
        texto.textContent = `${percentual}% concluído`;
      }
    }
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
      if (!confirm(`${semLeitura.length} hidrômetro(s) sem leitura. Deseja finalizar mesmo assim?`)) {
        return;
      }
    }
    const anomaliasSemJust = this.ronda.hidrometros.filter(h => h.status !== 'NORMAL' && h.status !== 'CONSUMO_BAIXO' && (!h.justificativa || h.justificativa.length < 10));
    if (anomaliasSemJust.length > 0) {
      this.mostrarToast('Preencha a justificativa para todas as divergências', 'error');
      return;
    }
    this.mostrarLoading(true, 'Enviando dados...');
    try {
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
      if (!data.success) {
        throw new Error(data.message || 'Erro ao salvar');
      }
      this.ronda = { id: null, hidrometros: [], locais: [], inicio: null };
      localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
      this.mostrarLoading(false);
      this.mostrarToast('Ronda finalizada com sucesso!', 'success');
      this.mostrarTela('startScreen');
      const bottomBar = document.getElementById('bottomBar');
      if (bottomBar) bottomBar.style.display = 'none';
    } catch (error) {
      console.error('[Finalizar] Erro:', error);
      this.mostrarLoading(false);
      this.mostrarToast('Erro ao finalizar: ' + error.message, 'error');
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

  verificarRondaPendente() {
    const ronda = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
    if (ronda && ronda.id && ronda.hidrometros.length > 0) {
      const btnContinuar = document.getElementById('btnContinuarRonda');
      if (btnContinuar) {
        btnContinuar.style.display = 'flex';
        const lidos = ronda.hidrometros.filter(h => h.leituraAtual > 0).length;
        const span = btnContinuar.querySelector('span:last-child');
        if (span) {
          span.textContent = `Continuar Ronda (${lidos}/${ronda.hidrometros.length})`;
        }
      }
    }
  }

  salvarRonda() {
    if (!this.ronda.id) return;
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA, JSON.stringify(this.ronda));
      this.salvamentoPendente = false;
    } catch (e) {
      console.error('[Save] Erro:', e);
    }
  }

  lerStorage(chave) {
    try {
      const item = localStorage.getItem(chave);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      return null;
    }
  }

  salvarStorage(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) {
      console.error('[Storage] Erro:', e);
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
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `
      <span>${tipo === 'success' ? '✓' : tipo === 'error' ? '✗' : 'ℹ'}</span>
      <span>${mensagem}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  mostrarErro(mensagem) {
    const erroDiv = document.getElementById('loginError');
    if (erroDiv) {
      erroDiv.textContent = mensagem;
      erroDiv.classList.add('show');
      setTimeout(() => erroDiv.classList.remove('show'), 5000);
    }
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new SistemaHidrometros();
});
