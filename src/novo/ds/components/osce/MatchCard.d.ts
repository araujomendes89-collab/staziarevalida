export interface MatchPerson {
  name: string;
  /** Online agora (pílula "online") */
  online?: boolean;
  /** Compatibilidade em porcentagem (pílula "{n}% compatível") */
  compat?: number;
  /** Ex.: "Instituição · Cidade · Revalida 2026/2" */
  meta?: string;
  bio?: string;
  facts?: Array<{ icon: string; label: string; value: string }>;
  /** Linhas de "Por que vocês combinam"; strong = destaque, weak = ponto fraco */
  reasons?: Array<{ icon: string; text: string; strong?: boolean; weak?: boolean }>;
  tags?: string[];
}
export interface MatchCardProps {
  person: MatchPerson;
  /** Chamado 240 ms depois de o cartão começar a sair (arrasto de mais de 110 px ou `command`) */
  onSwipe?: (dir: "right" | "left") => void;
  /** Sai pelos botões: troque `n` a cada vez; dir 1 = direita (estudar), -1 = esquerda (pular) */
  command?: { dir: 1 | -1; n: number };
}
/** Use `key` por pessoa: o cartão que já saiu não volta. */
export declare function MatchCard(props: MatchCardProps): JSX.Element;
