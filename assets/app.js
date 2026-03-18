/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.5.7
 * Correção: Persistência garantida contra F5 e modo privado
 */
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbztb2Zp6RTJKfzlDrOIN1zAyWl0Tz9PSmotNKUk4qKPX0JbOtT0mcytauJIuiAiWW9l/exec',
    VERSAO: '2.5.7',
    STORAGE_KEYS: {
        USUARIO: 'h2_usuario',
        LEITURAS_PENDENTES: 'h2_pendentes',
        RONDA_ATUAL: 'h2_ronda',
        CACHE_DASHBOARD: 'h2_dashboard',
        BACKUP_RONDA: 'h2_backup_ronda', // Backup adicional
        LAST_SAVE: 'h2_last_save'
    },
    AUTOSAVE_INTERVAL: 2000 // Mais frequente
};

class HidrometroApp {
    constructor() {
        this.usuario = null;
        this.hidrometros = [];
        this.locais = [];
        this.rondaAtual = null;
        this._atualizandoProgresso = false;
        this._dadosModificados = false;
        this._saveCount = 0;

        console.log(`🚀 Sistema v${CONFIG.VERSAO} carregado!`);
        this.init();
    }

    init() {
        this.testarLocalStorage();
        this.restaurarSessao();
        this.setupEventListeners();
        this.iniciarAutoSave();
    }

    // ==========================================
    // TESTE E PROTEÇÃO DO LOCALSTORAGE
    // ==========================================

    testarLocalStorage() {
        try {
            const test = '__test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            console.log('✅ localStorage disponível');
            return true;
        } catch (e) {
            console.error('❌ localStorage NÃO disponível:', e);
            alert('AVISO: Seu navegador está bloqueando armazenamento. Use modo normal (não anônimo).');
            return false;
        }
    }

    // ==========================================
    // SALVAMENTO DUPLO (PRINCIPAL + BACKUP)
    // ==========================================

    salvarRondaLocal(forcar = false) {
        if (!this.rondaAtual || !this.hidrometros || this.hidrometros.length === 0) {
            return false;
        }

        const agora = new Date().toISOString();
        const lidos = this.hidrometros.filter(h => h.leituraAtual > 0).length;
        
        const dados = {
            rondaId: this.rondaAtual,
            hidrometros: this.hidrometros,
            locais: this.locais,
            timestamp: agora,
            usuario: this.usuario?.usuario,
            versao: CONFIG.VERSAO,
            saveCount: ++this._saveCount,
            lidos: lidos,
            total: this.hidrometros.length
        };

        try {
            // Salva em múltiplas chaves para redundância
            const dadosString = JSON.stringify(dados);
            
            localStorage.setItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL, dadosString);
            localStorage.setItem(CONFIG.STORAGE_KEYS.BACKUP_RONDA, dadosString);
            localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_SAVE, agora);
            
            this._dadosModificados = false;
            
            if (forcar || this._saveCount % 5 === 0) {
                console.log(`💾 Salvo #${this._saveCount}: ${lidos}/${this.hidrometros.length}`);
            }
            
