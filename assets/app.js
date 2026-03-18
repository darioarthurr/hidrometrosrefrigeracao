/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.8.0
 * Código profissional, robusto e otimizado
 * 
 * Melhorias:
 * - Persistência garantida contra qualquer tipo de recarga
 * - Barra de progresso 100% funcional
 * - Botão de pausa/sair durante ronda
 * - Salvamento contínuo independente de local/período
 * - Recuperação automática em múltiplas sessões
 * - Interface profissional e feedback visual
 */

const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbztb2Zp6RTJKfzlDrOIN1zAyWl0Tz9PSmotNKUk4qKPX0JbOtT0mcytauJIuiAiWW9l/exec',
    VERSAO: '2.8.0',
    STORAGE_KEYS: {
        USUARIO: 'h2_usuario_v28',
        RONDA_ATIVA: 'h2_ronda_ativa_v28',
        BACKUP_RONDA: 'h2_backup_ronda_v28',
        CONFIG_USUARIO: 'h2_config_v28',
        SYNC_QUEUE: 'h2_fila_sync_v28'
    },
    INTERVALOS: {
        AUTOSAVE: 1500,      // 1.5 segundos
        BACKUP: 5000,        // 5 segundos backup
        PROGRESS_UPDATE: 100 // 100ms para UI
    }
};

class SistemaHidrometros {
    constructor() {
        // Estado da aplicação
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

        // Flags de controle
        this._flags = {
            initCompleto: false,
            salvamentoPendente: false,
            destruindo: false
        };

        // Timers
        this._timers = {};

        console.log(`[v${CONFIG.VERSAO}] Inicializando sistema...`);
        this.inicializar();
    }

    // ==========================================
    // INICIALIZAÇÃO
    // ==========================================

    async inicializar() {
        try {
            // 1. Verifica ambiente
            await this.verificarAmbiente();
            
            // 2. Configura listeners de sistema
            this.configurarListenersSistema();
            
            // 3. Restaura sessão
            await this.restaurarSessao();
            
            // 4. Configura UI
            this.configurarEventosUI();
            
            this._flags.initCompleto = true;
            console.log('[Sistema] Inicialização completa');
            
        } catch (erro) {
            console.error('[Sistema] Erro na inicialização:', erro);
            this.notificarErroCritico(erro);
        }
    }

    async verificarAmbiente() {
        // Testa localStorage
        try {
            const teste = `test_${Date.now()}`;
            localStorage.setItem(teste, '1');
            localStorage.removeItem(teste);
            console.log('[Ambiente] localStorage OK');
        } catch (e) {
            console.error('[Ambiente] localStorage falhou:', e);
            throw new Error('Navegador não suporta armazenamento local. Desative modo anônimo.');
        }

        // Verifica conectividade
        window.addEventListener('online', () => {
            this.estado.ui.online = true;
            console.log('[Rede] Online');
        });
        
        window.addEventListener('offline', () => {
            this.estado.ui.online = false;
            console.log('[Rede] Offline - modo local ativado');
        });
    }

