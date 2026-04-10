/**
 * SERVICE WORKER v2.9.9.5
 * Estratégia: Cache First para assets, Network First para dados
 */

const CACHE_NAME = 'hidrometros-v2995';
const STATIC_ASSETS = [
  '/hidrometrosrefrigeracao/',
  '/hidrometrosrefrigeracao/assets/style.css',
  '/hidrometrosrefrigeracao/assets/app.js'
];

// Instalação: Cachear assets estáticos e ativar imediatamente
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando v2.9.9.5...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cacheando assets estáticos');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        // Ativa imediatamente sem esperar fechar abas
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Erro ao cachear:', err);
      })
  );
});

// Ativação: Limpar caches antigos
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando v2.9.9.5...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('hidrometros-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deletando cache antigo:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // Tomar controle de todas as abas imediatamente
        return self.clients.claim();
      })
  );
});

// Estratégias de cache por tipo de requisição
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. API Google Apps Script: Network Only (não cachear dados dinâmicos)
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(request)
        .catch((error) => {
          console.log('[SW] API offline:', error);
          // Retorna resposta genérica de offline para POSTs
          if (request.method === 'POST') {
            return new Response(
              JSON.stringify({ 
                success: false, 
                offline: true, 
                message: 'Modo offline - dados serão sincronizados ao reconectar' 
              }),
              { 
                headers: { 'Content-Type': 'application/json' },
                status: 503 
              }
            );
          }
          throw error;
        })
    );
    return;
  }

  // 2. Assets estáticos (CSS, JS, HTML): Cache First, depois Network
  if (request.destination === 'style' || 
      request.destination === 'script' || 
      request.destination === 'document' ||
      url.pathname.includes('/assets/')) {
    
    event.respondWith(
      caches.match(request)
        .then((response) => {
          if (response) {
            // Cache hit - retorna do cache mas atualiza em background (Stale-while-revalidate)
            fetch(request)
              .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, networkResponse);
                  });
                }
              })
              .catch(() => {});
            
            return response;
          }
          
          // Se não está no cache, busca na rede e cacheia
          return fetch(request)
            .then((networkResponse) => {
              if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
              }
              
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
              });
              
              return networkResponse;
            });
        })
    );
    return;
  }

  // 3. Outras requisições (CDN Chart.js, etc): Cache with Network Fallback
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) return response;
        
        return fetch(request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) return networkResponse;
            
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
            
            return networkResponse;
          })
          .catch(() => {
            // Fallback para imagens CDN se offline
            if (request.destination === 'image') {
              return new Response('', { status: 204 }); // Retorna vazio em vez de erro
            }
          });
      })
  );
});

// Background Sync: Tentar reenviar dados quando voltar online
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-leituras') {
    console.log('[SW] Sincronizando leituras pendentes...');
    event.waitUntil(
      // Dispara mensagem para o app tentar reenviar
      self.clients.matchAll()
        .then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'SYNC_LEITURAS' });
          });
        })
    );
  }
});

// Mensagens do app (ex: forçar update)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
});

// Notificações push (preparado para futuro)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'GPS Hidrômetros', {
        body: data.body || 'Nova atualização disponível',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%23003366" width="192" height="192"/><text x="96" y="125" font-size="100" text-anchor="middle" fill="white">💧</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect fill="%23003366" width="96" height="96"/><text x="48" y="60" font-size="50" text-anchor="middle" fill="white">💧</text></svg>',
        tag: 'gps-hidrometros',
        requireInteraction: false
      })
    );
  }
});
