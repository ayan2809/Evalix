import { useState } from "react";
import { Link } from "react-router-dom";
import { api, asApiError, type StudioAnswer, type StudioQuestion, type StudioResult, type StudioSetup } from "../api";
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

type Step = "describe" | "answer";
const ELSE = "__else__";

export default function Studio() {
  useTitle("Agent Studio");
  const agents = useAsync(() => api.listAgents(), []);
  const [step, setStep] = useState<Step>("describe");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<StudioQuestion[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [own, setOwn] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "asking" | "making">("");
  const [error, setError] = useState("");
  const [made, setMade] = useState<StudioResult | null>(null);

  const mine = (agents.data ?? [])
    .filter((a) => a.source === "studio")
    .reverse();
  const empty = description.trim().length === 0;

  async function ask() {
    setBusy("asking");
    setError("");
    try {
      const res = await api.studio.questions(description.trim());
      setQuestions(res.questions);
      setPicked({});
      setOwn({});
      setStep("answer");
    } catch (e) {
      setError(asApiError(e).message);
    } finally {
      setBusy("");
    }
  }

  function answers(): StudioAnswer[] {
    return questions
      .map((q) => ({
        id: q.id,
        question: q.text,
        answer: (picked[q.id] === ELSE ? own[q.id] ?? "" : picked[q.id] ?? "").trim(),
      }))
      .filter((a) => a.answer);
  }

  async function make() {
    setBusy("making");
    setError("");
    try {
      const res = await api.studio.createAgent(description.trim(), answers());
      setMade(res);
      agents.reload();
    } catch (e) {
      setError(asApiError(e).message);
    } finally {
      setBusy("");
    }
  }

  function startOver() {
    setMade(null);
    setStep("describe");
    setDescription("");
    setQuestions([]);
    setPicked({});
    setOwn({});
    setError("");
  }

  return (
    <div className="wrap ds">
      <PageHeader title="What should your agent do?" />

      {!made && (
        <section className="ds-block" aria-label="Describe your agent">
          <SectionBar title={step === "describe" ? "Describe it" : "A few questions about it"} />
          <div className="ds-pad">
            {step === "describe" ? (
              <form
                className="ds-sheet studio-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!empty && !busy) void ask();
                }}
              >
                <label className="lbl-field">
                  <span className="ds-lbl">In one sentence</span>
                  <textarea
                    className="textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Find the current annual fee and foreign transaction fee of a travel credit card."
                    maxLength={500}
                    disabled={!!busy}
                  />
                </label>
                <div className="ds-actions">
                  <Button
                    type="submit"
                    variant="primary"
                    needsSignIn
                    disabled={!!busy}
                    disabledReason={empty ? "Write a sentence about what it should do." : undefined}
                  >
                    {busy === "asking" ? "Writing questions for it…" : "Next"}
                  </Button>
                </div>
                {error && <Notice tone="error">{error}</Notice>}
              </form>
            ) : (
              <form
                className="ds-sheet studio-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy) void make();
                }}
              >
                <div className="studio-said">
                  <p>{description.trim()}</p>
                  <button type="button" className="link-btn" onClick={() => setStep("describe")} disabled={!!busy}>
                    Change
                  </button>
                </div>
                <ol className="q-list">
                  {questions.map((q) => (
                    <li className="q-item" key={q.id}>
                      <fieldset disabled={!!busy}>
                        <legend>{q.text}</legend>
                        <div className="choices" role="radiogroup" aria-label={q.text}>
                          {[...q.choices, ELSE].map((c) => {
                            const on = picked[q.id] === c;
                            return (
                              <button
                                type="button"
                                role="radio"
                                aria-checked={on}
                                key={c}
                                className={`choice${on ? " on" : ""}`}
                                onClick={() => setPicked((p) => ({ ...p, [q.id]: c }))}
                              >
                                {c === ELSE ? "Something else" : c}
                              </button>
                            );
                          })}
                        </div>
                        {picked[q.id] === ELSE && (
                          <input
                            className="input"
                            aria-label={`Your answer: ${q.text}`}
                            value={own[q.id] ?? ""}
                            onChange={(e) => { const v = e.target.value; setOwn((o) => ({ ...o, [q.id]: v })) }}
                            maxLength={200}
                            autoFocus
                          />
                        )}
                      </fieldset>
                    </li>
                  ))}
                </ol>
                <div className="ds-actions">
                  <Button type="submit" variant="primary" needsSignIn disabled={!!busy}>
                    {busy === "making" ? "Making the agent…" : "Make the agent"}
                  </Button>
                  {answers().length < questions.length && !busy && (
                    <span className="tag">Skipped questions are left to the model.</span>
                  )}
                </div>
                {error && <Notice tone="error">{error}</Notice>}
              </form>
            )}
          </div>
        </section>
      )}

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
              <SectionBar title="Instructions it was given" actions={<Chevron />} />
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
          <EmptyState>None yet. Describe one above.</EmptyState>
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
