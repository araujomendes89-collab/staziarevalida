import React, { useState, useEffect, useCallback } from "react";
import { listarImagens, linksEquipe } from "./api.js";

function formatarBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function GaleriaImagens({
  backend,
  unidade,
  aula,
  onEscolher,
  multiplo = false,
}) {
  const [busca, setBusca] = useState("");
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const [imagens, setImagens] = useState([]);
  const [links, setLinks] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [selecionadas, setSelecionadas] = useState(new Set());

  const carregar = useCallback(async () => {
    if (!backend) return;
    setCarregando(true);
    setErro(null);
    try {
      const res = await listarImagens(backend, {
        unidade: unidade || undefined,
        aula: aula || undefined,
        busca: busca.trim() || undefined,
        arquivadas: mostrarArquivadas,
      });
      const itens = res.itens || [];
      setImagens(itens);

      if (itens.length > 0) {
        const ids = itens.map((i) => i.id);
        const mapaLinks = await linksEquipe(backend, ids);
        setLinks((prev) => ({ ...prev, ...mapaLinks }));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [backend, unidade, aula, busca, mostrarArquivadas]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const toggleSelecionada = (id) => {
    setSelecionadas((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  const handleInserirSelecionadas = () => {
    if (!onEscolher) return;
    const escolhidas = imagens.filter((img) => selecionadas.has(img.id));
    onEscolher(escolhidas);
  };

  return (
    <div className="ep-galeria">
      <style>{`
        .ep-galeria {
          display: flex;
          flex-direction: column;
          gap: 16px;
          color: #0d1c42;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .ep-galeria-topo {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .ep-galeria-filtros {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }
        .ep-galeria-busca {
          flex: 1;
          max-width: 360px;
          padding: 8px 12px;
          border: 1px solid #dce1e8;
          border-radius: 6px;
          font-size: 14px;
        }
        .ep-galeria-checkbox {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: #4f5a69;
          cursor: pointer;
        }
        .ep-galeria-botao-principal {
          background: #0b6f68;
          color: #ffffff;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
        }
        .ep-galeria-botao-principal:disabled {
          background: #cbd5e1;
          cursor: not-allowed;
        }
        .ep-galeria-grade {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }
        .ep-galeria-card {
          border: 1px solid #dce1e8;
          border-radius: 8px;
          overflow: hidden;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          transition: border-color 0.15s;
        }
        .ep-galeria-card:hover {
          border-color: #0b6f68;
        }
        .ep-galeria-card-selecionado {
          border-color: #0b6f68;
          box-shadow: 0 0 0 2px rgba(11, 111, 104, 0.2);
        }
        .ep-galeria-preview {
          width: 100%;
          height: 140px;
          background: #f8fafc;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          position: relative;
        }
        .ep-galeria-preview img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        .ep-galeria-check-overlay {
          position: absolute;
          top: 8px;
          left: 8px;
        }
        .ep-galeria-info {
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
          color: #687586;
          flex: 1;
        }
        .ep-galeria-dimensoes {
          font-weight: 600;
          color: #0d1c42;
        }
        .ep-galeria-aviso {
          color: #b45309;
          background: #fef3c7;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          display: inline-block;
          margin-top: 4px;
          align-self: flex-start;
        }
        .ep-galeria-card-rodape {
          padding: 8px 12px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          justify-content: flex-end;
        }
        .ep-galeria-botao-inserir {
          background: #eefbf9;
          color: #0b6f68;
          border: 1px solid #0b6f68;
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .ep-galeria-botao-inserir:hover {
          background: #0b6f68;
          color: #ffffff;
        }
        .ep-galeria-estado {
          padding: 32px 16px;
          text-align: center;
          color: #687586;
          font-size: 14px;
        }
        .ep-galeria-erro {
          color: #b91c1c;
          background: #fef2f2;
          border: 1px solid #fca5a5;
          padding: 12px;
          border-radius: 6px;
          font-size: 14px;
        }
      `}</style>

      <div className="ep-galeria-topo">
        <div className="ep-galeria-filtros">
          <input
            type="search"
            className="ep-galeria-busca"
            placeholder="Buscar por texto alternativo ou nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <label className="ep-galeria-checkbox">
            <input
              type="checkbox"
              checked={mostrarArquivadas}
              onChange={(e) => setMostrarArquivadas(e.target.checked)}
            />
            Mostrar arquivadas
          </label>
        </div>

        {multiplo && (
          <button
            type="button"
            className="ep-galeria-botao-principal"
            disabled={selecionadas.size === 0}
            onClick={handleInserirSelecionadas}
          >
            Inserir selecionadas ({selecionadas.size})
          </button>
        )}
      </div>

      {erro && <div className="ep-galeria-erro">{erro}</div>}

      {carregando ? (
        <div className="ep-galeria-estado">Carregando…</div>
      ) : imagens.length === 0 ? (
        <div className="ep-galeria-estado">Nenhuma imagem guardada ainda.</div>
      ) : (
        <div className="ep-galeria-grade">
          {imagens.map((img) => {
            const src = links[img.id] || "";
            const alt = img.alt_text || "Imagem sem texto alternativo";
            const estaSelecionada = selecionadas.has(img.id);

            return (
              <div
                key={img.id}
                className={`ep-galeria-card ${
                  estaSelecionada ? "ep-galeria-card-selecionado" : ""
                }`}
              >
                <div className="ep-galeria-preview">
                  {multiplo && (
                    <input
                      type="checkbox"
                      className="ep-galeria-check-overlay"
                      checked={estaSelecionada}
                      onChange={() => toggleSelecionada(img.id)}
                    />
                  )}
                  {src ? (
                    <img src={src} alt={alt} />
                  ) : (
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>Carregando prévia…</span>
                  )}
                </div>

                <div className="ep-galeria-info">
                  <span className="ep-galeria-dimensoes">
                    {img.width} × {img.height} px
                  </span>
                  <span>
                    {formatarBytes(img.bytes)} · versão {img.version}
                  </span>
                  <span>{img.enviada_por || "Equipe"}</span>
                  {!img.alt_text && (
                    <span className="ep-galeria-aviso">Falta texto alternativo</span>
                  )}
                </div>

                {!multiplo && (
                  <div className="ep-galeria-card-rodape">
                    <button
                      type="button"
                      className="ep-galeria-botao-inserir"
                      onClick={() => onEscolher && onEscolher(img)}
                    >
                      Inserir
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