    configurarListenersSistema() {
        // Salvar ao sair
        window.addEventListener('beforeunload', (e) => {
            if (this._flags.salvamentoPendente && this.estado.ronda.id) {
                this.salvarRonda(true);
                e.preventDefault();
                e.returnValue = 'Você tem alterações não salvas. Deseja realmente sair?';
            }
        });

        // Salvar quando muda de aba
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.estado.ronda.id) {
                this.salvarRonda(true);
            }
        });

        // Atalhos de teclado
        document.addEventListener('keydown', (e) => {
            // Ctrl+S = Salvar manual
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.salvarRonda(true);
                this.notificar('Dados salvos manualmente', 'success');
            }
        });
    }

    // ==========================================
    // SESSÃO E AUTENTICAÇÃO
    // ==========================================

    async restaurarSessao() {
        console.log('[Sessão] Verificando sessão existente...');
        
        const usuarioSalvo = this.lerStorage(CONFIG.STORAGE_KEYS.USUARIO);
        
        if (!usuarioSalvo) {
            console.log('[Sessão] Sem usuário, mostrando login');
            this.mostrarTela('login');
            return;
        }

        try {
            this.estado.usuario = usuarioSalvo;
            console.log(`[Sessão] Usuário: ${this.estado.usuario.nome}`);

            // Tenta restaurar ronda ativa
            const rondaRestaurada = await this.restaurarRonda();
            
            if (rondaRestaurada) {
                console.log('[Sessão] Ronda restaurada com sucesso');
                this.entrarModoLeitura();
            } else {
                // Sem ronda ativa
                if (this.estado.usuario.nivel === 'admin') {
                    this.mostrarTela('admin');
                } else {
                    this.mostrarTela('inicio');
                    this.atualizarNomeTecnico();
                }
            }
            
        } catch (erro) {
            console.error('[Sessão] Erro ao restaurar:', erro);
            this.encerrarSessao();
        }
    }

    async autenticar(evento) {
        evento.preventDefault();
        
        const usuario = document.getElementById('username')?.value.trim();
        const senha = document.getElementById('password')?.value.trim();
        
        if (!usuario || !senha) {
            this.notificar('Preencha usuário e senha', 'error');
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

            // Salva usuário
            this.estado.usuario = dados;
            this.salvarStorage(CONFIG.STORAGE_KEYS.USUARIO, dados);

            this.ocultarCarregamento();

            // Verifica ronda pendente
            const rondaPendente = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
            
            if (rondaPendente && dados.nivel !== 'admin') {
                const continuar = await this.confirmar(
                    `Ronda em andamento encontrada!\n\n` +
                    `Iniciada: ${new Date(rondaPendente.inicio).toLocaleString('pt-BR')}\n` +
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

            // Fluxo normal
            if (dados.nivel === 'admin') {
                this.mostrarTela('admin');
            } else {
                this.mostrarTela('inicio');
                this.atualizarNomeTecnico();
            }

        } catch (erro) {
            this.ocultarCarregamento();
            this.notificar(erro.message, 'error');
        }
    }

    encerrarSessao() {
        console.log('[Sessão] Encerrando...');
        
        // Para timers
        Object.values(this._timers).forEach(timer => clearInterval(timer));
        
        // Limpa estado
        this.estado.usuario = null;
        this.estado.ronda = { id: null, hidrometros: [], locais: [], inicio: null, ultimaAlteracao: null };
        
        // Limpa storage de sessão (mantém ronda para recuperação posterior se necessário)
        localStorage.removeItem(CONFIG.STORAGE_KEYS.USUARIO);
        
        location.reload();
    }

    // ==========================================
    // GERENCIAMENTO DE RONDA
    // ==========================================

    async iniciarNovaRonda() {
        // Verifica se já existe ronda ativa
        if (this.estado.ronda.id && this.estado.ronda.hidrometros.length > 0) {
            const confirmar = await this.confirmar(
                'Já existe uma ronda em andamento.\n\n' +
                'Iniciar nova ronda irá arquivar a atual.\n' +
                'Deseja continuar?'
            );
            
            if (!confirmar) return;
            
            this.arquivarRonda(this.estado.ronda);
        }

        this.mostrarCarregamento('Carregando hidrômetros...');

        try {
            const resposta = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ 
                    action: 'iniciar', 
                    usuario: this.estado.usuario.usuario,
                    timestamp: new Date().toISOString()
                })
            });

            const dados = await resposta.json();
            
            if (!dados.success) {
                throw new Error(dados.message);
            }

            // Inicializa nova ronda
            const agora = new Date().toISOString();
            
            this.estado.ronda = {
                id: dados.rondaId || `ronda_${Date.now()}`,
                hidrometros: dados.hidrometros.map((h, idx) => ({
                    ...h,
                    id: h.id || `hid_${idx}`,
                    leituraAtual: null,
                    foto: null,
                    justificativa: null,
                    timestampLeitura: null,
                    sync: false
                })),
                locais: [...new Set(dados.hidrometros.map(h => h.local))],
                inicio: agora,
                ultimaAlteracao: agora
            };

            // Salva imediatamente
            this.salvarRonda(true);
            this.ocultarCarregamento();
            
            this.entrarModoLeitura();
            this.notificar('Ronda iniciada! Boa leitura!', 'success');

        } catch (erro) {
            this.ocultarCarregamento();
            console.error('[Ronda] Erro ao iniciar:', erro);
            this.notificar('Erro ao iniciar ronda: ' + erro.message, 'error');
        }
    }

    async restaurarRonda() {
        // Tenta múltiplas fontes
        const fontes = [
            CONFIG.STORAGE_KEYS.RONDA_ATIVA,
            CONFIG.STORAGE_KEYS.BACKUP_RONDA
        ];

        for (const fonte of fontes) {
            const dados = this.lerStorage(fonte);
            
            if (dados && dados.id && Array.isArray(dados.hidrometros)) {
                // Valida integridade
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

    salvarRonda(forcar = false) {
        if (!this.estado.ronda.id) return false;
        if (!forcar && this._flags.salvamentoPendente) return false;

        this._flags.salvamentoPendente = true;
        this.estado.ronda.ultimaAlteracao = new Date().toISOString();

        try {
            const dados = { ...this.estado.ronda };
            
            // Salva em múltiplas chaves para redundância
            this.salvarStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA, dados);
            
            // Backup periódico ou forçado
            if (forcar || Date.now() - this.estado.ui.ultimoSave > CONFIG.INTERVALOS.BACKUP) {
                this.salvarStorage(CONFIG.STORAGE_KEYS.BACKUP_RONDA, dados);
                this.estado.ui.ultimoSave = Date.now();
            }

            const lidos = dados.hidrometros.filter(h => h.leituraAtual > 0).length;
            console.log(`[Save] ${lidos}/${dados.hidrometros.length} hidrômetros | ${new Date().toLocaleTimeString()}`);
            
            this._flags.salvamentoPendente = false;
            return true;

        } catch (erro) {
            console.error('[Save] Erro:', erro);
            this._flags.salvamentoPendente = false;
            return false;
        }
    }

    arquivarRonda(ronda) {
        // Move para fila de sincronização pendente
        const fila = this.lerStorage(CONFIG.STORAGE_KEYS.SYNC_QUEUE) || [];
        fila.push({
            ...ronda,
            arquivadaEm: new Date().toISOString(),
            motivo: 'nova_ronda_iniciada'
        });
        this.salvarStorage(CONFIG.STORAGE_KEYS.SYNC_QUEUE, fila);
        
        // Limpa ativa
        localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
        
        console.log('[Ronda] Arquivada:', ronda.id);
    }

    pausarRonda() {
        this.salvarRonda(true);
        this.notificar('Ronda pausada. Você pode continuar a qualquer momento.', 'info');
        this.mostrarTela('inicio');
        document.getElementById('bottomBar').style.display = 'none';
    }

    async finalizarRonda() {
        const pendentes = this.estado.ronda.hidrometros.filter(h => !this.estaCompleto(h));
        
        if (pendentes.length > 0) {
            this.notificar(`Ainda faltam ${pendentes.length} hidrômetros`, 'warning');
            
            // Mostra quais são
            const locaisPendentes = [...new Set(pendentes.map(h => h.local))];
            console.log('[Finalizar] Pendentes em:', locaisPendentes);
            
            // Opcional: perguntar se quer forçar finalização
            const forcar = await this.confirmar(
                `Atenção: ${pendentes.length} hidrômetros incompletos!\n\n` +
                `Locais: ${locaisPendentes.join(', ')}\n\n` +
                `Deseja finalizar mesmo assim? (Será necessário justificar)`
            );
            
            if (!forcar) return;
        }

        this.mostrarCarregamento('Sincronizando com servidor...');

        try {
            const payload = {
                action: 'finalizar',
                rondaId: this.estado.ronda.id,
                usuario: this.estado.usuario.usuario,
                inicio: this.estado.ronda.inicio,
                fim: new Date().toISOString(),
                dados: this.estado.ronda.hidrometros.map(h => ({
                    id: h.id,
                    local: h.local,
                    tipo: h.tipo,
                    leituraAnterior: h.leituraAnterior,
                    leituraAtual: h.leituraAtual,
                    consumo: h.leituraAtual ? (h.leituraAtual - h.leituraAnterior) : null,
                    foto: h.foto,
                    justificativa: h.justificativa,
                    timestamp: h.timestampLeitura
                }))
            };

            const resposta = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            const resultado = await resposta.json();
            
            if (!resultado.success) {
                throw new Error(resultado.message);
            }

            // Limpa ronda ativa
            localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
            localStorage.removeItem(CONFIG.STORAGE_KEYS.BACKUP_RONDA);
            
            this.estado.ronda = { id: null, hidrometros: [], locais: [], inicio: null, ultimaAlteracao: null };
            
            this.ocultarCarregamento();
            this.mostrarTela('inicio');
            document.getElementById('bottomBar').style.display = 'none';
            
            this.notificar('Ronda finalizada com sucesso! 🎉', 'success');

        } catch (erro) {
            this.ocultarCarregamento();
            console.error('[Finalizar] Erro:', erro);
            
            // Salva na fila para tentar depois
            this.arquivarRonda(this.estado.ronda);
            
            this.notificar(
                'Erro ao sincronizar. Dados salvos localmente e serão enviados quando possível.', 
                'warning'
            );
        }
    }

    // ==========================================
    // INTERFACE DE LEITURA
    // ==========================================

    entrarModoLeitura() {
        console.log('[UI] Entrando modo leitura');
        
        // Mostra telas
        this.mostrarTela('leitura');
        document.getElementById('bottomBar').style.display = 'flex';
        
        // Configura select de locais
        this.renderizarSelectLocais();
        
        // Seleciona primeiro local com pendências ou primeiro disponível
        const localInicial = this.encontrarLocalInicial();
        
        if (localInicial) {
            this.selecionarLocal(localInicial);
        }
        
        // Inicia auto-save
        this.iniciarAutoSave();
        
        // Atualiza progresso inicial
        this.atualizarBarraProgresso();
        
        console.log('[UI] Modo leitura ativo');
    }

    encontrarLocalInicial() {
        // Procura local com pendências
        for (const local of this.estado.ronda.locais) {
            const pendentes = this.estado.ronda.hidrometros.filter(
                h => h.local === local && !this.estaCompleto(h)
            );
            if (pendentes.length > 0) return local;
        }
        
        // Se todos completos, retorna primeiro
        return this.estado.ronda.locais[0] || null;
    }

    renderizarSelectLocais() {
        const select = document.getElementById('localSelect');
        if (!select) {
            console.error('[UI] Select de locais não encontrado');
            return;
        }

        // Limpa
        select.innerHTML = '<option value="">Selecione o local...</option>';
        
        // Preenche com estatísticas
        this.estado.ronda.locais.forEach(local => {
            const hidros = this.estado.ronda.hidrometros.filter(h => h.local === local);
            const completos = hidros.filter(h => this.estaCompleto(h)).length;
            const total = hidros.length;
            const pendentes = total - completos;
            
            const option = document.createElement('option');
            option.value = local;
            
            if (pendentes === 0) {
                option.textContent = `${local} ✓ Completo`;
                option.style.color = '#10b981';
            } else {
                option.textContent = `${local} (${pendentes} pend.)`;
            }
            
            select.appendChild(option);
        });

        console.log(`[UI] ${this.estado.ronda.locais.length} locais renderizados`);
    }

    selecionarLocal(local) {
        if (!local) return;
        
        this.estado.ui.localAtual = local;
        
        const select = document.getElementById('localSelect');
        if (select) select.value = local;
        
        this.renderizarCardsLocal(local);
        this.atualizarBarraProgresso();
    }

    renderizarCardsLocal(local) {
        const container = document.getElementById('hidrometrosContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Filtra e ordena: incompletos primeiro, depois por ID
        const hidros = this.estado.ronda.hidrometros
            .filter(h => h.local === local)
            .sort((a, b) => {
                const aComp = this.estaCompleto(a);
                const bComp = this.estaCompleto(b);
                if (aComp !== bComp) return aComp ? 1 : -1;
                return a.id.localeCompare(b.id);
            });
        
        // Renderiza cards
        hidros.forEach((h, idx) => {
            container.appendChild(this.criarCard(h, idx));
        });
        
        // Restaura valores após renderização
        requestAnimationFrame(() => {
            this.restaurarValoresCards(hidros);
        });
        
        console.log(`[UI] ${hidros.length} cards renderizados para ${local}`);
    }

    criarCard(hidrometro, indice) {
        const div = document.createElement('div');
        const completo = this.estaCompleto(hidrometro);
        const temAnomalia = this.temAnomalia(hidrometro);
        
        div.className = `hidrometro-card ${completo ? 'completo' : 'pendente'} ${temAnomalia ? 'anomalia' : ''}`;
        div.id = `card-${hidrometro.id}`;
        div.style.animationDelay = `${indice * 0.05}s`;
        
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
                <strong>${parseFloat(hidrometro.leituraAnterior).toFixed(2)} m³</strong>
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

        // Eventos
        const input = div.querySelector(`#input-${hidrometro.id}`);
        const file = div.querySelector(`#file-${hidrometro.id}`);
        const just = div.querySelector(`#just-${hidrometro.id}`);

        // Debounce no input para performance
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

    restaurarValoresCards(hidrometros) {
        hidrometros.forEach(h => {
            // Input já vem preenchido no HTML, mas garante
            if (h.leituraAtual) {
                const input = document.getElementById(`input-${h.id}`);
                if (input && !input.value) input.value = h.leituraAtual;
            }
            
            // Foto
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
            
            // Justificativa
            if (h.justificativa) {
                const just = document.getElementById(`just-${h.id}`);
                if (just) {
                    just.value = h.justificativa;
                    just.classList.add('preenchida');
                }
            }
        });
    }

    // ==========================================
    // PROCESSAMENTO DE DADOS
    // ==========================================

    processarLeitura(id, valor) {
        const hidro = this.estado.ronda.hidrometros.find(h => h.id === id);
        if (!hidro) return;

        const novoValor = parseFloat(valor);
        
        // Se inválido ou zerado, limpa
        if (isNaN(novoValor) || novoValor <= 0) {
            hidro.leituraAtual = null;
            hidro.timestampLeitura = null;
        } else {
            hidro.leituraAtual = novoValor;
            hidro.timestampLeitura = new Date().toISOString();
        }

        this._flags.salvamentoPendente = true;
        
        // Atualiza UI imediatamente
        this.atualizarCardUI(id);
        this.atualizarBarraProgresso();
        this.atualizarSelectLocais(); // Atualiza contadores no select
        
        // Feedback tátil em mobile
        if (navigator.vibrate && this.temAnomalia(hidro)) {
            navigator.vibrate(50);
        }
    }

    processarJustificativa(id, valor) {
        const hidro = this.estado.ronda.hidrometros.find(h => h.id === id);
        if (!hidro) return;

        hidro.justificativa = valor.trim();
        this._flags.salvamentoPendente = true;
        
        this.atualizarCardUI(id);
        this.atualizarBarraProgresso();
    }

    async processarFoto(id, arquivo) {
        if (!arquivo) return;

        this.mostrarCarregamento('Processando imagem...');

        try {
            const comprimida = await this.comprimirImagem(arquivo, 1200, 0.7);
            
            const hidro = this.estado.ronda.hidrometros.find(h => h.id === id);
            if (hidro) {
                hidro.foto = comprimida;
                this._flags.salvamentoPendente = true;
                
                // Atualiza UI
                const preview = document.getElementById(`preview-${id}`);
                const btn = document.getElementById(`btn-foto-${id}`);
                const txt = document.getElementById(`txt-foto-${id}`);
                
                if (preview) {
                    preview.src = comprimida;
                    preview.classList.add('visivel');
                }
                if (btn) btn.classList.add('tem-foto');
                if (txt) txt.textContent = 'Foto adicionada';
                
                this.salvarRonda(true);
                this.atualizarBarraProgresso();
            }
            
            this.ocultarCarregamento();

        } catch (erro) {
            this.ocultarCarregamento();
            console.error('[Foto] Erro:', erro);
            this.notificar('Erro ao processar foto', 'error');
        }
    }

    // ==========================================
    // ATUALIZAÇÃO DE UI
    // ==========================================

    atualizarCardUI(id) {
        const hidro = this.estado.ronda.hidrometros.find(h => h.id === id);
        if (!hidro) return;

        const consumo = hidro.leituraAtual ? (hidro.leituraAtual - hidro.leituraAnterior) : 0;
        const temAnomalia = this.temAnomalia(hidro);
        const completo = this.estaCompleto(hidro);

        // Input
        const input = document.getElementById(`input-${id}`);
        if (input) {
            input.classList.remove('valido', 'atencao', 'erro');
            if (completo) input.classList.add('valido');
            else if (temAnomalia) input.classList.add('atencao');
        }

        // Consumo
        const consumoDiv = document.getElementById(`consumo-${id}`);
        if (consumoDiv) {
            consumoDiv.innerHTML = this.renderizarInfoConsumo(hidro);
        }

        // Alertas
        const alertaDiv = document.getElementById(`alerta-${id}`);
        if (alertaDiv) {
            alertaDiv.innerHTML = this.renderizarAlertas(hidro);
        }

        // Justificativa container
        const justContainer = document.getElementById(`just-container-${id}`);
        if (justContainer) {
            justContainer.classList.toggle('obrigatoria', temAnomalia && !hidro.justificativa);
        }

        // Card e badge
        const card = document.getElementById(`card-${id}`);
        const badge = document.getElementById(`badge-${id}`);
        
        if (card) {
            card.classList.remove('completo', 'pendente', 'anomalia');
            card.classList.add(completo ? 'completo' : 'pendente');
            if (temAnomalia) card.classList.add('anomalia');
        }
        
        if (badge) {
            badge.className = `status-badge ${completo ? 'completo' : 'pendente'}`;
            badge.textContent = completo ? '✓' : '⏳';
        }
    }

    atualizarBarraProgresso() {
        // Garante que temos dados
        if (!this.estado.ronda.hidrometros || this.estado.ronda.hidrometros.length === 0) {
            console.warn('[Progresso] Sem hidrômetros para calcular');
            return;
        }

        const total = this.estado.ronda.hidrometros.length;
        const completos = this.estado.ronda.hidrometros.filter(h => this.estaCompleto(h)).length;
        const percentual = total > 0 ? Math.round((completos / total) * 100) : 0;

        // Elementos da barra
        const barraPreenchida = document.getElementById('progressFill');
        const textoNumerico = document.getElementById('progressText');
        const textoPercentual = document.getElementById('progressLabel');
        const botaoFinalizar = document.getElementById('btnFinalizar');

        // Atualiza com animação
        if (barraPreenchida) {
            barraPreenchida.style.transition = 'width 0.3s ease';
            barraPreenchida.style.width = `${percentual}%`;
        }

        if (textoNumerico) {
            textoNumerico.textContent = `${completos}/${total}`;
        }

        if (textoPercentual) {
            textoPercentual.textContent = `${percentual}% concluído`;
        }

        if (botaoFinalizar) {
            const podeFinalizar = completos >= total;
            botaoFinalizar.disabled = !podeFinalizar;
            botaoFinalizar.textContent = podeFinalizar ? '✓ Finalizar Ronda' : `⏳ Faltam ${total - completos}`;
            botaoFinalizar.classList.toggle('pronto', podeFinalizar);
        }

        // Log apenas a cada 5 mudanças para não poluir
        if (Math.abs((this._ultimoProgresso || 0) - percentual) >= 5) {
            console.log(`[Progresso] ${completos}/${total} (${percentual}%)`);
            this._ultimoProgresso = percentual;
        }
    }

    atualizarSelectLocais() {
        // Re-renderiza para atualizar contadores
        this.renderizarSelectLocais();
        
        // Restaura seleção atual
        if (this.estado.ui.localAtual) {
            const select = document.getElementById('localSelect');
            if (select) select.value = this.estado.ui.localAtual;
        }
    }

    // ==========================================
    // LÓGICA DE NEGÓCIO
    // ==========================================

    estaCompleto(hidro) {
        if (!hidro || !hidro.leituraAtual || hidro.leituraAtual <= 0) {
            return false;
        }

        const consumo = hidro.leituraAtual - hidro.leituraAnterior;
        
        // Se tem anomalia, precisa de justificativa
        if (this.temAnomalia(hidro)) {
            return hidro.justificativa && hidro.justificativa.length >= 10;
        }

        return true;
    }

    temAnomalia(hidro) {
        if (!hidro.leituraAtual) return false;

        const consumo = hidro.leituraAtual - hidro.leituraAnterior;

        // Consumo negativo
        if (consumo < 0) return true;

        // Consumo zerado ou muito baixo
        if (consumo < 0.5) return true;

        // Consumo excessivo (possível vazamento)
        if (consumo > 100) return true;

        // Variação grande em relação à média histórica
        const mediaHistorica = parseFloat(hidro.consumoAnterior) || 0;
        if (mediaHistorica > 0) {
            const variacao = Math.abs(((consumo - mediaHistorica) / mediaHistorica) * 100);
            if (variacao > 20) return true;
        }

        return false;
    }

    renderizarInfoConsumo(hidro) {
        if (!hidro.leituraAtual) return '<span class="placeholder">Aguardando leitura...</span>';

        const consumo = hidro.leituraAtual - hidro.leituraAnterior;
        const media = parseFloat(hidro.consumoAnterior) || 0;
        
        let html = `<span class="consumo">Consumo: <strong>${consumo.toFixed(2)} m³</strong></span>`;
        
        if (media > 0) {
            const varia = ((consumo - media) / media) * 100;
            const cor = varia > 20 ? 'alta' : varia < -20 ? 'baixa' : 'normal';
            html += `<span class="variacao ${cor}">${varia > 0 ? '+' : ''}${varia.toFixed(1)}%</span>`;
        }
        
        return html;
    }

    renderizarAlertas(hidro) {
        if (!hidro.leituraAtual) return '';

        const consumo = hidro.leituraAtual - hidro.leituraAnterior;
        const alertas = [];

        if (consumo < 0) {
            alertas.push({ tipo: 'erro', icone: '❌', msg: 'Consumo negativo! Verifique a leitura.' });
        } else if (consumo < 0.5) {
            alertas.push({ tipo: 'alerta', icone: '⚠️', msg: 'Consumo muito baixo - medidor pode estar parado' });
        } else if (consumo > 100) {
            alertas.push({ tipo: 'critico', icone: '🚨', msg: 'Possível VAZAMENTO! Consumo muito alto' });
        }

        const media = parseFloat(hidro.consumoAnterior) || 0;
        if (media > 0) {
            const varia = ((consumo - media) / media) * 100;
            if (varia > 20 && consumo <= 100) {
                alertas.push({ tipo: 'alerta', icone: '⚠️', msg: `Consumo ${varia.toFixed(0)}% acima da média` });
            } else if (varia < -20) {
                alertas.push({ tipo: 'info', icone: 'ℹ️', msg: `Consumo ${Math.abs(varia).toFixed(0)}% abaixo da média` });
            }
        }

        return alertas.map(a => 
            `<div class="alerta ${a.tipo}"><span class="icone">${a.icone}</span><span class="msg">${a.msg}</span></div>`
        ).join('');
    }

    // ==========================================
    // UTILITÁRIOS
    // ==========================================

    async comprimirImagem(arquivo, maxLargura = 1200, qualidade = 0.7) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (evento) => {
                const imagem = new Image();
                
                imagem.onload = () => {
                    const canvas = document.createElement('canvas');
                    let largura = imagem.width;
                    let altura = imagem.height;
                    
                    // Redimensiona se necessário
                    if (largura > maxLargura) {
                        altura = (altura * maxLargura) / largura;
                        largura = maxLargura;
                    }
                    
                    canvas.width = largura;
                    canvas.height = altura;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(imagem, 0, 0, largura, altura);
                    
                    // Comprime e retorna
                    resolve(canvas.toDataURL('image/jpeg', qualidade));
                };
                
                imagem.onerror = reject;
                imagem.src = evento.target.result;
            };
            
            reader.onerror = reject;
            reader.readAsDataURL(arquivo);
        });
    }

    iniciarAutoSave() {
        // Limpa timer anterior se existir
        if (this._timers.autosave) {
            clearInterval(this._timers.autosave);
        }

        // Auto-save periódico
        this._timers.autosave = setInterval(() => {
            if (this._flags.salvamentoPendente) {
                this.salvarRonda();
            }
        }, CONFIG.INTERVALOS.AUTOSAVE);

        console.log('[AutoSave] Ativado a cada', CONFIG.INTERVALOS.AUTOSAVE, 'ms');
    }

    // ==========================================
    // STORAGE HELPERS
    // ==========================================

    salvarStorage(chave, dados) {
        try {
            localStorage.setItem(chave, JSON.stringify(dados));
            return true;
        } catch (e) {
            console.error(`[Storage] Erro ao salvar ${chave}:`, e);
            return false;
        }
    }

    lerStorage(chave) {
        try {
            const dados = localStorage.getItem(chave);
            return dados ? JSON.parse(dados) : null;
        } catch (e) {
            console.error(`[Storage] Erro ao ler ${chave}:`, e);
            return null;
        }
    }

    // ==========================================
    // UI HELPERS
    // ==========================================

    mostrarTela(nome) {
        // Esconde todas
        document.querySelectorAll('.screen').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });
        
        // Mostra a solicitada
        const tela = document.getElementById(`${nome}Screen`) || document.getElementById(nome);
        if (tela) {
            tela.style.display = 'block';
            // Força reflow para animação
            void tela.offsetWidth;
            tela.classList.add('active');
            console.log('[UI] Tela:', nome);
        } else {
            console.error('[UI] Tela não encontrada:', nome);
        }
    }

    mostrarCarregamento(mensagem = 'Carregando...') {
        let overlay = document.getElementById('loadingOverlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loadingOverlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="loading-content">
                    <div class="spinner"></div>
                    <p class="mensagem">${mensagem}</p>
                </div>
            `;
            document.body.appendChild(overlay);
        } else {
            overlay.querySelector('.mensagem').textContent = mensagem;
        }
        
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Previne scroll
    }

    ocultarCarregamento() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        document.body.style.overflow = '';
    }

    notificar(mensagem, tipo = 'info', duracao = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        toast.innerHTML = `
            <span class="icone">${this.iconeTipo(tipo)}</span>
            <span class="mensagem">${mensagem}</span>
        `;
        
        document.body.appendChild(toast);
        
        // Anima entrada
        requestAnimationFrame(() => {
            toast.classList.add('visivel');
        });
        
        // Remove após delay
        setTimeout(() => {
            toast.classList.remove('visivel');
            setTimeout(() => toast.remove(), 300);
        }, duracao);
        
        // Log
        console.log(`[${tipo.toUpperCase()}] ${mensagem}`);
    }

    iconeTipo(tipo) {
        const icones = {
            success: '✓',
            error: '✕',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icones[tipo] || '•';
    }

    confirmar(mensagem) {
        return new Promise(resolve => {
            // Cria modal de confirmação
            const modal = document.createElement('div');
            modal.className = 'modal-confirmacao';
            modal.innerHTML = `
                <div class="modal-conteudo">
                    <p class="mensagem">${mensagem.replace(/\n/g, '<br>')}</p>
                    <div class="botoes">
                        <button class="btn-secundario" id="btn-nao">Não</button>
                        <button class="btn-primario" id="btn-sim">Sim</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Eventos
            modal.querySelector('#btn-sim').addEventListener('click', () => {
                modal.remove();
                resolve(true);
            });
            
            modal.querySelector('#btn-nao').addEventListener('click', () => {
                modal.remove();
                resolve(false);
            });
            
            // Fecha ao clicar fora
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(false);
                }
            });
        });
    }

    atualizarNomeTecnico() {
        const el = document.getElementById('nomeTecnico');
        if (el && this.estado.usuario) {
            el.textContent = this.estado.usuario.nome;
        }
    }

    ampliarFoto(id) {
        const hidro = this.estado.ronda.hidrometros.find(h => h.id === id);
        if (!hidro || !hidro.foto) return;

        const modal = document.createElement('div');
        modal.className = 'modal-imagem';
        modal.innerHTML = `
            <div class="modal-conteudo">
                <button class="btn-fechar">&times;</button>
                <img src="${hidro.foto}" alt="Foto do hidrômetro">
                <p class="legenda">${hidro.tipo} - ${hidro.local}</p>
            </div>
        `;
        
        modal.querySelector('.btn-fechar').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        document.body.appendChild(modal);
    }

    notificarErroCritico(erro) {
        console.error('[CRÍTICO]', erro);
        alert('Erro crítico no sistema:\n\n' + erro.message + '\n\nA página será recarregada.');
        location.reload();
    }

    // ==========================================
    // CONFIGURAÇÃO DE EVENTOS
    // ==========================================

    configurarEventosUI() {
        // Login
        const formLogin = document.getElementById('loginForm');
        if (formLogin) {
            formLogin.addEventListener('submit', (e) => this.autenticar(e));
        }

        // Toggle senha
        const toggleSenha = document.getElementById('togglePassword');
        if (toggleSenha) {
            toggleSenha.addEventListener('click', () => {
                const input = document.getElementById('password');
                if (input) {
                    input.type = input.type === 'password' ? 'text' : 'password';
                }
            });
        }

        // Logout
        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => this.encerrarSessao());
        }

        // Iniciar ronda
        const btnIniciar = document.getElementById('btnIniciar');
        if (btnIniciar) {
            btnIniciar.addEventListener('click', () => this.iniciarNovaRonda());
        }

        // Select de local
        const selectLocal = document.getElementById('localSelect');
        if (selectLocal) {
            selectLocal.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.selecionarLocal(e.target.value);
                }
            });
        }

        // Pausar ronda (NOVO BOTÃO)
        const btnPausar = document.getElementById('btnPausar');
        if (btnPausar) {
            btnPausar.addEventListener('click', () => this.pausarRonda());
        }

        // Finalizar ronda
        const btnFinalizar = document.getElementById('btnFinalizar');
        if (btnFinalizar) {
            btnFinalizar.addEventListener('click', () => this.finalizarRonda());
        }

        // Voltar (para compatibilidade)
        const btnVoltar = document.getElementById('btnVoltar');
        if (btnVoltar) {
            btnVoltar.addEventListener('click', () => this.pausarRonda());
        }
    }
}

// Inicialização global
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SistemaHidrometros();
});
