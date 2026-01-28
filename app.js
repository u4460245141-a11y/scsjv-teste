const AppState = {
    video: null, blob: null, duration: 0, start: null, end: null,
    queue: {}, currentEdit: null, tempCategoria: null,
    isPlaying: false, ffmpeg: null, ready: false, processing: false,
    mode: 'normal',
    liveRecording: false,
    livePaused: false,
    livePart: 1,
    liveStartTime: 0,
    livePauseTime: 0,
    liveTotalPaused: 0,
    liveTimerInterval: null,
    liveEvents: [],
    currentLiveTime: 0
};

const Categorias = [
    { nome: 'Golo Marcado', icon: '⚽' }, { nome: 'Golo Sofrido', icon: '🥅' },
    { nome: 'Penalti sofrido', icon: '🛑' }, { nome: 'Penalti cometido', icon: '⚠️' },
    { nome: 'Cartão amarelo', icon: '🟨' }, { nome: 'Duplo cartão amarelo', icon: '🟨🟨' },
    { nome: 'Cartão vermelho', icon: '🟥' }, { nome: 'Livre Ofensivo', icon: '🎯' },
    { nome: 'Livre Defensivo', icon: '🛡️' }, { nome: 'Canto Ofensivo', icon: '⛳' },
    { nome: 'Canto Defensivo', icon: '🚩' }, { nome: 'Erro Guarda-Redes', icon: '❌' },
    { nome: 'Defesa Guarda-Redes', icon: '👐' }, { nome: '1ª Fase', icon: '1️⃣' },
    { nome: '2ª Fase', icon: '2️⃣' }, { nome: '3ª Fase', icon: '3️⃣' },
    { nome: '1ª Fase Adversário', icon: '🔹' }, { nome: '2ª Fase Adversário', icon: '🔸' },
    { nome: '3ª Fase Adversário', icon: '🔺' }, { nome: 'Transição Ofensiva', icon: '⚡' },
    { nome: 'Transição Defensiva', icon: '🔒' }, { nome: 'Organização Ofensiva', icon: '🔷' },
    { nome: 'Organização Defensiva', icon: '🔶' }, { nome: 'Substituição', icon: '🔄' },
    { nome: 'Lançamento', icon: '🚀' }, { nome: 'Foras-de-jogo', icon: '⚳' }
];

const Els = {
    video: document.getElementById('videoPlayer'),
    previewVideo: document.getElementById('previewVideo'),
    timelineWrapper: document.getElementById('timelineWrapper'),
    playhead: document.getElementById('playhead'),
    timelineProgress: document.getElementById('timelineProgress'),
    categoryGrid: document.getElementById('categoryGrid'),
    liveEventsGrid: document.getElementById('liveEventsGrid')
};

// INIT OTIMIZADO PARA GITHUB PAGES (single-thread, sem SharedArrayBuffer)
async function init() {
    try {
        const { createFFmpeg } = FFmpeg;
        
        // Configuração CRÍTICA para GitHub Pages - modo single-thread
        AppState.ffmpeg = createFFmpeg({ 
            log: true,
            mainName: 'main',  // Importante: usar main em vez de worker threads
            corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
            progress: ({ ratio }) => {
                const pct = Math.round(ratio * 100);
                const bar = document.getElementById('progressBar');
                if(bar) bar.style.width = pct + '%';
            }
        });
        
        showNotification('A carregar FFmpeg (modo GitHub Pages)...', 'info');
        await AppState.ffmpeg.load();
        AppState.ready = true;
        console.log('FFmpeg ready (GitHub Pages single-thread mode)');
        showNotification('✅ Sistema pronto! Pode carregar vídeos.', 'success');
        
    } catch(e) {
        console.error('FFmpeg failed:', e);
        AppState.ready = false;
        showNotification('⚠️ Modo limitado: Para exportar vídeos, use Chrome/Edge actualizado.', 'error');
    }

    const catHtml = Categorias.map(c => `
        <button class="category-btn" onclick="selecionarCategoria('${c.nome}')">
            <span class="category-icon">${c.icon}</span>${c.nome}
        </button>
    `).join('');
    Els.categoryGrid.innerHTML = catHtml;

    const liveHtml = Categorias.map(c => `
        <button class="live-event-btn" onclick="captureLiveEvent('${c.nome}')" disabled>
            <span class="live-event-icon">${c.icon}</span>
            <span style="text-align: center; line-height: 1.2; font-size: 0.85rem;">${c.nome}</span>
        </button>
    `).join('');
    Els.liveEventsGrid.innerHTML = liveHtml;

    setupTimelineDrag();
}

