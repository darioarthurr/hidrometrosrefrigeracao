/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.8.4
 * Compatível com CSS existente - usa .loading-overlay do seu CSS
 */

const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbztb2Zp6RTJKfzlDrOIN1zAyWl0Tz9PSmotNKUk4qKPX0JbOtT0mcytauJIuiAiWW9l/exec',
    VERSAO: '2.8.4',
    STORAGE_KEYS: {
        USUARIO: 'h2_usuario_v28',
        RONDA_ATIVA: 'h2_ronda_ativa_v28',
        BACKUP_RONDA: 'h2_backup_ronda_v28',
        CONFIG_USUARIO: 'h2_config_v28',
        SYNC_QUEUE: 'h2_fila_sync_v28'
    },
    INTERVALOS: {
        AUTOSAVE: 1500,
        BACKUP: 5000,
        PROGRESS_UPDATE: 100
    }
};

class SistemaHidrometros {
    constructor() {
        this.estado = {
            usuario: null,
            ronda: {
                id: null,
                hidrometros: [],
                locais: [],
                inicio: null,
                ultimaAlteracao: null
            },
            ui: {
                localAtual: null,
                ultimoSave: 0,
                salvando: false,
                online: navigator.onLine
            }
        };

        this._flags = {
            initCompleto: false,
            salvamentoPendente: false,
            destruindo: false
        };

        this._timers = {};
        this._saveCount = 0;

        console.log(`[v${CONFIG.VERSAO}] Inicializando sistema...`);
        this.inicializar();
    }

    async inicializar() {
        try {
            await this.verificarAmbiente();
            this.configurarListenersSistema();
            await this.restaurarSessao();
            this.configurarEventosUI();
            this.iniciarAutoSave();

            this._flags.initCompleto = true;
            console.log('[Sistema] Inicialização completa');

        } catch (erro) {
            console.error('[Sistema] Erro na inicialização:', erro);
            this.notificarErroCritico(erro);
        }
    }

    async verificarAmbiente() {
        try {
            const teste = `test_${Date.now()}`;
            localStorage.setItem(teste, '1');
            localStorage.removeItem(teste);
            console.log('[Ambiente] localStorage OK');
        } catch (e) {
            console.error('[Ambiente] localStorage falhou:', e);
            throw new Error('Navegador não suporta armazenamento local.');
        }

        window.addEventListener('online', () => {
            this.estado.ui.online = true;
            console.log('[Rede] Online');
        });

        window.addEventListener('offline', () => {
            this.estado.ui.online = false;
            console.log('[Rede] Offline');
        });
    }

    configurarListenersSistema() {
        window.addEventListener('beforeunload', (e) => {
            if (this._flags.salvamentoPendente && this.estado.ronda.id) {
                this.salvarRonda(true);
                e.preventDefault();
                e.returnValue = 'Você tem alterações não salvas.';
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.estado.ronda.id) {
                this.salvarRonda(true);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.salvarRonda(true);
                this.notificar('Dados salvos manualmente', 'success');
            }
        });
    }

    async restaurarSessao() {
        console.log('[Sessão] Verificando sessão existente...');

        const usuarioSalvo = this.lerStorage(CONFIG.STORAGE_KEYS.USUARIO);

        if (!usuarioSalvo) {
            console.log('[Sessão] Sem usuário, mostrando login');
            this.mostrarTela('loginScreen');
            return;
        }

        try {
            this.estado.usuario = usuarioSalvo;
            console.log(`[Sessão] Usuário: ${this.estado.usuario.nome}`);

            this.showHeader();

            const loginScreen = document.getElementById('loginScreen');
            if (loginScreen) loginScreen.classList.remove('active');

            const rondaRestaurada = await this.restaurarRonda();

            if (rondaRestaurada && this.estado.usuario.nivel !== 'admin') {
                console.log('[Sessão] Ronda restaurada com sucesso');
                this.entrarModoLeitura();
            } else {
                if (this.estado.usuario.nivel === 'admin') {
                    this.mostrarTela('dashboardScreen');
                } else {
                    this.mostrarTela('startScreen');
                    this.atualizarNomeTecnico();
                    this.verificarRondaPendente();
                }
            }

        } catch (erro) {
            console.error('[Sessão] Erro ao restaurar:', erro);
            this.encerrarSessao();
        }
    }

