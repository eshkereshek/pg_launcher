import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Send, X } from 'lucide-react'
import { useTranslation } from './i18n'
import { showError, showOk, errorText } from './Toasts'
import { GroupIcon, PixelGlyph } from './AiIcons'
import './AiChat.css'

/** Порядок групп: сначала то, что не добавляет контент, потом остальное. */
const GROUPS = [
  'optimization',
  'library',
  'world',
  'building',
  'mobs',
  'magic',
  'tech',
  'adventure',
  'utility',
  'other',
] as const

/** Сколько чатов держим в истории: старые мешают и весят файл. */
const HISTORY_LIMIT = 30

type PlanMod = {
  project_id: string
  title: string
  icon_url?: string
  why?: string
  description?: string
  group?: string
}

/** Последняя сборка чата: контекст правок и отзыва модели. */
type PackContext = {
  name: string
  loader: string
  version: string
  mods: { title: string; project_id?: string }[]
}

type ChatMessage =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | {
      kind: 'edit'
      name: string
      loader: string
      version: string
      add: PlanMod[]
      remove: string[]
      unresolved: string[]
    }
  | {
      kind: 'plan'
      name: string
      summary: string
      version: string
      loader: string
      mods: PlanMod[]
      unresolved: string[]
    }
  | { kind: 'error'; text: string }

interface StoredChat {
  id: string
  title: string
  createdAt: number
  messages: ChatMessage[]
  /** Последняя собранная в этом чате сборка — память для правок. */
  pack?: PackContext
}

/** Иконки для новой сборки: случайный блок вместо одного и того же сундука. */
const PACK_ICONS = [
  './iconsblocks/Grass_Block_(inventory)_MCE.png',
  './iconsblocks/Emerald_Block_(inventory)_MCE.png',
  './iconsblocks/Obsidian_(inventory)_MCE.png',
  './iconsblocks/Crafting_Table_(inventory)_MCE.png',
  './iconsblocks/Furnace_(inventory)_MCE.png',
  './iconsblocks/Brick_Block_(inventory)_MCE.png',
  './iconsblocks/MCE_Diamond_Ore_(inventory).png',
  './iconsblocks/Netherrack_(inventory)_MCE.png',
  './iconsblocks/MCE_Bedrock_(inventory).png',
  './iconsblocks/Anvil.png',
]

const randomPackIcon = () => PACK_ICONS[Math.floor(Math.random() * PACK_ICONS.length)]

