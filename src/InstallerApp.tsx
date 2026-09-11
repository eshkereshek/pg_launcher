import { useState, useEffect } from 'react'

export default function InstallerApp() {
  const [step, setStep] = useState(0)
  const [installPath, setInstallPath] = useState('')
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null)
  const [installMode, setInstallMode] = useState<'install' | 'update' | 'clean' | 'uninstall'>('install')
  const [licenseAccepted, setLicenseAccepted] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [uninstalling, setUninstalling] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  // Java management state
  const [showJavaModal, setShowJavaModal] = useState(false)
  const [javaStatus, setJavaStatus] = useState<Record<string, { installed: boolean; path: string | null }>>({
    '8': { installed: false, path: null },
    '17': { installed: false, path: null },
    '21': { installed: false, path: null },
  })
  const [installingJava, setInstallingJava] = useState<string | null>(null)
  const [javaProgress, setJavaProgress] = useState<{ version: string; status: string; progress: number } | null>(null)
  const [javaError, setJavaError] = useState('')

  const refreshJavaStatus = async () => {
    try {
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.getInstalledJavas) {
        // @ts-ignore
        const res = await window.electronAPI.getInstalledJavas()
        if (res) setJavaStatus(res)
      }
    } catch (e) {
      console.error('Failed to load Java status:', e)
    }
  }

  const handleInstallJava = async (version: '8' | '17' | '21') => {
    if (installingJava) return
    setInstallingJava(version)
    setJavaError('')
    setJavaProgress({ version, status: `Подготовка к установке Java ${version}...`, progress: 5 })
    try {
      // @ts-ignore
      await window.electronAPI.installJava(version)
      await refreshJavaStatus()
      setJavaProgress(null)
    } catch (err: any) {
      setJavaError(err.message || 'Ошибка установки Java')
    } finally {
      setInstallingJava(null)
    }
  }

  const handleInstallAllRecommended = async () => {
    if (installingJava) return
    const toInstall: ('8' | '17' | '21')[] = []
    if (!javaStatus['8']?.installed) toInstall.push('8')
    if (!javaStatus['17']?.installed) toInstall.push('17')
    if (!javaStatus['21']?.installed) toInstall.push('21')

    for (const v of toInstall) {
      await handleInstallJava(v)
    }
  }

  useEffect(() => {
    refreshJavaStatus()
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.onJavaInstallProgress) {
      // @ts-ignore
      window.electronAPI.onJavaInstallProgress((data: any) => {
        setJavaProgress(data)
      })
    }
  }, [])

  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.updateDiscordPresence) {
      // @ts-ignore
      window.electronAPI.updateDiscordPresence({
        details: "Программа установки",
        state: "Устанавливает лаунчер",
        largeImageKey: "logo",
        largeImageText: "Pagrysha Launcher"
      })
    }

    // @ts-ignore
    window.electronAPI.getDefaultInstallPath().then(async (path: string) => {
      setInstallPath(path)
      // @ts-ignore
      const installed = await window.electronAPI.checkIsInstalled(path)
      setIsInstalled(installed)
      if (installed) {
        setInstallMode('update')
      }
    })
  }, [])

  const handleUninstall = async () => {
    setUninstalling(true)
    setError('')
    try {
      // @ts-ignore
      await window.electronAPI.uninstallApp(installPath)
      setStep(6)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUninstalling(false)
    }
  }

  const handleNext = () => {
    if (step === 0 && isInstalled && installMode === 'uninstall') {
      setStep(5)
      handleUninstall()
      return
    }
    if (step === 1 && !licenseAccepted) return
    setStep(s => s + 1)
  }

  const handleInstall = async () => {
    setInstalling(true)
    setError('')
    setStep(3)
    try {
      const interval = setInterval(() => {
        setProgress(p => {
          if (p >= 90) {
            clearInterval(interval)
            return 90
          }
          return p + 10
        })
      }, 200)

      if (installMode === 'clean') {
        // @ts-ignore
        await window.electronAPI.uninstallApp(installPath)
      }

      // @ts-ignore
      await window.electronAPI.installApp(installPath)
      setProgress(95)
      // @ts-ignore
      await window.electronAPI.createShortcuts(installPath)
      setProgress(100)
      clearInterval(interval)
      setStep(4)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setInstalling(false)
    }
  }

  const handleLaunch = () => {
    // @ts-ignore
    window.electronAPI.launchInstalled(installPath)
  }

  const handleCancel = () => {
    // @ts-ignore
    window.electronAPI.windowClose()
  }

  const titleFont = '"MinecraftTen", "Blocks", monospace';
  const warmBg = '#2c2826';
  const warmPanel = '#25201d';
  const warmBorder = '#3e3630';
  const warmText = '#d8ccb8';

  return (
    <div style={{
      width: '100vw', height: '100vh', 
      backgroundColor: warmBg, color: '#fff',
      fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      display: 'flex', flexDirection: 'column',
      userSelect: 'none',
      position: 'relative'
    }}>
      {/* Title bar (draggable) */}
      <div style={{
        height: '30px', backgroundColor: '#1a1614', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', ...( { WebkitAppRegion: 'drag' } as any )
      }}>
        <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Установка Pagrysha Launcher</div>
        <div style={{ cursor: 'pointer', padding: '0 5px', ...( { WebkitAppRegion: 'no-drag' } as any ) }} onClick={handleCancel}>✕</div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left image area */}
        <div style={{
          width: '200px', backgroundColor: warmPanel, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRight: `1px solid ${warmBorder}`
        }}>
          <div style={{
            width: '140px', height: '140px', backgroundColor: '#1a1614',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #111',
            boxShadow: 'inset 0 3px 0 0 rgba(255, 255, 255, 0.1), inset 3px 0 0 0 rgba(255, 255, 255, 0.05), inset 0 -3px 0 0 rgba(0, 0, 0, 0.6), inset -3px 0 0 0 rgba(0, 0, 0, 0.3), 0 4px 6px rgba(0,0,0,0.3)'
          }}>
            <img src="./icon.png" alt="Launcher Icon" style={{ width: '100px', height: '100px', imageRendering: 'pixelated' }} />
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, padding: '30px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          
          {step === 0 && isInstalled === false && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h1 style={{ margin: '0 0 15px 0', fontSize: '28px', fontFamily: titleFont, letterSpacing: '1px', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>Добро пожаловать!</h1>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: warmText }}>
                Этот Мастер поможет вам выполнить установку<br/>
                Pagrysha Launcher на ваш компьютер.
              </p>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: warmText, marginTop: '15px' }}>
                Для продолжения установки, нажмите "Продолжить".
              </p>

              <div style={{ marginTop: 'auto', padding: '12px 14px', background: warmPanel, border: `1px solid ${warmBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#f1c40f', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ☕ Компоненты Java (JRE 8, 17, 21)
                  </div>
                  <div style={{ fontSize: '11px', color: '#9c8e7e', marginTop: '2px' }}>
                    {Object.values(javaStatus).every(j => j.installed)
                      ? '✓ Все версии Java (8, 17, 21) уже установлены'
                      : 'Установите Java заранее для поддержки любых версий игры'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowJavaModal(true); refreshJavaStatus(); }}
                  className="mc-btn-primary"
                  style={{ padding: '6px 14px', fontSize: '12px', whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  {Object.values(javaStatus).every(j => j.installed) ? 'Проверить Java' : 'Установить Java'}
                </button>
              </div>
            </div>
          )}

          {step === 0 && isInstalled === true && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h1 style={{ margin: '0 0 15px 0', fontSize: '24px', fontFamily: titleFont, letterSpacing: '1px', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>Лаунчер уже установлен</h1>
              <p style={{ fontSize: '13px', lineHeight: '1.5', color: warmText, marginBottom: '14px' }}>
                Похоже, что Pagrysha Launcher уже установлен на вашем компьютере. Выберите действие:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button 
                  onClick={() => setInstallMode('update')} 
                  style={{ padding: '10px', background: installMode === 'update' ? '#111' : warmPanel, border: `2px solid ${installMode === 'update' ? '#f1c40f' : '#111'}`, color: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'monospace' }}
                >
                  <strong style={{ color: installMode === 'update' ? '#f1c40f' : '#fff' }}>Обновить лаунчер</strong><br/>
                  <span style={{ fontSize: '11px', color: '#9c8e7e' }}>Установить новую версию поверх старой, сохранив данные.</span>
                </button>
                <button 
                  onClick={() => setInstallMode('clean')} 
                  style={{ padding: '10px', background: installMode === 'clean' ? '#111' : warmPanel, border: `2px solid ${installMode === 'clean' ? '#f1c40f' : '#111'}`, color: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'monospace' }}
                >
                  <strong style={{ color: installMode === 'clean' ? '#f1c40f' : '#fff' }}>Чистая установка</strong><br/>
                  <span style={{ fontSize: '11px', color: '#9c8e7e' }}>Удалить абсолютно все старые файлы и данные (включая AppData) и установить чистый лаунчер.</span>
                </button>
                <button 
                  onClick={() => setInstallMode('uninstall')} 
                  style={{ padding: '10px', background: installMode === 'uninstall' ? '#111' : warmPanel, border: `2px solid ${installMode === 'uninstall' ? '#e74c3c' : '#111'}`, color: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'monospace' }}
                >
                  <strong style={{ color: installMode === 'uninstall' ? '#e74c3c' : '#fff' }}>Удалить лаунчер</strong><br/>
                  <span style={{ fontSize: '11px', color: '#9c8e7e' }}>Полностью удалить лаунчер, стерев все его данные, кэш и скрытые папки.</span>
                </button>
              </div>

              <div style={{ marginTop: 'auto', paddingTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { setShowJavaModal(true); refreshJavaStatus(); }}
                  style={{ background: 'none', border: 'none', color: '#f1c40f', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline', padding: 0, fontFamily: 'monospace' }}
                >
                  ☕ Проверить или установить версии Java (8, 17, 21)
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', fontFamily: titleFont, letterSpacing: '1px', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>Лицензионное соглашение</h1>
              <p style={{ fontSize: '13px', color: warmText, marginBottom: '10px' }}>Пожалуйста, ознакомьтесь с лицензионным соглашением.</p>
              <div style={{
                flex: 1, maxHeight: '220px', backgroundColor: '#1a1614', color: '#d8ccb8', padding: '10px', overflowY: 'auto',
                fontSize: '12px', border: `2px solid #111`, marginBottom: '15px', fontFamily: 'monospace',
                boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.5)'
              }}>
                Pagrysha Launcher - Лицензионное соглашение<br/><br/>
                Настоящее Соглашение является юридически обязательным договором между вами, далее именуемым «Пользователь», и разработчиком программного обеспечения «Pagrysha Launcher», далее именуемым «Разработчик», регулирующим использование данного лаунчера для запуска игры Minecraft. Устанавливая и используя данное программное обеспечение, вы выражаете свое полное и безоговорочное согласие со всеми условиями настоящего документа.
                <br/><br/>
                Разработчик не является правообладателем игры Minecraft, её ресурсов, торговых марок или иных объектов интеллектуальной собственности компании Mojang Studios или Microsoft Corporation, и лаунчер является лишь сторонним инструментом для запуска, не предоставляющим прав на саму игру. Пользователь обязан соблюдать официальное Лицензионное соглашение Mojang/Microsoft, доступное по адресу account.mojang.com/documents/minecraft_eula, и несет полную ответственность за использование своего аккаунта.
                <br/><br/>
                Программное обеспечение предоставляется на условиях «как есть», что означает отсутствие гарантий бесперебойной работы, отсутствия ошибок или полной совместимости с любыми пользовательскими модификациями. Разработчик не несет ответственности за любые прямые или косвенные убытки, включая потерю игровых данных, миров, прогресса, повреждение файлов конфигурации или операционной системы, возникшие в результате использования лаунчера.
              </div>
              <div className="settings-checkbox-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={licenseAccepted} onChange={(e) => setLicenseAccepted(e.target.checked)} />
                  Я принимаю условия лицензионного соглашения.
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', fontFamily: titleFont, letterSpacing: '1px', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>Выбор папки установки</h1>
              <p style={{ fontSize: '13px', color: warmText, marginBottom: '15px' }}>Программа будет установлена в следующую папку.</p>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={installPath}
                  onChange={async e => {
                    const newPath = e.target.value;
                    setInstallPath(newPath);
                    if (newPath) {
                      // @ts-ignore
                      const installed = await window.electronAPI.checkIsInstalled(newPath);
                      setIsInstalled(installed);
                      if (installed) {
                        setInstallMode('update');
                      }
                    }
                  }}
                  style={{ flex: 1, padding: '8px 12px', backgroundColor: warmPanel, border: '2px solid #111', color: '#fff', outline: 'none', fontFamily: 'monospace', fontSize: '13px' }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      // @ts-ignore
                      const selected = await window.electronAPI.selectFolder(installPath);
                      if (selected) {
                        setInstallPath(selected);
                        // @ts-ignore
                        const installed = await window.electronAPI.checkIsInstalled(selected);
                        setIsInstalled(installed);
                        if (installed) {
                          setInstallMode('update');
                        }
                      }
                    } catch (err) {
                      console.error('Error selecting folder:', err);
                    }
                  }}
                  className="mc-btn-primary"
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontFamily: titleFont,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer'
                  }}
                >Обзор...</button>
              </div>
              <p style={{ fontSize: '12px', color: '#9c8e7e', marginTop: '8px', marginBottom: '15px' }}>Требуется свободного места: ~150 МБ</p>

              <div style={{ marginTop: 'auto', padding: '12px 14px', background: warmPanel, border: `1px solid ${warmBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#f1c40f', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ☕ Компоненты Java (JRE 8, 17, 21)
                  </div>
                  <div style={{ fontSize: '11px', color: '#9c8e7e', marginTop: '2px' }}>
                    {Object.values(javaStatus).every(j => j.installed)
                      ? '✓ Все версии Java (8, 17, 21) уже установлены'
                      : 'Рекомендуется установить Java заранее для быстрого запуска игр'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowJavaModal(true); refreshJavaStatus(); }}
                  className="mc-btn-primary"
                  style={{ padding: '6px 14px', fontSize: '12px', whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  {Object.values(javaStatus).every(j => j.installed) ? 'Проверить Java' : 'Установить Java'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', fontFamily: titleFont, letterSpacing: '1px', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>Установка...</h1>
              <p style={{ fontSize: '13px', color: warmText, marginBottom: '20px' }}>Пожалуйста, подождите, пока Pagrysha Launcher установится.</p>
              
              <div style={{ width: '100%', height: '24px', backgroundColor: warmPanel, border: '2px solid #111', position: 'relative' }}>
                <div style={{
                  height: '100%', background: 'linear-gradient(to bottom, var(--pg-yellow), #d4a017)', width: `${progress}%`, transition: 'width 0.2s', borderRight: '2px solid #111'
                }}></div>
              </div>
              <div style={{ fontSize: '12px', color: '#9c8e7e', marginTop: '10px' }}>
                {error ? <span style={{ color: '#e74c3c' }}>{error}</span> : `Копирование файлов... ${progress}%`}
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: '0 0 15px 0', fontSize: '28px', fontFamily: titleFont, letterSpacing: '1px', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>Установка завершена</h1>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: warmText }}>
                Pagrysha Launcher был успешно установлен на ваш компьютер.
              </p>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: warmText, marginTop: '20px' }}>
                Нажмите "Завершить", чтобы выйти из программы установки и запустить лаунчер.
              </p>
            </div>
          )}

          {step === 5 && (
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', fontFamily: titleFont, letterSpacing: '1px', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>Удаление...</h1>
              <p style={{ fontSize: '13px', color: warmText, marginBottom: '20px' }}>Пожалуйста, подождите, пока Pagrysha Launcher удаляется.</p>
              <div style={{ fontSize: '12px', color: '#9c8e7e', marginTop: '10px' }}>
                {error ? <span style={{ color: '#e74c3c' }}>{error}</span> : `Удаление файлов...`}
              </div>
            </div>
          )}

          {step === 6 && (
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: '0 0 15px 0', fontSize: '28px', fontFamily: titleFont, letterSpacing: '1px', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>Удаление завершено</h1>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: warmText }}>
                Pagrysha Launcher и все его файлы, данные и скрытые папки были успешно удалены с вашего компьютера.
              </p>
            </div>
          )}

          {/* Bottom buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
            {step < 4 && step !== 5 && step !== 6 && (
              <button 
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0 || installing || uninstalling}
                className="mc-btn-primary"
                style={{
                  filter: (step === 0 || installing || uninstalling) ? 'grayscale(1) opacity(0.5)' : 'grayscale(1)',
                  padding: '10px 30px', fontSize: '14px', fontFamily: titleFont
                }}
              >Назад</button>
            )}
            
            {step < 2 && (
              <button 
                onClick={handleNext}
                disabled={(step === 1 && !licenseAccepted) || (step === 0 && isInstalled === null)}
                className="mc-btn-primary"
                style={{
                  filter: ((step === 1 && !licenseAccepted) || (step === 0 && isInstalled === null)) ? 'opacity(0.5)' : 'none',
                  padding: '10px 30px', fontSize: '14px', fontFamily: titleFont
                }}
              >{(step === 0 && isInstalled && installMode === 'uninstall') ? 'Удалить' : 'Продолжить'}</button>
            )}

            {step === 2 && (
              <button 
                onClick={handleInstall}
                className="mc-btn-primary"
                style={{
                  padding: '10px 30px', fontSize: '14px', fontFamily: titleFont
                }}
              >{installMode === 'update' ? 'Обновить' : 'Установить'}</button>
            )}

            {(step === 4 || step === 6) && (
              <button 
                onClick={step === 4 ? handleLaunch : handleCancel}
                className="mc-btn-primary"
                style={{
                  padding: '10px 30px', fontSize: '14px', fontFamily: titleFont
                }}
              >{step === 4 ? 'Завершить' : 'Закрыть'}</button>
            )}

            {step < 4 && step !== 5 && step !== 6 && (
              <button 
                onClick={handleCancel}
                disabled={installing || uninstalling}
                className="mc-btn-primary"
                style={{
                  filter: (installing || uninstalling) ? 'grayscale(1) opacity(0.5)' : 'grayscale(1)',
                  padding: '10px 30px', fontSize: '14px', fontFamily: titleFont
                }}
              >Отмена</button>
            )}
          </div>
        </div>
      </div>
      {/* Java Management Modal */}
      {showJavaModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(3px)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            width: '100%', maxWidth: '640px', backgroundColor: warmBg, border: '2px solid #111',
            boxShadow: '0 8px 30px rgba(0,0,0,0.9), inset 0 2px 0 rgba(255,255,255,0.1)',
            display: 'flex', flexDirection: 'column', maxHeight: '90vh'
          }}>
            {/* Modal Header */}
            <div style={{
              height: '38px', backgroundColor: '#1a1614', borderBottom: `1px solid ${warmBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px'
            }}>
              <div style={{ fontFamily: titleFont, fontSize: '14px', color: '#f1c40f', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ☕ Установка компонентов Java (Adoptium Temurin)
              </div>
              <button
                onClick={() => setShowJavaModal(false)}
                disabled={!!installingJava}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '16px', cursor: 'pointer', opacity: installingJava ? 0.3 : 1 }}
              >✕</button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ margin: 0, fontSize: '12px', lineHeight: '1.5', color: warmText }}>
                Minecraft требует разные версии Java в зависимости от версии игры. Вы можете установить их прямо сейчас, чтобы лаунчер запускал любые версии мгновенно без повторного докачивания.
              </p>

              {javaError && (
                <div style={{ padding: '8px 12px', backgroundColor: '#4a1515', border: '1px solid #e74c3c', color: '#ffb3b3', fontSize: '12px' }}>
                  {javaError}
                </div>
              )}

              {/* 3 Java Cards */}
              {[
                {
                  version: '8' as const,
                  title: 'Java 8 (JRE 8)',
                  desc: 'Для классических и старых версий (1.0 — 1.16.5, Alpha, Beta, Classic)',
                  badge: 'Версии <= 1.16.5'
                },
                {
                  version: '17' as const,
                  title: 'Java 17 (JRE 17)',
                  desc: 'Для версий Minecraft 1.17 — 1.20.4',
                  badge: 'Версии 1.17 — 1.20.4'
                },
                {
                  version: '21' as const,
                  title: 'Java 21 (JRE 21)',
                  desc: 'Для современных версий Minecraft (1.20.5 — 1.21+)',
                  badge: 'Версии 1.20.5+'
                }
              ].map(item => {
                const isInst = !!javaStatus[item.version]?.installed
                const isThisInstalling = installingJava === item.version
                const pct = isThisInstalling ? (javaProgress?.progress || 10) : 0

                return (
                  <div key={item.version} style={{
                    backgroundColor: warmPanel, border: `1px solid ${isInst ? '#27ae60' : warmBorder}`,
                    padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: titleFont, fontSize: '14px', color: '#fff' }}>{item.title}</span>
                          <span style={{ fontSize: '10px', background: '#333', color: '#aaa', padding: '2px 6px', borderRadius: '3px' }}>{item.badge}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#9c8e7e', marginTop: '3px' }}>{item.desc}</div>
                      </div>

                      <div>
                        {isInst ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2ecc71', fontSize: '12px', fontWeight: 'bold' }}>
                            <span>✓</span> Установлена
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={!!installingJava}
                            onClick={() => handleInstallJava(item.version)}
                            className="mc-btn-primary"
                            style={{
                              padding: '6px 14px', fontSize: '11px', whiteSpace: 'nowrap', cursor: 'pointer',
                              filter: installingJava ? 'opacity(0.5)' : 'none'
                            }}
                          >
                            {isThisInstalling ? 'Установка...' : 'Установить'}
                          </button>
                        )}
                      </div>
                    </div>

                    {isThisInstalling && (
                      <div style={{ marginTop: '4px' }}>
                        <div style={{ width: '100%', height: '14px', backgroundColor: '#111', border: '1px solid #333', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${pct}%`,
                            background: 'linear-gradient(to right, #f39c12, #f1c40f)',
                            transition: 'width 0.2s'
                          }}></div>
                        </div>
                        <div style={{ fontSize: '10px', color: '#f1c40f', marginTop: '4px', fontFamily: 'monospace' }}>
                          {javaProgress?.status || 'Загрузка...'}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px', backgroundColor: '#1a1614', borderTop: `1px solid ${warmBorder}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <button
                type="button"
                disabled={!!installingJava || Object.values(javaStatus).every(j => j.installed)}
                onClick={handleInstallAllRecommended}
                className="mc-btn-primary"
                style={{
                  padding: '8px 16px', fontSize: '12px', fontFamily: titleFont,
                  filter: (installingJava || Object.values(javaStatus).every(j => j.installed)) ? 'opacity(0.4)' : 'none'
                }}
              >
                Установить все (8, 17, 21)
              </button>

              <button
                type="button"
                disabled={!!installingJava}
                onClick={() => setShowJavaModal(false)}
                className="mc-btn-primary"
                style={{ padding: '8px 24px', fontSize: '12px', fontFamily: titleFont }}
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
