/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.9.3
 * CORREÇÕES:
 * - Fix mudarLocal
 * - Foto não some ao trocar local
 * - Salvamento garantido
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
        document.querySelectorAll('#modalFotoAmpliada, .modal-overlay:not(.permantente), [id*="detalhe"]:not([id*="Container"]), .detalhes-leitura')
            .forEach(el => el.remove());
    }

    async inicializar() {
        const usuarioSalvo = this.lerStorage(CONFIG.STORAGE_KEYS.USUARIO);

        if (usuarioSalvo) {
            this.usuario = usuarioSalvo;

            const rondaSalva = this.lerStorage(CONFIG.STORAGE_KEYS.RONDA_ATIVA);
            if (rondaSalva && rondaSalva.id) {
                this.ronda = rondaSalva;
                this.mostrarTela('startScreen');
            } else {
                this.mostrarTela('startScreen');
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
        const localSelect = document.getElementById('localSelect');
        if (localSelect) {
            localSelect.addEventListener('change', (e) => {
                this.salvarRonda();
                this.carregarHidrometros(e.target.value);
            });
        }
    }

    // FIX
    mudarLocal(local) {
        this.salvarRonda();
        this.carregarHidrometros(local);
    }

    carregarHidrometros(local) {
        if (!local) return;

        this.localAtual = local;

        const container = document.getElementById('hidrometrosContainer');
        if (!container) return;

        container.innerHTML = '';

        const hidros = this.ronda.hidrometros.filter(h => h.local === local);

        hidros.forEach(h => {
            const card = this.criarCardHidrometro(h);
            container.appendChild(card);
        });
    }

    criarCardHidrometro(h) {
        const div = document.createElement('div');
        div.id = `card-${h.id}`;

        div.innerHTML = `
            <input type="number" id="input-${h.id}" onblur="app.salvarLeitura('${h.id}')">
            <input type="file" accept="image/*" onchange="app.processarFoto('${h.id}', this.files[0])">
            <img id="preview-${h.id}" style="display:none;">
            <div id="btn-foto-${h.id}">📷 Foto</div>
        `;

        // FIX FOTO
        setTimeout(() => {
            if (h.foto) {
                const preview = document.getElementById(`preview-${h.id}`);
                const btn = document.getElementById(`btn-foto-${h.id}`);

                if (preview) {
                    preview.src = h.foto;
                    preview.style.display = 'block';
                }

                if (btn) {
                    btn.innerHTML = '✓ Foto adicionada';
                }
            }
        }, 0);

        return div;
    }

    processarFoto(id, arquivo) {
        const reader = new FileReader();

        reader.onload = (e) => {
            const h = this.ronda.hidrometros.find(h => h.id === id);
            if (h) {
                h.foto = e.target.result;
                this.salvamentoPendente = true;
                this.salvarRonda();
            }
        };

        reader.readAsDataURL(arquivo);
    }

    salvarLeitura(id) {
        const input = document.getElementById(`input-${id}`);
        const valor = parseFloat(input.value);

        const h = this.ronda.hidrometros.find(h => h.id === id);
        if (h) {
            h.leituraAtual = valor;
            this.salvamentoPendente = true;
            this.salvarRonda();
        }
    }

    salvarRonda() {
        localStorage.setItem(CONFIG.STORAGE_KEYS.RONDA_ATIVA, JSON.stringify(this.ronda));
        this.salvamentoPendente = false;
    }

    lerStorage(chave) {
        const item = localStorage.getItem(chave);
        return item ? JSON.parse(item) : null;
    }

    mostrarTela(id) {
        document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
        const tela = document.getElementById(id);
        if (tela) tela.style.display = 'block';
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SistemaHidrometros();
});