interface AiChatProps {
  version: string
  loader: string
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Моды плана, разложенные по группам в постоянном порядке. */
function groupMods(mods: PlanMod[]): { group: string; mods: PlanMod[] }[] {
  return GROUPS.map((group) => ({
    group,
    mods: mods.filter((mod) => (mod.group || 'other') === group),
  })).filter((section) => section.mods.length > 0)
}

/**
 * Всплывающий ИИ-чат на вкладке сборок.
 *
 * Модель отдаёт только план, моды приходят из Modrinth с реальными id, поэтому
 * «Создать сборку» ставит именно то, что видно в предпросмотре.
 */
export default function AiChat({ version, loader }: AiChatProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [chats, setChats] = useState<StoredChat[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [thinking, setThinking] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const loadedRef = useRef(false)
  // Активный чат нужен синхронно: между отправкой запроса и приходом плана
  // состояние `activeId` ещё старое, и план уходил в новый чат.
  const activeIdRef = useRef<string | null>(null)

  // Версию и загрузчик выбирает модель: фильтры вкладки её только ограничивают.
  const gameVersion = version && version !== 'all' ? version : 'auto'
  const gameLoader = loader && loader !== 'all' ? loader : 'auto'

  const active = chats.find((chat) => chat.id === activeId) || null
  const messages = active?.messages || []

  // История лежит в папке лаунчера: переживает перезапуск и чистку кэша webview.
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        // @ts-ignore
        const stored = await window.electronAPI.aiHistory?.()
        if (!alive) return
        const list: StoredChat[] = Array.isArray(stored) ? stored : []
        // Пока читался файл, игрок мог успеть отправить запрос: тогда его чат
        // уже в состоянии, и перезаписывать его старым списком нельзя.
        setChats((prev) => (prev.length > 0 ? prev : list))
        if (!activeIdRef.current) {
          activeIdRef.current = list[0]?.id || null
          setActiveId(list[0]?.id || null)
        }
      } catch (e) {
        console.error('AI history load failed', e)
      } finally {
        loadedRef.current = true
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Сохраняем после любого изменения, но не сразу после загрузки.
  useEffect(() => {
    if (!loadedRef.current) return
    // @ts-ignore
    void window.electronAPI.aiSaveHistory?.(chats.slice(0, HISTORY_LIMIT))
  }, [chats])

  // Новые сообщения должны быть видны без ручной прокрутки.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, thinking, progress, historyOpen])

  /** Пишет сообщение в активный чат; первый запрос задаёт название чата. */
  const append = (message: ChatMessage, fromUser = false) => {
    // id берём синхронно из ref: внутри обновляющей функции нельзя вызывать
    // setActiveId, а состояние к моменту прихода плана ещё старое.
    let id = activeIdRef.current
    if (!id) {
      id = newId()
      activeIdRef.current = id
      setActiveId(id)
    }
    setChats((prev) => {
      const index = prev.findIndex((chat) => chat.id === id)
      const base: StoredChat =
        index >= 0
          ? prev[index]
          : { id, title: t('ai.newChat'), createdAt: Date.now(), messages: [] }
      const title =
        fromUser && base.messages.length === 0 && message.kind === 'user'
          ? message.text.slice(0, 60)
          : base.title
      const updated: StoredChat = { ...base, title, messages: [...base.messages, message] }
      const next = index >= 0 ? prev.map((c, i) => (i === index ? updated : c)) : [updated, ...prev]
      return next.slice(0, HISTORY_LIMIT)
    })
  }


  const send = async () => {
    const text = prompt.trim()
    if (!text || thinking || progress) return

    setPrompt('')
    setHistoryOpen(false)
    append({ kind: 'user', text }, true)
    setThinking(true)
    try {
      // Сначала выясняем, вопрос это или заказ сборки: однословные темы
      // («оптимизация», «магия») бэкенд распознаёт без обращения к модели.
      const history = messages
        .filter((m) => m.kind === 'user' || m.kind === 'assistant')
        .slice(-8)
        .map((m) => ({
          role: m.kind === 'user' ? 'user' : 'assistant',
          content: String((m as any).text || ''),
        }))
      // @ts-ignore
      const route = await window.electronAPI.aiAssistant(text, history, active?.pack || null)

      // Правка последней сборки: показываем, что добавится и что уйдёт.
      if (route?.kind === 'edit') {
        append({
          kind: 'edit',
          name: String(route.name || active?.pack?.name || ''),
          loader: active?.pack?.loader || gameLoader,
          version: active?.pack?.version || gameVersion,
          add: (route.add || []) as PlanMod[],
          remove: route.remove || [],
          unresolved: route.unresolved || [],
        })
        return
      }
      if (route?.kind !== 'pack') {
        append({ kind: 'assistant', text: String(route?.answer || t('ai.emptyAnswer')) })
        return
      }

      // @ts-ignore
      // Большие сборки в приоритете: просим план до 110 модов. Это цель,
      // а не минимум — узкую тему бэкенд не раздувает выдумками.
      const plan = await window.electronAPI.aiPlan(text, gameVersion, gameLoader, 110)
      const mods: PlanMod[] = plan?.mods || []
      if (mods.length === 0) {
        append({ kind: 'error', text: t('ai.empty') })
        return
      }
      append({
        kind: 'plan',
        name: plan.name || t('ai.untitled'),
        summary: plan.summary || '',
        version: plan.gameVersion || '1.20.1',
        loader: plan.loader || 'fabric',
        mods,
        unresolved: plan.unresolved || [],
      })
    } catch (e: any) {
      append({ kind: 'error', text: errorText(e, t('app.unknownError')) })
    } finally {
      setThinking(false)
    }
  }

  /** Создаёт сборку из плана и ставит моды по одному, показывая прогресс. */
  const createFromPlan = async (plan: Extract<ChatMessage, { kind: 'plan' }>) => {
    if (progress) return
    const safeName = plan.name.replace(/[<>:"/\\|?*]/g, '-').slice(0, 48).trim() || 'AI Build'

    try {
      // @ts-ignore
      const existing: any[] = (await window.electronAPI.getModpacks()) || []
      // Имя должно быть уникальным: по нему строится папка сборки.
      let name = safeName
      let n = 2
      while (existing.some((m: any) => m.name === name)) {
        name = `${safeName} ${n++}`
      }

      const installed: any[] = []
      // @ts-ignore
      await window.electronAPI.saveModpacks([
        ...existing,
        {
          name,
          loader: plan.loader,
          version: plan.version,
          installedMods: installed,
          icon: randomPackIcon(),
        },
      ])
      window.dispatchEvent(new CustomEvent('modpacks-updated'))

      let done = 0
      // Предупреждения back-end'а: какие зависимости не встали.
      const installWarnings: string[] = []
      // Ставим пачками по три: сеть не задыхается, а сотня модов не
      // превращается в десятиминутное ожидание.
      const totalMods = plan.mods.length
      const BATCH = 3
      for (let i = 0; i < totalMods; i += BATCH) {
        setProgress(t('ai.installing', { done, total: totalMods }))
        const batch = plan.mods.slice(i, i + BATCH)
        await Promise.all(
          batch.map(async (mod) => {
            try {
              // @ts-ignore
              const res = await window.electronAPI.downloadMod(
                mod.project_id,
                plan.version,
                plan.loader,
                name,
                'mod',
              )
              const files = res?.filenames || (res?.filename ? [res.filename] : [])
              if (Array.isArray(res?.warnings)) installWarnings.push(...res.warnings)
              files.forEach((f: string) =>
                installed.push({
                  id: f,
                  // Человеческое имя из плана, а не имя файла с хешем.
                  title: mod.title || f,
                  type: 'mod',
                  isEnabled: true,
                  projectId: mod.project_id,
                }),
              )
            } catch (e) {
              console.error('AI mod install failed', mod.project_id, e)
            }
          }),
        )
        done += batch.length
      }
      setProgress(t('ai.installing', { done: totalMods, total: totalMods }))

      // Состав пишем после установки: иначе в сборке не будет списка модов.
      // @ts-ignore
      const fresh: any[] = (await window.electronAPI.getModpacks()) || []
      // @ts-ignore
      await window.electronAPI.saveModpacks(
        fresh.map((m: any) => (m.name === name ? { ...m, installedMods: installed } : m)),
      )
      window.dispatchEvent(new CustomEvent('modpacks-updated'))

      setProgress(null)
      if (installed.length === 0) {
        showError(t('ai.createdEmpty', { name }))
      } else {
        showOk(t('ai.created', { name, count: installed.length }))

        // Память чата: следующие сообщения смогут править именно эту сборку.
        const ctx: PackContext = {
          name,
          loader: plan.loader,
          version: plan.version,
          mods: plan.mods.map((mod) => ({ title: mod.title, project_id: mod.project_id })),
        }
        const chatId = activeIdRef.current
        if (chatId) {
          setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, pack: ctx } : c)))
        }

        // Если какие-то зависимости не встали — говорим прямо, а не молчим.
        if (installWarnings.length > 0) {
          console.warn('AI pack dependency warnings', installWarnings)
          append({ kind: 'error', text: t('ai.depsWarn', { count: installWarnings.length }) })
        }
      }
    } catch (e: any) {
      setProgress(null)
      showError(errorText(e, t('app.unknownError')))
    }
  }

