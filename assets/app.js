/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.9.3
 * CORREÇÕES:
 * - Fix mudarLocal (erro JS)
 * - Persistência de foto ao trocar local
 * - Garantia de salvamento antes da troca
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
        this.ronda = {
            id: null,
            hidrometros: [],
            locais: [],
            inicio: null
        };
        this.localAtual = null;
        this.salvamentoPendente = false;
        this.online = navigator.onLine;

        console.log(`[v${CONFIG.VERSAO}] Inicializando...`);

        this.limparElementosFantasmas();
        this.inicializar();
    }

    limparElementosFantasmas() {
        const elementosParaRemover = [
            '#modalFotoAmpliada',
            '.modal-overlay:not(.permantente)',
            '[id*="detalhe"]:not([id*="Container"])',
            '.detalhes-leitura'
        ];

        elementosParaRemover.forEach(seletor => {
            document.querySelectorAll(seletor).forEach(el => {
                console.log('[Cleanup] Removendo elemento fantasma:', el.id || el.className);
                el.remove();
            });
        });
    }

    async inicializar() {
        const usuarioSalvo = this.lerStorage(CONFIG.STORAGE_KEYS.USUARIO);

        if (usuarioSalvo) {
            this.usuario = usuarioSalvo;

            const header = document.getElementById('corporateHeader');
            if (header) header.style.display = 'flex';

            const nomeTecnico = document.getElementById('nomeTecnico');
            if (nomeTecnico) nomeTecnico.textContent = this.usuario.nome;

            const rondaSalva = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
            if (rondaSalva && rondaSalva.id) {
                this.ronda = rondaSalva;

                if (this.usuario.nivel === 'admin') {
                    this.mostrarTela('dashboardScreen');
                } else {
                    this.mostrarTela('startScreen');
                    this.verificarRondaPendente();
                }
            } else {
                if (this.usuario.nivel === 'admin') {
                    this.mostrarTela('dashboardScreen');
                } else {
                    this.mostrarTela('startScreen');
                }
            }
        } else {
            this.mostrarTela('loginScreen');
        }

        this.configurarEventos();

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
            // ✅ FIX: garante salvamento antes da troca
            localSelect.addEventListener('change', (e) => {
                this.salvarRonda();
                this.carregarHidrometros(e.target.value);
            });
        }

        window.addEventListener('online', () => {
            this.online = true;
            console.log('[Rede] Online');
        });

        window.addEventListener('offline', () => {
            this.online = false;
            console.log('[Rede] Offline');
        });

        console.log('[UI] Eventos configurados');
    }

    // ✅ FIX: função que estava faltando (erro mudarLocal)
    mudarLocal(local) {
        this.salvarRonda();
        this.carregarHidrometros(local);
    }

    // ... (TODO O RESTANTE DO SEU CÓDIGO PERMANECE 100% IGUAL ATÉ A FUNÇÃO criarCardHidrometro)

    criarCardHidrometro(h, index) {
        const div = document.createElement('div');
        div.className = 'hidrometro-card';
        div.id = `card-${h.id}`;

        div.innerHTML = `... SEU HTML ORIGINAL AQUI ...`;

        // ✅ FIX: restaurar foto ao recriar DOM
        setTimeout(() => {
            if (h.foto) {
                const preview = document.getElementById(`preview-${h.id}`);
                const btn = document.getElementById(`btn-foto-${h.id}`);

                if (preview) {
                    preview.src = h.foto;
                    preview.style.display = 'block';
                }

                if (btn) {
                    btn.innerHTML = '<span>✓ Foto adicionada</span>';
                    btn.classList.add('tem-foto');
                }
            }
        }, 0);

        return div;
    }

    // ... (RESTANTE DO CÓDIGO TOTALMENTE INALTERADO)
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SistemaHidrometros();
});