    mostrarTela(idTela) {
        console.log(`[UI] Tentando mostrar tela: ${idTela}`);

        const mapeamento = {
            'login': 'loginScreen',
            'inicio': 'startScreen',
            'start': 'startScreen',
            'leitura': 'leituraScreen',
            'dashboard': 'dashboardScreen',
            'admin': 'dashboardScreen',
            'leituras': 'leiturasAdminScreen'
        };

        const idFinal = mapeamento[idTela] || idTela;

        document.querySelectorAll('.screen').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });

        const tela = document.getElementById(idFinal);
        if (tela) {
            tela.style.display = 'block';
            void tela.offsetWidth;
            tela.classList.add('active');
            console.log(`[UI] Tela ativa: ${idFinal}`);
        } else {
            console.error(`[UI] Tela não encontrada: ${idTela} (mapeado para: ${idFinal})`);
        }
    }

    showHeader() {
        const header = document.getElementById('corporateHeader');
        if (header) {
            header.style.display = 'flex';
            console.log('[UI] Header mostrado');
        }
    }

    async restaurarRonda() {
        const fontes = [
            CONFIG.STORAGE_KEYS.RONDA_ATIVA,
            CONFIG.STORAGE_KEYS.BACKUP_RONDA
        ];

        for (const fonte of fontes) {
            const dados = this.lerStorage(fonte);

            if (dados && dados.id && Array.isArray(dados.hidrometros)) {
                if (dados.hidrometros.length > 0) {
                    this.estado.ronda = {
                        ...dados,
                        locais: dados.locais || [...new Set(dados.hidrometros.map(h => h.local))]
                    };
                    console.log(`[Ronda] Restaurada de ${fonte}: ${dados.hidrometros.length} hidrômetros`);
                    return true;
                }
            }
        }

        return false;
    }

    verificarRondaPendente() {
        const ronda = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
        if (ronda && ronda.hidrometros && ronda.hidrometros.length > 0) {
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

    async autenticar(evento) {
        evento.preventDefault();

        const usuario = document.getElementById('username')?.value.trim();
        const senha = document.getElementById('password')?.value.trim();

        if (!usuario || !senha) {
            this.mostrarErroLogin('Preencha usuário e senha');
            return;
        }

        this.mostrarCarregamento('Autenticando...');

        try {
            const resposta = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ 
                    action: 'login', 
                    usuario: usuario, 
                    senha: senha,
                    versao: CONFIG.VERSAO 
                })
            });

            const dados = await resposta.json();

            if (!dados.success) {
                throw new Error(dados.message || 'Credenciais inválidas');
            }

            this.estado.usuario = dados;
            this.salvarStorage(CONFIG.STORAGE_KEYS.USUARIO, dados);

            this.ocultarCarregamento();

            const loginScreen = document.getElementById('loginScreen');
            if (loginScreen) loginScreen.classList.remove('active');

            const rondaPendente = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);

            if (rondaPendente && dados.nivel !== 'admin') {
                const continuar = confirm(
                    `Ronda em andamento encontrada!\n\n` +
                    `Progresso: ${rondaPendente.hidrometros.filter(h => h.leituraAtual > 0).length}/${rondaPendente.hidrometros.length}\n\n` +
                    `Deseja continuar esta ronda?`
                );

                if (continuar) {
                    this.estado.ronda = rondaPendente;
                    this.entrarModoLeitura();
                    return;
                } else {
                    this.arquivarRonda(rondaPendente);
                }
            }

            if (dados.nivel === 'admin') {
                this.mostrarTela('dashboardScreen');
            } else {
                this.mostrarTela('startScreen');
                this.atualizarNomeTecnico();
                this.verificarRondaPendente();
            }

        } catch (erro) {
            this.ocultarCarregamento();
            this.mostrarErroLogin(erro.message);
        }
    }

    mostrarErroLogin(mensagem) {
        const erroDiv = document.getElementById('loginError');
        if (erroDiv) {
            erroDiv.textContent = mensagem;
            erroDiv.classList.add('show');
            setTimeout(() => erroDiv.classList.remove('show'), 5000);
        }
    }

    // ALIAS: iniciarLeitura -> iniciarNovaRonda
    iniciarLeitura() {
        console.log('[UI] Alias iniciarLeitura chamado');
        return this.iniciarNovaRonda();
    }

    // ALIAS: logout -> encerrarSessao
    logout() {
        console.log('[UI] Alias logout chamado');
        return this.encerrarSessao();
    }

    async iniciarNovaRonda() {
        console.log('[Ronda] Iniciando nova ronda...');

        if (!this.estado.usuario) {
            console.error('[Ronda] Usuário não logado');
            this.notificar('Erro: Usuário não autenticado', 'error');
            return;
        }

        this.mostrarCarregamento('Carregando hidrômetros...');

        try {
            console.log('[API] Chamando getHidrometros...');

            const resposta = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'getHidrometros',
                    usuario: this.estado.usuario.id
                })
            });

            console.log('[API] Resposta recebida:', resposta.status);

            if (!resposta.ok) {
                throw new Error(`HTTP ${resposta.status}: ${resposta.statusText}`);
            }

            const dados = await resposta.json();
            console.log('[API] Dados:', dados);

            if (!dados.success) {
                throw new Error(dados.message || 'Erro ao carregar hidrômetros');
            }

            if (!dados.hidrometros || !Array.isArray(dados.hidrometros)) {
                throw new Error('Formato de dados inválido: hidrometros não é array');
            }

            if (dados.hidrometros.length === 0) {
                throw new Error('Nenhum hidrômetro encontrado para este usuário');
            }

            this.estado.ronda = {
                id: `ronda_${Date.now()}`,
                hidrometros: dados.hidrometros.map(h => ({
                    ...h,
                    leituraAtual: null,
                    timestampLeitura: null,
                    justificativa: null,
                    foto: null
                })),
                locais: [...new Set(dados.hidrometros.map(h => h.local))],
                inicio: new Date().toISOString(),
                ultimaAlteracao: new Date().toISOString()
            };

            console.log(`[Ronda] Criada com ${this.estado.ronda.hidrometros.length} hidrômetros`);

            this.salvarRonda(true);
            this.ocultarCarregamento();
            this.entrarModoLeitura();
            this.notificar(`Ronda iniciada! ${this.estado.ronda.hidrometros.length} hidrômetros`, 'success');

        } catch (erro) {
            this.ocultarCarregamento();
            console.error('[Ronda] Erro ao iniciar:', erro);
            this.notificar('Erro: ' + erro.message, 'error');
        }
    }

    entrarModoLeitura() {
        console.log('[UI] Entrando modo leitura');

        this.mostrarTela('leituraScreen');

        const bottomBar = document.getElementById('bottomBar');
        if (bottomBar) bottomBar.style.display = 'flex';

        this.renderizarSelectLocais();

        const localInicial = this.encontrarLocalInicial();

        if (localInicial) {
            this.selecionarLocal(localInicial);
        }

        this.iniciarAutoSave();

        setTimeout(() => {
            this.restaurarDadosNosCards();
            this.atualizarBarraProgresso();
        }, 100);
    }

    encontrarLocalInicial() {
        for (const local of this.estado.ronda.locais) {
            const pendentes = this.estado.ronda.hidrometros.filter(
                h => h.local === local && !this.estaCompleto(h)
            );
            if (pendentes.length > 0) return local;
        }
        return this.estado.ronda.locais[0] || null;
    }

    renderizarSelectLocais() {
        const select = document.getElementById('localSelect');
        if (!select) {
            console.error('[UI] Select de locais não encontrado');
            return;
        }

        select.innerHTML = '<option value="">Escolha um local...</option>';

        this.estado.ronda.locais.forEach(local => {
            const hidros = this.estado.ronda.hidrometros.filter(h => h.local === local);
            const completos = hidros.filter(h => this.estaCompleto(h)).length;
            const pendentes = hidros.length - completos;

            const option = document.createElement('option');
            option.value = local;

            if (pendentes === 0) {
                option.textContent = `${local} ✓ Completo`;
            } else {
                option.textContent = `${local} (${pendentes} pend.)`;
            }

            select.appendChild(option);
        });
    }

    selecionarLocal(local) {
        if (!local) return;

        this.estado.ui.localAtual = local;

        const select = document.getElementById('localSelect');
        if (select) select.value = local;

        this.renderizarCardsLocal(local);
    }

    renderizarCardsLocal(local) {
        const container = document.getElementById('hidrometrosContainer');
        if (!container) return;

        container.innerHTML = '';

        const hidros = this.estado.ronda.hidrometros.filter(h => h.local === local);

        hidros.sort((a, b) => {
            const aComp = this.estaCompleto(a);
            const bComp = this.estaCompleto(b);
            return aComp === bComp ? 0 : aComp ? 1 : -1;
        });

        hidros.forEach((h, i) => {
            container.appendChild(this.criarCard(h, i));
        });

        requestAnimationFrame(() => {
            this.restaurarDadosNosCards();
        });

        this.atualizarBarraProgresso();
    }

    criarCard(hidrometro, indice) {
        const div = document.createElement('div');
        const completo = this.estaCompleto(hidrometro);
        const temAnomalia = this.temAnomalia(hidrometro);

        div.className = `hidrometro-card ${completo ? 'completo' : 'pendente'} ${temAnomalia ? 'anomalia' : ''}`;
        div.id = `card-${hidrometro.id}`;

        div.innerHTML = `
            <div class="card-header">
                <div class="info-principal">
                    <span class="tipo">🔧 ${hidrometro.tipo || 'Hidrômetro'}</span>
                    <span class="id">#${hidrometro.id.split('_').pop()}</span>
                </div>
                <span class="status-badge ${completo ? 'completo' : 'pendente'}" id="badge-${hidrometro.id}">
                    ${completo ? '✓' : '⏳'}
                </span>
            </div>

            <div class="leitura-anterior">
                <span>Leitura anterior</span>
                <strong>${parseFloat(hidrometro.leituraAnterior || 0).toFixed(2)} m³</strong>
            </div>

            <div class="campo-leitura">
                <input 
                    type="number" 
                    step="0.01" 
                    inputmode="decimal"
                    class="input-leitura ${completo ? 'valido' : ''} ${temAnomalia ? 'atencao' : ''}"
                    id="input-${hidrometro.id}"
                    value="${hidrometro.leituraAtual || ''}"
                    placeholder="Digite a leitura atual"
                    autocomplete="off"
                >
                <span class="unidade">m³</span>
            </div>

            <div class="info-consumo" id="consumo-${hidrometro.id}">
                ${this.renderizarInfoConsumo(hidrometro)}
            </div>

            <div class="alertas" id="alerta-${hidrometro.id}">
                ${this.renderizarAlertas(hidrometro)}
            </div>

            <div class="justificativa-container ${temAnomalia && !hidrometro.justificativa ? 'obrigatoria' : ''}" 
                 id="just-container-${hidrometro.id}">
                <textarea 
                    id="just-${hidrometro.id}"
                    class="input-justificativa ${hidrometro.justificativa ? 'preenchida' : ''}"
                    placeholder="Descreva o motivo da anomalia (mín. 10 caracteres)..."
                    rows="2"
                >${hidrometro.justificativa || ''}</textarea>
            </div>

            <div class="foto-container">
                <label class="btn-foto ${hidrometro.foto ? 'tem-foto' : ''}" id="btn-foto-${hidrometro.id}">
                    <input type="file" accept="image/*" capture="environment" style="display:none" id="file-${hidrometro.id}">
                    <span class="icone">📷</span>
                    <span class="texto" id="txt-foto-${hidrometro.id}">
                        ${hidrometro.foto ? 'Foto adicionada' : 'Adicionar foto'}
                    </span>
                </label>
                <img id="preview-${hidrometro.id}" 
                     class="preview-foto ${hidrometro.foto ? 'visivel' : ''}" 
                     src="${hidrometro.foto || ''}" 
                     onclick="app.ampliarFoto('${hidrometro.id}')"
                     alt="Foto da leitura">
            </div>
        `;

        const input = div.querySelector(`#input-${hidrometro.id}`);
        const file = div.querySelector(`#file-${hidrometro.id}`);
        const just = div.querySelector(`#just-${hidrometro.id}`);

        let timeoutInput;
        input.addEventListener('input', (e) => {
            clearTimeout(timeoutInput);
            timeoutInput = setTimeout(() => {
                this.processarLeitura(hidrometro.id, e.target.value);
            }, 100);
        });

        input.addEventListener('blur', () => {
            this.salvarRonda(true);
        });

        file.addEventListener('change', (e) => {
            this.processarFoto(hidrometro.id, e.target.files[0]);
        });

        just.addEventListener('input', (e) => {
            this.processarJustificativa(hidrometro.id, e.target.value);
        });

        just.addEventListener('blur', () => {
            this.salvarRonda(true);
        });

        return div;
    }

    restaurarDadosNosCards() {
        let count = 0;

        this.estado.ronda.hidrometros.forEach(h => {
            const input = document.getElementById(`input-${h.id}`);
            if (input && h.leituraAtual > 0) {
                input.value = h.leituraAtual;
                count++;
            }

            if (h.foto) {
                const preview = document.getElementById(`preview-${h.id}`);
                const btn = document.getElementById(`btn-foto-${h.id}`);
                const txt = document.getElementById(`txt-foto-${h.id}`);

                if (preview) {
                    preview.src = h.foto;
                    preview.classList.add('visivel');
                }
                if (btn) btn.classList.add('tem-foto');
                if (txt) txt.textContent = 'Foto adicionada';
            }

            if (h.justificativa) {
                const just = document.getElementById(`just-${h.id}`);
                if (just) {
                    just.value = h.justificativa;
                    just.classList.add('preenchida');
                }
            }

            this.atualizarCardUI(h.id);
        });

        if (count > 0) {
            console.log(`[UI] ${count} valores restaurados`);
        }
    }

    processarLeitura(id, valor) {
        const hidro = this.estado.ronda.hidrometros.find(h => h.id === id);
        if (!hidro) return;

        const novo = parseFloat(valor);

        if (isNaN(novo) || novo <= 0) {
            hidro.leituraAtual = null;
            hidro.timestampLeitura = null;
        } else {
            hidro.leituraAtual = novo;
            hidro.timestampLeitura = new Date().toISOString();
        }

        this._flags.salvamentoPendente = true;

        this.atualizarCardUI(id);
        this.atualizarBarraProgresso();

        if (navigator.vibrate && this.temAnomalia(hidro)) {
            navigator.vibrate(50);
        }
    }

    processarJustificativa(id, valor) {
        const hidro = this.estado.ronda.hidrometros.find(h => h.id === id);
        if (hidro) {
            hidro.justificativa = valor.trim();
            this._flags.salvamentoPendente = true;
            this.atualizarCardUI(id);
            this.atualizarBarraProgresso();
        }
    }

    async processarFoto(id, arquivo) {
        if (!arquivo) return;

        this.mostrarCarregamento('Processando imagem...');

        try {
            const comprimida = await this.comprimirImagem(arquivo);
            const h = this.estado.ronda.hidrometros.find(h => h.id === id);

            if (h) {
                h.foto = comprimida;
                this._flags.salvamentoPendente = true;

                const preview = document.getElementById(`preview-${id}`);
                const btn = document.getElementById(`btn-foto-${id}`);
                const txt = document.getElementById(`txt-foto-${id}`);

                if (preview) {
                    preview.src = comprimida;
                    preview.classList.add('visivel');
                }
                if (btn) btn.classList.add('tem-foto');
                if (txt) txt.textContent = 'Foto adicionada';

                this.atualizarCardUI(id);
                this.salvarRonda(true);
            }

            this.ocultarCarregamento();
            this.notificar('Foto adicionada com sucesso', 'success');

        } catch (erro) {
            this.ocultarCarregamento();
            console.error('[Foto] Erro:', erro);
            this.notificar('Erro ao processar foto', 'error');
        }
    }

    async comprimirImagem(arquivo, maxWidth = 1280, qualidade = 0.7) {
        return new Promise((resolve, reject) => {
            const leitor = new FileReader();

            leitor.onload = (e) => {
                const img = new Image();

                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let largura = img.width;
                    let altura = img.height;

                    if (largura > maxWidth) {
                        altura = (maxWidth / largura) * altura;
                        largura = maxWidth;
                    }

                    canvas.width = largura;
                    canvas.height = altura;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, largura, altura);

                    const dadosComprimidos = canvas.toDataURL('image/jpeg', qualidade);
                    resolve(dadosComprimidos);
                };

                img.onerror = () => reject(new Error('Erro ao carregar imagem'));
                img.src = e.target.result;
            };

            leitor.onerror = () => reject(new Error('Erro ao ler arquivo'));
            leitor.readAsDataURL(arquivo);
        });
    }

    estaCompleto(hidrometro) {
        if (!hidrometro.leituraAtual || hidrometro.leituraAtual <= 0) return false;
        if (this.temAnomalia(hidrometro) && (!hidrometro.justificativa || hidrometro.justificativa.length < 10)) return false;
        return true;
    }

    temAnomalia(hidrometro) {
        if (!hidrometro.leituraAtual || !hidrometro.leituraAnterior) return false;
        const consumo = hidrometro.leituraAtual - hidrometro.leituraAnterior;
        const limite = 1000;
        return consumo < 0 || consumo > limite;
    }

    renderizarInfoConsumo(hidrometro) {
        if (!hidrometro.leituraAtual || !hidrometro.leituraAnterior) {
            return '<span class="placeholder">Aguardando leitura...</span>';
        }

        const consumo = hidrometro.leituraAtual - hidrometro.leituraAnterior;
        const classe = consumo < 0 ? 'negativo' : (consumo > 1000 ? 'alto' : 'normal');

        return `
            <span>Consumo:</span>
            <span class="consumo ${classe}"><strong>${consumo.toFixed(2)} m³</strong></span>
        `;
    }

    renderizarAlertas(hidrometro) {
        if (!hidrometro.leituraAtual) return '';

        const consumo = hidrometro.leituraAtual - (hidrometro.leituraAnterior || 0);
        let alertas = '';

        if (consumo < 0) {
            alertas += '<div class="alerta danger"><span class="icone">⚠️</span><span>Leitura menor que anterior</span></div>';
        }
        if (consumo > 1000) {
            alertas += '<div class="alerta warning"><span class="icone">⚠️</span><span>Consumo muito alto</span></div>';
        }

        return alertas;
    }

    atualizarCardUI(id) {
        const h = this.estado.ronda.hidrometros.find(h => h.id === id);
        if (!h) return;

        const card = document.getElementById(`card-${id}`);
        const badge = document.getElementById(`badge-${id}`);
        const input = document.getElementById(`input-${id}`);
        const consumo = document.getElementById(`consumo-${id}`);
        const alerta = document.getElementById(`alerta-${id}`);
        const justContainer = document.getElementById(`just-container-${id}`);

        if (!card) return;

        const completo = this.estaCompleto(h);
        const temAnomalia = this.temAnomalia(h);

        card.className = `hidrometro-card ${completo ? 'completo' : 'pendente'} ${temAnomalia ? 'anomalia' : ''}`;

        if (badge) {
            badge.className = `status-badge ${completo ? 'completo' : 'pendente'}`;
            badge.textContent = completo ? '✓' : '⏳';
        }

        if (input) {
            input.className = `input-leitura ${completo ? 'valido' : ''} ${temAnomalia ? 'atencao' : ''}`;
        }

        if (consumo) consumo.innerHTML = this.renderizarInfoConsumo(h);
        if (alerta) alerta.innerHTML = this.renderizarAlertas(h);

        if (justContainer) {
            justContainer.className = `justificativa-container ${temAnomalia && !h.justificativa ? 'obrigatoria' : ''}`;
        }
    }

    atualizarBarraProgresso() {
        const total = this.estado.ronda.hidrometros.length;
        const completos = this.estado.ronda.hidrometros.filter(h => this.estaCompleto(h)).length;
        const percentual = total > 0 ? (completos / total) * 100 : 0;

        const barra = document.getElementById('progressBar');
        const texto = document.getElementById('progressText');

        if (barra) barra.style.width = `${percentual}%`;
        if (texto) texto.textContent = `${completos}/${total} (${Math.round(percentual)}%)`;

        // Atualiza botão finalizar
        const btnFinalizar = document.getElementById('btnFinalizar');
        if (btnFinalizar) {
            if (percentual === 100) {
                btnFinalizar.classList.add('pronto');
                btnFinalizar.disabled = false;
                btnFinalizar.textContent = '✓ Finalizar Ronda';
            } else {
                btnFinalizar.classList.remove('pronto');
                btnFinalizar.disabled = true;
                btnFinalizar.textContent = `Finalizar (${Math.round(percentual)}%)`;
            }
        }

        this.renderizarSelectLocais();
    }

    iniciarAutoSave() {
        if (this._timers.autoSave) clearInterval(this._timers.autoSave);

        this._timers.autoSave = setInterval(() => {
            if (this._flags.salvamentoPendente && this.estado.ronda.id) {
                this.salvarRonda();
            }
        }, CONFIG.INTERVALOS.AUTOSAVE);
    }

    salvarRonda(imediato = false) {
        if (!this.estado.ronda.id) return;

        const agora = Date.now();
        if (!imediato && agora - this.estado.ui.ultimoSave < CONFIG.INTERVALOS.AUTOSAVE) return;

        this.estado.ronda.ultimaAlteracao = new Date().toISOString();

        try {
            this.salvarStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA, this.estado.ronda);
            this._flags.salvamentoPendente = false;
            this.estado.ui.ultimoSave = agora;
            this._saveCount++;

            console.log(`[Save #${this._saveCount}] Ronda salva`);

            if (this._saveCount % 5 === 0) {
                this.salvarStorage(CONFIG.STORAGE_KEYS.BACKUP_RONDA, this.estado.ronda);
            }

        } catch (e) {
            console.error('[Save] Erro:', e);
        }
    }

    arquivarRonda(ronda) {
        const historico = this.lerStorage('h2_historico_rondas') || [];
        historico.push({
            ...ronda,
            arquivadaEm: new Date().toISOString(),
            motivo: 'Cancelada pelo usuário'
        });
        this.salvarStorage('h2_historico_rondas', historico);

        localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.BACKUP_RONDA);
    }

    async finalizarRonda() {
        const incompletos = this.estado.ronda.hidrometros.filter(h => !this.estaCompleto(h));

        if (incompletos.length > 0) {
            const continuar = confirm(
                `Atenção! ${incompletos.length} hidrômetro(s) incompleto(s).\n\n` +
                `Deseja finalizar mesmo assim?`
            );
            if (!continuar) return;
        }

        this.mostrarCarregamento('Enviando dados...');

        try {
            const resposta = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'finalizarRonda',
                    ronda: this.estado.ronda,
                    usuario: this.estado.usuario.id
                })
            });

            const dados = await resposta.json();

            if (!dados.success) {
                throw new Error(dados.message || 'Erro ao finalizar');
            }

            localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
            localStorage.removeItem(CONFIG.STORAGE_KEYS.BACKUP_RONDA);
            this.estado.ronda = { id: null, hidrometros: [], locais: [], inicio: null };

            this.ocultarCarregamento();
            this.notificar('Ronda finalizada com sucesso!', 'success');

            this.mostrarTela('startScreen');
            this.atualizarNomeTecnico();
            this.verificarRondaPendente();

        } catch (erro) {
            this.ocultarCarregamento();
            this.notificar(erro.message, 'error');
        }
    }

    // USA AS CLASSES DO CSS EXISTENTE (.loading-overlay)
    mostrarCarregamento(mensagem = 'Carregando...') {
        // Remove loader existente
        this.ocultarCarregamento();

        const loader = document.createElement('div');
        loader.id = 'globalLoader';
        loader.className = 'loading-overlay show'; // Usa classe do seu CSS
        loader.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <div class="loading-text">${mensagem}</div>
            </div>
        `;
        document.body.appendChild(loader);
    }

    ocultarCarregamento() {
        const loader = document.getElementById('globalLoader');
        if (loader) loader.remove();
    }

    // USA AS CLASSES DO CSS EXISTENTE (.toast-container e .toast)
    notificar(mensagem, tipo = 'info') {
        // Remove notificações antigas do novo sistema
        const antigas = document.querySelectorAll('.notification-toast');
        antigas.forEach(n => n.remove());

        // Verifica se existe toast-container no HTML, se não, cria
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        toast.innerHTML = `
            <span style="font-size: 1.25rem;">${tipo === 'success' ? '✓' : tipo === 'error' ? '✗' : 'ℹ'}</span>
            <span style="font-weight: 600;">${mensagem}</span>
        `;

        container.appendChild(toast);

        // Remove após 3 segundos
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    notificarErroCritico(erro) {
        console.error('[CRÍTICO]', erro);
        alert(`Erro crítico: ${erro.message}\n\nRecarregue a página.`);
    }

    atualizarNomeTecnico() {
        const elemento = document.getElementById('nomeTecnico');
        if (elemento && this.estado.usuario) {
            elemento.textContent = this.estado.usuario.nome;
        }
    }

    openModal(idModal) {
        const modal = document.getElementById(idModal);
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(idModal) {
        const modal = document.getElementById(idModal);
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }, 300);
        }
    }

    ampliarFoto(idHidrometro) {
        const h = this.estado.ronda.hidrometros.find(h => h.id === idHidrometro);
        if (!h || !h.foto) return;

        // Cria modal de imagem usando suas classes CSS
        const modal = document.createElement('div');
        modal.id = 'modalFotoAmpliada';
        modal.className = 'modal-imagem';
        modal.innerHTML = `
            <div class="modal-conteudo">
                <button class="btn-fechar" onclick="document.getElementById('modalFotoAmpliada').remove()">×</button>
                <img src="${h.foto}" alt="Foto ampliada">
                <div class="legenda">Hidrômetro #${idHidrometro.split('_').pop()}</div>
            </div>
        `;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        document.body.appendChild(modal);
    }

    salvarStorage(chave, valor) {
        try {
            localStorage.setItem(chave, JSON.stringify(valor));
            return true;
        } catch (e) {
            console.error('[Storage] Erro ao salvar:', e);
            return false;
        }
    }

    lerStorage(chave) {
        try {
            const item = localStorage.getItem(chave);
            return item ? JSON.parse(item) : null;
        } catch (e) {
            console.error('[Storage] Erro ao ler:', e);
            return null;
        }
    }

    configurarEventosUI() {
        // Login
        const formLogin = document.getElementById('loginForm');
        if (formLogin) {
            formLogin.addEventListener('submit', (e) => this.autenticar(e));
        }

        // Select de locais
        const selectLocais = document.getElementById('localSelect');
        if (selectLocais) {
            selectLocais.addEventListener('change', (e) => {
                this.selecionarLocal(e.target.value);
            });
        }

        // Botão nova ronda
        const btnNova = document.getElementById('btnNovaRonda');
        if (btnNova) {
            btnNova.addEventListener('click', () => this.iniciarNovaRonda());
        }

        // Botão continuar ronda
        const btnContinuar = document.getElementById('btnContinuarRonda');
        if (btnContinuar) {
            btnContinuar.addEventListener('click', () => this.entrarModoLeitura());
        }

        // Botão finalizar
        const btnFinalizar = document.getElementById('btnFinalizar');
        if (btnFinalizar) {
            btnFinalizar.addEventListener('click', () => this.finalizarRonda());
        }

        // Botão logout
        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => this.encerrarSessao());
        }

        console.log('[UI] Eventos configurados');
    }

    encerrarSessao() {
        if (this._flags.salvamentoPendente) {
            this.salvarRonda(true);
        }

        localStorage.removeItem(CONFIG.STORAGE_KEYS.USUARIO);
        this.estado.usuario = null;
        this.estado.ronda = { id: null, hidrometros: [], locais: [], inicio: null };

        const header = document.getElementById('corporateHeader');
        if (header) header.style.display = 'none';

        const bottomBar = document.getElementById('bottomBar');
        if (bottomBar) bottomBar.style.display = 'none';

        this.mostrarTela('loginScreen');
        this.notificar('Sessão encerrada', 'info');
    }
}

// Inicialização global
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new SistemaHidrometros();
});
