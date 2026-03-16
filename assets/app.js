/**
 * SISTEMA DE LEITURA DE HIDRÔMETROS v2.5.1
 * JavaScript Completo - Offline First, Dashboard Admin, PWA
 * Correção de loop infinito no select de locais
 *
 * CONFIGURAÇÃO: Altere a URL abaixo para seu Apps Script
 */
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbztb2Zp6RTJKfzlDrOIN1zAyWl0Tz9PSmotNKUk4qKPX0JbOtT0mcytauJIuiAiWW9l/exec',
    VERSAO: '2.5.1',
    STORAGE_KEYS: {
        USUARIO: 'h2_usuario',
        LEITURAS_PENDENTES: 'h2_pendentes',
        RONDA_ATUAL: 'h2_ronda',
        CACHE_DASHBOARD: 'h2_dashboard'
    }
};
// ============================================
// CLASSE PRINCIPAL
// ============================================
class HidrometroApp {
    constructor() {
        this.usuario = null;
        this.hidrometros = [];
        this.locais = [];
        this.rondaAtual = null;
        this.paginaAtual = 1;
        this.itensPorPagina = 20;
        this.charts = {};
        this._atualizandoProgresso = false; // Proteção contra loop infinito

        this.init();
    }
    init() {
        this.checkAuth();
        this.setupEventListeners();
        this.setupServiceWorker();
    }
    // ============================================
    // AUTENTICAÇÃO & SESSÃO
    // ============================================
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
    // ============================================
    // OPERAÇÃO - LEITURAS EM CAMPO
    // ============================================
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

        // REMOVIDO: select.dispatchEvent(new Event('change')); → causava loop infinito
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
                const btn = document.getElementById(`btn-foto-${id}`);
                const txt = document.getElementById(`txt-foto-${id}`);
               
                if (preview) {
                    preview.src = comprimida;
                    preview.classList.add('show');
                }
                if (btn) btn.classList.add('tem-foto');
                if (txt) txt.textContent = '✓ Foto adicionada';
               
