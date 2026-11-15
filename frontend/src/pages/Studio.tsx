import { useState } from "react";
import { Link } from "react-router-dom";
import { api, asApiError, type StudioResult, type StudioSetup } from "../api";
import { useAsync, useTitle } from "../hooks";
import {
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  Loading,
  Notice,
  PageHeader,
  SectionBar,
  Segmented,
  TitleBlock,
} from "../ui";
import { OnlineStatus } from "./agents/OnlineStatus";
import "./sheet.css";
import "./studio/studio.css";

/** The setup in plain words, one line each. */
export function setupTraits(
  s: StudioSetup,
): { title: string; about: string }[] {
  return [
    s.double_check
      ? {
          title: "Checks every fact twice",
          about: "Looks for each value in two results before it answers.",
        }
      : {
          title: "Takes the first answer it finds",
          about: "Does not look for a second source.",
        },
    s.retries > 0
      ? {
          title:
            s.retries === 1
              ? "Tries again once"
              : `Tries again up to ${s.retries} times`,
          about: "If a search or the model fails, it waits and tries again.",
        }
      : {
          title: "Does not try again",
          about: "If a search or the model fails, it gives up straight away.",
        },
    s.stop_when_unsure
      ? {
          title: "Owns up when unsure",
          about: "Stops and says why, rather than making something up.",
        }
      : { title: "Always gives an answer", about: "Even when it is not sure." },
  ];
}

export default function Studio() {
  useTitle("Make an agent");
  const questions = useAsync(() => api.studio.questions(), []);
  const agents = useAsync(() => api.listAgents(), []);
  const [description, setDescription] = useState("");
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<StudioResult | null>(null);

  const asked = questions.data ?? [];
  const answerFor = (id: string) => answers[id] ?? true;
  const mine = (agents.data ?? [])
    .filter((a) => a.source === "studio")
    .reverse();

  async function make() {
    setBusy(true);
    setError("");
    try {
      const body: Record<string, boolean> = {};
      for (const q of asked) body[q.id] = answerFor(q.id);
      const res = await api.studio.createAgent(description.trim(), body);
      setMade(res);
      agents.reload();
    } catch (e) {
      setError(asApiError(e).message);
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setMade(null);
    setDescription("");
    setAnswers({});
    setError("");
  }

  const empty = description.trim().length === 0;

  return (
    <div className="wrap ds">
      <PageHeader
        title="What kind of agent do you want to test?"
        answer="Describe it in one sentence. We'll build it and put it to the test."
        facts="One sentence and three quick questions, no code. It gets the same questions and problems as every other agent."
      />

      <section className="ds-block" aria-label="Describe it">
        <SectionBar
          title="Describe your agent"
          hint="One sentence and three yes or no questions"
        />
        <div className="ds-pad">
          <form
            className="ds-sheet studio-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!empty && !busy) void make();
            }}
          >
            <label className="lbl-field">
              <span className="ds-lbl">What should it do?</span>
              <textarea
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A cautious researcher that checks cloud and banking facts against official sources."
                maxLength={600}
                disabled={busy}
              />
            </label>

            <div className="stack" style={{ gap: 4 }}>
              <span className="ds-lbl">A few quick questions</span>
              {questions.error ? (
                <ErrorState
                  error={questions.error}
                  onRetry={questions.reload}
                />
              ) : !questions.data ? (
                <Loading />
              ) : (
                <div className="q-list">
                  {asked.map((q) => (
                    <div className="q-row" key={q.id}>
                      <span>{q.text}</span>
                      <Segmented
                        label={q.text}
                        value={answerFor(q.id)}
                        onChange={(v) => setAnswers({ ...answers, [q.id]: v })}
                        disabled={busy}
                        options={[
                          { value: true, label: "Yes" },
                          { value: false, label: "No" },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ds-actions">
              <Button
                type="submit"
                variant="primary"
                ownerOnly
                disabled={busy || !questions.data}
                disabledReason={
                  empty
                    ? "Write a sentence about what it should do."
                    : undefined
                }
              >
                {busy ? "Making the agent…" : "Make the agent"}
              </Button>
              {busy && (
                <span className="tag">
                  The model is writing its instructions. This takes a few
                  seconds.
                </span>
              )}
            </div>
            {error && <Notice tone="error">{error}</Notice>}
          </form>
        </div>
      </section>

      {made && (
        <section className="ds-block" aria-label="Your new agent">
          <div className="studio-made">
            <TitleBlock
              label="Your new agent"
              cells={[
                {
                  label: "Name",
                  value: (
                    <>
                      {made.setup.name}
                      <small>
                        {made.agent.online
                          ? "Ready to test"
                          : "Not answering yet"}
                      </small>
                    </>
                  ),
                  wide: true,
                },
                {
                  label: "Made from",
                  value: (
                    <span className="studio-from">
                      {made.agent.description}
                    </span>
                  ),
                  wide: true,
                },
                {
                  label: "Retries",
                  value: made.setup.retries > 0 ? made.setup.retries : "None",
                },
                {
                  label: "Double-checks",
                  value: made.setup.double_check ? "Yes" : "No",
                },
                {
                  label: "Stops when unsure",
                  value: made.setup.stop_when_unsure ? "Yes" : "No",
                },
              ]}
              action={
                <>
                  <LinkButton to="/run" variant="primary">
                    Use it in a run
                  </LinkButton>
                  <Button onClick={startOver}>Make another</Button>
                </>
              }
            />
          </div>
          <div className="ds-pad" />
          <SectionBar title="How it behaves" />
          <div className="ds-scroll">
            <table className="ds-table" aria-label="How it behaves">
              <tbody>
                {setupTraits(made.setup).map((t) => (
                  <tr key={t.title}>
                    <th scope="row" className="studio-trait">
                      {t.title}
                    </th>
                    <td className="graph">{t.about}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ds-pad" />
          <details className="ds-bar-more">
            <summary>
              <SectionBar
                title="Instructions"
                hint="See the instructions we wrote for it"
                actions={<Chevron />}
              />
            </summary>
            <p className="ds-body">{made.setup.instructions}</p>
          </details>
        </section>
      )}

      <section className="ds-block" aria-label="Agents you've made">
        <SectionBar title="Agents you've made" />
        {agents.error ? (
          <ErrorState error={agents.error} onRetry={agents.reload} />
        ) : !agents.data ? (
          <Loading />
        ) : mine.length === 0 ? (
          <EmptyState>
            No agents made here yet. Describe one above and it will show up
            here.
          </EmptyState>
        ) : (
          <div className="ds-scroll">
            <table className="ds-table" aria-label="Agents you've made">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Status</th>
                  <th className="narrow">
                    <span className="sr-only">Use it</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {mine.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="plate">
                        <b>{a.name}</b>
                        <small>{a.description || a.tag}</small>
                      </span>
                    </td>
                    <td>
                      <OnlineStatus online={a.online} />
                    </td>
                    <td className="narrow">
                      <Link to="/run">Use it in a run</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Chevron() {
  return (
    <svg className="ds-chev" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 4.5 L6 8.5 L10 4.5" />
    </svg>
  );
}