  /** Применяет правку сборки: убирает лишние моды, ставит новые, обновляет состав. */
  const applyEdit = async (msg: Extract<ChatMessage, { kind: 'edit' }>) => {
    if (progress || (msg.add.length === 0 && msg.remove.length === 0)) return
    const packName = msg.name
    const norm = (value: string) => value.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, ' ').trim()

    try {
      // Удаление: файл ищем по названию среди установленных модов сборки.
      const removedFiles: string[] = []
      if (msg.remove.length > 0) {
        // @ts-ignore
        const installed: any[] = (await window.electronAPI.getInstalledMods(packName)) || []
        for (const want of msg.remove) {
          const key = norm(want)
          const hit =
            installed.find(
              (mod: any) => norm(String(mod?.title || '')) === key || norm(String(mod?.id || '')) === key,
            ) || installed.find((mod: any) => norm(String(mod?.title || '')).includes(key))
          if (hit?.id) {
            // @ts-ignore
            await window.electronAPI.uninstallMod(hit.id, packName)
            removedFiles.push(hit.id)
          }
        }
      }

      // Добавление: по одному, с прогрессом.
      const added: any[] = []
      const editWarnings: string[] = []
      let done = 0
      // Та же схема, что и при создании сборки: пачки по три, а не по одному.
      const BATCH = 3
      for (let i = 0; i < msg.add.length; i += BATCH) {
        setProgress(t('ai.installing', { done, total: msg.add.length }))
        const batch = msg.add.slice(i, i + BATCH)
        await Promise.all(
          batch.map(async (mod) => {
            try {
              // @ts-ignore
              const res = await window.electronAPI.downloadMod(
                mod.project_id,
                msg.version || '1.20.1',
                msg.loader || 'fabric',
                packName,
                'mod',
              )
              const files = res?.filenames || (res?.filename ? [res.filename] : [])
              if (Array.isArray(res?.warnings)) editWarnings.push(...res.warnings)
              files.forEach((file: string) =>
                added.push({
                  id: file,
                  title: mod.title || file,
                  type: 'mod',
                  isEnabled: true,
                  projectId: mod.project_id,
                }),
              )
            } catch (e) {
              console.error('AI edit install failed', mod.project_id, e)
            }
          }),
        )
        done += batch.length
      }
      setProgress(null)

      // Состав сборки в modpacks.json.
      // @ts-ignore
      const all: any[] = (await window.electronAPI.getModpacks()) || []
      // @ts-ignore
      await window.electronAPI.saveModpacks(
        all.map((pack: any) => {
          if (pack.name !== packName) return pack
          const kept = (pack.installedMods || []).filter((mod: any) => !removedFiles.includes(mod.id))
          return { ...pack, installedMods: [...kept, ...added] }
        }),
      )
      window.dispatchEvent(new CustomEvent('modpacks-updated'))

      // Контекст чата: снятые убираем, новые запоминаем.
      const chatId = activeIdRef.current
      const addedCtx = msg.add.map((mod) => ({ title: mod.title, project_id: mod.project_id }))
      if (chatId) {
        const removeKeys = new Set(msg.remove.map(norm))
        setChats((prev) =>
          prev.map((chat) => {
            if (chat.id !== chatId || !chat.pack) return chat
            const mods = chat.pack.mods.filter((mod) => !removeKeys.has(norm(mod.title)))
            return { ...chat, pack: { ...chat.pack, mods: [...mods, ...addedCtx] } }
          }),
        )
      }

      showOk(t('ai.editApplied'))
      if (editWarnings.length > 0) {
        console.warn('AI edit dependency warnings', editWarnings)
        append({ kind: 'error', text: t('ai.depsWarn', { count: editWarnings.length }) })
      }
    } catch (e: any) {
      setProgress(null)
      showError(errorText(e, t('app.unknownError')))
    }
  }

  /** Название группы: ключи фиксированные, поэтому собираем их явно. */
  const groupLabel = (group: string) => {
    const key = (
      [
        'ai.group.optimization',
        'ai.group.library',
        'ai.group.world',
        'ai.group.building',
        'ai.group.mobs',
        'ai.group.magic',
        'ai.group.tech',
        'ai.group.adventure',
        'ai.group.utility',
        'ai.group.other',
      ] as const
    )[GROUPS.indexOf(group as any)]
    return t(key || 'ai.group.other')
  }

  const startNewChat = () => {
    const chat: StoredChat = {
      id: newId(),
      title: t('ai.newChat'),
      createdAt: Date.now(),
      messages: [],
    }
    setChats((prev) => [chat, ...prev].slice(0, HISTORY_LIMIT))
    activeIdRef.current = chat.id
    setActiveId(chat.id)
    setHistoryOpen(false)
    setPrompt('')
  }

  const removeChat = (id: string) => {
    const next = chats.filter((chat) => chat.id !== id)
    setChats(next)
    if (id === activeIdRef.current) {
      activeIdRef.current = next[0]?.id || null
      setActiveId(next[0]?.id || null)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`ai-chat-fab${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={t('ai.openChat')}
        aria-label={t('ai.openChat')}
        aria-expanded={open}
      >
        <PixelGlyph name="magic" size={16} />
      </button>

      {open
        ? createPortal(
            <div className="ai-chat" role="dialog" aria-label={t('ai.chatTitle')}>
              <div className="ai-chat-head">
                <PixelGlyph name="magic" size={14} />
                <span className="ai-chat-title">{t('ai.chatTitle')}</span>
                <span className="ai-chat-ctx" title={t('ai.auto')}>
                  {gameVersion === 'auto' ? t('ai.autoShort') : `${gameVersion} · ${gameLoader}`}
                </span>
                <button
                  type="button"
                  className="ai-chat-icon-btn"
                  onClick={() => setHistoryOpen((v) => !v)}
                  title={t('ai.history')}
                  aria-label={t('ai.history')}
                  aria-pressed={historyOpen}
                >
                  <PixelGlyph name="history" size={13} />
                </button>
                <button
                  type="button"
                  className="ai-chat-icon-btn"
                  onClick={startNewChat}
                  title={t('ai.newChat')}
                  aria-label={t('ai.newChat')}
                >
                  <PixelGlyph name="plus" size={13} />
                </button>
                <button
                  type="button"
                  className="ai-chat-close"
                  onClick={() => setOpen(false)}
                  aria-label={t('ui.close')}
                >
                  <X size={15} />
                </button>
              </div>

              {historyOpen ? (
                <div className="ai-chat-history">
                  {chats.length === 0 ? (
                    <div className="ai-chat-hint">{t('ai.historyEmpty')}</div>
                  ) : (
                    <ul className="ai-history-list">
                      {chats.map((chat) => (
                        <li
                          key={chat.id}
                          className={`ai-history-item${chat.id === activeId ? ' is-active' : ''}`}
                        >
                          <button
                            type="button"
                            className="ai-history-open"
                            onClick={() => {
                              activeIdRef.current = chat.id
                              setActiveId(chat.id)
                              setHistoryOpen(false)
                            }}
                          >
                            <span className="ai-history-name">{chat.title}</span>
                            <span className="ai-history-meta">
                              {new Date(chat.createdAt).toLocaleDateString()} ·{' '}
                              {chat.messages.length}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="ai-history-delete"
                            onClick={() => removeChat(chat.id)}
                            aria-label={t('ai.deleteChat')}
                            title={t('ai.deleteChat')}
                          >
                            <PixelGlyph name="trash" size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="ai-chat-list" ref={listRef}>
                  {messages.length === 0 && !thinking ? (
                    <div className="ai-chat-hint">{t('ai.chatHello')}</div>
                  ) : null}

                  {messages.map((m, i) => {
                    if (m.kind === 'user') {
                      return (
                        <div key={i} className="ai-msg ai-msg-user">
                          {m.text}
                        </div>
                      )
                    }
                    if (m.kind === 'error') {
                      return (
                        <div key={i} className="ai-msg ai-msg-error">
                          {m.text}
                        </div>
                      )
                    }
                    if (m.kind === 'assistant') {
                      return (
                        <div key={i} className="ai-msg ai-msg-assistant">
                          {m.text}
                        </div>
                      )
                    }
                    if (m.kind === 'edit') {
                      return (
                        <div key={i} className="ai-msg ai-msg-plan">
                          <div className="ai-plan-name">
                            {t('ai.editTitle')}: {m.name}
                          </div>
                          {m.remove.length > 0 ? (
                            <div className="ai-plan-count">
                              <span className="ai-plan-tag">{t('ai.editRemove')}</span>
                              {m.remove.join(', ')}
                            </div>
                          ) : null}
                          {m.add.length > 0 ? (
                            <>
                              <div className="ai-plan-count">
                                <span className="ai-plan-tag">{t('ai.editAdd')}</span>
                                {t('ai.found', { count: m.add.length })}
                                {m.unresolved.length > 0
                                  ? ` · ${t('ai.missed', { count: m.unresolved.length })}`
                                  : ''}
                              </div>
                              <ul className="ai-group-mods">
                                {m.add.map((mod) => (
                                  <li
                                    key={mod.project_id}
                                    className="ai-mod"
                                    title={mod.why || mod.description}
                                  >
                                    {mod.icon_url ? (
                                      <img src={mod.icon_url} alt="" loading="lazy" />
                                    ) : (
                                      <span className="ai-mod-blank" />
                                    )}
                                    <span className="ai-mod-title">{mod.title}</span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="mods-btn-primary ai-plan-create"
                            disabled={!!progress || (m.add.length === 0 && m.remove.length === 0)}
                            onClick={() => {
                              void applyEdit(m)
                            }}
                          >
                            {progress ? <Loader2 size={13} className="spin" /> : null}
                            {t('ai.editApply')}
                          </button>
                        </div>
                      )
                    }
                    return (
                      <div key={i} className="ai-msg ai-msg-plan">
                        <div className="ai-plan-name">{m.name}</div>
                        {m.summary ? <div className="ai-plan-summary">{m.summary}</div> : null}
                        <div className="ai-plan-count">
                          <span className="ai-plan-tag">
                            {m.version} · {m.loader}
                          </span>
                          {t('ai.found', { count: m.mods.length })}
                          {m.unresolved.length > 0
                            ? ` · ${t('ai.missed', { count: m.unresolved.length })}`
                            : ''}
                        </div>

                        <div className="ai-plan-groups">
                          {groupMods(m.mods).map((section) => (
                            <section key={section.group} className="ai-group">
                              <div className="ai-group-head">
                                <GroupIcon group={section.group} />
                                <span>{groupLabel(section.group)}</span>
                                <span className="ai-group-count">{section.mods.length}</span>
                              </div>
                              <ul className="ai-group-mods">
                                {section.mods.map((mod) => (
                                  <li
                                    key={mod.project_id}
                                    className="ai-mod"
                                    title={mod.why || mod.description}
                                  >
                                    {mod.icon_url ? (
                                      <img src={mod.icon_url} alt="" loading="lazy" />
                                    ) : (
                                      <span className="ai-mod-blank" />
                                    )}
                                    <span className="ai-mod-title">{mod.title}</span>
                                  </li>
                                ))}
                              </ul>
                            </section>
                          ))}
                        </div>

                        <button
                          type="button"
                          className="mods-btn-primary ai-plan-create"
                          onClick={() => {
                            void createFromPlan(m)
                          }}
                          disabled={!!progress}
                        >
                          {progress ? <Loader2 size={13} className="spin" /> : null}
                          {t('ai.createPack')}
                        </button>
                      </div>
                    )
                  })}

                  {thinking ? (
                    <div className="ai-msg ai-msg-thinking">
                      <Loader2 size={13} className="spin" /> {t('ai.generating')}
                    </div>
                  ) : null}
                  {progress ? <div className="ai-msg ai-msg-thinking">{progress}</div> : null}
                </div>
              )}

              <div className="ai-chat-input">
                <input
                  className="mc-input"
                  placeholder={t('ai.placeholder')}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void send()
                  }}
                  disabled={thinking || !!progress}
                />
                <button
                  type="button"
                  className="mods-btn-primary ai-chat-send"
                  onClick={() => {
                    void send()
                  }}
                  disabled={thinking || !!progress || !prompt.trim()}
                  aria-label={t('ai.send')}
                >
                  <Send size={15} />
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
