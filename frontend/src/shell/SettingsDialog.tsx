import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, asApiError, type KeyStatus, type Settings, type SettingsUpdate } from '../api'
import { useIsOwner } from '../auth'
import { Button, Chip, Icon, Mark, Modal, Notice, Switch, Tabs, type TabItem } from '../ui'
import { useShell, type SettingsTab } from './ShellContext'
import './settings.css'

const TABS: TabItem<SettingsTab>[] = [
  { id: 'models', label: 'Models' },
  { id: 'keys', label: 'API keys' },
  { id: 'gateway', label: 'Gateway' },
  { id: 'search', label: 'Search' },
  { id: 'send', label: 'Send results to' },
]

const ABOUT: Record<SettingsTab, string> = {
  models: 'Pick the model every agent uses, and the one that writes reviews. All calls go through Bifrost.',
  keys: 'Saved on this computer only. Never shown in full.',
  gateway: 'Bifrost sits between Evalix and the models.',
  search: 'How agents look things up when you start a run.',
  send: 'Share finished runs with Maxim.',
}

interface Draft {
  agent_model: string
  judge_model: string
  search_default: 'saved' | 'live'
  maxim_auto: boolean
}

function draftOf(s: Settings): Draft {
  return {
    agent_model: s.agent_model,
    judge_model: s.judge_model,
    search_default: s.search.default_mode,
    maxim_auto: s.send_to.maxim_auto,
  }
}

