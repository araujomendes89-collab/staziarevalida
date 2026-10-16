import '@testing-library/jest-dom';

// In-memory mock for localStorage in jsdom test environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] || null,
    get length() {
      return Object.keys(store).length;
    },
  };
})();

// Testes com `@vitest-environment node` (ex.: banco no PGlite) não têm window.
if (typeof window !== 'undefined') {
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock matchMedia for responsive UI components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
}

// Editor estilo Word (TipTap) nas telas da Administração: nos testes de TELA ele vira um <textarea> simples com o mesmo texto com
// marcas (value/onChange iguais), para os testes continuarem digitando com fireEvent.change. O editor de verdade (barra, negrito,
// tabela, desfazer) tem os próprios testes em textoRicoEditor.test.tsx, que importam EditorTexto.jsx direto (sem este mock).
vi.mock('./novo/app/textoRico/CampoTexto.jsx', async () => {
  const React = await import('react');
  function CampoTexto({ value, onChange, label, hint, disabled, minRows = 3, maxLength }: any) {
    const id = React.useId();
    return React.createElement(
      'div',
      { className: 'sm-field' },
      label ? React.createElement('label', { className: 'sm-field__label', htmlFor: id }, label) : null,
      React.createElement('textarea', { id, value: value ?? '', rows: minRows, maxLength, disabled, onChange: (e: any) => onChange?.(e.target.value) }),
      hint ? React.createElement('span', { className: 'sm-field__hint' }, hint) : null,
    );
  }
  return { CampoTexto, default: CampoTexto };
});