            return true;
        } catch (e) {
            console.error('❌ Erro ao salvar:', e);
            this.showToast('ERRO: Não foi possível salvar!', 'error');
            return false;
        }
    }

    // ==========================================
    // RESTAURAÇÃO ROBUSTA (TENTA MÚLTIPLAS FONTES)
    // ==========================================

    carregarRondaSalva() {
        let dados = null;
        let fonte = '';

        // Tenta chave principal
        const principal = localStorage.getItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
        if (principal) {
            try {
                dados = JSON.parse(principal);
                fonte = 'principal';
            } catch (e) {
                console.warn('⚠️ Dados principais corrompidos');
            }
        }

        // Se falhou, tenta backup
        if (!dados) {
            const backup = localStorage.getItem(CONFIG.STORAGE_KEYS.BACKUP_RONDA);
            if (backup) {
                try {
                    dados = JSON.parse(backup);
                    fonte = 'backup';
                    console.log('✅ Recuperado do backup!');
                } catch (e) {
                    console.warn('⚠️ Backup também corrompido');
                }
            }
        }

        if (dados && dados.rondaId && Array.isArray(dados.hidrometros)) {
            console.log(`📦 Ronda ${dados.rondaId} carregada de ${fonte}`);
            return dados;
        }

        return null;
    }

    // ==========================================
    // SESSÃO E INICIALIZAÇÃO
    // ==========================================

    restaurarSessao() {
        console.log('🔍 Iniciando restauração...');

        // 1. Verifica usuário
        const usuarioSalvo = localStorage.getItem(CONFIG.STORAGE_KEYS.USUARIO);
        
        if (!usuarioSalvo) {
            console.log('❌ Sem usuário');
            this.showScreen('loginScreen');
            return;
        }

        try {
            this.usuario = JSON.parse(usuarioSalvo);
            console.log('✅ Usuário:', this.usuario.nome);
            
            this.showHeader();
            
            const loginScreen = document.getElementById('loginScreen');
            if (loginScreen) loginScreen.classList.remove('active');

            // 2. Verifica ronda (tenta múltiplas fontes)
            const ronda = this.carregarRondaSalva();
            
            if (ronda && this.usuario.nivel !== 'admin') {
                // Restaura estado
                this.hidrometros = ronda.hidrometros;
                this.rondaAtual = ronda.rondaId;
                this.locais = ronda.locais || [...new Set(this.hidrometros.map(h => h.local))];
                
                console.log(`📊 Ronda: ${this.hidrometros.filter(h => h.leituraAtual > 0).length}/${this.hidrometros.length} lidos`);
                
                // VAI DIRETO PARA LEITURA
                this.entrarModoLeitura();
                return;
            }

            // 3. Sem ronda - tela inicial
            if (this.usuario.nivel === 'admin') {
                this.showScreen('adminScreen');
            } else {
                this.showScreen('startScreen');
                const nomeEl = document.getElementById('nomeTecnico');
                if (nomeEl) nomeEl.textContent = this.usuario.nome;
            }

        } catch (e) {
            console.error('❌ Erro:', e);
            this.logout();
        }
    }

    entrarModoLeitura() {
        console.log('🎯 Entrando modo leitura...');
        
        // Mostra tela
        this.showScreen('leituraScreen');
        
        // Mostra barra
        const bottomBar = document.getElementById('bottomBar');
        if (bottomBar) bottomBar.style.display = 'block';
        
        // Preenche select
        this.preencherSelectLocais();
        
        // Seleciona local
        if (this.locais.length > 0) {
            const select = document.getElementById('localSelect');
            if (select) {
                select.value = this.locais[0];
                this.renderizarLocal(this.locais[0]);
            }
        }
        
        // Restaura dados com delay para garantir DOM pronto
        setTimeout(() => {
            this.restaurarDadosNosCards();
            this.atualizarBarraProgresso();
        }, 100);
    }

    // ==========================================
    // RENDERIZAÇÃO
    // ==========================================

    preencherSelectLocais() {
        const select = document.getElementById('localSelect');
        if (!select) return;

        select.innerHTML = '<option value="">Escolha um local...</option>';
        
        this.locais.forEach(local => {
            const hidros = this.hidrometros.filter(h => h.local === local);
            const completos = hidros.filter(h => this.isCompleto(h)).length;
            const pendentes = hidros.length - completos;
            
            const opt = document.createElement('option');
            opt.value = local;
            opt.textContent = `${local} ${pendentes > 0 ? `(${pendentes} pend.)` : '✓'}`;
            select.appendChild(opt);
        });
    }

    renderizarLocal(local) {
        const container = document.getElementById('hidrometrosContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        const hidros = this.hidrometros.filter(h => h.local === local);
        
        // Ordena: pendentes primeiro
        hidros.sort((a, b) => {
            const aComp = this.isCompleto(a);
            const bComp = this.isCompleto(b);
            return aComp === bComp ? 0 : aComp ? 1 : -1;
        });
        
        hidros.forEach((h, i) => {
            container.appendChild(this.criarCard(h, i));
        });

        // Restaura dados após criar cards
        requestAnimationFrame(() => this.restaurarDadosNosCards());
        this.atualizarBarraProgresso();
    }

    criarCard(h, idx) {
        const div = document.createElement('div');
        const completo = this.isCompleto(h);
        
        div.className = `hidrometro-card ${completo ? 'completo' : 'pendente'}`;
        div.id = `card-${h.id}`;
        
        div.innerHTML = `
            <div class="hidrometro-header">
                <span class="hidrometro-tipo">🔧 ${h.tipo || 'Hidrômetro'}</span>
                <span class="status-badge ${completo ? 'completo' : 'pendente'}" id="badge-${h.id}">
                    ${completo ? '✓' : '⏳'}
                </span>
            </div>
            <div class="leitura-anterior">
                Anterior: <strong>${parseFloat(h.leituraAnterior).toFixed(2)}</strong>
            </div>
            <input type="number" step="0.01" class="input-field" id="input-${h.id}"
                   value="${h.leituraAtual || ''}" placeholder="Digite a leitura">
            <div class="consumo-info" id="consumo-${h.id}">-</div>
            <div id="alerta-${h.id}" class="alerta-variacao"></div>
            <div id="justificativa-${h.id}" class="justificativa">
                <textarea id="txt-${h.id}" placeholder="Justificativa..." rows="2">${h.justificativa || ''}</textarea>
            </div>
            <div class="foto-section">
                <label class="foto-btn ${h.foto ? 'tem-foto' : ''}" id="btn-foto-${h.id}">
                    <input type="file" accept="image/*" capture="environment" style="display:none" id="file-${h.id}">
                    <span id="txt-foto-${h.id}">${h.foto ? '✓ Foto' : '📷 Foto'}</span>
                </label>
                <img id="preview-${h.id}" class="foto-preview ${h.foto ? 'show' : ''}" src="${h.foto || ''}">
            </div>
        `;

        // Eventos
        const input = div.querySelector(`#input-${h.id}`);
        const file = div.querySelector(`#file-${h.id}`);
        const txt = div.querySelector(`#txt-${h.id}`);

        input.addEventListener('input', (e) => this.onInputChange(h.id, e.target.value));
        input.addEventListener('blur', () => this.salvarRondaLocal(true));
        
        file.addEventListener('change', (e) => this.onFotoChange(h.id, e.target));
        
        txt.addEventListener('input', (e) => this.onJustificativaChange(h.id, e.target.value));
        txt.addEventListener('blur', () => this.salvarRondaLocal(true));

        return div;
    }

    restaurarDadosNosCards() {
        let count = 0;
        
        this.hidrometros.forEach(h => {
            // Input
            const input = document.getElementById(`input-${h.id}`);
            if (input && h.leituraAtual > 0) {
                input.value = h.leituraAtual;
                count++;
            }

            // Foto
            if (h.foto) {
                const preview = document.getElementById(`preview-${h.id}`);
                const btn = document.getElementById(`btn-foto-${h.id}`);
                const txt = document.getElementById(`txt-foto-${h.id}`);
                
                if (preview) {
                    preview.src = h.foto;
                    preview.classList.add('show');
                }
                if (btn) btn.classList.add('tem-foto');
                if (txt) txt.textContent = '✓ Foto';
            }

            // Justificativa
            if (h.justificativa) {
                const txt = document.getElementById(`txt-${h.id}`);
                if (txt) txt.value = h.justificativa;
            }

            // Atualiza UI
            this.atualizarCard(h.id);
        });

        if (count > 0) {
            console.log(`✅ ${count} valores restaurados`);
        }
    }

    // ==========================================
    // LÓGICA DE NEGÓCIO
    // ==========================================

    onInputChange(id, valor) {
        const h = this.hidrometros.find(x => x.id === id);
        if (!h) return;

        const novo = parseFloat(valor) || 0;
        if (h.leituraAtual === novo) return;

        h.leituraAtual = novo;
        this._dadosModificados = true;

        this.atualizarCard(id);
        this.atualizarBarraProgresso();
        
        // Salva imediatamente em caso de F5 rápido
        if (this._saveCount % 3 === 0) {
            this.salvarRondaLocal();
        }
    }

    onJustificativaChange(id, valor) {
        const h = this.hidrometros.find(x => x.id === id);
        if (h) {
            h.justificativa = valor.trim();
            this._dadosModificados = true;
            this.atualizarCard(id);
            this.atualizarBarraProgresso();
        }
    }

    async onFotoChange(id, input) {
        const file = input.files[0];
        if (!file) return;

        this.showLoading('Processando...');
        
        try {
            const comprimida = await this.comprimirImagem(file);
            const h = this.hidrometros.find(x => x.id === id);
            
            if (h) {
                h.foto = comprimida;
                this._dadosModificados = true;
                
                const preview = document.getElementById(`preview-${id}`);
                const btn = document.getElementById(`btn-foto-${id}`);
                const txt = document.getElementById(`txt-foto-${id}`);
                
                if (preview) {
                    preview.src = comprimida;
                    preview.classList.add('show');
                }
                if (btn) btn.classList.add('tem-foto');
                if (txt) txt.textContent = '✓ Foto';
                
                this.salvarRondaLocal(true);
                this.atualizarBarraProgresso();
            }
        } catch (err) {
            console.error('Erro foto:', err);
        } finally {
            this.hideLoading();
        }
    }

    atualizarCard(id) {
        const h = this.hidrometros.find(x => x.id === id);
        if (!h) return;

        const consumo = h.leituraAtual - h.leituraAnterior;
        const precisaJust = this.precisaJustificativa(h, consumo);
        
        const input = document.getElementById(`input-${id}`);
        const consumoDiv = document.getElementById(`consumo-${id}`);
        const alerta = document.getElementById(`alerta-${id}`);
        const justDiv = document.getElementById(`justificativa-${id}`);
        const card = document.getElementById(`card-${id}`);
        const badge = document.getElementById(`badge-${id}`);

        // Estilo input
        if (input) {
            input.classList.remove('erro', 'valido');
            if (precisaJust && !h.justificativa) input.classList.add('erro');
            else if (h.leituraAtual > 0) input.classList.add('valido');
        }

        // Consumo
        if (consumoDiv) {
            consumoDiv.textContent = `Consumo: ${consumo.toFixed(2)} m³`;
        }

        // Alerta
        if (alerta) {
            alerta.className = 'alerta-variacao';
            if (precisaJust) {
                alerta.classList.add('show');
                let msg = '⚠️ Anomalia detectada';
                if (consumo < 0) msg = '❌ Consumo negativo!';
                else if (consumo > 100) msg = '🚨 Vazamento!';
                alerta.textContent = msg;
            }
        }

        // Justificativa
        if (justDiv) {
            justDiv.classList.toggle('show', precisaJust);
        }

        // Card status
        const completo = this.isCompleto(h);
        if (card) {
            card.classList.toggle('completo', completo);
            card.classList.toggle('pendente', !completo);
        }
        if (badge) {
            badge.className = `status-badge ${completo ? 'completo' : 'pendente'}`;
            badge.textContent = completo ? '✓' : '⏳';
        }
    }

    precisaJustificativa(h, consumo) {
        if (consumo < 0) return true;
        if (consumo > 100) return true;
        if (consumo < 0.5 && consumo >= 0) return true;
        
        const media = parseFloat(h.consumoAnterior) || 0;
        if (media > 0) {
            const varia = Math.abs(((consumo - media) / media) * 100);
            return varia > 20;
        }
        
        return false;
    }

    isCompleto(h) {
        if (!h || h.leituraAtual <= 0) return false;
        const consumo = h.leituraAtual - h.leituraAnterior;
        const precisa = this.precisaJustificativa(h, consumo);
        return !precisa || (h.justificativa && h.justificativa.length >= 10);
    }

    atualizarBarraProgresso() {
        if (this._atualizandoProgresso) return;
        this._atualizandoProgresso = true;

        requestAnimationFrame(() => {
            const total = this.hidrometros.length;
            const completos = this.hidrometros.filter(h => this.isCompleto(h)).length;
            const pct = total > 0 ? Math.round((completos / total) * 100) : 0;

            const fill = document.getElementById('progressFill');
            const text = document.getElementById('progressText');
            const label = document.getElementById('progressLabel');
            const btn = document.getElementById('btnFinalizar');

            if (fill) fill.style.width = `${pct}%`;
            if (text) text.textContent = `${completos}/${total}`;
            if (label) label.textContent = `${pct}% concluído`;
            
            if (btn) {
                btn.disabled = completos < total;
                btn.textContent = completos >= total ? '✓ Finalizar' : `⏳ Faltam ${total - completos}`;
            }

            console.log(`📊 Progresso: ${completos}/${total} (${pct}%)`);
            this._atualizandoProgresso = false;
        });
    }

    // ==========================================
    // NAVEGAÇÃO
    // ==========================================

    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('active');
            console.log('📱 Tela:', id);
        }
    }

    showHeader() {
        const h = document.getElementById('mainHeader');
        if (h) h.style.display = 'block';
    }

    // ==========================================
    // AÇÕES
    // ==========================================

    async iniciarLeitura() {
        // Verifica se já tem ronda
        if (this.rondaAtual && this.hidrometros.length > 0) {
            if (!confirm('Já existe uma ronda ativa. Iniciar nova? (Dados antigos serão perdidos)')) {
                return;
            }
            this.limparRonda();
        }

        this.showLoading('Carregando...');
        
        try {
            const resp = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ 
                    action: 'iniciar', 
                    usuario: this.usuario.usuario 
                })
            });
            
            const data = await resp.json();
            if (!data.success) throw new Error(data.message);

            // Inicializa
            this.rondaAtual = data.rondaId;
            this.hidrometros = data.hidrometros.map((h, i) => ({
                ...h,
                id: h.id || `hid-${data.rondaId}-${i}`,
                leituraAtual: 0,
                foto: null,
                justificativa: ''
            }));
            
            this.locais = [...new Set(this.hidrometros.map(h => h.local))];

            this.salvarRondaLocal(true);
            this.hideLoading();
            
            this.entrarModoLeitura();

        } catch (err) {
            this.hideLoading();
            console.error('Erro:', err);
            this.showToast('Erro ao iniciar: ' + err.message, 'error');
        }
    }

    limparRonda() {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.BACKUP_RONDA);
        this.hidrometros = [];
        this.rondaAtual = null;
        this.locais = [];
    }

    voltarInicio() {
        this.salvarRondaLocal(true);
        if (confirm('Sair? Os dados estão salvos.')) {
            this.showScreen('startScreen');
            const bar = document.getElementById('bottomBar');
            if (bar) bar.style.display = 'none';
        }
    }

    async finalizarRonda() {
        const pendentes = this.hidrometros.filter(h => !this.isCompleto(h));
        if (pendentes.length > 0) {
            this.showToast(`Complete ${pendentes.length} hidrômetros primeiro!`, 'error');
            return;
        }

        this.showLoading('Finalizando...');
        
        try {
            const resp = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'finalizar',
                    rondaId: this.rondaAtual,
                    usuario: this.usuario.usuario,
                    dados: this.hidrometros.map(h => ({
                        id: h.id,
                        leitura: h.leituraAtual,
                        foto: h.foto,
                        justificativa: h.justificativa
                    }))
                })
            });

            const result = await resp.json();
            if (!result.success) throw new Error(result.message);

            this.limparRonda();
            this.hideLoading();
            this.showToast('Ronda finalizada!', 'success');
            this.showScreen('startScreen');
            document.getElementById('bottomBar').style.display = 'none';

        } catch (err) {
            this.hideLoading();
            console.error('Erro:', err);
            this.showToast('Erro ao finalizar', 'error');
        }
    }

    // ==========================================
    // LOGIN / LOGOUT
    // ==========================================

    async login(e) {
        e.preventDefault();
        
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value.trim();
        
        if (!user || !pass) {
            this.showToast('Preencha usuário e senha', 'error');
            return;
        }

        this.showLoading('Autenticando...');
        
        try {
            const resp = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'login', usuario: user, senha: pass })
            });
            
            const data = await resp.json();
            if (!data.success) throw new Error(data.message);

            this.usuario = data;
            localStorage.setItem(CONFIG.STORAGE_KEYS.USUARIO, JSON.stringify(data));

            this.hideLoading();
            this.showHeader();
            document.getElementById('loginScreen').classList.remove('active');

            // Verifica ronda pendente
            const ronda = this.carregarRondaSalva();
            if (ronda && data.nivel !== 'admin') {
                if (confirm(`Continuar ronda com ${ronda.hidrometros.filter(h => h.leituraAtual > 0).length} leituras?`)) {
                    this.hidrometros = ronda.hidrometros;
                    this.rondaAtual = ronda.rondaId;
                    this.locais = ronda.locais || [...new Set(this.hidrometros.map(h => h.local))];
                    this.entrarModoLeitura();
                    return;
                } else {
                    this.limparRonda();
                }
            }

            if (data.nivel === 'admin') {
                this.showScreen('adminScreen');
            } else {
                this.showScreen('startScreen');
                const nomeEl = document.getElementById('nomeTecnico');
                if (nomeEl) nomeEl.textContent = data.nome;
            }

        } catch (err) {
            this.hideLoading();
            this.showToast(err.message, 'error');
        }
    }

    logout() {
        console.log('Logout...');
        this.limparRonda();
        localStorage.removeItem(CONFIG.STORAGE_KEYS.USUARIO);
        this.usuario = null;
        location.reload();
    }

    // ==========================================
    // UTILITÁRIOS
    // ==========================================

    iniciarAutoSave() {
        // Salva a cada 2 segundos se houver mudanças
        setInterval(() => {
            if (this._dadosModificados) {
                this.salvarRondaLocal();
            }
        }, CONFIG.AUTOSAVE_INTERVAL);
        
        // Salva ao sair da página
        window.addEventListener('beforeunload', () => {
            if (this._dadosModificados) {
                this.salvarRondaLocal(true);
            }
        });
        
        // Salva quando a aba fica inativa (usuário muda de aba)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this._dadosModificados) {
                this.salvarRondaLocal(true);
            }
        });
    }

    async comprimirImagem(file, maxW = 1200, q = 0.7) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;
                    if (w > maxW) { h = (h * maxW) / w; w = maxW; }
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', q));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    showLoading(msg) {
        let el = document.getElementById('loadingOverlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'loadingOverlay';
            el.className = 'loading-overlay';
            el.innerHTML = `<div class="loading-content"><div class="spinner"></div><p>${msg}</p></div>`;
            document.body.appendChild(el);
        }
        el.style.display = 'flex';
    }

    hideLoading() {
        const el = document.getElementById('loadingOverlay');
        if (el) el.style.display = 'none';
    }

    showToast(msg, type = 'info') {
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('show'), 10);
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
    }

    setupEventListeners() {
        // Login
        const loginForm = document.getElementById('loginForm');
        if (loginForm) loginForm.addEventListener('submit', (e) => this.login(e));

        // Toggle senha
        const toggle = document.getElementById('togglePassword');
        if (toggle) toggle.addEventListener('click', () => this.togglePassword());

        // Logout
        const logout = document.getElementById('btnLogout');
        if (logout) logout.addEventListener('click', () => this.logout());

        // Iniciar
        const iniciar = document.getElementById('btnIniciar');
        if (iniciar) iniciar.addEventListener('click', () => this.iniciarLeitura());

        // Select local
        const select = document.getElementById('localSelect');
        if (select) {
            select.removeAttribute('onchange');
            select.addEventListener('change', (e) => {
                if (e.target.value) this.renderizarLocal(e.target.value);
            });
        }

        // Finalizar
        const finalizar = document.getElementById('btnFinalizar');
        if (finalizar) finalizar.addEventListener('click', () => this.finalizarRonda());

        // Voltar
        const voltar = document.getElementById('btnVoltar');
        if (voltar) voltar.addEventListener('click', () => this.voltarInicio());
    }

    togglePassword() {
        const input = document.getElementById('password');
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
    }
}

// Inicialização
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new HidrometroApp();
});
