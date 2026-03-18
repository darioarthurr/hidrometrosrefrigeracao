/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.5.8
 * Correção: Progresso 0/0 - Garantia de atualização após dados
 */
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbztb2Zp6RTJKfzlDrOIN1zAyWl0Tz9PSmotNKUk4qKPX0JbOtT0mcytauJIuiAiWW9l/exec',
    VERSAO: '2.5.8',
    STORAGE_KEYS: {
        USUARIO: 'h2_usuario',
        LEITURAS_PENDENTES: 'h2_pendentes',
        RONDA_ATUAL: 'h2_ronda',
        BACKUP_RONDA: 'h2_backup_ronda',
        LAST_SAVE: 'h2_last_save'
    },
    AUTOSAVE_INTERVAL: 2000
};

class HidrometroApp {
    constructor() {
        this.usuario = null;
        this.hidrometros = [];
        this.locais = [];
        this.rondaAtual = null;
        this._saveCount = 0;
        this._dadosModificados = false;

        console.log(`🚀 Sistema v${CONFIG.VERSAO} iniciado`);
        this.init();
    }

    init() {
        this.restaurarSessao();
        this.setupEventListeners();
        this.iniciarAutoSave();
    }

    // ==========================================
    // SESSÃO E RESTAURAÇÃO (CORRIGIDA)
    // ==========================================

    restaurarSessao() {
        console.log('🔍 Restaurando sessão...');

        const usuarioSalvo = localStorage.getItem(CONFIG.STORAGE_KEYS.USUARIO);
        
        if (!usuarioSalvo) {
            this.showScreen('loginScreen');
            return;
        }

        try {
            this.usuario = JSON.parse(usuarioSalvo);
            console.log('✅ Usuário:', this.usuario.nome);
            
            this.showHeader();
            const loginScreen = document.getElementById('loginScreen');
            if (loginScreen) loginScreen.classList.remove('active');

            // Carrega ronda PRIMEIRO
            const ronda = this.carregarRondaSalva();
            
            if (ronda && this.usuario.nivel !== 'admin') {
                // Restaura dados ANTES de mostrar tela
                this.hidrometros = ronda.hidrometros || [];
                this.rondaAtual = ronda.rondaId;
                this.locais = ronda.locais || [...new Set(this.hidrometros.map(h => h.local))];
                
                console.log(`📦 Ronda: ${this.rondaAtual}, ${this.hidrometros.length} hidrômetros`);
                
                // AGORA mostra tela com dados já carregados
                this.mostrarTelaLeitura();
            } else {
                // Sem ronda - fluxo normal
                if (this.usuario.nivel === 'admin') {
                    this.showScreen('adminScreen');
                } else {
                    this.showScreen('startScreen');
                    const nomeEl = document.getElementById('nomeTecnico');
                    if (nomeEl) nomeEl.textContent = this.usuario.nome;
                }
            }

        } catch (e) {
            console.error('❌ Erro:', e);
            this.logout();
        }
    }

    carregarRondaSalva() {
        // Tenta múltiplas fontes
        const chaves = [CONFIG.STORAGE_KEYS.RONDA_ATUAL, CONFIG.STORAGE_KEYS.BACKUP_RONDA];
        
        for (const chave of chaves) {
            const dados = localStorage.getItem(chave);
            if (dados) {
                try {
                    const ronda = JSON.parse(dados);
                    if (ronda.rondaId && Array.isArray(ronda.hidrometros) && ronda.hidrometros.length > 0) {
                        console.log(`✅ Dados carregados de ${chave}`);
                        return ronda;
                    }
                } catch (e) {
                    console.warn(`⚠️ Erro em ${chave}:`, e);
                }
            }
        }
        
        return null;
    }

    // ==========================================
    // TELA DE LEITURA (CORRIGIDA)
    // ==========================================

    mostrarTelaLeitura() {
        console.log('🎯 Mostrando leitura...');
        
        // 1. Mostra elementos
        this.showScreen('leituraScreen');
        
        const bottomBar = document.getElementById('bottomBar');
        if (bottomBar) bottomBar.style.display = 'block';

        // 2. Preenche select
        this.preencherSelectLocais();
        
        // 3. Seleciona primeiro local
        if (this.locais.length > 0) {
            const select = document.getElementById('localSelect');
            if (select) {
                select.value = this.locais[0];
                // Renderiza cards deste local
                this.renderizarCards(this.locais[0]);
            }
        }

        // 4. ATUALIZA PROGRESSO COM DELAY para garantir DOM pronto
        setTimeout(() => {
            this.restaurarValoresNosInputs();
            this.atualizarProgressoForcado(); // Força atualização
        }, 50);
    }

    atualizarProgressoForcado() {
        console.log('📊 Atualizando progresso...', {
            total: this.hidrometros.length,
            hidrometros: this.hidrometros.slice(0, 2) // Log dos primeiros
        });
        
        const total = this.hidrometros.length;
        const completos = this.hidrometros.filter(h => this.isCompleto(h)).length;
        const pct = total > 0 ? Math.round((completos / total) * 100) : 0;

        // Atualiza TODOS os elementos da barra
        const elementos = {
            fill: document.getElementById('progressFill'),
            text: document.getElementById('progressText'),
            label: document.getElementById('progressLabel'),
            btn: document.getElementById('btnFinalizar')
        };

        console.log('Elementos encontrados:', {
            fill: !!elementos.fill,
            text: !!elementos.text,
            label: !!elementos.label,
            btn: !!elementos.btn
        });

        if (elementos.fill) {
            elementos.fill.style.width = `${pct}%`;
            elementos.fill.style.transition = 'width 0.3s ease';
        }
        
        if (elementos.text) elementos.text.textContent = `${completos}/${total}`;
        if (elementos.label) elementos.label.textContent = `${pct}% concluído`;
        
        if (elementos.btn) {
            elementos.btn.disabled = completos < total;
            elementos.btn.textContent = completos >= total ? '✓ Finalizar' : `⏳ Faltam ${total - completos}`;
        }

        console.log(`✅ Progresso: ${completos}/${total} (${pct}%)`);
    }

    // ==========================================
    // RENDERIZAÇÃO DE CARDS
    // ==========================================

    preencherSelectLocais() {
        const select = document.getElementById('localSelect');
        if (!select) {
            console.error('❌ Select não encontrado');
            return;
        }

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
        
        console.log('📝 Select preenchido:', this.locais.length, 'locais');
    }

    renderizarCards(local) {
        const container = document.getElementById('hidrometrosContainer');
        if (!container) {
            console.error('❌ Container não encontrado');
            return;
        }
        
        container.innerHTML = '';
        
        const hidros = this.hidrometros.filter(h => h.local === local);
        console.log(`🏭 ${local}: ${hidros.length
