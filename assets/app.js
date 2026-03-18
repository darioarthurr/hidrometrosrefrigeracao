/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.5.2
 * JavaScript Completo - Offline First, Dashboard Admin, PWA
 * Correção: Recuperação automática ao recarregar (F5) vai direto para tela de leitura se houver ronda pendente
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
                    // Verifica ronda pendente ANTES de decidir a tela
                    const rondaSalva = localStorage.getItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
                    if (rondaSalva) {
                        console.log('Ronda pendente detectada no checkAuth. Indo direto para leitura.');
                        this.resumeRondaIfExists();
                    } else {
                        console.log('Sem ronda pendente. Mostrando tela inicial.');
                        this.showScreen('startScreen');
                        document.getElementById('nomeTecnico').textContent = this.usuario.nome;
                        this.checkPendentes();
                    }
                }
            } catch (e) {
                console.error('Erro ao parsear usuário:', e);
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
                // Verifica ronda pendente após login
                const rondaSalva = localStorage.getItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
                if (rondaSalva) {
                    console.log('Ronda pendente detectada após login. Recuperando.');
                    this.resumeRondaIfExists();
                } else {
                    this.showScreen('startScreen');
                    document.getElementById('nomeTecnico').textContent = data.nome;
                    this.checkPendentes();
                }
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
                console.log(`✅ Recuperando ronda pendente (${this.hidrometros.length} hidrômetros)`);

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
                        console.log(`Container pronto (${currentCards}/${expectedCards} cards). Preenchendo.`);
                        fillInputs();
                    } else if (attempt < 30) {
                        console.log(`Tentativa ${attempt + 1}: ${currentCards}/${expectedCards} cards. Aguardando...`);
                        setTimeout(() => checkCards(attempt + 1), 300);
                    } else {
                        console.warn(`Timeout após 30 tentativas. Forçando preenchimento.`);
                        fillInputs();
                    }
                };

                setTimeout(() => checkCards(), 500);

                const observer = new MutationObserver(() => {
                    if (container.children.length >= expectedCards) {
                        console.log('MutationObserver detectou todos os cards.');
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
        const rondaSalva = localStorage.getItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
        if (rondaSalva) {
            console.log('Ronda pendente detectada. Recuperando em vez de iniciar nova.');
            this.resumeRondaIfExists();
            return;
        }

        this.showLoading('Carregando hidrômetros...');
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'iniciar', usuario: this.usuario.usuario })
            });
            const data = await response.json();

            console.log('Dados recebidos do servidor:', data);

            if (!data.success) throw new Error(data.message);

            this.hidrometros = this.inicializarHidrometros(data.hidrometros);
            this.rondaAtual = data.rondaId;
            this.locais = [...new Set(this.hidrometros.map(h => h.local))];

            this.salvarRondaLocal();
            this.hideLoading();

            this.showScreen('leituraScreen');
            document.getElementById('bottomBar').style.display = 'block';

            this.preencherSelectLocais();

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

    // ... (o resto do código continua igual ao anterior: inicializarHidrometros, preencherSelectLocais, mostrarHidrometrosDoLocal, criarCardHidrometro, atualizarLeitura, etc.)

    // Para não repetir o código inteiro aqui, mantenha o restante do arquivo como estava (a partir de inicializarHidrometros até o final), pois não mudamos essas partes.

    // Se quiser o arquivo inteiro com todas as funções coladas, me avise que envio o bloco completo de novo.
}

// Inicialização global
const app = new HidrometroApp();

// Recuperação automática ao carregar/atualizar página
window.addEventListener('load', () => {
    if (app.usuario && app.usuario.nivel !== 'admin') {
        console.log('Evento load disparado. Verificando ronda pendente.');
        setTimeout(() => {
            app.resumeRondaIfExists();
        }, 1500);
    }
});
