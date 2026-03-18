/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.5.3
 * JavaScript Completo - Offline First, Dashboard Admin, PWA
 * Correções: Persistência robusta, recuperação garantida, auto-save
 */
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbztb2Zp6RTJKfzlDrOIN1zAyWl0Tz9PSmotNKUk4qKPX0JbOtT0mcytauJIuiAiWW9l/exec',
    VERSAO: '2.5.3',
    STORAGE_KEYS: {
        USUARIO: 'h2_usuario',
        LEITURAS_PENDENTES: 'h2_pendentes',
        RONDA_ATUAL: 'h2_ronda',
        CACHE_DASHBOARD: 'h2_dashboard'
    },
    AUTOSAVE_INTERVAL: 3000 // 3 segundos
};

class HidrometroApp {
    constructor() {
        this.usuario = null;
        this.hidrometros = [];
        this.locais = [];
        this.rondaAtual = null;
        this.paginaAtual = 1;
        this.itensPorPagina = 20;
        this.charts = {};
        this._atualizandoProgresso = false;
        this._dadosModificados = false;
        this._intervaloSalvamento = null;
        this._salvamentoPendente = false;

        console.log(`🚀 Sistema de Hidrômetros v${CONFIG.VERSAO} carregado com sucesso!`);
        this.init();
    }

    init() {
        this.checkAuth();
        this.setupEventListeners();
        this.setupServiceWorker();
        this.iniciarAutoSave();
    }

    // ==========================================
    // AUTENTICAÇÃO E SESSÃO
    // ==========================================

    checkAuth() {
        const salvo = localStorage.getItem(CONFIG.STORAGE_KEYS.USUARIO);
        if (salvo) {
            try {
                this.usuario = JSON.parse(salvo);
                this.showHeader();
                document.getElementById('loginScreen').classList.remove('active');
                if (this.usuario.nivel === 'admin') {
                    this.showAdminInterface();
                } else {
                    this.showScreen('startScreen');
                    this.checkPendentes();
                    // Tenta recuperar ronda existente primeiro
                    if (!this.tentarRecuperarRonda()) {
                        this.resumeRondaIfExists();
                    }
                }
            } catch (e) {
                console.error('Erro ao restaurar sessão:', e);
                this.logout();
            }
        } else {
            this.showScreen('loginScreen');
        }
    }