// Iniciar quando DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function setupTimelineDrag() {
    let isDragging = false;
    
    Els.playhead.addEventListener('mousedown', (e) => {
        if(!AppState.duration) return;
        isDragging = true;
        e.preventDefault();
        Els.video.pause();
    });

    document.addEventListener('mousemove', (e) => {
        if(!isDragging || !AppState.duration) return;
        
        const rect = Els.timelineWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        
        const newTime = pct * AppState.duration;
        Els.video.currentTime = newTime;
        updateInterface();
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    Els.timelineWrapper.addEventListener('click', (e) => {
        if(e.target === Els.playhead || !AppState.duration) return;
        const rect = Els.timelineWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        Els.video.currentTime = pct * AppState.duration;
        updateInterface();
    });
}

function setMode(mode) {
    AppState.mode = mode;
    document.getElementById('tab-normal').classList.toggle('active', mode === 'normal');
    document.getElementById('tab-live').classList.toggle('active', mode === 'live');
    
    if(mode === 'live') {
        document.getElementById('uploadSection').classList.add('hidden');
        document.getElementById('normalContainer').classList.add('hidden');
        document.getElementById('timelineSection').style.display = 'none';
        document.getElementById('liveInterface').classList.add('active');
        if(AppState.liveRecording) stopLiveRecording();
    } else {
        document.getElementById('uploadSection').classList.remove('hidden');
        document.getElementById('normalContainer').classList.remove('hidden');
        document.getElementById('liveInterface').classList.remove('active');
        if(AppState.video) document.getElementById('timelineSection').style.display = 'block';
    }
}

// ==================== MODO LIVE ====================
        
function updateLiveButtons() {
    const recording = AppState.liveRecording;
    const paused = AppState.livePaused;
    const part = AppState.livePart;
    const hasEvents = AppState.liveEvents.length > 0;
    
    document.getElementById('btnLiveStart').classList.add('hidden');
    document.getElementById('btnLivePause').classList.add('hidden');
    document.getElementById('btnLiveResume').classList.add('hidden');
    document.getElementById('btnEndFirstHalf').classList.add('hidden');
    document.getElementById('btnEndSecondHalf').classList.add('hidden');
    
    const indicator = document.getElementById('livePartIndicator');
    const timer = document.getElementById('liveTimer');
    const status = document.getElementById('liveStatusText');
    
    if(!recording) {
        document.getElementById('btnLiveStart').classList.remove('hidden');
        indicator.style.display = 'none';
        timer.className = 'live-timer';
        status.textContent = 'Pronto para iniciar análise';
    } else {
        indicator.style.display = 'inline-flex';
        indicator.textContent = part === 1 ? '1ª PARTE' : '2ª PARTE';
        indicator.className = 'live-part-indicator' + (part === 2 ? ' part2' : '');
        
        if(paused) {
            document.getElementById('btnLiveResume').classList.remove('hidden');
            
            if(hasEvents) {
                if(part === 1) {
                    document.getElementById('btnEndFirstHalf').classList.remove('hidden');
                } else {
                    document.getElementById('btnEndSecondHalf').classList.remove('hidden');
                }
            }
            
            indicator.classList.add('paused');
            timer.classList.add('paused');
            status.textContent = 'Análise pausada';
        } else {
            document.getElementById('btnLivePause').classList.remove('hidden');
            
            if(part === 2 && hasEvents) {
                document.getElementById('btnEndSecondHalf').classList.remove('hidden');
            }
            
            timer.className = 'live-timer' + (part === 2 ? ' part2' : '');
            indicator.classList.remove('paused');
            status.textContent = part === 1 ? 'A analisar 1ª parte...' : 'A analisar 2ª parte...';
        }
    }
}

function startLiveRecording() {
    AppState.liveRecording = true;
    AppState.livePaused = false;
    AppState.livePart = 1;
    AppState.liveStartTime = Date.now();
    AppState.liveTotalPaused = 0;
    AppState.currentLiveTime = 0;
    AppState.liveEvents = [];
    
    document.getElementById('liveEventsContainer').innerHTML = '';
    document.getElementById('liveEventsList').style.display = 'block';
    document.getElementById('liveEventCount').textContent = '0 eventos';
    
    enableLiveEvents(true);
    startLiveTimer();
    updateLiveButtons();
    showNotification('🔴 1ª Parte iniciada!');
}

function pauseLiveRecording() {
    if(!AppState.liveRecording || AppState.livePaused) return;
    
    AppState.livePaused = true;
    AppState.livePauseTime = Date.now();
    clearInterval(AppState.liveTimerInterval);
    
    enableLiveEvents(false);
    updateLiveButtons();
    showNotification('⏸ Análise pausada');
}

function resumeLiveRecording() {
    if(!AppState.liveRecording || !AppState.livePaused) return;
    
    AppState.livePaused = false;
    const pauseDuration = Date.now() - AppState.livePauseTime;
    AppState.liveTotalPaused += pauseDuration;
    
    enableLiveEvents(true);
    startLiveTimer();
    updateLiveButtons();
    showNotification('▶ Análise retomada');
}

function endFirstHalf() {
    if(AppState.liveEvents.length === 0) {
        showNotification('Não há eventos para exportar!', 'error');
        return;
    }
    
    const gameName = document.getElementById('liveGameName').value || 'Analise';
    exportLiveTxt(`${gameName}_1ªParte`, 1);
    
    AppState.livePart = 2;
    AppState.liveEvents = [];
    AppState.liveStartTime = Date.now();
    AppState.liveTotalPaused = 0;
    AppState.currentLiveTime = 0;
    AppState.livePaused = false;
    
    document.getElementById('liveEventsContainer').innerHTML = '';
    document.getElementById('liveEventCount').textContent = '0 eventos';
    document.getElementById('liveTimer').textContent = '00:00.0';
    
    clearInterval(AppState.liveTimerInterval);
    startLiveTimer();
    enableLiveEvents(true);
    updateLiveButtons();
    
    showNotification('✅ 1ª Parte exportada! 2ª Parte iniciada automaticamente.');
}

function endSecondHalf() {
    if(AppState.liveEvents.length === 0) {
        showNotification('Não há eventos na 2ª parte para exportar!', 'error');
        return;
    }
    
    const gameName = document.getElementById('liveGameName').value || 'Analise';
    exportLiveTxt(`${gameName}_2ªParte`, 2);
    
    AppState.liveRecording = false;
    AppState.livePaused = false;
    clearInterval(AppState.liveTimerInterval);
    
    document.getElementById('liveEventsList').style.display = 'none';
    enableLiveEvents(false);
    updateLiveButtons();
    showNotification('✅ 2ª Parte exportada! Análise completa.');
}

function startLiveTimer() {
    clearInterval(AppState.liveTimerInterval);
    AppState.liveTimerInterval = setInterval(() => {
        if(AppState.livePaused) return;
        
        const now = Date.now();
        const elapsed = (now - AppState.liveStartTime - AppState.liveTotalPaused) / 1000;
        AppState.currentLiveTime = elapsed;
        document.getElementById('liveTimer').textContent = formatTime(elapsed);
    }, 100);
}

function enableLiveEvents(enable) {
    document.querySelectorAll('.live-event-btn').forEach(btn => {
        btn.disabled = !enable;
    });
}

function captureLiveEvent(categoria) {
    if(!AppState.liveRecording || AppState.livePaused) return;
    
    const preTime = parseInt(document.getElementById('livePreTime').value) || 10;
    const postTime = parseInt(document.getElementById('livePostTime').value) || 15;
    
    const clickTime = AppState.currentLiveTime;
    const startTime = Math.max(0, clickTime - preTime);
    const endTime = clickTime + postTime;
    
    const existing = AppState.liveEvents.filter(e => e.categoria === categoria).length;
    const nome = existing === 0 ? categoria : `${categoria} ${existing + 1}`;
    
    const evento = {
        id: Date.now(),
        categoria,
        nome,
        clickTime,
        start: startTime,
        end: endTime,
        part: AppState.livePart,
        preTime,
        postTime
    };
    
    AppState.liveEvents.push(evento);
    
    const div = document.createElement('div');
    div.className = 'live-event-item' + (AppState.livePart === 2 ? ' part2' : '');
    div.innerHTML = `
        <div class="live-event-item-info">
            <div class="live-event-item-title">
                ${nome}
                <span class="live-event-item-part">${AppState.livePart}ªP</span>
            </div>
            <div class="live-event-item-time">
                @ ${formatTime(clickTime)} | ${formatTime(startTime)} → ${formatTime(endTime)}
            </div>
        </div>
        <button class="live-event-item-delete" onclick="removerLiveEvent(${evento.id})">🗑️</button>
    `;
    div.id = `live-event-${evento.id}`;
    document.getElementById('liveEventsContainer').appendChild(div);
    
    document.getElementById('liveEventCount').textContent = `${AppState.liveEvents.length} evento(s)`;
    document.getElementById('liveEventsContainer').scrollTop = document.getElementById('liveEventsContainer').scrollHeight;
    
    updateLiveButtons();
}

function removerLiveEvent(id) {
    AppState.liveEvents = AppState.liveEvents.filter(e => e.id !== id);
    const el = document.getElementById(`live-event-${id}`);
    if(el) el.remove();
    document.getElementById('liveEventCount').textContent = `${AppState.liveEvents.length} evento(s)`;
    updateLiveButtons();
}

function exportLiveTxt(fileName, partFilter) {
    const events = AppState.liveEvents.filter(e => e.part === partFilter);
    if(events.length === 0) return;
    
    const grupos = {};
    events.forEach(e => {
        if(!grupos[e.categoria]) grupos[e.categoria] = [];
        grupos[e.categoria].push(e);
    });
    
    let conteudo = `===============================================\n`;
    conteudo += `RELATÓRIO DE ANÁLISE - ${partFilter}ª PARTE\n`;
    conteudo += `Ferramenta: Análise SCSJV\n`;
    conteudo += `Jogo: ${document.getElementById('liveGameName').value || 'Análise'}\n`;
    conteudo += `Data: ${new Date().toLocaleString('pt-PT')}\n`;
    conteudo += `Total de Eventos: ${events.length}\n`;
    conteudo += `===============================================\n\n`;
    
    Object.keys(grupos).forEach(cat => {
        conteudo += `EVENTO: ${cat.toUpperCase()}\n`;
        conteudo += `-----------------------------------------------\n`;
        grupos[cat].forEach(e => {
            conteudo += `• ${e.nome}\n`;
            conteudo += `  Momento: ${formatTime(e.clickTime)}\n`;
            conteudo += `  Clip: ${formatTime(e.start)} - ${formatTime(e.end)}\n`;
            conteudo += `  (Pré: ${e.preTime}s | Pós: ${e.postTime}s)\n\n`;
        });
        conteudo += `\n`;
    });
    
    const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
    if(typeof saveAs !== 'undefined') {
        saveAs(blob, `${fileName.replace(/\s+/g, '_')}.txt`);
    } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName.replace(/\s+/g, '_')}.txt`;
        a.click();
    }
}

// ==================== MODO NORMAL (VÍDEO) ====================
        
document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;

    AppState.blob = file;
    const url = URL.createObjectURL(file);
    Els.video.src = url;
    Els.video.style.display = 'block';
    document.getElementById('placeholder').style.display = 'none';
    document.getElementById('timelineSection').style.display = 'block';
    document.getElementById('uploadText').textContent = file.name;

    resetCorte();

    Els.video.addEventListener('loadedmetadata', () => {
        AppState.duration = Els.video.duration;
        AppState.video = Els.video;
        document.getElementById('totalDuration').textContent = formatTime(AppState.duration);
        document.getElementById('timelineTotal').textContent = formatTime(AppState.duration);
        document.getElementById('btnSetStart').disabled = false;
        document.getElementById('btnSetEnd').disabled = false;
        showNotification('✅ Vídeo carregado! Pronto para cortar.');
    });

    Els.video.addEventListener('timeupdate', updateInterface);
});

function updateInterface() {
    const current = Els.video.currentTime;
    const duration = AppState.duration;
    
    document.getElementById('currentPos').textContent = formatTime(current);
    document.getElementById('timelinePos').textContent = formatTime(current);
    
    const progressPct = (current / duration) * 100;
    Els.timelineProgress.style.width = progressPct + '%';
    Els.playhead.style.left = progressPct + '%';
    
    document.getElementById('mainPlayBtn').textContent = Els.video.paused ? '▶' : '⏸';
}

function definirInicio() {
    AppState.start = Els.video.currentTime;
    if(AppState.end !== null && AppState.end <= AppState.start) AppState.end = null;
    updateCutDisplay();
    document.getElementById('btnSetStart').classList.add('active');
    document.getElementById('btnReset').style.display = 'block';
    updateTimelineCut();
}

function definirFim() {
    if(AppState.start === null) return showNotification('Defina o início primeiro!', 'error');
    if(Els.video.currentTime <= AppState.start) return showNotification('Fim deve ser depois do início!', 'error');
    
    AppState.end = Els.video.currentTime;
    updateCutDisplay();
    document.getElementById('btnSetEnd').classList.add('active');
    document.getElementById('btnPreview').disabled = false;
    updateTimelineCut();
}

function updateCutDisplay() {
    const display = document.getElementById('cutRangeDisplay');
    if(AppState.start === null && AppState.end === null) {
        display.innerHTML = '<span style="color: var(--gray);">Aguardando...</span>';
    } else {
        const s = AppState.start !== null ? formatTime(AppState.start) : '--:--.-';
        const e = AppState.end !== null ? formatTime(AppState.end) : '--:--.-';
        display.innerHTML = `<span class="start">${s}</span><span class="sep">→</span><span class="end">${e}</span>`;
    }
}

function updateTimelineCut() {
    if(AppState.start === null) return;
    const startPct = (AppState.start / AppState.duration) * 100;
    const cutRange = document.getElementById('timelineCutRange');
    cutRange.style.left = startPct + '%';
    
    if(AppState.end !== null) {
        const endPct = (AppState.end / AppState.duration) * 100;
        cutRange.style.width = (endPct - startPct) + '%';
        cutRange.classList.add('active');
    }
}

function resetCorte() {
    AppState.start = null;
    AppState.end = null;
    updateCutDisplay();
    document.getElementById('btnSetStart').classList.remove('active');
    document.getElementById('btnSetEnd').classList.remove('active');
    document.getElementById('btnPreview').disabled = true;
    document.getElementById('btnReset').style.display = 'none';
    document.getElementById('timelineCutRange').classList.remove('active');
}

function togglePlay() {
    if(Els.video.paused) Els.video.play();
    else Els.video.pause();
}

function skip(seconds) {
    Els.video.currentTime = Math.max(0, Math.min(AppState.duration, Els.video.currentTime + seconds));
}

// PREVIEW
function abrirPreview() {
    if(AppState.start === null || AppState.end === null) return;
    document.getElementById('previewStart').textContent = formatTime(AppState.start);
    document.getElementById('previewEnd').textContent = formatTime(AppState.end);
    document.getElementById('previewDuration').textContent = `Duração: ${(AppState.end - AppState.start).toFixed(1)}s`;
    
    Els.previewVideo.src = Els.video.src;
    Els.previewVideo.currentTime = AppState.start;
    document.getElementById('previewModal').classList.add('active');
    
    setTimeout(() => togglePreviewPlay(), 300);
}

function editarTempo(tipo) {
    const el = document.getElementById(tipo === 'start' ? 'previewStart' : 'previewEnd');
    const atual = tipo === 'start' ? AppState.start : AppState.end;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'time-editor';
    input.value = formatTime(atual);
    
    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();
    
    Els.previewVideo.pause();
    
    function confirmar() {
        const val = parseTime(input.value);
        if(val !== null) {
            if(tipo === 'start' && val >= 0 && val < AppState.end) {
                AppState.start = val;
                Els.previewVideo.currentTime = val;
            } else if(tipo === 'end' && val > AppState.start && val <= AppState.duration) {
                AppState.end = val;
            } else {
                showNotification('Tempo inválido!', 'error');
            }
        }
        document.getElementById('previewStart').textContent = formatTime(AppState.start);
        document.getElementById('previewEnd').textContent = formatTime(AppState.end);
        document.getElementById('previewDuration').textContent = `Duração: ${(AppState.end - AppState.start).toFixed(1)}s`;
        updateCutDisplay();
        updateTimelineCut();
    }
    
    input.addEventListener('blur', confirmar);
    input.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') input.blur();
    });
}

function togglePreviewPlay() {
    if(AppState.isPlaying) {
        Els.previewVideo.pause();
        AppState.isPlaying = false;
    } else {
        if(Els.previewVideo.currentTime >= AppState.end) Els.previewVideo.currentTime = AppState.start;
        Els.previewVideo.play();
        AppState.isPlaying = true;
        
        const check = setInterval(() => {
            if(!AppState.isPlaying) clearInterval(check);
            if(Els.previewVideo.currentTime >= AppState.end) {
                Els.previewVideo.pause();
                AppState.isPlaying = false;
                document.getElementById('previewPlayBtn').textContent = '▶';
                clearInterval(check);
            }
            document.getElementById('previewTimeDisplay').textContent = formatTime(Els.previewVideo.currentTime);
        }, 50);
    }
    document.getElementById('previewPlayBtn').textContent = AppState.isPlaying ? '⏸' : '▶';
}

function previewSkip(seconds) {
    Els.previewVideo.currentTime = Math.max(AppState.start, Math.min(AppState.end, Els.previewVideo.currentTime + seconds));
}

function fecharPreview() {
    Els.previewVideo.pause();
    AppState.isPlaying = false;
    document.getElementById('previewModal').classList.remove('active');
}

// CATEGORIZAÇÃO
function iniciarSelecaoCategoria() {
    fecharPreview();
    AppState.currentEdit = { 
        start: AppState.start, 
        end: AppState.end, 
        duration: AppState.end - AppState.start 
    };
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('selectedCatDisplay').textContent = 'Nenhuma categoria selecionada';
    document.getElementById('btnConfirmCat').disabled = true;
    document.getElementById('categoryModal').classList.add('active');
}

function selecionarCategoria(nome) {
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
    const btn = document.querySelector(`[onclick="selecionarCategoria('${nome}')"]`);
    if(btn) btn.classList.add('selected');
    AppState.tempCategoria = nome;
    document.getElementById('selectedCatDisplay').textContent = `Selecionado: ${nome}`;
    document.getElementById('btnConfirmCat').disabled = false;
}

function confirmarCategoria() {
    if(!AppState.tempCategoria || !AppState.currentEdit) return;
    
    if(!AppState.queue[AppState.tempCategoria]) AppState.queue[AppState.tempCategoria] = [];
    
    const count = AppState.queue[AppState.tempCategoria].length + 1;
    const nome = count === 1 ? AppState.tempCategoria : `${AppState.tempCategoria} ${count}`;
    
    AppState.queue[AppState.tempCategoria].push({
        ...AppState.currentEdit,
        id: Date.now(),
        categoria: AppState.tempCategoria,
        nome: nome,
        nomeDisplay: nome
    });
    
    renderQueue();
    showNotification(`✅ Adicionado: ${nome}`);
    document.getElementById('categoryModal').classList.remove('active');
    resetCorte();
}

function renderQueue() {
    const container = document.getElementById('queueList');
    let total = 0;
    Object.keys(AppState.queue).forEach(k => total += AppState.queue[k].length);
    
    document.getElementById('queueCount').textContent = total;
    document.getElementById('btnProcess').disabled = total === 0 || AppState.processing;
    
    if(total === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--gray);">Nenhum corte na fila</div>';
        return;
    }
    
    container.innerHTML = Object.keys(AppState.queue).map(cat => {
        const items = AppState.queue[cat];
        const catInfo = Categorias.find(c => c.nome === cat) || { icon: '📁' };
        
        return `
            <div class="category-group">
                <div class="category-header">
                    <div>${catInfo.icon} ${cat}</div>
                    <div>
                        <span class="category-count">${items.length} clip(s)</span>
                        <button class="btn-process-cat" onclick="exportarCategoria('${cat}')">📥 ZIP</button>
                    </div>
                </div>
                <div class="category-items">
                    ${items.map(item => `
                        <div class="queue-item">
                            <div>
                                <div class="queue-item-name">${item.nomeDisplay}</div>
                                <div class="queue-item-time">${formatTime(item.start)} → ${formatTime(item.end)} (${item.duration.toFixed(1)}s)</div>
                            </div>
                            <button onclick="removerFila('${cat}', ${item.id})" 
                                    style="background: transparent; border: 1px solid var(--danger); color: var(--danger); padding: 5px 10px; border-radius: 4px; cursor: pointer;">🗑️</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function removerFila(cat, id) {
    AppState.queue[cat] = AppState.queue[cat].filter(i => i.id !== id);
    if(AppState.queue[cat].length === 0) delete AppState.queue[cat];
    renderQueue();
}

// EXPORTAÇÃO COM FFMPEG
async function exportarCategoria(categoria) {
    if(!AppState.ready || !AppState.ffmpeg) {
        showNotification('FFmpeg não está pronto. A exportar metadados apenas...', 'error');
        return exportarCategoriaComoInfo(categoria);
    }
    
    const items = AppState.queue[categoria];
    if(!items || items.length === 0) return;
    
    AppState.processing = true;
    document.getElementById('processModal').classList.add('active');
    document.getElementById('progressText').textContent = `A processar ${categoria}...`;
    document.getElementById('processDetail').textContent = 'Preparando FFmpeg...';
    
    const zip = new JSZip();
    const folder = zip.folder(categoria);
    
    try {
        const videoName = 'input.mp4';
        if(!AppState.blob) throw new Error('Sem vídeo carregado');
        
        document.getElementById('processDetail').textContent = 'Carregando vídeo no processador...';
        AppState.ffmpeg.FS('writeFile', videoName, await fetchFile(AppState.blob));
        
        for(let i = 0; i < items.length; i++) {
            const item = items[i];
            const outputName = `${item.nome.replace(/\s+/g, '_')}.mp4`;
            
            document.getElementById('progressText').textContent = `A cortar: ${item.nomeDisplay} (${i+1}/${items.length})`;
            document.getElementById('processDetail').textContent = `Intervalo: ${formatTime(item.start)} - ${formatTime(item.end)}`;
            document.getElementById('progressBar').style.width = '0%';
            
            const duration = item.end - item.start;
            await AppState.ffmpeg.run(
                '-i', videoName,
                '-ss', item.start.toString(),
                '-t', duration.toString(),
                '-c', 'copy',
                '-avoid_negative_ts', 'make_zero',
                outputName
            );
            
            const data = AppState.ffmpeg.FS('readFile', outputName);
            const blob = new Blob([data.buffer], { type: 'video/mp4' });
            folder.file(outputName, blob);
            
            AppState.ffmpeg.FS('unlink', outputName);
            
            const pct = Math.round(((i + 1) / items.length) * 100);
            document.getElementById('progressBar').style.width = pct + '%';
        }
        
        AppState.ffmpeg.FS('unlink', videoName);
        
        document.getElementById('processDetail').textContent = 'A criar arquivo ZIP...';
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `${categoria.replace(/\s+/g, '_')}_cortes.zip`);
        
        showNotification(`✅ ${categoria} exportado em vídeo!`);
        
    } catch(err) {
        console.error(err);
        showNotification('Erro na exportação vídeo. Exportando metadados...', 'error');
        exportarCategoriaComoInfo(categoria);
    }
    
    document.getElementById('processModal').classList.remove('active');
    AppState.processing = false;
    if(document.getElementById('progressBar')) document.getElementById('progressBar').style.width = '0%';
}

async function fetchFile(file) {
    const response = await fetch(URL.createObjectURL(file));
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
}

function exportarCategoriaComoInfo(categoria) {
    const items = AppState.queue[categoria];
    let txt = `CORTES - ${categoria}\n\n`;
    items.forEach(item => {
        txt += `${item.nomeDisplay}: ${formatTime(item.start)} - ${formatTime(item.end)}\n`;
    });
    const blob = new Blob([txt], {type: 'text/plain'});
    if(typeof saveAs !== 'undefined') {
        saveAs(blob, `${categoria}_tempos.txt`);
    } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${categoria}_tempos.txt`;
        a.click();
    }
}

async function processarTudo() {
    const categorias = Object.keys(AppState.queue);
    if(categorias.length === 0) return;
    
    if(!AppState.ready || !AppState.ffmpeg) {
        showNotification('FFmpeg não disponível. Não é possível exportar vídeos.', 'error');
        return;
    }
    
    AppState.processing = true;
    document.getElementById('processModal').classList.add('active');
    document.getElementById('progressText').textContent = 'Iniciando exportação completa...';
    
    const videoName = 'input.mp4';
    document.getElementById('processDetail').textContent = 'Carregando vídeo no processador...';
    AppState.ffmpeg.FS('writeFile', videoName, await fetchFile(AppState.blob));
    
    let totalItems = 0;
    let processed = 0;
    categorias.forEach(c => totalItems += AppState.queue[c].length);
    
    const zip = new JSZip();
    
    try {
        for(const cat of categorias) {
            const folder = zip.folder(cat);
            const items = AppState.queue[cat];
            
            for(const item of items) {
                processed++;
                const outputName = `${item.nome.replace(/\s+/g, '_')}.mp4`;
                
                document.getElementById('progressText').textContent = `A processar: ${item.nomeDisplay}`;
                document.getElementById('processDetail').textContent = `Categoria: ${cat} (${processed}/${totalItems})`;
                
                const duration = item.end - item.start;
                await AppState.ffmpeg.run(
                    '-i', videoName,
                    '-ss', item.start.toString(),
                    '-t', duration.toString(),
                    '-c', 'copy',
                    outputName
                );
                
                const data = AppState.ffmpeg.FS('readFile', outputName);
                const blob = new Blob([data.buffer], { type: 'video/mp4' });
                folder.file(outputName, blob);
                AppState.ffmpeg.FS('unlink', outputName);
                
                const pct = Math.round((processed / totalItems) * 100);
                document.getElementById('progressBar').style.width = pct + '%';
            }
        }
        
        AppState.ffmpeg.FS('unlink', videoName);
        
        document.getElementById('processDetail').textContent = 'Finalizando arquivo ZIP...';
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `Analise_Completa_${new Date().getTime()}.zip`);
        
        showNotification('✅ Todos os vídeos exportados com sucesso!');
        
        AppState.queue = {};
        renderQueue();
        
    } catch(err) {
        console.error(err);
        showNotification('Erro na exportação. Tente exportar por categoria.', 'error');
    }
    
    document.getElementById('processModal').classList.remove('active');
    AppState.processing = false;
    if(document.getElementById('progressBar')) document.getElementById('progressBar').style.width = '0%';
}

