/** i18n leve — dicionários por idioma + contexto React (sem lib externa).
 *
 * Uso: `const t = useT()` num componente, e `t('chave')` (ou `t('chave', {n})`).
 * Chaves ausentes caem para o português e, por fim, para a própria chave.
 */

import { createContext, useContext } from 'react'

export type Lang = 'pt' | 'en'

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'pt', label: 'Português' },
  { id: 'en', label: 'English' }
]

type Dict = Record<string, string>

const pt: Dict = {
  'app.phase': 'Fase 1 · editor',
  'app.status': 'conexão: {conn} · kernel: {kernel}',
  'app.autosave': ' · auto save',

  'view.files': 'Arquivos',
  'view.search': 'Buscar',
  'view.git': 'Git',
  'view.debug': 'Debug',
  'view.panels': 'Painéis',
  'view.settings': 'Configurações',

  'sidebar.openFolder': 'Abrir pasta…',
  'recents.title': 'Projetos recentes',
  'recents.remove': 'Remover dos recentes',

  'toolbar.runAll': '▶ Rodar tudo',
  'toolbar.debug': '🐞 Debug',
  'toolbar.debugTitle': 'Depurar este arquivo (breakpoints na margem esquerda)',
  'toolbar.interrupt': '■ Interromper',
  'toolbar.restart': '⟳ Restart',
  'toolbar.restartTitle': 'Reiniciar kernel',
  'toolbar.clear': 'Limpar',
  'editor.hint':
    'Ctrl+Enter: célula · Shift+Enter: célula e avança · Ctrl+Shift+Enter: tudo · Ctrl+S: salvar · células com # %%',
  'editor.scratch': 'scratch (não salvo em arquivo)',
  'console.title': 'Console',

  'sb.connecting': 'conectando',
  'sb.closed': 'desconectado',
  'sb.error': 'erro',
  'sb.busy': 'ocupado',
  'sb.idle': 'ocioso',
  'sb.ram': 'RAM',
  'sb.cpu': 'CPU',
  'sb.threads': '{n} thr',
  'sb.vars': '{n} var',
  'sb.varsPlural': '{n} vars',
  'sb.tasks': '▷ Tarefas',
  'sb.tasksTitle': 'Tarefas do projeto',
  'sb.terminal': '⌨ Terminal',
  'sb.terminalTitle': 'Terminal (Ctrl+`)',
  'sb.interrupt': '■ Interromper',
  'sb.interruptTitle': 'Interromper execução',
  'sb.restart': '⟳ Restart',
  'sb.restartTitle': 'Reiniciar kernel',

  'settings.title': 'Configurações',
  'settings.general': 'Geral',
  'settings.python': 'Python',
  'settings.project': 'Projeto',
  'settings.close': 'Fechar (Esc)',
  'settings.theme': 'Tema',
  'settings.accent': 'Cor de destaque',
  'settings.fontSize': 'Fonte do editor',
  'settings.tabSize': 'Largura do tab',
  'settings.autosave': 'Auto save',
  'settings.language': 'Idioma',
  'settings.projectNeedsFolder': 'Abra uma pasta para configurar o projeto.',
  'settings.projectName': 'Nome',
  'settings.projectNameHint': '(opcional)',
  'settings.projectTheme': 'Tema do projeto',
  'settings.themeDefault': 'Padrão (IDE)',
  'settings.projectSavedIn': 'Salvo em {file} (versionável com o projeto).',
  'settings.py.interpreter': 'Interpretador do kernel',
  'settings.py.detecting': 'detectando…',
  'settings.py.default': 'Padrão do engine',
  'settings.py.defaultMeta': 'o Python que roda o PyKortex',
  'settings.py.noIpykernel': 'sem ipykernel — não pode virar kernel',
  'settings.py.env': 'Variáveis de ambiente do kernel',
  'settings.py.addVar': '+ variável',
  'settings.py.apply': 'Aplicar e reiniciar o kernel',
  'settings.py.active': 'ativo: {name}'
}

const en: Dict = {
  'app.phase': 'Phase 1 · editor',
  'app.status': 'connection: {conn} · kernel: {kernel}',
  'app.autosave': ' · auto save',

  'view.files': 'Files',
  'view.search': 'Search',
  'view.git': 'Git',
  'view.debug': 'Debug',
  'view.panels': 'Panels',
  'view.settings': 'Settings',

  'sidebar.openFolder': 'Open folder…',
  'recents.title': 'Recent projects',
  'recents.remove': 'Remove from recents',

  'toolbar.runAll': '▶ Run all',
  'toolbar.debug': '🐞 Debug',
  'toolbar.debugTitle': 'Debug this file (breakpoints in the left margin)',
  'toolbar.interrupt': '■ Interrupt',
  'toolbar.restart': '⟳ Restart',
  'toolbar.restartTitle': 'Restart kernel',
  'toolbar.clear': 'Clear',
  'editor.hint':
    'Ctrl+Enter: cell · Shift+Enter: cell and advance · Ctrl+Shift+Enter: all · Ctrl+S: save · cells with # %%',
  'editor.scratch': 'scratch (not saved to a file)',
  'console.title': 'Console',

  'sb.connecting': 'connecting',
  'sb.closed': 'disconnected',
  'sb.error': 'error',
  'sb.busy': 'busy',
  'sb.idle': 'idle',
  'sb.ram': 'RAM',
  'sb.cpu': 'CPU',
  'sb.threads': '{n} thr',
  'sb.vars': '{n} var',
  'sb.varsPlural': '{n} vars',
  'sb.tasks': '▷ Tasks',
  'sb.tasksTitle': 'Project tasks',
  'sb.terminal': '⌨ Terminal',
  'sb.terminalTitle': 'Terminal (Ctrl+`)',
  'sb.interrupt': '■ Interrupt',
  'sb.interruptTitle': 'Interrupt execution',
  'sb.restart': '⟳ Restart',
  'sb.restartTitle': 'Restart kernel',

  'settings.title': 'Settings',
  'settings.general': 'General',
  'settings.python': 'Python',
  'settings.project': 'Project',
  'settings.close': 'Close (Esc)',
  'settings.theme': 'Theme',
  'settings.accent': 'Accent color',
  'settings.fontSize': 'Editor font size',
  'settings.tabSize': 'Tab size',
  'settings.autosave': 'Auto save',
  'settings.language': 'Language',
  'settings.projectNeedsFolder': 'Open a folder to configure the project.',
  'settings.projectName': 'Name',
  'settings.projectNameHint': '(optional)',
  'settings.projectTheme': 'Project theme',
  'settings.themeDefault': 'Default (IDE)',
  'settings.projectSavedIn': 'Saved in {file} (versionable with the project).',
  'settings.py.interpreter': 'Kernel interpreter',
  'settings.py.detecting': 'detecting…',
  'settings.py.default': 'Engine default',
  'settings.py.defaultMeta': 'the Python that runs PyKortex',
  'settings.py.noIpykernel': 'no ipykernel — cannot be a kernel',
  'settings.py.env': 'Kernel environment variables',
  'settings.py.addVar': '+ variable',
  'settings.py.apply': 'Apply and restart the kernel',
  'settings.py.active': 'active: {name}'
}

const DICTS: Record<Lang, Dict> = { pt, en }

export type TFunc = (key: string, vars?: Record<string, string | number>) => string

export function createT(lang: Lang): TFunc {
  const dict = DICTS[lang] ?? pt
  return (key, vars) => {
    let s = dict[key] ?? pt[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
    }
    return s
  }
}

export const I18nContext = createContext<TFunc>(createT('pt'))
export const useT = (): TFunc => useContext(I18nContext)