                this.salvarRondaLocal();
                this.atualizarProgresso();
                this.atualizarUIHidrometro(id);
            }
        } catch (err) {
            this.showToast('Erro ao processar foto', 'error');
        } finally {
            this.hideLoading();
        }
    }
    comprimirImagem(file, maxWidth, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const scale = Math.min(1, maxWidth / img.width);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                   
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                   
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    isCompleto(h) {
        if (!h.leituraAtual || h.leituraAtual <= 0) return false;
       
        const consumoDia = h.leituraAtual - h.leituraAnterior;
        const precisaJust = this.verificarNecessidadeJustificativa(h, consumoDia);
       
        if (precisaJust && (!h.justificativa || h.justificativa.length < 10)) return false;
        if (!h.foto) return false;
       
        return true;
    }
    atualizarProgresso() {
        if (this._atualizandoProgresso) return; // Proteção contra reentrada e loop
        this._atualizandoProgresso = true;

        const total = this.hidrometros.length;
        const completos = this.hidrometros.filter(h => this.isCompleto(h)).length;
        const percent = total > 0 ? (completos / total) * 100 : 0;
       
        document.getElementById('progressoTexto').textContent = `${completos}/${total}`;
        document.getElementById('progressoBarra').style.width = `${percent}%`;
        document.getElementById('progressoPercent').textContent = `${Math.round(percent)}%`;
       
        const btn = document.getElementById('btnFinalizar');
        btn.disabled = completos !== total;
        btn.classList.toggle('ativo', completos === total);
       
        this.preencherSelectLocais();

        this._atualizandoProgresso = false;
    }
    mudarLocal(local) {
        this.mostrarHidrometrosDoLocal(local);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    salvarRondaLocal() {
        const dados = {
            rondaId: this.rondaAtual,
            hidrometros: this.hidrometros,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL, JSON.stringify(dados));
    }
    checkPendentes() {
        const pendentes = this.getLeiturasPendentes();
        const btn = document.getElementById('btnSyncPendentes');
        const count = document.getElementById('countPendentes');
        const stats = document.getElementById('welcomeStats');
       
        if (pendentes.length > 0) {
            btn.style.display = 'flex';
            count.textContent = pendentes.length;
            stats.style.display = 'flex';
            document.getElementById('statPendentes').textContent = pendentes.length;
        }
    }
    getLeiturasPendentes() {
        const dados = localStorage.getItem(CONFIG.STORAGE_KEYS.LEITURAS_PENDENTES);
        return dados ? JSON.parse(dados) : [];
    }
    async finalizarRonda() {
        const pendentes = this.hidrometros.filter(h => !this.isCompleto(h));
        if (pendentes.length > 0) {
            this.showToast(`Ainda há ${pendentes.length} hidrômetros pendentes`, 'warning');
            return;
        }
        if (!confirm('Deseja finalizar e enviar a ronda?')) return;
        this.showLoading('Enviando leituras...');
        try {
            if (navigator.onLine) {
                const response = await fetch(CONFIG.API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'salvarLeituras',
                        leituras: this.hidrometros,
                        usuario: this.usuario.usuario,
                        rondaId: this.rondaAtual
                    })
                });
                const data = await response.json();
                if (!data.success) throw new Error(data.message);
               
                this.showToast('Ronda enviada com sucesso!', 'success');
            } else {
                this.salvarPendenteOffline();
                this.showToast('Ronda salva offline. Sincronize quando houver internet.', 'warning');
            }
            localStorage.removeItem(CONFIG.STORAGE_KEYS.RONDA_ATUAL);
            this.hidrometros = [];
            this.rondaAtual = null;
           
            this.hideLoading();
            this.showScreen('startScreen');
            document.getElementById('bottomBar').style.display = 'none';
            this.checkPendentes();
        } catch (err) {
            this.hideLoading();
            this.salvarPendenteOffline();
            this.showToast('Erro ao enviar. Salvo para sincronizar depois.', 'warning');
        }
    }
    salvarPendenteOffline() {
        const pendentes = this.getLeiturasPendentes();
        pendentes.push({
            rondaId: this.rondaAtual,
            hidrometros: this.hidrometros,
            usuario: this.usuario.usuario,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem(CONFIG.STORAGE_KEYS.LEITURAS_PENDENTES, JSON.stringify(pendentes));
    }
    async sincronizarPendentes() {
        const pendentes = this.getLeiturasPendentes();
        if (pendentes.length === 0) return;
        this.showLoading(`Sincronizando ${pendentes.length} ronda(s)...`);
        const novosPendentes = [];
       
        for (const ronda of pendentes) {
            try {
                const response = await fetch(CONFIG.API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'salvarLeituras',
                        leituras: ronda.hidrometros,
                        usuario: ronda.usuario,
                        rondaId: ronda.rondaId
                    })
                });
                const data = await response.json();
                if (!data.success) throw new Error(data.message);
               
            } catch (err) {
                novosPendentes.push(ronda);
            }
        }
        localStorage.setItem(CONFIG.STORAGE_KEYS.LEITURAS_PENDENTES, JSON.stringify(novosPendentes));
       
        this.hideLoading();
        if (novosPendentes.length === 0) {
            this.showToast('Todas as rondas sincronizadas!', 'success');
            document.getElementById('btnSyncPendentes').style.display = 'none';
            document.getElementById('welcomeStats').style.display = 'none';
        } else {
            this.showToast(`${novosPendentes.length} ronda(s) ainda pendentes`, 'warning');
        }
    }
    // ============================================
    // ADMIN - DASHBOARD & GESTÃO
    // ============================================
    showAdminInterface() {
        document.getElementById('userBadge').textContent = 'ADM';
        document.getElementById('userBadge').classList.add('admin');
        document.getElementById('adminNav').style.display = 'flex';
        this.navigate('dashboard');
    }
    navigate(page) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });
        document.querySelectorAll('.admin-screen').forEach(s => s.classList.remove('active'));
       
        switch(page) {
            case 'dashboard':
                document.getElementById('dashboardScreen').classList.add('active');
                this.loadDashboard();
                break;
            case 'leituras':
                document.getElementById('leiturasAdminScreen').classList.add('active');
                this.loadLeiturasAdmin();
                break;
            case 'analise':
                this.showToast('Módulo em desenvolvimento', 'info');
                break;
            case 'gestao':
                this.showToast('Módulo em desenvolvimento', 'info');
                break;
        }
    }
    async loadDashboard() {
        const periodo = document.getElementById('periodoDashboard').value;
       
        this.showLoading('Carregando dashboard...');
        try {
            const cacheKey = `${CONFIG.STORAGE_KEYS.CACHE_DASHBOARD}_${periodo}`;
            const cache = localStorage.getItem(cacheKey);
           
            if (cache) {
                const dadosCache = JSON.parse(cache);
                if (new Date() - new Date(dadosCache.timestamp) < 5 * 60 * 1000) {
                    this.renderDashboard(dadosCache.data);
                }
            }
            if (navigator.onLine) {
                const response = await fetch(CONFIG.API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'getDashboard', periodo: parseInt(periodo) })
                });
                const data = await response.json();
                if (data.success) {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        data: data,
                        timestamp: new Date().toISOString()
                    }));
                    this.renderDashboard(data);
                }
            }
        } catch (err) {
            console.error('Erro dashboard:', err);
        } finally {
            this.hideLoading();
        }
    }
    renderDashboard(data) {
        if (data.vazio) {
            document.getElementById('kpiTotal').textContent = '0';
            document.getElementById('kpiAlertas').textContent = '0';
            document.getElementById('kpiVazamentos').textContent = '0';
            document.getElementById('kpiNormal').textContent = '0';
            return;
        }
        document.getElementById('kpiTotal').textContent = data.kpi.total;
        document.getElementById('kpiAlertas').textContent = data.kpi.alertas;
        document.getElementById('kpiVazamentos').textContent = data.kpi.vazamentos;
        document.getElementById('kpiNormal').textContent = data.kpi.normal;
       
        this.renderChartConsumoDia(data.graficos.porDia);
        this.renderChartPorLocal(data.graficos.porLocal);
        this.renderUltimasLeituras(data.ultimas);
    }
    renderChartConsumoDia(dados) {
        const ctx = document.getElementById('chartConsumoDia').getContext('2d');
       
        if (this.charts.consumoDia) {
            this.charts.consumoDia.destroy();
        }
        this.charts.consumoDia = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dados.map(d => {
                    const date = new Date(d[0]);
                    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                }),
                datasets: [{
                    label: 'Leituras',
                    data: dados.map(d => d[1]),
                    borderColor: '#00A651',
                    backgroundColor: 'rgba(0, 166, 81, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }
    renderChartPorLocal(dados) {
        const ctx = document.getElementById('chartPorLocal').getContext('2d');
       
        if (this.charts.porLocal) {
            this.charts.porLocal.destroy();
        }
        this.charts.porLocal = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dados.slice(0, 8).map(d => d[0].substring(0, 15)),
                datasets: [{
                    label: 'Leituras',
                    data: dados.slice(0, 8).map(d => d[1]),
                    backgroundColor: '#003366',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
    renderUltimasLeituras(leituras) {
        const tbody = document.getElementById('ultimasLeiturasTable');
        tbody.innerHTML = leituras.map(l => `
            <tr>
                <td>${new Date(l.data).toLocaleString('pt-BR')}</td>
                <td>${l.tecnico}</td>
                <td>${l.local}</td>
                <td>${l.leitura}</td>
                <td><span class="status-cell status-${this.getStatusClass(l.status)}">${this.formatStatus(l.status)}</span></td>
            </tr>
        `).join('');
    }
    async loadLeiturasAdmin() {
        this.showLoading('Carregando leituras...');
        try {
            const locaisResponse = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getLocais' })
            });
            const locaisData = await locaisResponse.json();
           
            if (locaisData.success) {
                const select = document.getElementById('filtroLocal');
                select.innerHTML = '<option value="">Todos</option>';
                locaisData.locais.forEach(local => {
                    const opt = document.createElement('option');
                    opt.value = local;
                    opt.textContent = local;
                    select.appendChild(opt);
                });
            }
            await this.filtrarLeituras();
        } catch (err) {
            this.showToast('Erro ao carregar dados', 'error');
        } finally {
            this.hideLoading();
        }
    }
    async filtrarLeituras() {
        const filtros = {
            local: document.getElementById('filtroLocal').value,
            status: document.getElementById('filtroStatus').value,
            dataInicio: document.getElementById('filtroDataInicio').value,
            dataFim: document.getElementById('filtroDataFim').value
        };
        this.showLoading('Buscando...');
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getLeituras', filtros })
            });
            const data = await response.json();
            if (data.success) {
                this.renderTabelaLeituras(data.leituras);
            }
        } catch (err) {
            this.showToast('Erro ao filtrar', 'error');
        } finally {
            this.hideLoading();
        }
    }
    renderTabelaLeituras(leituras) {
        const tbody = document.getElementById('leiturasAdminTable');
        const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
        const fim = inicio + this.itensPorPagina;
        const pagina = leituras.slice(inicio, fim);
        tbody.innerHTML = pagina.map(l => `
            <tr>
                <td>${new Date(l.data).toLocaleString('pt-BR')}</td>
                <td>${l.tecnico}</td>
                <td>${l.local}</td>
                <td>${l.tipo}</td>
                <td>${l.leituraAtual}</td>
                <td>${l.consumoDia.toFixed(2)}</td>
                <td style="color: ${l.variacao > 0 ? 'var(--success)' : 'var(--danger)'}">
                    ${l.variacao > 0 ? '+' : ''}${l.variacao.toFixed(1)}%
                </td>
                <td>
                    <span class="status-cell status-${this.getStatusClass(l.status)}">
                        ${this.formatStatus(l.status)}
                    </span>
                </td>
                <td>
                    <button class="btn-icon" onclick="app.verDetalhes('${l.id}')" title="Ver detalhes">👁️</button>
                    ${l.status !== 'NORMAL' ? `
                        <button class="btn-icon" onclick="app.aprovar('${l.id}')" title="Aprovar">✓</button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
        this.renderPagination(leituras.length);
    }
    renderPagination(total) {
        const totalPaginas = Math.ceil(total / this.itensPorPagina);
        const container = document.getElementById('paginationControls');
       
        let html = `
            <button class="page-btn" onclick="app.mudarPagina(${this.paginaAtual - 1})"
                    ${this.paginaAtual === 1 ? 'disabled' : ''}>←</button>
        `;
       
        for (let i = 1; i <= totalPaginas; i++) {
            if (i === 1 || i === totalPaginas || (i >= this.paginaAtual - 1 && i <= this.paginaAtual + 1)) {
                html += `
                    <button class="page-btn ${i === this.paginaAtual ? 'active' : ''}"
                            onclick="app.mudarPagina(${i})">${i}</button>
                `;
            } else if (i === this.paginaAtual - 2 || i === this.paginaAtual + 2) {
                html += `<span>...</span>`;
            }
        }
       
        html += `
            <button class="page-btn" onclick="app.mudarPagina(${this.paginaAtual + 1})"
                    ${this.paginaAtual === totalPaginas ? 'disabled' : ''}>→</button>
        `;
       
        container.innerHTML = html;
    }
    mudarPagina(pagina) {
        this.paginaAtual = pagina;
        this.filtrarLeituras();
    }
    verDetalhes(id) {
        this.showToast('Detalhes em desenvolvimento', 'info');
    }
    async aprovar(id) {
        if (!confirm('Aprovar justificativa desta leitura?')) return;
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'aprovarJustificativa',
                    leituraId: id,
                    admin: this.usuario.usuario
                })
            });
            const data = await response.json();
            if (data.success) {
                this.showToast('Justificativa aprovada', 'success');
                this.filtrarLeituras();
            } else {
                throw new Error(data.message);
            }
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }
    exportarExcel() {
        const tabela = document.querySelector('#leiturasAdminTable');
        if (!tabela || tabela.rows.length === 0) {
            this.showToast('Nenhum dado para exportar', 'warning');
            return;
        }
        let csv = '\uFEFF';
        const headers = ['Data', 'Técnico', 'Local', 'Tipo', 'Leitura', 'Consumo', 'Variação', 'Status'];
        csv += headers.join(';') + '\n';
        Array.from(tabela.rows).forEach(row => {
            const cells = Array.from(row.cells).slice(0, -1);
            csv += cells.map(c => `"${c.textContent.replace(/"/g, '""')}"`).join(';') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `leituras_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }
    // ============================================
    // UTILITÁRIOS
    // ============================================
    getStatusClass(status) {
        const map = {
            'NORMAL': 'normal',
            'ALERTA_VARIACAO': 'alerta',
            'VAZAMENTO': 'vazamento',
            'ANOMALIA_NEGATIVO': 'anomalia',
            'CONSUMO_BAIXO': 'anomalia'
        };
        return map[status] || 'normal';
    }
    formatStatus(status) {
        const map = {
            'NORMAL': 'Normal',
            'ALERTA_VARIACAO': 'Alerta',
            'VAZAMENTO': 'Vazamento',
            'ANOMALIA_NEGATIVO': 'Anomalia',
            'CONSUMO_BAIXO': 'Baixo Consumo'
        };
        return map[status] || status;
    }
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        window.scrollTo(0, 0);
    }
    showHeader() {
        document.getElementById('corporateHeader').style.display = 'flex';
        document.getElementById('userName').textContent = this.usuario.nome;
    }
    showLoading(texto) {
        document.getElementById('loadingText').textContent = texto;
        document.getElementById('loadingGlobal').classList.add('show');
    }
    hideLoading() {
        document.getElementById('loadingGlobal').classList.remove('show');
    }
    showError(msg) {
        const el = document.getElementById('loginError');
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 5000);
    }
    showToast(mensagem, tipo = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
       
        const icones = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
       
        toast.innerHTML = `
            <span style="font-size: 1.2rem;">${icones[tipo]}</span>
            <span>${mensagem}</span>
        `;
       
        container.appendChild(toast);
       
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
    closeModal() {
        document.getElementById('modalDetalhes').classList.remove('show');
    }
    setupEventListeners() {
        document.getElementById('loginForm')?.addEventListener('submit', (e) => this.login(e));
        document.getElementById('password')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login(e);
        });
        window.addEventListener('online', () => {
            this.showToast('Conexão restaurada', 'success');
            if (this.usuario?.nivel !== 'admin') {
                this.checkPendentes();
            }
        });
        window.addEventListener('offline', () => {
            this.showToast('Modo offline ativado', 'warning');
        });
        document.addEventListener('gesturestart', (e) => e.preventDefault());
    }
    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(err => {
                console.log('SW registration failed:', err);
            });
        }
    }
}
// Inicialização global
const app = new HidrometroApp();
