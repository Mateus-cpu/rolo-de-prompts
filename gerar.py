"""Gera dados.js a partir de data/videos.json do repositório awesome-opus5-5-videos.

Uso: python3 -I gerar.py <pasta-do-repositorio> <arquivo-com-slugs-que-tem-video> <arquivo-de-midias>
O segundo arquivo tem uma linha por item: "<slug> <codigo-http>:..." (resultado de um HEAD no mp4).
O terceiro tem uma URL de mídia por linha (vídeos leves de grade e capas dos refeitos).
"""
import json
import re
import sys
from pathlib import Path

ORIGEM_MIDIA = "https://media.skillry.dev/opus-5-5/"
ORIGENS_PERMITIDAS = ("https://x.com/", "https://twitter.com/", "https://skillry.dev/", ORIGEM_MIDIA)
CAMPOS_OBRIGATORIOS = ("slug", "author", "post_url", "category", "prompt", "poster_url", "added")


def url_segura(url: str) -> str:
    """Devolve a URL só se for https e de uma origem conhecida; senão, vazio."""
    return url if isinstance(url, str) and url.startswith(ORIGENS_PERMITIDAS) else ""


def ler_slugs_com_video(caminho: Path) -> frozenset:
    linhas = (linha.split() for linha in caminho.read_text().splitlines() if linha.strip())
    return frozenset(slug for slug, estado in linhas if estado.startswith("200:video/mp4"))


PADRAO_MIDIA = re.compile(r"^https://media\.skillry\.dev/opus-5-5/([a-z0-9-]+)/(original-card|remake-card|remake)\.[a-f0-9]+\.(mp4|webp)$")


def ler_midias(caminho: Path) -> dict:
    """Devolve {slug: {"original-card": url, "remake-card": url, "remake": url}} só com URLs no formato esperado."""
    midias: dict = {}
    for linha in caminho.read_text().splitlines():
        achado = PADRAO_MIDIA.match(linha.strip())
        if achado:
            slug, tipo, _ = achado.groups()
            midias = {**midias, slug: {**midias.get(slug, {}), tipo: linha.strip()}}
    return midias


def converter(item: dict, com_video: frozenset, midias: dict) -> dict:
    faltando = [campo for campo in CAMPOS_OBRIGATORIOS if not item.get(campo)]
    if faltando:
        raise ValueError(f"item {item.get('slug')!r} sem os campos {faltando}")
    slug = item["slug"]
    return {
        "slug": slug,
        "autor": item["author"],
        "post": url_segura(item["post_url"]),
        "categoria": item["category"],
        "tags": list(item.get("tech_tags", [])),
        "titulo": item.get("title", ""),
        "prompt": item["prompt"],
        "parcial": bool(item.get("prompt_partial")),
        "capa": url_segura(item["poster_url"]),
        "skillry": url_segura(item.get("skillry_url", "")),
        "data": item["added"],
        "video": f"{ORIGEM_MIDIA}{slug}/original.mp4" if slug in com_video else "",
        "previa": midias.get(slug, {}).get("original-card", ""),
        "refeito": f"{ORIGEM_MIDIA}{slug}/remake.mp4" if "remake-card" in midias.get(slug, {}) else "",
        "refeitoPrevia": midias.get(slug, {}).get("remake-card", ""),
        "refeitoCapa": midias.get(slug, {}).get("remake", ""),
    }


def main() -> None:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    repositorio, arquivo_slugs, arquivo_midias = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    itens = json.loads((repositorio / "data" / "videos.json").read_text(encoding="utf-8"))
    com_video = ler_slugs_com_video(arquivo_slugs)
    midias = ler_midias(arquivo_midias)
    convertidos = [converter(item, com_video, midias) for item in itens]
    # "</" escapado para o texto de um prompt nunca fechar a tag <script>.
    corpo = json.dumps(convertidos, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    Path(__file__).with_name("dados.js").write_text(f"window.VIDEOS = {corpo};\n", encoding="utf-8")
    total_video = sum(1 for item in convertidos if item["video"])
    total_refeito = sum(1 for item in convertidos if item["refeito"])
    print(f"{len(convertidos)} itens, {total_video} com vídeo, {total_refeito} com refeito, {sum(i['parcial'] for i in convertidos)} com prompt parcial")


if __name__ == "__main__":
    main()