// HELPERS
function formatTime(s) {
    if(s === null || isNaN(s) || s < 0) return '00:00.0';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 10);
    return `${m}:${sec.toString().padStart(2,'0')}.${ms}`;
}

function parseTime(str) {
    if(!str) return null;
    str = str.trim().replace(',', '.');
    if(str.includes(':')) {
        const parts = str.split(':');
        const mins = parseInt(parts[0]) || 0;
        const secs = parseFloat(parts[1]) || 0;
        return mins * 60 + secs;
    }
    const val = parseFloat(str);
    return isNaN(val) ? null : val;
}

function showNotification(msg, type='success') {
    const n = document.getElementById('notification');
    if(!n) return;
    n.textContent = msg;
    n.className = 'notification show' + (type === 'error' ? ' error' : '');
    setTimeout(() => n.classList.remove('show'), 4000);
}

// TECLADO
document.addEventListener('keydown', (e) => {
    if(AppState.mode === 'live') {
        if(e.key === 'Escape' && AppState.liveRecording) pauseLiveRecording();
        return;
    }
    
    if(document.getElementById('categoryModal').classList.contains('active')) {
        if(e.key === 'Escape') document.getElementById('categoryModal').classList.remove('active');
        return;
    }
    if(document.getElementById('previewModal').classList.contains('active')) {
        if(e.key === 'Escape') fecharPreview();
        if(e.key === ' ') { e.preventDefault(); togglePreviewPlay(); }
        return;
    }
    if(e.target.tagName === 'INPUT') return;
    if(e.key === ' ') { e.preventDefault(); togglePlay(); }
    if(e.key === 'ArrowLeft') skip(-5);
    if(e.key === 'ArrowRight') skip(5);
    if(e.key === 'i' || e.key === 'I') definirInicio();
    if(e.key === 'o' || e.key === 'O') definirFim();
});