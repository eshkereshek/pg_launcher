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
      userSelect: 'none'
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
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: '0 0 15px 0', fontSize: '28px', fontFamily: titleFont, letterSpacing: '1px', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>Добро пожаловать!</h1>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: warmText }}>
                Этот Мастер поможет вам выполнить установку<br/>
                Pagrysha Launcher на ваш компьютер.
              </p>
              <p style={{ fontSize: '14px', lineHeight: '1.5', color: warmText, marginTop: '20px' }}>
                Для продолжения установки, нажмите "Продолжить".
              </p>
            </div>
          )}

          {step === 0 && isInstalled === true && (
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: '0 0 15px 0', fontSize: '24px', fontFamily: titleFont, letterSpacing: '1px', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>Лаунчер уже установлен</h1>
              <p style={{ fontSize: '13px', lineHeight: '1.5', color: warmText, marginBottom: '20px' }}>
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
                  <span style={{ fontSize: '11px', color: '#9c8e7e' }}>Полностью удалить старую версию и установить новую.</span>
                </button>
                <button 
                  onClick={() => setInstallMode('uninstall')} 
                  style={{ padding: '10px', background: installMode === 'uninstall' ? '#111' : warmPanel, border: `2px solid ${installMode === 'uninstall' ? '#e74c3c' : '#111'}`, color: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'monospace' }}
                >
                  <strong style={{ color: installMode === 'uninstall' ? '#e74c3c' : '#fff' }}>Удалить лаунчер</strong><br/>
                  <span style={{ fontSize: '11px', color: '#9c8e7e' }}>Полностью удалить лаунчер с вашего компьютера.</span>
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
                Программное обеспечение предоставляется на условиях «как есть», что означает отсутствие гарантий бесперебойной работы, отсутствия ошибок или полной совместимости с любыми пользовательскими модификациями. Разработчик не несет ответственности за любые прямые или косвенные убытки, включая потерю игровых данных, миров, прогресса, повреждение файлов конфигурации или операционной системы, возникшие в результате использования лаунчера. Использование лаунчера для подключения к сторонним серверам осуществляется исключительно на страх и риск Пользователя, при этом Разработчик не несет ответственности за действия администраторов таких серверов или их содержимое.
                <br/><br/>
                Лаунчер может собирать исключительно техническую информацию, необходимую для корректной работы приложения и устранения программных сбоев. Настоящее Соглашение действует до момента удаления вами программного обеспечения с вашего устройства, а Разработчик оставляет за собой право в одностороннем порядке вносить изменения в текст условий, при этом продолжение использования лаунчера после внесения таких изменений подтверждает ваше согласие с новой редакцией Соглашения.
                <br/><br/>
                Если вы не согласны с любым из положений настоящего текста, вы обязаны немедленно прекратить использование программы и удалить её со своего устройства.
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
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: '0 0 10px 0', fontSize: '24px', fontFamily: titleFont, letterSpacing: '1px', textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>Выбор папки установки</h1>
              <p style={{ fontSize: '13px', color: warmText, marginBottom: '20px' }}>Программа будет установлена в следующую папку.</p>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  value={installPath}
                  onChange={e => setInstallPath(e.target.value)}
                  style={{ flex: 1, padding: '8px', backgroundColor: warmPanel, border: `2px solid #111`, color: '#fff', outline: 'none', fontFamily: 'monospace' }}
                />
              </div>
              <p style={{ fontSize: '12px', color: '#9c8e7e', marginTop: '10px' }}>Требуется свободного места: ~150 МБ</p>
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
                Pagrysha Launcher был успешно удален с вашего компьютера.
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
    </div>
  )
}
