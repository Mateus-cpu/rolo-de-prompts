// Rolo: lista, filtra e exibe os vídeos de window.VIDEOS (gerado por gerar.py).
// Todo texto vindo dos dados entra por textContent; nenhum HTML é interpretado.
(() => {
  'use strict';

  const LOTE = 36;
  const QUADROS_NO_ROLO = 14;
  const ESPERA_BUSCA_MS = 140;
  const AVISO_MS = 1800;
  const SLUG_VALIDO = /^[a-z0-9-]+$/;
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

  const semAcento = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const numero = (n) => String(n).padStart(3, '0');
  const dataBr = (iso) => iso.split('-').reverse().join('/');
  const etiquetasDe = (item) => [CATEGORIAS[item.categoria] || item.categoria, ...item.tags.map((t) => TECNICAS[t] || t)];

  function preparar(bruto) {
    if (!Array.isArray(bruto)) throw new Error('dados.js não carregou ou está em formato inesperado');
    return bruto.map((item, i) => Object.freeze({
      ...item,
      ordem: i,
      rotulo: numero(i + 1),
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
    clearTimeout(relogioAviso);
    relogioAviso = setTimeout(() => { el.hidden = true; }, AVISO_MS);
  }

  function copiarPorSelecao(texto, onde) {
    const area = h('textarea', { readonly: true, style: 'position:fixed;opacity:0;top:0;left:0' });
    area.value = texto;
    onde.append(area); // dentro do <dialog> aberto, senão a seleção não pega
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

  function botaoCopiarPrompt(item) {
    const botao = h('button', { class: 'botao botao--cheio', type: 'button', texto: 'Copiar prompt' });
    botao.addEventListener('click', () => copiar(item.prompt, `Prompt ${item.rotulo} copiado`, botao));
    return botao;
  }

  function imagem(item, alt) {
    const img = h('img', { src: item.capa, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('load', () => img.classList.add('pronta'));
    img.addEventListener('error', () => console.warn('Capa não carregou:', item.slug));
    return img;
  }

  // ---------- cartão ----------
  function montarCartao(item, abrir) {
    const aoAbrir = (evento) => abrir(item, evento.currentTarget);
    return h('article', { class: 'quadro' },
      h('button', { class: 'quadro__tela', type: 'button', 'aria-label': `Abrir o quadro ${item.rotulo}, de @${item.autor}`, onclick: aoAbrir },
        imagem(item, ''),
        h('span', { class: item.video ? 'quadro__selo' : 'quadro__selo quadro__selo--fora', texto: item.video ? '▶ Assistir' : 'Só imagem' }),
        h('span', { class: 'quadro__num', texto: item.rotulo })),
      h('div', { class: 'quadro__corpo' },
        h('div', { class: 'quadro__meta mono' },
          h('a', { href: item.post, ...NOVA_ABA, texto: `@${item.autor}` }),
          h('span', { texto: dataBr(item.data) })),
        item.titulo && h('h2', { class: 'quadro__titulo', texto: item.titulo }),
        h('p', { class: 'quadro__trecho', texto: item.prompt }),
        h('div', { class: 'quadro__tags mono' },
          ...etiquetasDe(item).map((texto) => h('span', { texto })),
          item.parcial && h('span', { class: 'quadro__parcial', texto: 'Texto do post' })),
        h('div', { class: 'quadro__acoes' },
          botaoCopiarPrompt(item),
          h('button', { class: 'botao', type: 'button', texto: 'Ver', onclick: aoAbrir }))));
  }

  // ---------- tela de detalhe ----------
  function criarDetalhe(total) {
    const dialogo = $('detalhe');
    const tela = $('d-tela');
    const lado = $('d-lado');
    let lista = [];
    let posicao = -1;
    let origem = null;

    function midia(item) {
      if (!item.video) return [imagem(item, `Quadro do vídeo de @${item.autor}`)];
      const video = h('video', { src: item.video, poster: item.capa, controls: true, autoplay: true, playsinline: true, loop: true, preload: 'auto' });
      video.addEventListener('error', () => {
        console.error('Vídeo não carregou:', item.video);
        tela.replaceChildren(imagem(item, ''), h('p', { class: 'detalhe__falha', texto: 'O vídeo não carregou. Veja no post original.' }));
        tela.querySelector('img').classList.add('pronta');
      });
      return [video];
    }

    function preencher() {
      const item = lista[posicao];
      tela.replaceChildren(...midia(item));
      const copiarLink = h('button', { class: 'botao', type: 'button', texto: 'Copiar link' });
      copiarLink.addEventListener('click', () => copiar(location.href, 'Link do quadro copiado', copiarLink));
      lado.replaceChildren(...[
        h('h2', { class: 'detalhe__autor' }, h('a', { href: item.post, ...NOVA_ABA, texto: `@${item.autor}` })),
        item.titulo && h('p', { class: 'detalhe__titulo', texto: item.titulo }),
        h('div', { class: 'quadro__tags mono' }, h('span', { texto: dataBr(item.data) }), ...etiquetasDe(item).map((texto) => h('span', { texto }))),
        h('div', { class: 'detalhe__acoes' },
          botaoCopiarPrompt(item),
          copiarLink,
          h('a', { class: 'botao', href: item.post, ...NOVA_ABA, texto: item.video ? 'Post original ↗' : 'Ver o vídeo no post ↗' }),
          item.skillry && h('a', { class: 'botao', href: item.skillry, ...NOVA_ABA, texto: 'Versão refeita ↗' })),
        item.parcial && h('p', { class: 'detalhe__nota mono', texto: 'O autor não publicou o prompt. O texto abaixo é o do post.' }),
        h('div', { class: 'detalhe__rotulo mono' },
          h('span', { texto: item.parcial ? 'Texto do post' : 'Prompt' }),
          h('span', { texto: `${item.prompt.length.toLocaleString('pt-BR')} caracteres` })),
        h('pre', { class: 'detalhe__prompt', tabindex: '0', texto: item.prompt }),
      ].filter(Boolean));
      lado.scrollTop = 0;
      $('d-num').textContent = `Quadro ${item.rotulo} / ${numero(total)}`;
      $('d-ant').disabled = posicao <= 0;
      $('d-prox').disabled = posicao >= lista.length - 1;
      history.replaceState(null, '', `#${item.slug}`);
      document.title = `@${item.autor} · quadro ${item.rotulo} — Rolo`;
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
    dialogo.addEventListener('keydown', (evento) => {
      if (evento.target.tagName === 'VIDEO') return; // as setas avançam o vídeo
      if (evento.key === 'ArrowLeft') andar(-1);
      if (evento.key === 'ArrowRight') andar(1);
    });
    dialogo.addEventListener('close', () => {
      tela.replaceChildren(); // para o vídeo
      history.replaceState(null, '', location.pathname + location.search);
      document.title = 'Rolo — prompts de vídeo do Opus 5.5';
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
    const contar = (teste) => itens.filter(teste).length;
    const chave = (rotulo, total, aoClicar) => h('button', { class: 'chave mono', type: 'button', 'aria-pressed': 'false', onclick: aoClicar },
      h('span', { texto: rotulo }), h('i', { texto: String(total) }));

    const botoesCategoria = new Map([['', chave('Todos', itens.length, () => mudar({ categoria: '' }))],
      ...Object.entries(CATEGORIAS).map(([id, rotulo]) => [id, chave(rotulo, contar((i) => i.categoria === id), () => mudar({ categoria: id }))])]);
    const botoesTecnica = new Map(Object.entries(TECNICAS)
      .map(([id, rotulo]) => [id, rotulo, contar((i) => i.tags.includes(id))])
      .filter(([, , total]) => total > 0)
      .map(([id, rotulo, total]) => [id, chave(rotulo, total, () => mudar({
        tecnicas: estado.tecnicas.includes(id) ? estado.tecnicas.filter((t) => t !== id) : [...estado.tecnicas, id],
      }))]));
    $('categorias').append(...botoesCategoria.values());
    $('tecnicas').append(...botoesTecnica.values());

    const ultimaData = itens.reduce((maior, item) => (item.data > maior ? item.data : maior), '');
    $('numeros').append(...[
      [contar((i) => i.video), 'com vídeo'],
      [contar((i) => !i.parcial), 'prompts completos'],
      [dataBr(ultimaData).slice(0, 5), 'última leva'],
    ].map(([valor, rotulo]) => h('div', {}, h('dt', { texto: rotulo }), h('dd', { texto: String(valor) }))));

    const destaques = itens.filter((item) => item.video).slice(0, QUADROS_NO_ROLO);
    const grupoDoRolo = (repetido) => h('div', { class: 'rolo__grupo', 'aria-hidden': repetido ? 'true' : null },
      ...destaques.map((item) => h('button', {
        class: 'rolo__quadro', type: 'button', tabindex: repetido ? '-1' : null,
        'aria-label': `Abrir o quadro ${item.rotulo}, de @${item.autor}`, onclick: (evento) => abrir(item, evento.currentTarget),
      }, imagem(item, ''), h('span', { texto: item.rotulo }))));
    $('rolo-trilho').append(grupoDoRolo(false), grupoDoRolo(true));

    function carregarMais() {
      const proximos = visiveis.slice(mostrados, mostrados + LOTE);
      grade.append(...proximos.map((item) => montarCartao(item, abrir)));
      mostrados += proximos.length;
    }

    function desenhar() {
      visiveis = filtrar(itens, estado);
      mostrados = 0;
      grade.replaceChildren();
      carregarMais();
      $('vazio').hidden = visiveis.length > 0;
      $('contagem').textContent = `${visiveis.length} de ${itens.length}`;
      botoesCategoria.forEach((botao, id) => botao.setAttribute('aria-pressed', String(id === estado.categoria)));
      botoesTecnica.forEach((botao, id) => botao.setAttribute('aria-pressed', String(estado.tecnicas.includes(id))));
      $('so-video').setAttribute('aria-pressed', String(estado.soVideo));
      $('so-completo').setAttribute('aria-pressed', String(estado.soCompleto));
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
    $('so-video').addEventListener('click', () => mudar({ soVideo: !estado.soVideo }));
    $('so-completo').addEventListener('click', () => mudar({ soCompleto: !estado.soCompleto }));
    $('ordem').addEventListener('change', (evento) => mudar({ ordem: evento.target.value in ORDENS ? evento.target.value : INICIAL.ordem }));
    $('limpar').addEventListener('click', () => mudar(INICIAL));
    $('limpar-vazio').addEventListener('click', () => mudar(INICIAL));
    $('subir').addEventListener('click', (evento) => { evento.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    document.addEventListener('keydown', (evento) => {
      const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      if (evento.key === '/' && !digitando && !$('detalhe').open) { evento.preventDefault(); $('busca').focus(); }
    });
    window.addEventListener('hashchange', abrirPeloEndereco);

    new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting) && mostrados < visiveis.length) carregarMais();
    }, { rootMargin: '1200px 0px' }).observe($('sentinela'));

    $('total').textContent = String(itens.length);
    $('total-hud').textContent = String(itens.length);
    desenhar();
    abrirPeloEndereco();
  }

  try {
    iniciar();
  } catch (erro) {
    console.error(erro);
    const vazio = $('vazio');
    vazio.replaceChildren(h('p', { texto: 'Não consegui carregar os prompts. Recarregue a página.' }));
    vazio.hidden = false;
  }
})();