    async login(e) {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        if (!username || !password) {
            this.showError('Preencha usuário e senha');
            return;
        }

        this.showLoading('Autenticando...');
        
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
            localStorage.setItem(CONFIG.STORAGE_KEYS.USUARIO, JSON.stringify(data));

            this.hideLoading();
            this.showHeader();
            document.getElementById('loginScreen').classList.remove('active');

            if (data.nivel === 'admin') {
                this.showAdminInterface();
            } else {
                this.showScreen('startScreen');
                document.getElementById('nomeTecnico').textContent = data.nome;
                this.checkPendentes();
                this.resumeRondaIfExists();
            }
        } catch (err) {
            this.hideLoading();
            this.showError(err.message);
        }
    }

    logout() {
        this.pararAutoSave();
        localStorage.removeItem(CONFIG.STORAGE_KEYS.USUARIO);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
        this.usuario = null;
        this.hidrometros = [];
        this.rondaAtual = null;
        location.reload();
    }

    togglePassword() {
        const input = document.getElementById('password');
        input.type = input.type === 'password' ? 'text' : 'password';
    }

    // ==========================================
    // RECUPERAÇÃO DE RONDA (CRÍTICO - CORRIGIDO)
    // ==========================================

    tentarRecuperarRonda() {
        const rondaSalva = localStorage.getItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
        if (!rondaSalva) return false;

        try {
            const ronda = JSON.parse(rondaSalva);
            if (!ronda.hidrometros || ronda.hidrometros.length === 0) {
                localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
                return false;
            }
            return true;
        } catch (e) {
            localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
            return false;
        }
    }

    resumeRondaIfExists() {
        const rondaSalva = localStorage.getItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
        if (!rondaSalva || !this.usuario || this.usuario.nivel === 'admin') {
            console.log('Nenhuma ronda para recuperar');
            return;
        }

        try {
            const ronda = JSON.parse(rondaSalva);
            
            // Valida estrutura dos dados
            if (!ronda.rondaId || !Array.isArray(ronda.hidrometros)) {
                throw new Error('Estrutura de ronda inválida');
            }

            this.hidrometros = ronda.hidrometros;
            this.rondaAtual = ronda.rondaId;
            this.locais = [...new Set(this.hidrometros.map(h => h.local))];

            console.log(`✅ Recuperando ronda ${this.rondaAtual} com ${this.hidrometros.length} hidrômetros`);

            // Conta leituras já realizadas
            const lidos = this.hidrometros.filter(h => h.leituraAtual > 0).length;
            console.log(`📊 Leituras já salvas: ${lidos}/${this.hidrometros.length}`);

            this.showScreen('leituraScreen');
            document.getElementById('bottomBar').style.display = 'block';

            this.preencherSelectLocais();
            
            // Seleciona primeiro local com pendências ou o primeiro disponível
            const localInicial = this.locais.find(loc => {
                const pendentes = this.hidrometros.filter(h => h.local === loc && !this.isCompleto(h));
                return pendentes.length > 0;
            }) || this.locais[0];

            if (localInicial) {
                document.getElementById('localSelect').value = localInicial;
                this.mostrarHidrometrosDoLocal(localInicial);
                
                // Aguarda DOM renderizar completamente
                setTimeout(() => this.restaurarTodosOsDados(), 200);
            }

            this.showToast(`Ronda recuperada (${lidos} de ${this.hidrometros.length} lidos)`, 'success');
            
        } catch (e) {
            console.error('❌ Erro ao recuperar ronda:', e);
            localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
            this.showToast('Erro ao recuperar ronda anterior', 'error');
        }
    }

    restaurarTodosOsDados() {
        console.log('🔄 Restaurando dados nos inputs...');
        let restaurados = 0;
        let comFoto = 0;
        let comJustificativa = 0;

        this.hidrometros.forEach(h => {
            // Restaura leitura
            const input = document.getElementById(`input-${h.id}`);
            if (input && h.leituraAtual > 0) {
                input.value = h.leituraAtual;
                restaurados++;
            }

            // Restaura foto
            if (h.foto) {
                const preview = document.getElementById(`preview-${h.id}`);
                const btnText = document.getElementById(`txt-foto-${h.id}`);
                const btn = document.getElementById(`btn-foto-${h.id}`);
                
                if (preview) {
                    preview.src = h.foto;
                    preview.classList.add('show');
                }
                if (btnText) btnText.textContent = '✓ Foto adicionada';
                if (btn) btn.classList.add('tem-foto');
                comFoto++;
            }

            // Restaura justificativa
            if (h.justificativa) {
                const txt = document.getElementById(`txt-${h.id}`);
                if (txt) {
                    txt.value = h.justificativa;
                    comJustificativa++;
                }
            }

            // Atualiza UI do card
            this.atualizarUIHidrometro(h.id);
        });

        this.atualizarProgresso();
        this.preencherSelectLocais(); // Atualiza contadores

        console.log(`✅ Restauração completa: ${restaurados} leituras, ${comFoto} fotos, ${comJustificativa} justificativas`);
    }

    // ==========================================
    // INICIALIZAÇÃO DE LEITURA
    // ==========================================

    async iniciarLeitura() {
        this.showLoading('Carregando hidrômetros...');
        
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'iniciar', usuario: this.usuario.usuario })
            });
            
            const data = await response.json();

            if (!data.success) throw new Error(data.message);

            // Verifica se já existe ronda em andamento para este ID
            const rondaSalva = localStorage.getItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
            let usarDadosSalvos = false;

            if (rondaSalva) {
                try {
                    const ronda = JSON.parse(rondaSalva);
                    if (ronda.rondaId === data.rondaId && ronda.hidrometros.length > 0) {
                        const confirmar = confirm(
                            `Existe uma ronda em andamento com ${ronda.hidrometros.filter(h => h.leituraAtual > 0).length} leituras já realizadas.\n\nDeseja continuar de onde parou?`
                        );
                        
                        if (confirmar) {
                            this.hidrometros = ronda.hidrometros;
                            usarDadosSalvos = true;
                        }
                    }
                } catch (e) {
                    console.error('Erro ao verificar ronda salva:', e);
                }
            }

            if (!usarDadosSalvos) {
                this.hidrometros = this.inicializarHidrometros(data.hidrometros, data.rondaId);
            }

            this.rondaAtual = data.rondaId;
            this.locais = [...new Set(this.hidrometros.map(h => h.local))];

            this.salvarRondaLocal();
            this.hideLoading();

            this.showScreen('leituraScreen');
            document.getElementById('bottomBar').style.display = 'block';

            this.preencherSelectLocais();
            
            const primeiroLocal = this.locais[0] || '';
            if (primeiroLocal) {
                document.getElementById('localSelect').value = primeiroLocal;
                this.mostrarHidrometrosDoLocal(primeiroLocal);
            }

        } catch (err) {
            console.error('Erro ao iniciar leitura:', err);
            this.hideLoading();
            this.showToast(err.message, 'error');
        }
    }

    inicializarHidrometros(dados, rondaId) {
        // Tenta recuperar dados salvos da mesma ronda
        const rondaSalva = localStorage.getItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
        let mapaDadosSalvos = new Map();

        if (rondaSalva) {
            try {
                const ronda = JSON.parse(rondaSalva);
                if (ronda.rondaId === rondaId && ronda.hidrometros) {
                    ronda.hidrometros.forEach(h => {
                        if (h.leituraAtual > 0 || h.foto || h.justificativa) {
                            mapaDadosSalvos.set(h.id, {
                                leituraAtual: h.leituraAtual,
                                foto: h.foto,
                                justificativa: h.justificativa
                            });
                        }
                    });
                    console.log(`Preservando ${mapaDadosSalvos.size} registros com dados`);
                }
            } catch (e) {
                console.error('Erro ao preservar dados:', e);
            }
        }

        return dados.map((h, index) => {
            const id = h.id || `hid-${rondaId}-${index}`;
            const salvo = mapaDadosSalvos.get(id) || {};

            return {
                ...h,
                id: id,
                leituraAtual: salvo.leituraAtual || 0,
                foto: salvo.foto || null,
                justificativa: salvo.justificativa || '',
                variacao: 0,
                sincronizado: false
            };
        });
    }

    // ==========================================
    // PERSISTÊNCIA (CORRIGIDA E REFORÇADA)
    // ==========================================

    salvarRondaLocal() {
        if (!this.rondaAtual || !this.hidrometros || this.hidrometros.length === 0) {
            return;
        }

        const dados = {
            rondaId: this.rondaAtual,
            hidrometros: this.hidrometros,
            timestamp: new Date().toISOString(),
            usuario: this.usuario?.usuario,
            versao: CONFIG.VERSAO
        };

        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL, JSON.stringify(dados));
            this._salvamentoPendente = false;
            console.log('💾 Ronda salva:', new Date().toLocaleTimeString(), `(${this.hidrometros.filter(h => h.leituraAtual > 0).length} lidos)`);
        } catch (e) {
            console.error('❌ Erro ao salvar no localStorage:', e);
            if (e.name === 'QuotaExceededError') {
                this.showToast('Armazenamento cheio! Sincronize os dados.', 'error');
            }
        }
    }

    iniciarAutoSave() {
        this._intervaloSalvamento = setInterval(() => {
            if (this._dadosModificados && this.rondaAtual) {
                this.salvarRondaLocal();
                this._dadosModificados = false;
            }
        }, CONFIG.AUTOSAVE_INTERVAL);
        
        // Salva também antes de fechar a página
        window.addEventListener('beforeunload', () => {
            if (this._dadosModificados) {
                this.salvarRondaLocal();
            }
        });
    }

    pararAutoSave() {
        if (this._intervaloSalvamento) {
            clearInterval(this._intervaloSalvamento);
            this._intervaloSalvamento = null;
        }
    }

    marcarModificado() {
        this._dadosModificados = true;
        this._salvamentoPendente = true;
    }

    // ==========================================
    // INTERFACE E RENDERIZAÇÃO
    // ==========================================

    preencherSelectLocais() {
        const select = document.getElementById('localSelect');
        const valorAtual = select.value;

        select.innerHTML = '<option value="">Escolha um local...</option>';
        
        this.locais.forEach(local => {
            const total = this.hidrometros.filter(h => h.local === local).length;
            const completos = this.hidrometros.filter(h => h.local === local && this.isCompleto(h)).length;
            const pendentes = total - completos;
            
            const opt = document.createElement('option');
            opt.value = local;
            opt.textContent = `${local} ${pendentes > 0 ? `(${pendentes} pend.)` : '✓ Completo'}`;
            
            // Destaca locais completos
            if (pendentes === 0) {
                opt.style.color = '#10b981';
            }
            
            select.appendChild(opt);
        });

        // Restaura seleção anterior se ainda válida
        if (valorAtual && this.locais.includes(valorAtual)) {
            select.value = valorAtual;
        }
    }

    mostrarHidrometrosDoLocal(local) {
        const container = document.getElementById('hidrometrosContainer');
        container.innerHTML = '';
        
        if (!local) return;

        const hidrometrosLocal = this.hidrometros.filter(h => h.local === local);
        
        // Ordena: pendentes primeiro, depois por ID
        hidrometrosLocal.sort((a, b) => {
            const aCompleto = this.isCompleto(a);
            const bCompleto = this.isCompleto(b);
            if (aCompleto !== bCompleto) return aCompleto ? 1 : -1;
            return a.id.localeCompare(b.id);
        });
        
        hidrometrosLocal.forEach((h, idx) => {
            const card = this.criarCardHidrometro(h, idx);
            container.appendChild(card);
        });

        // Preenche dados após renderização
        requestAnimationFrame(() => {
            this.restaurarDadosVisiveis();
        });

        this.atualizarProgresso();
    }

    restaurarDadosVisiveis() {
        // Apenas para cards visíveis (performance)
        const container = document.getElementById('hidrometrosContainer');
        if (!container) return;

        this.hidrometros.forEach(h => {
            const card = document.getElementById(`card-${h.id}`);
            if (!card) return;

            if (h.leituraAtual > 0) {
                const input = document.getElementById(`input-${h.id}`);
                if (input) input.value = h.leituraAtual;
            }

            if (h.foto) {
                const preview = document.getElementById(`preview-${h.id}`);
                const btnText = document.getElementById(`txt-foto-${h.id}`);
                if (preview) {
                    preview.src = h.foto;
                    preview.classList.add('show');
                }
                if (btnText) btnText.textContent = '✓ Foto adicionada';
            }

            if (h.justificativa) {
                const txt = document.getElementById(`txt-${h.id}`);
                if (txt) txt.value = h.justificativa;
            }

            this.atualizarUIHidrometro(h.id);
        });
    }

    criarCardHidrometro(h, idx) {
        const div = document.createElement('div');
        const completo = this.isCompleto(h);
        
        div.className = `hidrometro-card ${completo ? 'completo' : 'pendente'}`;
        div.id = `card-${h.id}`;
        
        div.innerHTML = `
            <div class="hidrometro-header">
                <div class="hidrometro-tipo">
                    🔧 ${h.tipo || 'Hidrômetro'} #${h.id.split('-').pop()}
                </div>
                <span class="status-badge ${completo ? 'completo' : 'pendente'}" id="badge-${h.id}">
                    ${completo ? '✓ Completo' : '⏳ Pendente'}
                </span>
            </div>
            <div class="leitura-anterior">
                <span>📊 Leitura anterior:</span>
                <strong>${parseFloat(h.leituraAnterior).toFixed(2)} m³</strong>
            </div>
            <div class="input-group">
                <input type="number"
                       step="0.01"
                       class="input-field ${h.leituraAtual > 0 ? 'valido' : ''}"
                       id="input-${h.id}"
                       value="${h.leituraAtual > 0 ? h.leituraAtual : ''}"
                       placeholder="Digite a leitura atual"
                       inputmode="decimal"
                       autocomplete="off">
            </div>
            <div class="consumo-info" id="consumo-${h.id}">
                <span>Consumo: <strong>-</strong></span>
                <span>Variação: <strong>-</strong></span>
            </div>
            <div id="alerta-${h.id}" class="alerta-variacao"></div>
            <div id="justificativa-${h.id}" class="justificativa ${this.verificarNecessidadeJustificativa(h, h.leituraAtual - h.leituraAnterior) ? 'show' : ''}">
                <textarea id="txt-${h.id}"
                          class="${h.justificativa ? 'valido' : ''}"
                          placeholder="Descreva o motivo da anomalia (mínimo 10 caracteres)..."
                          rows="2">${h.justificativa || ''}</textarea>
            </div>
            <div class="foto-section">
                <label class="foto-btn ${h.foto ? 'tem-foto' : ''}" id="btn-foto-${h.id}">
                    <input type="file"
                           accept="image/*"
                           capture="environment"
                           style="display:none;"
                           id="file-${h.id}">
                    <span id="txt-foto-${h.id}">
                        ${h.foto ? '✓ Foto adicionada' : '📷 Tirar foto da leitura'}
                    </span>
                </label>
                <img id="preview-${h.id}" class="foto-preview ${h.foto ? 'show' : ''}" 
                     src="${h.foto || ''}" 
                     onclick="app.ampliarFoto('${h.id}')">
            </div>
        `;

        // Event listeners diretos (mais confiáveis que inline)
        const input = div.querySelector(`#input-${h.id}`);
        const fileInput = div.querySelector(`#file-${h.id}`);
        const textarea = div.querySelector(`#txt-${h.id}`);

        input.addEventListener('input', (e) => this.atualizarLeitura(h.id, e.target.value));
        input.addEventListener('blur', () => this.salvarRondaLocal()); // Salva ao sair do campo
        
        fileInput.addEventListener('change', (e) => this.capturarFoto(h.id, e.target));
        
        textarea.addEventListener('input', (e) => this.atualizarJustificativa(h.id, e.target.value));
        textarea.addEventListener('blur', () => this.salvarRondaLocal());

        return div;
    }

    // ==========================================
    // LÓGICA DE LEITURA
    // ==========================================

    atualizarLeitura(id, valor) {
        const h = this.hidrometros.find(x => x.id === id);
        if (!h) return;

        const novoValor = parseFloat(valor) || 0;
        
        // Evita processamento desnecessário
        if (h.leituraAtual === novoValor && novoValor === 0) return;

        h.leituraAtual = novoValor;
        this.marcarModificado();

        const consumoDia = novoValor - h.leituraAnterior;
        const precisaJust = this.verificarNecessidadeJustificativa(h, consumoDia);

        this.atualizarUIHidrometro(id);
        this.atualizarProgresso();

        // Feedback tátil para anomalias
        if (navigator.vibrate && precisaJust && !h.justificativa) {
            navigator.vibrate(50);
        }
    }

    verificarNecessidadeJustificativa(h, consumoDia) {
        if (consumoDia < 0) return true;
        
        const consumoAnterior = parseFloat(h.consumoAnterior) || 0;
        if (consumoAnterior > 0 && consumoDia > 0) {
            const variacao = ((consumoDia - consumoAnterior) / consumoAnterior) * 100;
            h.variacao = variacao;
            
            if (Math.abs(variacao) > 20 || consumoDia <= 0.5 || variacao > 100) {
                return true;
            }
        } else if (consumoDia <= 0.5 && consumoDia >= 0) {
            return true;
        }
        
        return false;
    }

    atualizarUIHidrometro(id) {
        const h = this.hidrometros.find(x => x.id === id);
        if (!h) return;

        const consumoDia = h.leituraAtual - h.leituraAnterior;
        const precisaJust = this.verificarNecessidadeJustificativa(h, consumoDia);
        
        const input = document.getElementById(`input-${id}`);
        const justDiv = document.getElementById(`justificativa-${id}`);
        const alertaDiv = document.getElementById(`alerta-${id}`);
        const consumoDiv = document.getElementById(`consumo-${id}`);
        const card = document.getElementById(`card-${id}`);
        const badge = document.getElementById(`badge-${id}`);

        // Estilos do input
        if (input) {
            input.classList.remove('erro', 'valido');
            if (precisaJust && !h.justificativa) {
                input.classList.add('erro');
            } else if (h.leituraAtual > 0) {
                input.classList.add('valido');
            }
        }

        // Alertas
        if (alertaDiv) {
            alertaDiv.className = 'alerta-variacao';
            alertaDiv.innerHTML = '';
            
            if (precisaJust) {
                alertaDiv.classList.add('show');
                let msg = '', classe = 'warning';
                
                if (consumoDia < 0) {
                    msg = '⚠️ Consumo negativo detectado!';
                    classe = 'danger';
                } else if (h.variacao > 100) {
                    msg = `🚨 VAZAMENTO! Consumo +${h.variacao.toFixed(1)}% acima do normal!`;
                    classe = 'vazamento';
                } else if (h.variacao > 20) {
                    msg = `⚠️ Consumo +${h.variacao.toFixed(1)}% maior que a média`;
                } else if (h.variacao < -20) {
                    msg = `⚠️ Consumo ${Math.abs(h.variacao).toFixed(1)}% menor que a média`;
                    classe = 'danger';
                } else if (consumoDia <= 0.5) {
                    msg = '⚠️ Consumo muito baixo - verifique o medidor';
                    classe = 'danger';
                }
                
                alertaDiv.classList.add(classe);
                alertaDiv.innerHTML = `<span>${msg}</span>`;
            }
        }

        // Justificativa
        if (justDiv) {
            justDiv.classList.toggle('show', precisaJust);
            const txt = document.getElementById(`txt-${id}`);
            if (txt) {
                txt.classList.toggle('valido', h.justificativa && h.justificativa.length >= 10);
            }
        }

        // Consumo
        if (consumoDiv) {
            const variacaoText = h.variacao ? `${h.variacao > 0 ? '+' : ''}${h.variacao.toFixed(1)}%` : '-';
            consumoDiv.innerHTML = `
                <span>Consumo: <strong>${consumoDia.toFixed(2)} m³</strong></span>
                <span>Variação: <strong>${variacaoText}</strong></span>
            `;
        }

        // Card e badge
        if (card) {
            const completo = this.isCompleto(h);
            card.classList.toggle('completo', completo);
            card.classList.toggle('pendente', !completo);
            
            if (badge) {
                badge.className = `status-badge ${completo ? 'completo' : 'pendente'}`;
                badge.textContent = completo ? '✓ Completo' : '⏳ Pendente';
            }
        }
    }

    atualizarJustificativa(id, valor) {
        const h = this.hidrometros.find(x => x.id === id);
        if (h) {
            h.justificativa = valor.trim();
            this.marcarModificado();
            this.atualizarUIHidrometro(id);
            this.atualizarProgresso();
        }
    }

    async capturarFoto(id, input) {
        const file = input.files[0];
        if (!file) return;

        this.showLoading('Processando imagem...');
        
        try {
            const comprimida = await this.comprimirImagem(file, 1200, 0.7);
            const h = this.hidrometros.find(x => x.id === id);
            
            if (h) {
                h.foto = comprimida;
                this.marcarModificado();
                
                const preview = document.getElementById(`preview-${id}`);
                const btnText = document.getElementById(`txt-foto-${id}`);
                const btn = document.getElementById(`btn-foto-${id}`);
                
                if (preview) {
                    preview.src = comprimida;
                    preview.classList.add('show');
                }
                if (btnText) btnText.textContent = '✓ Foto adicionada';
                if (btn) btn.classList.add('tem-foto');
                
                this.salvarRondaLocal();
                this.atualizarProgresso();
            }
        } catch (err) {
            console.error('Erro ao processar foto:', err);
            this.showToast('Erro ao processar imagem', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async comprimirImagem(file, maxWidth = 1200, quality = 0.7) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    ampliarFoto(id) {
        const h = this.hidrometros.find(x => x.id === id);
        if (!h || !h.foto) return;

        const modal = document.createElement('div');
        modal.className = 'modal-foto';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <img src="${h.foto}" style="max-width: 100%; border-radius: 8px;">
                <p>${h.tipo} - ${h.local}</p>
            </div>
        `;
        
        modal.querySelector('.close').onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
        document.body.appendChild(modal);
    }

    // ==========================================
    // CONTROLE DE PROGRESSO
    // ==========================================

    isCompleto(h) {
        if (!h) return false;
        
        const consumo = h.leituraAtual - h.leituraAnterior;
        const precisaJust = this.verificarNecessidadeJustificativa(h, consumo);
        
        // Completo se: tem leitura E (não precisa justificativa OU tem justificativa válida)
        return h.leituraAtual > 0 && (!precisaJust || (h.justificativa && h.justificativa.length >= 10));
    }

    atualizarProgresso() {
        if (this._atualizandoProgresso) return;
        this._atualizandoProgresso = true;

        requestAnimationFrame(() => {
            const total = this.hidrometros.length;
            const completos = this.hidrometros.filter(h => this.isCompleto(h)).length;
            const percentual = total > 0 ? Math.round((completos / total) * 100) : 0;

            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');
            const btnFinalizar = document.getElementById('btnFinalizar');

            if (progressFill) progressFill.style.width = `${percentual}%`;
            if (progressText) progressText.textContent = `${completos}/${total} (${percentual}%)`;
            
            if (btnFinalizar) {
                btnFinalizar.disabled = completos < total;
                btnFinalizar.textContent = completos >= total ? '✓ Finalizar Ronda' : `⏳ Faltam ${total - completos}`;
            }

            // Atualiza select também
            this.preencherSelectLocais();

            this._atualizandoProgresso = false;
        });
    }

    // ==========================================
    // NAVEGAÇÃO E UI
    // ==========================================

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');
    }

    showHeader() {
        const header = document.getElementById('mainHeader');
        if (header) header.style.display = 'block';
    }

    showAdminInterface() {
        this.showScreen('adminScreen');
        this.carregarDashboard();
    }

    changeLocal(select) {
        const local = select.value;
        if (local) {
            this.mostrarHidrometrosDoLocal(local);
        }
    }

    voltarParaInicio() {
        if (this._dadosModificados) {
            this.salvarRondaLocal();
        }
        
        const confirmar = confirm('Deseja sair da leitura? Os dados estão salvos e você pode continuar depois.');
        if (confirmar) {
            this.showScreen('startScreen');
            document.getElementById('bottomBar').style.display = 'none';
        }
    }

    // ==========================================
    // SINCRONIZAÇÃO
    // ==========================================

    async finalizarRonda() {
        const pendentes = this.hidrometros.filter(h => !this.isCompleto(h));
        if (pendentes.length > 0) {
            this.showToast(`Ainda faltam ${pendentes.length} hidrômetros`, 'error');
            return;
        }

        this.showLoading('Sincronizando dados...');
        
        try {
            const dados = this.hidrometros.map(h => ({
                id: h.id,
                leitura: h.leituraAtual,
                foto: h.foto,
                justificativa: h.justificativa,
                consumo: h.leituraAtual - h.leituraAnterior
            }));

            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'finalizar',
                    rondaId: this.rondaAtual,
                    usuario: this.usuario.usuario,
                    dados: dados
                })
            });

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message);
            }

            // Limpa dados locais
            localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
            this.hidrometros = [];
            this.rondaAtual = null;
            this._dadosModificados = false;

            this.hideLoading();
            this.showToast('Ronda finalizada com sucesso!', 'success');
            this.showScreen('startScreen');
            document.getElementById('bottomBar').style.display = 'none';

        } catch (err) {
            this.hideLoading();
            console.error('Erro ao finalizar:', err);
            this.showToast('Erro ao sincronizar: ' + err.message, 'error');
            
            // Salva para tentar depois
            this.salvarPendentes();
        }
    }

    salvarPendentes() {
        const pendentes = {
            timestamp: new Date().toISOString(),
            rondaId: this.rondaAtual,
            dados: this.hidrometros
        };
        
        let fila = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEITURAS_PENDENTES) || '[]');
        fila.push(pendentes);
        localStorage.setItem(CONFIG.STORAGE_KEYS.LEITURAS_PENDENTES, JSON.stringify(fila));
    }

    checkPendentes() {
        const pendentes = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LEITURAS_PENDENTES) || '[]');
        if (pendentes.length > 0) {
            const btn = document.getElementById('btnSincronizar');
            if (btn) {
                btn.style.display = 'block';
                btn.textContent = `🔄 ${pendentes.length} ronda(s) pendente(s)`;
            }
        }
    }

    // ==========================================
    // UTILITÁRIOS
    // ==========================================

    showLoading(msg = 'Carregando...') {
        let loader = document.getElementById('loadingOverlay');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'loadingOverlay';
            loader.className = 'loading-overlay';
            loader.innerHTML = `
                <div class="loading-content">
                    <div class="spinner"></div>
                    <p id="loadingText">${msg}</p>
                </div>
            `;
            document.body.appendChild(loader);
        } else {
            document.getElementById('loadingText').textContent = msg;
        }
        loader.style.display = 'flex';
    }

    hideLoading() {
        const loader = document.getElementById('loadingOverlay');
        if (loader) loader.style.display = 'none';
    }

    showError(msg) {
        this.showToast(msg, 'error');
    }

    showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = msg;
        
        const container = document.getElementById('toastContainer') || document.body;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    setupEventListeners() {
        // Login
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.login(e));
        }

        // Botão toggle password
        const toggleBtn = document.getElementById('togglePassword');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.togglePassword());
        }

        // Logout
        const logoutBtn = document.getElementById('btnLogout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

        // Iniciar leitura
        const btnIniciar = document.getElementById('btnIniciar');
        if (btnIniciar) {
            btnIniciar.addEventListener('click', () => this.iniciarLeitura());
        }

        // Change local
        const localSelect = document.getElementById('localSelect');
        if (localSelect) {
            localSelect.addEventListener('change', (e) => this.changeLocal(e.target));
        }

        // Finalizar
        const btnFinalizar = document.getElementById('btnFinalizar');
        if (btnFinalizar) {
            btnFinalizar.addEventListener('click', () => this.finalizarRonda());
        }

        // Voltar
        const btnVoltar = document.getElementById('btnVoltar');
        if (btnVoltar) {
            btnVoltar.addEventListener('click', () => this.voltarParaInicio());
        }
    }

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('SW registrado:', reg.scope))
                .catch(err => console.log('SW erro:', err));
        }
    }

    // Placeholder para métodos admin (implementar conforme necessidade)
    carregarDashboard() {
        console.log('Carregando dashboard admin...');
    }
}

// Inicialização global
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new HidrometroApp();
});
