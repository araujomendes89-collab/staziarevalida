export interface TimerProps {
  /** Segundos que faltam (vêm do servidor). Fração é descartada; negativo vira 00:00 */
  seconds: number;
  state?: 'idle' | 'running' | 'paused' | 'expired';
  /** Amarelo a partir daqui (padrão 120 s) */
  warnAt?: number;
  /** Vermelho a partir daqui e no zero (padrão 30 s) */
  dangerAt?: number;
  /** Tamanho da fonte em px (padrão 26) */
  size?: number;
}
export declare function Timer(props: TimerProps): JSX.Element;
