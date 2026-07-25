import { describe, it, expect } from "vitest";
import { extrairInfoSite, resumoInfoSite } from "./extrair-site";

const HTML = `
<!doctype html>
<html lang="pt">
<head>
  <title>Padaria do Bairro — Pão fresco todos os dias</title>
  <meta name="description" content="Pão &amp; doçaria artesanal em Oeiras.">
  <meta property="og:site_name" content="Padaria do Bairro">
  <link rel="alternate" hreflang="en" href="/en/">
</head>
<body>
  <a href="mailto:ola@padaria.pt">Email</a>
  <a href="tel:+351210000000">Ligar</a>
  <a href="https://www.instagram.com/padariadobairro/">IG</a>
  <a href="https://facebook.com/sharer/sharer.php?u=x">partilhar</a>
  <a href="https://www.facebook.com/padariadobairro">FB</a>
  <a href="/blog/receitas">Blog</a>
  <form action="/contacto"><input name="email"></form>
  <script src="https://widget.crisp.chat/l.js"></script>
</body>
</html>`;

describe("extração de informação do website (Parte 7)", () => {
  const info = extrairInfoSite(HTML, "https://padaria.pt");

  it("extrai nome, descrição e contactos", () => {
    expect(info.nome).toBe("Padaria do Bairro");
    expect(info.descricao).toBe("Pão & doçaria artesanal em Oeiras.");
    expect(info.email).toBe("ola@padaria.pt");
    expect(info.telefone).toBe("+351210000000");
  });

  it("apanha os perfis sociais e ignora links de partilha", () => {
    expect(info.redes.instagram).toContain("instagram.com/padariadobairro");
    expect(info.redes.facebook).toBe("https://www.facebook.com/padariadobairro");
    expect(info.redes.facebook).not.toContain("sharer");
  });

  it("deteta blog, formulário, assistente e idiomas", () => {
    expect(info.temBlog).toBe(true);
    expect(info.temFormulario).toBe(true);
    expect(info.temAssistente).toBe(true);
    expect(info.temLoja).toBe(false);
    expect(info.idiomas.sort()).toEqual(["en", "pt"]);
  });

  it("deteta loja quando há carrinho/checkout", () => {
    expect(extrairInfoSite(`<a href="/checkout">Finalizar</a>`).temLoja).toBe(true);
  });

  it("resumo só inclui o que foi detetado", () => {
    const linhas = resumoInfoSite(info);
    expect(linhas.some((l) => l.includes("Padaria do Bairro"))).toBe(true);
    expect(linhas.some((l) => l.includes("loja"))).toBe(false);
  });

  it("html vazio não parte", () => {
    const vazio = extrairInfoSite("");
    expect(vazio.nome).toBeNull();
    expect(vazio.redes).toEqual({});
    expect(vazio.temFormulario).toBe(false);
  });
});