export default function SettingsDialog() {
  const { settings, settingsOpen, settingsTab, closeSettings, openSettings } = useShell()
  return (
    <Modal open={settingsOpen} onClose={closeSettings} label="Settings">
      {settings ? (
        <Body settings={settings} tab={settingsTab} setTab={openSettings} close={closeSettings} />
      ) : (
        <div className="modal-body">
          <p className="muted">Loading settings…</p>
          <div className="modal-foot">
            <span />
            <Button onClick={closeSettings}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Body({
  settings,
  tab,
  setTab,
  close,
}: {
  settings: Settings
  tab: SettingsTab
  setTab: (t: SettingsTab) => void
  close: () => void
}) {
  const { setSettings, refresh, toast } = useShell()
  const { isOwner: canEdit } = useIsOwner()
  // The draft starts from what is saved. It is kept while the person moves between tabs or saves a key.
  const [draft, setDraft] = useState<Draft>(() => draftOf(settings))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const saved = useMemo(() => draftOf(settings), [settings])
  const dirty = (Object.keys(saved) as (keyof Draft)[]).some((k) => saved[k] !== draft[k])

  async function save() {
    const body: SettingsUpdate = {}
    if (draft.agent_model !== saved.agent_model) body.agent_model = draft.agent_model
    if (draft.judge_model !== saved.judge_model) body.judge_model = draft.judge_model
    if (draft.search_default !== saved.search_default) body.search_default = draft.search_default
    if (draft.maxim_auto !== saved.maxim_auto) body.maxim_auto = draft.maxim_auto
    setSaving(true)
    setError('')
    try {
      setSettings(await api.settings.update(body))
      refresh()
      toast('Saved. Changes apply to the next run.')
      close()
    } catch (e) {
      setError(asApiError(e).message)
    } finally {
      setSaving(false)
    }
  }

  const shared: DraftProps = { settings, draft, setDraft, goKeys: () => setTab('keys'), locked: !canEdit }

  return (
    <div className="modal-split">
      <nav className="modal-nav" aria-label="Settings sections">
        <div className="modal-title">Settings</div>
        <Tabs items={TABS} value={tab} onChange={setTab} variant="side" label="Settings sections" />
      </nav>

      <div className="modal-body" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <div className="set-head">
          <div className="stack" style={{ gap: 4 }}>
            <h2>{TABS.find((t) => t.id === tab)?.label}</h2>
            <span className="tag">{ABOUT[tab]}</span>
          </div>
          <Button small aria-label="Close settings" onClick={close}>
            <Icon name="close" size={14} />
          </Button>
        </div>

        {!canEdit && <Notice>You're looking around, so this is read-only. Sign in to change it.</Notice>}
        {settings.pending_restart && <Notice tone="warn">Restart Bifrost to use the new key.</Notice>}

        {tab === 'models' && <ModelsTab {...shared} />}
        {tab === 'keys' && <KeysTab settings={settings} locked={!canEdit} />}
        {tab === 'gateway' && <GatewayTab settings={settings} close={close} />}
        {tab === 'search' && <SearchTab {...shared} />}
        {tab === 'send' && <SendTab {...shared} />}

        {error && <Notice tone="error">{error}</Notice>}
        <div className="modal-foot">
          <span className="tag">
            Changes apply to the next run, not one already going.{' '}
            {dirty && (
              <Chip sm dashed>
                Pending
              </Chip>
            )}
          </span>
          <div className="row">
            {canEdit ? (
              <>
                <Button onClick={close}>Cancel</Button>
                <Button
                  variant="primary"
                  onClick={save}
                  disabled={saving}
                  disabledReason={dirty ? undefined : 'Nothing to save yet'}
                >
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </>
            ) : (
              <Button onClick={close}>Close</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface DraftProps {
  settings: Settings
  draft: Draft
  setDraft: (d: Draft) => void
  goKeys: () => void
  locked: boolean
}

interface Choice {
  id: string
  title: string
  about: string
  ready: boolean
  /** What to say in the Ready column when it isn't. */
  needs: string
}

/**
 * An ordering-information table: pick one row with its radio button. Rows that aren't ready (no key yet)
 * can't be picked and say what is missing. Native radio buttons, so the arrow keys work.
 */
function ChoiceTable({
  name,
  label,
  firstHead,
  choices,
  value,
  onPick,
  goKeys,
  locked,
}: {
  name: string
  label: string
  firstHead: string
  choices: Choice[]
  value: string
  onPick: (id: string) => void
  goKeys: () => void
  locked: boolean
}) {
  return (
    <div className="scroll-x" role="radiogroup" aria-label={label}>
      <table className="tbl set-tbl">
        <thead>
          <tr>
            <th className="set-pick">
              <span className="sr-only">Selected</span>
            </th>
            <th>{firstHead}</th>
            <th>About</th>
            <th>Ready</th>
          </tr>
        </thead>
        <tbody>
          {choices.map((c) => {
            const blocked = !c.ready || locked
            const on = c.id === value
            const id = `${name}-${c.id}`
            return (
              <tr
                key={c.id}
                className={`${on ? 'on' : ''}${c.ready ? '' : ' off'}`}
                onClick={() => !blocked && onPick(c.id)}
              >
                <td className="set-pick">
                  <input
                    type="radio"
                    name={name}
                    id={id}
                    checked={on}
                    disabled={blocked}
                    onChange={() => onPick(c.id)}
                  />
                </td>
                <td>
                  <label htmlFor={id} className="set-name">
                    {c.title}
                  </label>
                </td>
                <td className="set-about">{c.about}</td>
                <td className="set-ready">
                  {c.ready ? (
                    <span className="set-state">
                      <Mark state="through" size={12} label="" />
                      Ready
                    </span>
                  ) : (
                    <span className="set-state">
                      <Mark state="setup" size={12} label="" />
                      {c.needs}
                      <button
                        type="button"
                        className="link-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          goKeys()
                        }}
                      >
                        Add a key
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Models ----------

function ModelPick({
  name,
  title,
  value,
  onPick,
  settings,
  goKeys,
  locked,
}: {
  name: string
  title: string
  value: string
  onPick: (id: string) => void
  settings: Settings
  goKeys: () => void
  locked: boolean
}) {
  return (
    <section className="stack" style={{ gap: 8 }}>
      <div className="set-sub">
        <h3>{title}</h3>
      </div>
      <ChoiceTable
        name={name}
        label={title}
        firstHead="Model"
        value={value}
        onPick={onPick}
        goKeys={goKeys}
        locked={locked}
        choices={settings.models.map((m) => ({
          id: m.id,
          title: m.label,
          about: m.about,
          ready: m.ready,
          needs: `Needs a ${settings.keys.find((k) => k.provider === m.provider)?.label ?? m.provider} key`,
        }))}
      />
    </section>
  )
}

function ModelsTab({ settings, draft, setDraft, goKeys, locked }: DraftProps) {
  return (
    <>
      <ModelPick
        name="agent-model"
        title="The model agents use"
        value={draft.agent_model}
        onPick={(id) => setDraft({ ...draft, agent_model: id })}
        settings={settings}
        goKeys={goKeys}
        locked={locked}
      />
      <ModelPick
        name="judge-model"
        title="The model that writes reviews"
        value={draft.judge_model}
        onPick={(id) => setDraft({ ...draft, judge_model: id })}
        settings={settings}
        goKeys={goKeys}
        locked={locked}
      />
    </>
  )
}

// ---------- API keys ----------

function KeysTab({ settings, locked }: { settings: Settings; locked: boolean }) {
  return (
    <div className="scroll-x">
      <table className="tbl set-tbl set-keys">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Used for</th>
            <th>Key</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        {settings.keys.map((k) => (
          <KeyRow key={k.provider} k={k} locked={locked} />
        ))}
      </table>
    </div>
  )
}

function KeyRow({ k, locked }: { k: KeyStatus; locked: boolean }) {
  const { setSettings } = useShell()
  const [replacing, setReplacing] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [test, setTest] = useState<{ ok: boolean; note: string } | null>(null)
  const [error, setError] = useState('')
  const optional = k.provider === 'openai' || k.provider === 'anthropic'
  const entering = !k.set || replacing

  // A different key means an old test result no longer applies.
  useEffect(() => setTest(null), [k.masked])

  async function save() {
    if (!value.trim()) return
    setBusy('save')
    setError('')
    try {
      await api.settings.setKey(k.provider, value.trim())
      setValue('')
      setReplacing(false)
      setSettings(await api.settings.get())
    } catch (e) {
      setError(asApiError(e).message)
    } finally {
      setBusy(null)
    }
  }

  async function runTest() {
    setBusy('test')
    setError('')
    try {
      setTest(await api.settings.testKey(k.provider))
    } catch (e) {
      setTest({ ok: false, note: asApiError(e).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <tbody>
      <tr>
        <th scope="row" className="set-provider">
          {k.label}
        </th>
        <td className="set-about">{optional ? `Optional. ${k.used_for}` : k.used_for}</td>
        <td className="set-key">
          {entering ? (
            <input
              className="input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={k.set ? 'Paste the new key' : 'Paste a key'}
              aria-label={`${k.label} key`}
              value={value}
              disabled={locked}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          ) : (
            <span className="mask">{k.masked ?? '••••••••'}</span>
          )}
        </td>
        <td className="set-status">
          {k.set ? (
            <Chip sm tone={test ? (test.ok ? 'pass' : 'fail') : 'pass'}>
              {test ? (test.ok ? 'Working' : 'Not working') : 'Added'}
            </Chip>
          ) : (
            <Chip sm>Not added</Chip>
          )}
        </td>
        <td className="set-actions">
          {entering ? (
            <>
              <Button small variant="primary" ownerOnly disabled={busy !== null || !value.trim()} onClick={save}>
                {busy === 'save' ? 'Saving…' : 'Save'}
              </Button>
              {replacing && (
                <Button
                  small
                  onClick={() => {
                    setReplacing(false)
                    setValue('')
                    setError('')
                  }}
                >
                  Cancel
                </Button>
              )}
            </>
          ) : (
            <>
              <Button small ownerOnly disabled={busy !== null} onClick={runTest}>
                {busy === 'test' ? 'Testing…' : 'Test'}
              </Button>
              <Button small ownerOnly disabled={busy !== null} onClick={() => setReplacing(true)}>
                Replace
              </Button>
            </>
          )}
        </td>
      </tr>
      {(test || error) && (
        <tr className="set-note">
          <td colSpan={5}>
            <Notice tone={error || !test?.ok ? 'error' : 'pass'}>{error || test?.note}</Notice>
          </td>
        </tr>
      )}
    </tbody>
  )
}

// ---------- Gateway ----------

function GatewayTab({ settings, close }: { settings: Settings; close: () => void }) {
  const g = settings.gateway
  const up = g.bifrost_up
  return (
    <section className="stack" style={{ gap: 14 }}>
      <div className="scroll-x">
        <table className="tbl set-tbl">
          <thead>
            <tr>
              <th>Setting</th>
              <th>About</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="set-provider">
                Bifrost
              </th>
              <td className="set-about">{g.bifrost_url}</td>
              <td>
                <Chip sm tone={up === null ? 'neutral' : up ? 'pass' : 'fail'}>
                  {up === null ? 'Not used in test mode' : up ? 'Running' : "Isn't answering"}
                </Chip>
              </td>
            </tr>
            <tr>
              <th scope="row" className="set-provider">
                Backup model
              </th>
              <td className="set-about">Used when the main model is down</td>
              <td>
                <span className="mask">{g.fallback_model}</span>
              </td>
            </tr>
            <tr>
              <th scope="row" className="set-provider">
                Tries when a model is busy
              </th>
              <td className="set-about">Bifrost waits a little longer between each try</td>
              <td>
                <span className="mask">Up to {g.max_retries}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="tag" style={{ margin: 0 }}>
        These live in Bifrost's own settings. To see them work,{' '}
        <Link to="/gateway" onClick={close}>
          run the gateway test
        </Link>
        .
      </p>
    </section>
  )
}

// ---------- Search ----------

function SearchTab({ settings, draft, setDraft, goKeys, locked }: DraftProps) {
  const ready = settings.search.tavily_ready
  return (
    <section className="stack" style={{ gap: 8 }}>
      <div className="set-sub">
        <h3>When you start a run, search with</h3>
        <span className="tag">You can still change it for each run</span>
      </div>
      <ChoiceTable
        name="search-default"
        label="Default search"
        firstHead="Search"
        value={draft.search_default}
        onPick={(id) => setDraft({ ...draft, search_default: id as Draft['search_default'] })}
        goKeys={goKeys}
        locked={locked}
        choices={[
          {
            id: 'saved',
            title: 'Saved results',
            about: 'The same pages every time, so runs are fair and cost nothing.',
            ready: true,
            needs: '',
          },
          {
            id: 'live',
            title: 'Live web search',
            about: 'Real results from Tavily. Uses your search credits.',
            ready,
            needs: 'Needs a Tavily key',
          },
        ]}
      />
    </section>
  )
}

// ---------- Send results to ----------

function SendTab({ settings, draft, setDraft, goKeys, locked }: DraftProps) {
  const ready = settings.send_to.maxim_ready
  return (
    <div className="scroll-x">
      <table className="tbl set-tbl">
        <thead>
          <tr>
            <th>Destination</th>
            <th>About</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className="set-provider">
              Maxim
            </th>
            <td className="set-about">See every run as a trace in Maxim</td>
            <td className="set-state">
              {ready ? (
                <Chip sm tone="pass">
                  Ready
                </Chip>
              ) : (
                <>
                  <Chip sm>Needs a key</Chip>
                  <button type="button" className="link-btn" onClick={goKeys}>
                    Add a key
                  </button>
                </>
              )}
            </td>
          </tr>
          <tr>
            <th scope="row" className="set-provider">
              Send every finished run automatically
            </th>
            <td className="set-about">Or send one at a time with "Send to Maxim" on the Results page</td>
            <td>
              <Switch
                checked={draft.maxim_auto}
                onChange={(v) => setDraft({ ...draft, maxim_auto: v })}
                label="Send every finished run to Maxim"
                disabled={!ready || locked}
                title={!ready ? 'Add a Maxim key first' : undefined}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
