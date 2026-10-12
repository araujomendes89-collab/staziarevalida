export interface ToastProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  message?: string;
  onClose?: () => void;
}
export declare function Toast(props: ToastProps): JSX.Element;
/** Um aviso por vez, some em 2600 ms. Renderize `node` uma vez na tela; `show(título, tom = "success")`. */
export declare function useToast(): [node: React.ReactNode, show: (title: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void];
