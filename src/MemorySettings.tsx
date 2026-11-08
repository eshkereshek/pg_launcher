import { useEffect, useState } from 'react'
import { RotateCcw, Save, Trash2 } from 'lucide-react'
import { useTranslation } from './i18n'
import { McSelect } from './McSelect'

/** Мегабайты в человекочитаемый вид: 512 МБ, 1,4 ГБ. */
function fmt(mb: number): string {
  if (!mb) return '0 МБ'
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace('.', ',')} ГБ`
  return `${mb} МБ`
}

/** Цвета секторов: лаунчер, остальные, и категории диска. */
const DISK_COLORS = ['#f1c40f', '#5aa469', '#5a7fb8', '#8a6fb8', '#c45f5f']

/** Вкладка настроек: сколько ОЗУ ест лаунчер, чем занят диск и бэкапы миров. */
export default function MemorySettings() {
  const { t } = useTranslation()
  const [stats, setStats] = useState<any>(null)
  // Ванильные версии и сборки — миры бывают и там, и там.
  const [instances, setInstances] = useState<any[]>([])
  const [packName, setPackName] = useState('')
  const [auto, setAuto] = useState(localStorage.getItem('pg_backup_auto') === 'true')
  const [keep, setKeep] = useState(Number(localStorage.getItem('pg_backup_keep') || '3'))
  const [busy, setBusy] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [pendingRestore, setPendingRestore] = useState('')
  // Перенос данных на другой диск.
  const [moveTarget, setMoveTarget] = useState('')
  const [moving, setMoving] = useState(false)
  const [moveProgress, setMoveProgress] = useState(0)
  const [moveConfirm, setMoveConfirm] = useState(false)
  const [moveResult, setMoveResult] = useState<any>(null)

  const load = async () => {
    try {
      // @ts-ignore
      const next = await window.electronAPI.memoryStats()
      setStats(next)
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  useEffect(() => {
    load()
    // Живой визуализатор: цифры обновляем, пока вкладка открыта.
    const timer = setInterval(load, 4000)
    ;(async () => {
      try {
        // @ts-ignore
        const list = (await window.electronAPI.listInstances()) || []
        setInstances(list)
        // По умолчанию — первый инстанс, у которого есть миры.
        const withSaves = list.find((item: any) => item.hasSaves) || list[0]
        if (withSaves) setPackName((prev) => prev || withSaves.name)
      } catch {
        /* нет списка версий — бэкапы просто недоступны */
      }
    })()
    return () => clearInterval(timer)
  }, [])

  // Прогресс копирования приходит событиями из Rust (раз в ~64 МБ).
  useEffect(() => {
    let unlisten: any = null
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen('data-move-progress', (event: any) => {
          setMoveProgress(Number(event?.payload?.progress || 0))
        })
      } catch {
        /* без событий — хотя бы без полосы, результат всё равно придёт */
      }
    })()
    return () => {
      if (typeof unlisten === 'function') unlisten()
    }
  }, [])

  const pickFolder = async () => {
    // @ts-ignore
    const dir = await window.electronAPI.selectFolder(String(stats?.dataDir || ''))
    if (dir) {
      setMoveTarget(dir)
      setMoveConfirm(false)
    }
  }

  const moveNow = async () => {
    if (!moveTarget || moving) return
    // Копирование гигабайтов — подтверждаем повторным кликом.
    if (!moveConfirm) {
      setMoveConfirm(true)
      return
    }
    setMoving(true)
    setMoveConfirm(false)
    setMoveProgress(0)
    setError(null)
    try {
      // @ts-ignore
      const res = await window.electronAPI.moveDataDir(moveTarget)
      setMoveResult(res)
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setMoving(false)
    }
  }

  const savePrefs = (nextAuto: boolean, nextKeep: number) => {
    setAuto(nextAuto)
    setKeep(nextKeep)
    localStorage.setItem('pg_backup_auto', String(nextAuto))
    localStorage.setItem('pg_backup_keep', String(nextKeep))
  }

  const create = async () => {
    if (!packName || busy) return
    setBusy('create')
    setError(null)
    try {
      // @ts-ignore
      const res = await window.electronAPI.createBackup(packName, keep)
      setStats((prev: any) => ({ ...prev, backups: res.backups }))
      await load()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setBusy('')
    }
  }

  const restore = async (name: string) => {
    if (!packName || busy) return
    // Восстановление перезаписывает миры — просим подтверждение повторным кликом.
    if (pendingRestore !== name) {
      setPendingRestore(name)
      return
    }
    setBusy('restore')
    setError(null)
    setPendingRestore('')
    try {
      // @ts-ignore
      await window.electronAPI.restoreBackup(name, packName)
      await load()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setBusy('')
    }
  }

  const remove = async (name: string) => {
    if (busy) return
    setBusy('delete')
    setError(null)
    try {
      // @ts-ignore
      const res = await window.electronAPI.deleteBackup(name)
      setStats((prev: any) => ({ ...prev, backups: res.backups }))
      await load()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setBusy('')
    }
  }

  const totalMb = Number(stats?.systemTotalMb || 0)
  const freeMb = Number(stats?.systemFreeMb || 0)
  const launcherMb = Number(stats?.launcherRssMb || 0)
  const usedMb = Math.max(0, totalMb - freeMb)
  const otherMb = Math.max(0, usedMb - launcherMb)

  const usedPct = totalMb ? Math.min(100, (usedMb / totalMb) * 100) : 0
  const launcherPct = totalMb ? Math.min(100, (launcherMb / totalMb) * 100) : 0

  const disk = stats?.disk || {}
  const diskRows: Array<[string, number]> = [
    [t('mem.diskVersions'), Number(disk.versions || 0)],
    [t('mem.diskAssets'), Number(disk.assets || 0)],
    [t('mem.diskLibraries'), Number(disk.libraries || 0)],
    [t('mem.diskLogs'), Number(disk.logs || 0)],
    [t('mem.diskBackups'), Number(disk.backups || 0)],
  ]
  const diskTotal = diskRows.reduce((sum, [, value]) => sum + value, 0) || 1

  const backups: any[] = (stats?.backups || []).filter((item: any) =>
    packName ? String(item.name || '').startsWith(`${packName}-`) : true,
  )

  const packOptions = instances.map((item: any) => ({
    value: item.name,
    label: item.kind === 'version' ? `${item.name} · vanilla` : item.name,
  }))
  const keepOptions = [1, 2, 3, 5, 10].map((value) => ({ value: String(value), label: String(value) }))

  return (
    <>
      {error && <div className="settings-hint" style={{ borderColor: '#5a1a1a', color: '#ff9c94' }}>{error}</div>}

      {/* ── ОЗУ ─────────────────────────────────────────────────── */}
      <section className="settings-card">
        <div className="settings-card-head">
          {/* У заголовка карточки уже есть жёлтый маркер из settings.css —
              второй значок не нужен. */}
          <h2>{t('mem.ramTitle')}</h2>
          <p>{t('mem.ramDesc')}</p>
        </div>

        <div className="mem-row">
          <div className="mem-ring">
            <svg viewBox="0 0 124 124" width="124" height="124">
              <circle cx="62" cy="62" r="52" fill="none" stroke="#101010" strokeWidth="12" />
              {/* Лаунчер — золотая дуга от нуля. */}
              <circle
                cx="62"
                cy="62"
                r="52"
                fill="none"
                stroke="#f1c40f"
                strokeWidth="12"
                pathLength={100}
                strokeDasharray={`${launcherPct} ${100 - launcherPct}`}
                strokeDashoffset={0}
              />
              {/* Остальные процессы — серая дуга сразу за лаунчером. */}
              <circle
                cx="62"
                cy="62"
                r="52"
                fill="none"
                stroke="#4a4a4a"
                strokeWidth="12"
                pathLength={100}
                strokeDasharray={`${Math.max(0, usedPct - launcherPct)} ${100 - Math.max(0, usedPct - launcherPct)}`}
                strokeDashoffset={-launcherPct}
              />
            </svg>
            <div className="mem-ring-center">
              <div className="mem-ring-value">{Math.round(usedPct)}%</div>
              <div className="mem-ring-label">{t('mem.used')}</div>
            </div>
          </div>

          <div className="mem-legend">
            <div className="mem-legend-row">
              <span>
                <span className="mem-dot" style={{ background: '#f1c40f' }} />
                {t('mem.launcher')}
              </span>
              <span className="mem-value">{fmt(launcherMb)}</span>
            </div>
            <div className="mem-legend-row">
              <span>
                <span className="mem-dot" style={{ background: '#4a4a4a' }} />
                {t('mem.other')}
              </span>
              <span className="mem-value">{fmt(otherMb)}</span>
            </div>
            <div className="mem-legend-row">
              <span>
                <span className="mem-dot" style={{ background: '#262626', border: '1px solid #3a3a3a' }} />
                {t('mem.free')}
              </span>
              <span className="mem-value">{fmt(freeMb)}</span>
            </div>
            <div className="mem-sub">
              {t('mem.system')}: {fmt(usedMb)} / {fmt(totalMb)}
            </div>
          </div>
        </div>
      </section>

      {/* ── Диск ────────────────────────────────────────────────── */}
      <section className="settings-card">
        <div className="settings-card-head">
          <h2>{t('mem.diskTitle')}</h2>
          <p>{t('mem.diskDesc')}</p>
        </div>

        <div className="mem-bar">
          {diskRows.map(([label, value], index) => (
            <div
              key={label}
              title={`${label}: ${fmt(value)}`}
              style={{ width: `${(value / diskTotal) * 100}%`, background: DISK_COLORS[index % DISK_COLORS.length] }}
            />
          ))}
        </div>

        <div>
          {diskRows.map(([label, value], index) => (
            <div key={label} className="mem-cat">
              <div className="mem-cat-head">
                <span>
                  <span className="mem-dot" style={{ background: DISK_COLORS[index % DISK_COLORS.length] }} />
                  {label}
                </span>
                <span className="mem-value">{fmt(value)}</span>
              </div>
              <div className="mem-cat-bar">
                <div
                  className="mem-cat-fill"
                  style={{
                    width: `${(value / diskTotal) * 100}%`,
                    background: DISK_COLORS[index % DISK_COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mem-legend-row" style={{ borderTop: '1px solid #232323', paddingTop: '8px' }}>
          <span>{t('mem.diskTotal')}</span>
          <span className="mem-value">{fmt(diskTotal)}</span>
        </div>
      </section>

      {/* ── Перенос данных ─────────────────────────────────────── */}
      <section className="settings-card">
        <div className="settings-card-head">
          <h2>{t('mem.moveTitle')}</h2>
          <p>{t('mem.moveDesc')}</p>
        </div>

        <div className="mem-legend-row" style={{ alignItems: 'flex-start', gap: '10px' }}>
          <span style={{ flexShrink: 0 }}>{t('mem.dataPath')}</span>
          <span
            className="mem-value"
            style={{ fontFamily: 'monospace', fontSize: '11px', textAlign: 'right', wordBreak: 'break-all' }}
          >
            {String(stats?.dataDir || '…')}
          </span>
        </div>

        {moveResult ? (
          <>
            <div className="settings-hint" style={{ color: '#5aa469' }}>
              {t('mem.moveDone', { path: String(moveResult.dataDir), mb: String(moveResult.movedMb) })}
            </div>
            {!moveResult.removedOld && (
              <div className="settings-hint" style={{ color: '#d8a24a' }}>
                {t('mem.oldKept', { path: String(moveResult.oldDir) })}
              </div>
            )}
            <button
              type="button"
              className="mc-cube-btn gold"
              onClick={() => {
                // @ts-ignore
                window.electronAPI.restartLauncher()
              }}
            >
              {t('mem.restart')}
            </button>
          </>
        ) : (
          <>
            <div className="mem-legend-row">
              <span>{t('mem.moveTo')}</span>
              <span className="mem-value" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                {moveTarget || t('mem.notChosen')}
              </span>
            </div>

            {moving && (
              <div className="mem-cat-bar" style={{ height: '10px', marginBottom: '8px' }}>
                <div className="mem-cat-fill" style={{ width: `${moveProgress}%`, background: '#f1c40f' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" className="mc-cube-btn neutral" disabled={moving} onClick={pickFolder}>
                {t('mem.pickFolder')}
              </button>
              {moveTarget && (
                <button type="button" className="mc-cube-btn gold" disabled={moving} onClick={moveNow}>
                  {moving ? t('mem.moving') : moveConfirm ? t('mem.moveConfirm') : t('mem.move')}
                </button>
              )}
            </div>

            <div className="mem-sub" style={{ marginTop: '8px' }}>
              {t('mem.moveHint')}
            </div>
          </>
        )}
      </section>

      {/* ── Бэкапы ──────────────────────────────────────────────── */}
      <section className="settings-card">
        <div className="settings-card-head">
          <h2>{t('mem.backupTitle')}</h2>
          <p>{t('mem.backupDesc')}</p>
        </div>

        {instances.length === 0 ? (
          <div className="settings-hint">{t('mem.noInstances')}</div>
        ) : (
          <>
            <div className="mem-legend-row">
              <span>{t('mem.pack')}</span>
              <McSelect value={packName} onChange={setPackName} options={packOptions} style={{ width: '260px' }} />
            </div>

            <div className="settings-check-list">
              <label className="settings-check">
                <input type="checkbox" checked={auto} onChange={(event) => savePrefs(event.target.checked, keep)} />
                <span className="settings-check-text">
                  <span className="settings-check-title">{t('mem.auto')}</span>
                  <span className="settings-check-desc">{t('mem.autoDesc')}</span>
                </span>
              </label>
            </div>

            <div className="mem-legend-row">
              <span>{t('mem.keep')}</span>
              <McSelect
                value={String(keep)}
                onChange={(value) => savePrefs(auto, Number(value))}
                options={keepOptions}
                style={{ width: '90px' }}
              />
            </div>

            <div>
              <button type="button" className="mc-cube-btn gold" disabled={!!busy} onClick={create}>
                <Save size={13} /> {busy === 'create' ? t('mem.creating') : t('mem.create')}
              </button>
            </div>

            {backups.length === 0 ? (
              <div className="settings-hint">{t('mem.empty')}</div>
            ) : (
              <div className="mem-backups">
                {backups.map((backup: any) => (
                  <div key={backup.name} className="mem-backup">
                    <div style={{ minWidth: 0 }}>
                      <div className="mem-backup-name">{String(backup.name).replace(`${packName}-`, '')}</div>
                      <div className="mem-backup-meta">
                        {new Date(Number(backup.created) * 1000).toLocaleString()} · {fmt(Number(backup.sizeMb))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="mc-cube-btn neutral"
                        disabled={!!busy}
                        onClick={() => restore(backup.name)}
                        title={t('mem.restore')}
                      >
                        <RotateCcw size={12} />
                        {pendingRestore === backup.name ? t('mem.confirm') : t('mem.restore')}
                      </button>
                      <button
                        type="button"
                        className="mc-cube-btn danger"
                        disabled={!!busy}
                        onClick={() => remove(backup.name)}
                        title={t('mem.delete')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  )
}
