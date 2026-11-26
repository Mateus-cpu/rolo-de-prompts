// Rolo: lista, filtra e exibe os vídeos de window.VIDEOS (gerado por gerar.py).
// Todo texto vindo dos dados entra por textContent; nenhum HTML é interpretado.
(() => {
  'use strict';

  const LOTE = 40;
  const ESPERA_BUSCA_MS = 140;
  const VISIVEL_PARA_TOCAR = 0.35;
  const CHAVE_PREFERENCIAS = 'rolo.preferencias.v1';
  const COLUNAS_VALIDAS = [1, 2, 3];
  const AVISO_MS = 1800;
  const ATRASO_MAXIMO = 12;
  const SLUG_VALIDO = /^[a-z0-9-]+$/;
  const SVG = 'http://www.w3.org/2000/svg';
  const TITULO = document.title;
  const CATEGORIAS = { motion: 'Motion graphics', explainer: 'Explicativos', '3d': 'Cenas 3D', interactive: 'Jogos e interativos' };
  const TECNICAS = {
    canvas: 'Canvas', svg: 'SVG', threejs: 'Three.js', shader: 'Shader', gsap: 'GSAP', css: 'CSS', audio: 'Áudio',
    playable: 'Jogável', particles: 'Partículas', pixel: 'Pixel', webgl: 'WebGL', physics: 'Física', 'ai-image': 'Imagem de IA',
  };
  const ORDENS = {
    original: null,
    destaques: (a, b) => Number(Boolean(b.refeito)) - Number(Boolean(a.refeito)) || Number(Boolean(b.video)) - Number(Boolean(a.video)) || a.ordem - b.ordem,
    recentes: (a, b) => b.data.localeCompare(a.data) || a.ordem - b.ordem,
    longos: (a, b) => b.prompt.length - a.prompt.length,
    curtos: (a, b) => a.prompt.length - b.prompt.length,
    autor: (a, b) => a.autor.localeCompare(b.autor, 'pt-BR', { sensitivity: 'base' }),
  };
  const INICIAL = Object.freeze({ busca: '', categoria: '', tecnicas: Object.freeze([]), soVideo: false, soCompleto: false, ordem: 'destaques' });
  const ICONES = {
    tudo: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z',
    motion: 'M3 4h14v12H3zM7 4v12M13 4v12M3 10h4M13 10h4',
    explainer: 'M2 8l8-4 8 4-8 4zM5 10v4c2 2 8 2 10 0v-4',
    '3d': 'M10 2l7 4v8l-7 4-7-4V6zM3 6l7 4 7-4M10 10v8',
    interactive: 'M6 7h8a4 4 0 0 1 4 4v1a3 3 0 0 1-5 2l-1-1H8l-1 1a3 3 0 0 1-5-2v-1a4 4 0 0 1 4-4zM6 10v2M5 11h2M14 11h.01',
    copiar: 'M7 7h9v10H7zM4 13V3h9',
    fora: 'M8 4H4v12h12v-4M11 3h6v6M17 3l-8 8',
    play: 'M6 4v12l10-6z',
    codigo: 'M7 6l-4 4 4 4M13 6l4 4-4 4',
    col1: 'M5 3h10v14H5z', col2: 'M3 3h6v14H3zM11 3h6v14h-6z', col3: 'M2 3h4v14H2zM8 3h4v14H8zM14 3h4v14h-4z',
  };
  const NOVA_ABA = { target: '_blank', rel: 'noopener noreferrer' };
  const economia = navigator.connection?.saveData === true;
  const poucoMovimento = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (id) => document.getElementById(id);

  function h(tag, props = {}, ...filhos) {
    const el = document.createElement(tag);
    for (const [chave, valor] of Object.entries(props)) {
      if (valor === false || valor == null) continue;
      if (chave === 'class') el.className = valor;
      else if (chave === 'texto') el.textContent = valor;
      else if (chave.startsWith('on')) el.addEventListener(chave.slice(2), valor);
      else el.setAttribute(chave, valor === true ? '' : valor);
    }
    el.append(...filhos.filter(Boolean));
    return el;
  }

  function icone(nome) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    const forma = document.createElementNS(SVG, 'path');
    forma.setAttribute('d', ICONES[nome]);
    svg.append(forma);
    return svg;
  }

  function lerPreferencias() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) || '{}');
      return { comparar: salvo.comparar !== false, colunas: COLUNAS_VALIDAS.includes(salvo.colunas) ? salvo.colunas : 2 };
    } catch (erro) {
      console.warn('Preferências indisponíveis; usando o padrão.', erro);
      return { comparar: true, colunas: 2 };
    }
  }

  function salvarPreferencias(preferencias) {
    try { localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(preferencias)); } catch (erro) { console.warn('Não deu para salvar as preferências.', erro); }
  }


  const semAcento = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dataBr = (iso) => iso.split('-').reverse().join('/');
  const etiquetasDe = (item) => [CATEGORIAS[item.categoria] || item.categoria, ...item.tags.map((t) => TECNICAS[t] || t)];
  const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

  function preparar(bruto) {
    if (!Array.isArray(bruto)) throw new Error('dados.js não carregou ou está em formato inesperado');
    return bruto.map((item, i) => Object.freeze({
      ...item,
      ordem: i,
      numero: i + 1,
      indice: semAcento([item.prompt, item.autor, item.titulo, ...etiquetasDe(item)].join(' ')),
    }));
  }

  function filtrar(itens, estado) {
    const termos = semAcento(estado.busca).split(/\s+/).filter(Boolean);
    const lista = itens.filter((item) =>
      (!estado.categoria || item.categoria === estado.categoria) &&
      estado.tecnicas.every((t) => item.tags.includes(t)) &&
      (!estado.soVideo || item.video) &&
      (!estado.soCompleto || !item.parcial) &&
      termos.every((t) => item.indice.includes(t)));
    const comparar = ORDENS[estado.ordem];
    return comparar ? [...lista].sort(comparar) : lista;
  }

  // ---------- aviso e cópia ----------
  let relogioAviso = 0;
  function avisar(texto) {
    const el = $('aviso');
    el.textContent = texto;
    el.hidden = false;
    ($('detalhe').open ? $('detalhe') : document.body).append(el); // dentro do diálogo aberto para ficar por cima
    clearTimeout(relogioAviso);
    relogioAviso = setTimeout(() => { el.hidden = true; }, AVISO_MS);
  }

  function copiarPorSelecao(texto, onde) {
    const area = h('textarea', { readonly: true, style: 'position:fixed;opacity:0;top:0;left:0' });
    area.value = texto;
    onde.append(area);
    area.select();
    const deuCerto = document.execCommand('copy');
    area.remove();
    return deuCerto;
  }

  async function copiar(texto, mensagem, botao) {
    let deuCerto;
    try {
      await navigator.clipboard.writeText(texto);
      deuCerto = true;
    } catch (erro) {
      console.warn('Área de transferência recusou; usando seleção.', erro);
      deuCerto = copiarPorSelecao(texto, botao.closest('dialog') || document.body);
    }
    avisar(deuCerto ? mensagem : 'Não deu para copiar. Selecione o texto e copie à mão.');
  }

  function imagem(item, alt) {
    const img = h('img', { src: item.capa, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('load', () => img.classList.add('pronta'));
    img.addEventListener('error', () => console.warn('Capa não carregou:', item.slug));
    return img;
  }

  // ---------- par de telas ----------
  // Os vídeos da grade só recebem endereço quando entram na tela, e pausam ao sair.
  const tocarSozinho = !poucoMovimento && !economia;
  const vigia = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      const video = entrada.target;
      if (entrada.intersectionRatio >= VISIVEL_PARA_TOCAR) {
        if (!video.src) video.src = video.dataset.src;
        video.play().catch((erro) => console.warn('O navegador não deixou tocar sozinho:', erro.name));
      } else if (!video.paused) {
        video.pause();
      }
    }
  }, { threshold: [0, VISIVEL_PARA_TOCAR] });

  function telaDeVideo({ fonte, capa, rotulo, iconeNome, descricao, aoAbrir }) {
    const video = h('video', { muted: true, loop: true, playsinline: true, preload: 'none', poster: capa || null, 'data-src': fonte, 'aria-hidden': 'true', tabindex: '-1' });
    video.muted = true;
    video.addEventListener('error', () => console.warn('Vídeo da grade não carregou:', fonte));
    const botao = h('button', { class: 'meia', type: 'button', 'aria-label': descricao, onclick: aoAbrir },
      video, h('span', { class: 'selo' }, icone(iconeNome), h('span', { texto: rotulo })));
    if (tocarSozinho) vigia.observe(video);
    else {
      botao.addEventListener('pointerenter', () => { if (!video.src) video.src = video.dataset.src; video.play().catch(() => {}); });
      botao.addEventListener('pointerleave', () => video.pause());
    }
    return botao;
  }

  function telaOriginal(item, abrir) {
    const aoAbrir = (e) => abrir(item, e.currentTarget, 'original');
    if (item.video) {
      return telaDeVideo({ fonte: item.previa || item.video, capa: item.capa, rotulo: 'Original', iconeNome: 'play', descricao: `Abrir o original de @${item.autor}`, aoAbrir });
    }
    return h('button', { class: 'meia', type: 'button', 'aria-label': `Abrir o quadro de @${item.autor}`, onclick: aoAbrir },
      imagem(item, ''), h('span', { class: 'selo' }, h('span', { texto: 'Vídeo no post' })));
  }

  function telaAoLado(item, abrir) {
    if (item.refeito) {
      return telaDeVideo({ fonte: item.refeitoPrevia, capa: item.refeitoCapa, rotulo: 'Refeito', iconeNome: 'codigo', descricao: `Abrir a versão refeita do vídeo de @${item.autor}`, aoAbrir: (e) => abrir(item, e.currentTarget, 'refeito') });
    }
    return h('button', { class: 'meia meia--prompt', type: 'button', 'aria-label': `Abrir o prompt de @${item.autor}`, onclick: (e) => abrir(item, e.currentTarget, 'original') },
      h('p', { texto: item.prompt.replace(/\s+/g, ' ').slice(0, 400) }),
      h('span', { class: 'selo' }, h('span', { texto: item.parcial ? 'Texto do post' : 'Prompt' })));
  }

  function montarCartao(item, abrir, posicao, comparar) {
    const copiarBotao = h('button', { class: 'icone', type: 'button', 'aria-label': 'Copiar prompt', title: 'Copiar prompt' }, icone('copiar'));
    copiarBotao.addEventListener('click', () => copiar(item.prompt, 'Prompt copiado', copiarBotao));
    const acoes = h('div', { class: 'par__acoes' },
      copiarBotao,
      h('a', { class: 'icone', href: item.post, ...NOVA_ABA, 'aria-label': 'Abrir o post original', title: 'Post original' }, icone('fora')));
    const autor = h('a', { class: 'par__autor', href: item.post, ...NOVA_ABA, texto: `@${item.autor}` });
    const credito = item.refeito
      ? h('a', { class: 'par__credito', href: item.skillry, ...NOVA_ABA, texto: 'refeito por Skillry' })
      : h('span', { class: 'par__credito', texto: plural(item.prompt.length, 'caractere', 'caracteres') });
    const cartao = h('article', { class: 'par' },
      h('div', { class: 'par__telas' }, telaOriginal(item, abrir), comparar && telaAoLado(item, abrir)),
      h('div', { class: 'par__legenda' },
        comparar ? h('div', { class: 'par__lado' }, autor) : h('div', { class: 'par__lado' }, autor, acoes),
        comparar && h('div', { class: 'par__lado' }, credito, acoes)));
    cartao.style.setProperty('--partes', comparar ? '2' : '1');
    cartao.style.setProperty('--i', String(Math.min(posicao, ATRASO_MAXIMO)));
    return cartao;
  }

  // ---------- folha de detalhe ----------
  function criarDetalhe(total) {
    const dialogo = $('detalhe');
    const tela = $('d-tela');
    const lado = $('d-lado');
    const pe = $('d-pe');
    let lista = [];
    let posicao = -1;
    let origem = null;
    let versao = 'original';
    const seletor = $('d-versao');

    function midia(item) {
      const refeito = versao === 'refeito' && item.refeito;
      if (!refeito && !item.video) return [imagem(item, `Quadro do vídeo de @${item.autor}`)];
      const video = h('video', { src: refeito ? item.refeito : item.video, poster: refeito ? item.refeitoCapa : item.capa, controls: true, autoplay: true, playsinline: true, loop: true, preload: 'auto' });
      video.addEventListener('error', () => {
        console.error('Vídeo não carregou:', video.src);
        const capa = imagem(item, '');
        capa.classList.add('pronta');
        tela.replaceChildren(capa, h('p', { class: 'folha__falha', texto: 'O vídeo não carregou. Veja no post original.' }));
      });
      return [video];
    }

    function mostrarMidia() {
      const item = lista[posicao];
      if (!item.refeito) versao = 'original';
      tela.replaceChildren(...midia(item));
      seletor.hidden = !item.refeito;
      seletor.replaceChildren(...[['original', 'Original'], ['refeito', 'Refeito']].map(([id, rotulo]) =>
        h('button', { type: 'button', 'aria-pressed': String(versao === id), texto: rotulo, onclick: () => { versao = id; mostrarMidia(); } })));
    }

    function preencher() {
      const item = lista[posicao];
      mostrarMidia();
      const copiarLink = h('button', { type: 'button', texto: 'Copiar link' });
      copiarLink.addEventListener('click', () => copiar(location.href, 'Link copiado', copiarLink));
      lado.replaceChildren(...[
        h('h2', { class: 'folha__autor', id: 'd-autor' }, h('a', { href: item.post, ...NOVA_ABA, texto: `@${item.autor}` })),
        item.titulo && h('p', { class: 'folha__titulo', texto: item.titulo }),
        h('div', { class: 'folha__tags' }, ...etiquetasDe(item).map((texto) => h('span', { texto })), h('span', { texto: dataBr(item.data) })),
        item.parcial && h('p', { class: 'folha__nota', texto: 'O autor não publicou o prompt. Este é o texto do post.' }),
        !item.video && h('p', { class: 'folha__nota', texto: 'Este vídeo só está disponível no post original.' }),
        h('pre', { class: 'folha__prompt', tabindex: '0', texto: item.prompt }),
        h('div', { class: 'folha__links' },
          copiarLink,
          h('a', { href: item.post, ...NOVA_ABA, texto: item.video ? 'Post original' : 'Ver o vídeo no post' }),
          item.skillry && h('a', { href: item.skillry, ...NOVA_ABA, texto: 'Versão refeita' })),
      ].filter(Boolean));
      lado.scrollTop = 0;
      const copiarPrompt = h('button', { class: 'botao', type: 'button', texto: item.parcial ? 'Copiar texto' : 'Copiar prompt' });
      copiarPrompt.addEventListener('click', () => copiar(item.prompt, 'Prompt copiado', copiarPrompt));
      pe.replaceChildren(copiarPrompt, h('span', { texto: plural(item.prompt.length, 'caractere', 'caracteres') }));
      $('d-num').textContent = `${item.numero} de ${total}`;
      $('d-ant').disabled = posicao <= 0;
      $('d-prox').disabled = posicao >= lista.length - 1;
      history.replaceState(null, '', `#${item.slug}`);
      document.title = `@${item.autor} — Rolo`;
    }

    function andar(passo) {
      const nova = posicao + passo;
      if (nova < 0 || nova >= lista.length) return;
      posicao = nova;
      preencher();
    }

    function abrir(item, novaLista, quemAbriu, qualVersao) {
      versao = qualVersao === 'refeito' ? 'refeito' : 'original';
      const onde = novaLista.indexOf(item);
      lista = onde >= 0 ? novaLista : [item];
      posicao = Math.max(onde, 0);
      origem = quemAbriu || null;
      preencher();
      document.querySelectorAll('.meia video').forEach((video) => { if (!video.paused) { video.pause(); video.dataset.pausado = '1'; } });
      if (!dialogo.open) dialogo.showModal();
    }

    $('d-ant').addEventListener('click', () => andar(-1));
    $('d-prox').addEventListener('click', () => andar(1));
    $('d-fechar').addEventListener('click', () => dialogo.close());
    dialogo.addEventListener('click', (evento) => { if (evento.target === dialogo) dialogo.close(); }); // clique no fundo
    dialogo.addEventListener('keydown', (evento) => {
      if (evento.target.tagName === 'VIDEO') return; // as setas avançam o vídeo
      if (evento.key === 'ArrowLeft') andar(-1);
      if (evento.key === 'ArrowRight') andar(1);
    });
    dialogo.addEventListener('close', () => {
      tela.replaceChildren(); // para o vídeo
      document.querySelectorAll('.meia video').forEach((video) => { if (tocarSozinho && video.dataset.pausado) { delete video.dataset.pausado; video.play().catch(() => {}); } });
      history.replaceState(null, '', location.pathname + location.search);
      document.title = TITULO;
      if (origem?.isConnected) origem.focus({ preventScroll: true });
    });
    return abrir;
  }

  // ---------- página ----------
  function iniciar() {
    const itens = preparar(window.VIDEOS);
    const porSlug = new Map(itens.map((item) => [item.slug, item]));
    const grade = $('grade');
    const abrirDetalhe = criarDetalhe(itens.length);
    let estado = INICIAL;
    let visiveis = [];
    let mostrados = 0;

    let preferencias = lerPreferencias();
    const abrir = (item, quemAbriu, qualVersao) => abrirDetalhe(item, visiveis, quemAbriu, qualVersao);
    const contar = (teste) => itens.filter(teste).length;
    const chip = (rotulo, aoClicar, leve) => h('button', { class: leve ? 'chip chip--leve' : 'chip', type: 'button', 'aria-pressed': 'false', texto: rotulo, onclick: aoClicar });
    const divisa = () => h('span', { class: 'filtros__divisa', 'aria-hidden': 'true' });
    const alternarTecnica = (id) => (estado.tecnicas.includes(id) ? estado.tecnicas.filter((t) => t !== id) : [...estado.tecnicas, id]);

    const chipComIcone = (nomeIcone, rotulo, total, aoClicar) => h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onclick: aoClicar },
      icone(nomeIcone), h('span', { texto: rotulo }), h('b', { texto: String(total) }));
    const chipsCategoria = new Map([['', chipComIcone('tudo', 'Tudo', itens.length, () => mudar({ categoria: '' }))],
      ...Object.entries(CATEGORIAS).map(([id, rotulo]) => [id, chipComIcone(id, rotulo, contar((i) => i.categoria === id), () => mudar({ categoria: id }))])]);
    const botoesColuna = new Map(COLUNAS_VALIDAS.map((n) => [n, h('button', {
      type: 'button', 'aria-pressed': 'false', 'aria-label': `${n} ${n === 1 ? 'coluna' : 'colunas'}`, title: `${n} ${n === 1 ? 'coluna' : 'colunas'}`,
      onclick: () => preferir({ colunas: n }),
    }, icone(`col${n}`))]));
    $('colunas').append(...botoesColuna.values());
    $('comparar').addEventListener('click', () => preferir({ comparar: !preferencias.comparar }));
    const chipVideo = chip('Com vídeo', () => mudar({ soVideo: !estado.soVideo }));
    const chipCompleto = chip('Prompt completo', () => mudar({ soCompleto: !estado.soCompleto }));
    const chipsTecnica = new Map(Object.entries(TECNICAS)
      .filter(([id]) => itens.some((item) => item.tags.includes(id)))
      .map(([id, rotulo]) => [id, chip(rotulo, () => mudar({ tecnicas: alternarTecnica(id) }), true)]));
    $('categorias').append(...chipsCategoria.values());
    $('chips').append(chipVideo, chipCompleto, divisa(), ...chipsTecnica.values());

    function carregarMais() {
      const proximos = visiveis.slice(mostrados, mostrados + LOTE);
      grade.append(...proximos.map((item, i) => montarCartao(item, abrir, i, preferencias.comparar)));
      mostrados += proximos.length;
    }

    function desenhar() {
      visiveis = filtrar(itens, estado);
      mostrados = 0;
      vigia.disconnect();
      grade.replaceChildren();
      const { comparar, colunas } = preferencias;
      grade.style.setProperty('--colunas', String(comparar ? colunas : colunas * 2));
      grade.style.setProperty('--colunas-cel', comparar ? '1' : '2');
      $('comparar').setAttribute('aria-checked', String(comparar));
      botoesColuna.forEach((botao, n) => botao.setAttribute('aria-pressed', String(n === colunas)));
      carregarMais();
      $('vazio').hidden = visiveis.length > 0;
      $('contagem').textContent = plural(visiveis.length, 'vídeo', 'vídeos');
      chipsCategoria.forEach((botao, id) => botao.setAttribute('aria-pressed', String(id === estado.categoria)));
      chipsTecnica.forEach((botao, id) => botao.setAttribute('aria-pressed', String(estado.tecnicas.includes(id))));
      chipVideo.setAttribute('aria-pressed', String(estado.soVideo));
      chipCompleto.setAttribute('aria-pressed', String(estado.soCompleto));
      $('ordem').value = estado.ordem;
      if ($('busca').value !== estado.busca) $('busca').value = estado.busca;
    }

    function mudar(parte) {
      estado = Object.freeze({ ...estado, ...parte });
      desenhar();
    }

    function preferir(parte) {
      preferencias = { ...preferencias, ...parte };
      salvarPreferencias(preferencias);
      desenhar();
    }

    function abrirPeloEndereco() {
      const slug = location.hash.slice(1);
      if (!SLUG_VALIDO.test(slug)) return;
      const item = porSlug.get(slug);
      if (item) abrir(item, null);
    }

    let relogioBusca = 0;
    $('busca').addEventListener('input', (evento) => {
      clearTimeout(relogioBusca);
      const valor = evento.target.value;
      relogioBusca = setTimeout(() => mudar({ busca: valor }), ESPERA_BUSCA_MS);
    });
    $('ordem').addEventListener('change', (evento) => mudar({ ordem: evento.target.value in ORDENS ? evento.target.value : INICIAL.ordem }));
    $('limpar').addEventListener('click', () => mudar(INICIAL));
    document.addEventListener('keydown', (evento) => {
      const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      if (evento.key === '/' && !digitando && !$('detalhe').open) { evento.preventDefault(); $('busca').focus(); }
    });
    window.addEventListener('hashchange', abrirPeloEndereco);

    new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting) && mostrados < visiveis.length) carregarMais();
    }, { rootMargin: '1200px 0px' }).observe($('sentinela'));

    $('total').textContent = itens.length.toLocaleString('pt-BR');
    $('total-refeito').textContent = contar((i) => i.refeito).toLocaleString('pt-BR');
    desenhar();
    abrirPeloEndereco();
  }

  try {
    iniciar();
  } catch (erro) {
    console.error(erro);
    const vazio = $('vazio');
    vazio.replaceChildren(h('p', { texto: 'Não consegui carregar os vídeos. Recarregue a página.' }));
    vazio.hidden = false;
  }
})();
