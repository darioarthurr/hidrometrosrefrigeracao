/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.5.2
 * JavaScript Completo - Offline First, Dashboard Admin, PWA
 * Correção: Recuperação automática ao recarregar com preenchimento garantido dos inputs
 */
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbztb2Zp6RTJKfzlDrOIN1zAyWl0Tz9PSmotNKUk4qKPX0JbOtT0mcytauJIuiAiWW9l/exec',
    VERSAO: '2.5.2',
    STORAGE_KEYS: {
        USUARIO: 'h2_usuario',
        LEITURAS_PENDENTES: 'h2_pendentes',
        RONDA_ATUAL: 'h2_ronda',
        CACHE_DASHBOARD: 'h2_dashboard'
    }
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

        console.log(`🚀 Sistema de Hidrômetros v${CONFIG.VERSAO} carregado com sucesso!`);
        this.init();
    }

    init() {
        this.checkAuth();
        this.setupEventListeners();
        this.setupServiceWorker();
    }

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
                    this.resumeRondaIfExists();
                }
            } catch (e) {
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
        localStorage.removeItem(CONFIG.STORAGE_KEYS.USUARIO);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
        this.usuario = null;
        this.hidrometros = [];
        location.reload();
    }

    togglePassword() {
        const input = document.getElementById('password');
        input.type = input.type === 'password' ? 'text' : 'password';
    }

    resumeRondaIfExists() {
        const rondaSalva = localStorage.getItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
        if (!rondaSalva || !this.usuario || this.usuario.nivel === 'admin') {
            console.log('Nenhuma ronda salva para recuperar');
            return;
        }

        try {
            const ronda = JSON.parse(rondaSalva);
            this.hidrometros = ronda.hidrometros || [];
            this.rondaAtual = ronda.rondaId;
            this.locais = [...new Set(this.hidrometros.map(h => h.local))];

            if (this.hidrometros.length > 0) {
                console.log(`✅ Iniciando recuperação de ${this.hidrometros.length} hidrômetros da ronda ${this.rondaAtual}`);

                this.showScreen('leituraScreen');
                document.getElementById('bottomBar').style.display = 'block';

                this.preencherSelectLocais();
                if (this.locais.length > 0) {
                    this.mostrarHidrometrosDoLocal(this.locais[0]);
                    document.getElementById('localSelect').value = this.locais[0];
                }

                const container = document.getElementById('hidrometrosContainer');
                if (!container) {
                    console.warn('Container não encontrado');
                    return;
                }

                const expectedCards = this.hidrometros.length;

                const fillInputs = () => {
                    let filledCount = 0;
                    this.hidrometros.forEach(h => {
                        const input = document.getElementById(`input-${h.id}`);
                        if (input) {
                            input.value = h.leituraAtual || '';
                            console.log(`Input ${h.id} preenchido com ${h.leituraAtual}`);
                            this.atualizarUIHidrometro(h.id);
                            filledCount++;
                        }
                    });
                    console.log(`Preenchimento final: ${filledCount}/${expectedCards} inputs preenchidos`);
                    this.atualizarProgresso();
                };

                const checkCards = (attempt = 0) => {
                    const currentCards = container.children.length;
                    if (currentCards >= expectedCards) {
                        console.log(`Container tem ${currentCards} cards (esperado ${expectedCards}). Preenchendo agora.`);
                        fillInputs();
                    } else if (attempt < 30) {
                        console.log(`Tentativa ${attempt + 1}: ${currentCards}/${expectedCards} cards encontrados. Aguardando 300ms...`);
                        setTimeout(() => checkCards(attempt + 1), 300);
                    } else {
                        console.warn(`❌ Timeout após 30 tentativas. Forçando preenchimento com o que tem.`);
                        fillInputs();
                    }
                };

                setTimeout(() => checkCards(), 500);

                const observer = new MutationObserver(() => {
                    const currentCards = container.children.length;
                    if (currentCards >= expectedCards) {
                        console.log('MutationObserver detectou todos os cards. Preenchendo.');
                        fillInputs();
                        observer.disconnect();
                    }
                });
                observer.observe(container, { childList: true, subtree: true });

                this.showToast(`Ronda anterior recuperada (${this.hidrometros.length} hidrômetros)`, 'success');
            }
        } catch (e) {
            console.error('Erro ao recuperar ronda:', e);
            localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
        }
    }

    async iniciarLeitura() {
        this.showLoading('Carregando hidrômetros...');
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'iniciar', usuario: this.usuario.usuario })
            });
            const data = await response.json();

            console.log('Dados recebidos do servidor:', data);
            console.log('Hidrometros crus:', data.hidrometros);

            if (!data.success) throw new Error(data.message);

            const rondaSalva = localStorage.getItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
            if (rondaSalva) {
                const ronda = JSON.parse(rondaSalva);
                if (ronda.rondaId === data.rondaId) {
                    this.hidrometros = ronda.hidrometros;
                } else {
                    this.hidrometros = this.inicializarHidrometros(data.hidrometros);
                }
            } else {
                this.hidrometros = this.inicializarHidrometros(data.hidrometros);
            }
            this.rondaAtual = data.rondaId;
            this.locais = [...new Set(this.hidrometros.map(h => h.local))];

            console.log('Locais extraídos:', this.locais);
            console.log('Quantos locais:', this.locais.length);

            this.salvarRondaLocal();
            this.hideLoading();

            this.showScreen('leituraScreen');
            document.getElementById('bottomBar').style.display = 'block';

            this.preencherSelectLocais();
            console.log('Select após preencher:', document.getElementById('localSelect')?.innerHTML);

            this.mostrarHidrometrosDoLocal(this.locais[0] || '');
            if (this.locais.length > 0) {
                document.getElementById('localSelect').value = this.locais[0];
            }
        } catch (err) {
            console.error('Erro ao iniciar leitura:', err);
            this.hideLoading();
            this.showToast(err.message, 'error');
        }
    }

    inicializarHidrometros(dados) {
        return dados.map((h, index) => ({
            ...h,
            id: h.id || `hid-${index}`,
            leituraAtual: 0,
            foto: null,
            justificativa: '',
            variacao: 0,
            sincronizado: false
        }));
    }

    preencherSelectLocais() {
        const select = document.getElementById('localSelect');
        
        let valorSelecionado = select.value;
        if (!valorSelecionado && select.selectedIndex > -1) {
            const textoAtual = select.options[select.selectedIndex].text || '';
            valorSelecionado = this.locais.find(loc => textoAtual.includes(loc)) || this.locais[0] || '';
        }

        select.innerHTML = '<option value="">Escolha um local...</option>';
        
        this.locais.forEach(local => {
            const count = this.hidrometros.filter(h => h.local === local && !this.isCompleto(h)).length;
            const opt = document.createElement('option');
            opt.value = local;
            opt.textContent = `${local} ${count > 0 ? `(${count} pend.)` : '✓'}`;
            select.appendChild(opt);
        });

        if (valorSelecionado && this.locais.includes(valorSelecionado)) {
            select.value = valorSelecionado;
        } else if (this.locais.length > 0) {
            select.value = this.locais[0];
        } else {
            select.value = '';
        }
    }

    mostrarHidrometrosDoLocal(local) {
        const container = document.getElementById('hidrometrosContainer');
        container.innerHTML = '';
        if (!local) return;
        const hidrometrosLocal = this.hidrometros.filter(h => h.local === local);
        
        hidrometrosLocal.forEach((h, idx) => {
            const card = this.criarCardHidrometro(h, idx);
            container.appendChild(card);
            this.atualizarUIHidrometro(h.id);
        });
        this.atualizarProgresso();
    }

    criarCardHidrometro(h, idx) {
        const div = document.createElement('div');
        div.className = `hidrometro-card ${this.isCompleto(h) ? 'completo' : 'pendente'} stagger-${(idx % 4) + 1}`;
        div.id = `card-${h.id}`;
        
        div.innerHTML = `
            <div class="hidrometro-header">
                <div class="hidrometro-tipo">
                    🔧 ${h.tipo}
                </div>
                <span class="status-badge ${this.isCompleto(h) ? 'completo' : 'pendente'}">
                    ${this.isCompleto(h) ? '✓ Completo' : '⏳ Pendente'}
                </span>
            </div>
            <div class="leitura-anterior">
                <span>📊 Leitura anterior:</span>
                <strong>${h.leituraAnterior.toFixed(2)}</strong>
            </div>
            <input type="number"
                   step="0.01"
                   class="input-field"
                   id="input-${h.id}"
                   value="${h.leituraAtual || ''}"
                   placeholder="Digite a leitura atual"
                   inputmode="decimal"
                   oninput="app.atualizarLeitura('${h.id}', this.value)">
            <div class="consumo-info" id="consumo-${h.id}">
                <span>Consumo: <strong>-</strong></span>
                <span>Variação: <strong>-</strong></span>
            </div>
            <div id="alerta-${h.id}" class="alerta-variacao"></div>
            <div id="justificativa-${h.id}" class="justificativa">
                <textarea id="txt-${h.id}"
                          placeholder="Descreva o motivo da anomalia (obrigatório)..."
                          oninput="app.atualizarJustificativa('${h.id}', this.value)">${h.justificativa}</textarea>
            </div>
            <div class="foto-section">
                <label class="foto-btn ${h.foto ? 'tem-foto' : ''}" id="btn-foto-${h.id}">
                    <input type="file"
                           accept="image/*"
                           capture="environment"
                           style="display:none;"
                           onchange="app.capturarFoto('${h.id}', this)">
                    <span id="txt-foto-${h.id}">
                        ${h.foto ? '✓ Foto adicionada' : '📷 Tirar foto da leitura'}
                    </span>
                </label>
                <img id="preview-${h.id}" class="foto-preview ${h.foto ? 'show' : ''}" src="${h.foto || ''}">
            </div>
        `;
        
        return div;
    }

    atualizarLeitura(id, valor) {
        const h = this.hidrometros.find(x => x.id === id);
        if (!h) return;
        const novoValor = parseFloat(valor) || 0;
        h.leituraAtual = novoValor;

        const consumoDia = novoValor - h.leituraAnterior;
        const precisaJust = this.verificarNecessidadeJustificativa(h, consumoDia);
        
        this.atualizarUIHidrometro(id);
        this.salvarRondaLocal();
        this.atualizarProgresso();

        const input = document.getElementById(`input-${id}`);
        if (input) input.value = novoValor;

        if (navigator.vibrate && precisaJust) {
            navigator.vibrate(50);
        }
    }

    verificarNecessidadeJustificativa(h, consumoDia) {
        if (consumoDia < 0) return true;
        if (h.consumoAnterior > 0) {
            const variacao = ((consumoDia - h.consumoAnterior) / h.consumoAnterior) * 100;
            h.variacao = variacao;
            
            if (Math.abs(variacao) > 20 || consumoDia <= 0.5 || variacao > 100) {
                return true;
            }
        }
        return false;
    }

    atualizarUIHidrometro(id) {
        const h = this.hidrometros.find(x => x.id === id);
        const consumoDia = h.leituraAtual - h.leituraAnterior;
        const precisaJust = this.verificarNecessidadeJustificativa(h, consumoDia);
        
        const input = document.getElementById(`input-${id}`);
        const justDiv = document.getElementById(`justificativa-${id}`);
        const alertaDiv = document.getElementById(`alerta-${id}`);
        const consumoDiv = document.getElementById(`consumo-${id}`);
        const card = document.getElementById(`card-${id}`);
        
        if (input) {
            input.classList.remove('erro', 'valido');
            if (precisaJust && !h.justificativa) {
                input.classList.add('erro');
            } else if (h.leituraAtual > 0) {
                input.classList.add('valido');
            }
        }
        
        if (alertaDiv) {
            alertaDiv.className = 'alerta-variacao';
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
        
        if (justDiv) {
            justDiv.classList.toggle('show', precisaJust);
            const txt = document.getElementById(`txt-${id}`);
            if (txt && h.justificativa) {
                txt.classList.toggle('valido', h.justificativa.length > 10);
            }
        }
        
        if (consumoDiv) {
            const variacaoText = h.variacao ? `${h.variacao > 0 ? '+' : ''}${h.variacao.toFixed(1)}%` : '-';
            consumoDiv.innerHTML = `
                <span>Consumo: <strong>${consumoDia.toFixed(2)} m³</strong></span>
                <span>Variação: <strong>${variacaoText}</strong></span>
            `;
        }
        
        if (card) {
            const completo = this.isCompleto(h);
            card.classList.toggle('completo', completo);
            card.classList.toggle('pendente', !completo);
            
            const badge = card.querySelector('.status-badge');
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
            this.atualizarUIHidrometro(id);
            this.salvarRondaLocal();
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
                
                const preview = document.getElementById(`preview-${id}`);
