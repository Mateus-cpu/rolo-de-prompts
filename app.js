// Rolo: lista, filtra e exibe os vídeos de window.VIDEOS (gerado por gerar.py).
// Todo texto vindo dos dados entra por textContent; nenhum HTML é interpretado.
(() => {
  'use strict';

  const LOTE = 40;
  const ESPERA_BUSCA_MS = 140;
  const ESPERA_PREVIA_MS = 160;
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
    recentes: (a, b) => b.data.localeCompare(a.data) || a.ordem - b.ordem,
    longos: (a, b) => b.prompt.length - a.prompt.length,
    curtos: (a, b) => a.prompt.length - b.prompt.length,
    autor: (a, b) => a.autor.localeCompare(b.autor, 'pt-BR', { sensitivity: 'base' }),
  };
  const INICIAL = Object.freeze({ busca: '', categoria: '', tecnicas: Object.freeze([]), soVideo: false, soCompleto: false, ordem: 'recentes' });
  const NOVA_ABA = { target: '_blank', rel: 'noopener noreferrer' };
  const temCursor = matchMedia('(hover: hover)').matches;
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

  function iconePlay() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('aria-hidden', 'true');
    const forma = document.createElementNS(SVG, 'path');
    forma.setAttribute('d', 'M2 1v10l9-5z');
    svg.append(forma);
    return svg;
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

  // ---------- cartão ----------
  function ligarPrevia(tela, item) {
    let relogio = 0;
    let video = null;
    const parar = () => {
      clearTimeout(relogio);
      if (video) { video.remove(); video = null; }
    };
    tela.addEventListener('pointerenter', () => {
      relogio = setTimeout(() => {
        video = h('video', { src: item.video, muted: true, loop: true, playsinline: true, autoplay: true, preload: 'auto', 'aria-hidden': 'true', tabindex: '-1' });
        video.muted = true;
        video.addEventListener('playing', () => video?.classList.add('rodando'));
        video.addEventListener('error', () => { console.warn('Prévia não carregou:', item.slug); parar(); });
        tela.append(video);
      }, ESPERA_PREVIA_MS);
    });
    tela.addEventListener('pointerleave', parar);
    tela.addEventListener('click', parar);
  }

  function montarCartao(item, abrir, posicao) {
    const tela = h('button', { class: 'cena__tela', type: 'button', 'aria-label': `Abrir o vídeo de @${item.autor}`, onclick: (e) => abrir(item, e.currentTarget) },
      imagem(item, ''),
      item.video && h('span', { class: 'cena__play' }, iconePlay()));
    if (item.video && temCursor && !poucoMovimento) ligarPrevia(tela, item);
    const copiarBotao = h('button', { class: 'cena__copiar', type: 'button', texto: 'Copiar prompt' });
    copiarBotao.addEventListener('click', () => copiar(item.prompt, 'Prompt copiado', copiarBotao));
    const cartao = h('article', { class: 'cena' },
      h('div', { style: 'position:relative' }, tela, copiarBotao),
      h('div', { class: 'cena__legenda' },
        h('a', { class: 'cena__autor', href: item.post, ...NOVA_ABA, texto: `@${item.autor}` }),
        h('span', { class: 'cena__tipo', texto: CATEGORIAS[item.categoria] || item.categoria }),
        h('p', { class: 'cena__trecho', texto: item.titulo || item.prompt.replace(/\s+/g, ' ').slice(0, 140) })));
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

    function midia(item) {
      if (!item.video) return [imagem(item, `Quadro do vídeo de @${item.autor}`)];
      const video = h('video', { src: item.video, poster: item.capa, controls: true, autoplay: true, playsinline: true, loop: true, preload: 'auto' });
      video.addEventListener('error', () => {
        console.error('Vídeo não carregou:', item.video);
        const capa = imagem(item, '');
        capa.classList.add('pronta');
        tela.replaceChildren(capa, h('p', { class: 'folha__falha', texto: 'O vídeo não carregou. Veja no post original.' }));
      });
      return [video];
    }

    function preencher() {
      const item = lista[posicao];
      tela.replaceChildren(...midia(item));
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

    function abrir(item, novaLista, quemAbriu) {
      const onde = novaLista.indexOf(item);
      lista = onde >= 0 ? novaLista : [item];
      posicao = Math.max(onde, 0);
      origem = quemAbriu || null;
      preencher();
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

    const abrir = (item, quemAbriu) => abrirDetalhe(item, visiveis, quemAbriu);
    const chip = (rotulo, aoClicar, leve) => h('button', { class: leve ? 'chip chip--leve' : 'chip', type: 'button', 'aria-pressed': 'false', texto: rotulo, onclick: aoClicar });
    const divisa = () => h('span', { class: 'filtros__divisa', 'aria-hidden': 'true' });
    const alternarTecnica = (id) => (estado.tecnicas.includes(id) ? estado.tecnicas.filter((t) => t !== id) : [...estado.tecnicas, id]);

    const chipsCategoria = new Map([['', chip('Tudo', () => mudar({ categoria: '' }))],
      ...Object.entries(CATEGORIAS).map(([id, rotulo]) => [id, chip(rotulo, () => mudar({ categoria: id }))])]);
    const chipVideo = chip('Com vídeo', () => mudar({ soVideo: !estado.soVideo }));
    const chipCompleto = chip('Prompt completo', () => mudar({ soCompleto: !estado.soCompleto }));
    const chipsTecnica = new Map(Object.entries(TECNICAS)
      .filter(([id]) => itens.some((item) => item.tags.includes(id)))
      .map(([id, rotulo]) => [id, chip(rotulo, () => mudar({ tecnicas: alternarTecnica(id) }), true)]));
    $('chips').append(...chipsCategoria.values(), divisa(), chipVideo, chipCompleto, divisa(), ...chipsTecnica.values());

    function carregarMais() {
      const proximos = visiveis.slice(mostrados, mostrados + LOTE);
      grade.append(...proximos.map((item, i) => montarCartao(item, abrir, i)));
      mostrados += proximos.length;
    }

    function desenhar() {
      visiveis = filtrar(itens, estado);
      mostrados = 0;
      grade.replaceChildren();
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
