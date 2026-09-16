"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type {
  StudentQuestionPaper,
  LectureNotes,
  PaperGrade,
  TopicStats,
  FollowUpMaterial,
  HintResponse,
  FeynmanEvaluation,
  FeynmanSession,
} from "@/lib/schemas";
import { FeynmanTrajectoryChart, WeakTopicsBarChart } from "@/lib/charts";

interface StudentUnit {
  id: string;
  status: "draft" | "published";
  notes: LectureNotes;
  paper: StudentQuestionPaper;
  createdAt: string;
}

const STUDENT_ID_KEY = "classpilot.studentId";

export default function StudentPage() {
  const [studentId, setStudentId] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [units, setUnits] = useState<StudentUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grade, setGrade] = useState<PaperGrade | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [weakTopics, setWeakTopics] = useState<TopicStats[]>([]);
  const [followUpTopic, setFollowUpTopic] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<FollowUpMaterial | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});

  const [feynmanTopic, setFeynmanTopic] = useState("");
  const [feynmanExplanation, setFeynmanExplanation] = useState("");
  const [feynmanLoading, setFeynmanLoading] = useState(false);
  const [feynmanEvaluation, setFeynmanEvaluation] = useState<FeynmanEvaluation | null>(null);
  const [feynmanHistory, setFeynmanHistory] = useState<FeynmanSession[]>([]);

  const [practiceProblem, setPracticeProblem] = useState("");
  const [practiceAttempt, setPracticeAttempt] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [hintDone, setHintDone] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STUDENT_ID_KEY);
    if (saved) {
      void load(saved);
    }
  }, []);

  async function load(id: string) {
    if (!id.trim()) return;
    setError(null);
    try {
      setStudentId(id);
      localStorage.setItem(STUDENT_ID_KEY, id);
      const [unitsRes, weakRes] = await Promise.all([
        apiFetch<{ units: StudentUnit[] }>("/api/units?view=student"),
        apiFetch<{ topicStats: TopicStats[] }>(`/api/students/${encodeURIComponent(id)}/weak-topics`),
      ]);
      setUnits(unitsRes.units);
      setWeakTopics(weakRes.topicStats);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  const selectedUnit = units.find((u) => u.id === selectedUnitId) ?? null;

  function selectUnit(unit: StudentUnit) {
    setSelectedUnitId(unit.id);
    setAnswers({});
    setGrade(null);
    setFeynmanTopic("");
    setFeynmanExplanation("");
    setFeynmanEvaluation(null);
    setFeynmanHistory([]);
  }

  async function loadFeynmanHistory(topic: string) {
    if (!selectedUnit || !topic) return;
    try {
      const res = await apiFetch<{ sessions: FeynmanSession[] }>(
        `/api/units/${selectedUnit.id}/feynman?studentId=${encodeURIComponent(studentId)}&topic=${encodeURIComponent(topic)}`,
      );
      setFeynmanHistory(res.sessions);
      setFeynmanEvaluation(res.sessions.length > 0 ? res.sessions[res.sessions.length - 1].evaluation : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prior attempts");
    }
  }

  async function submitFeynman() {
    if (!selectedUnit || !feynmanTopic || !feynmanExplanation.trim()) return;
    setFeynmanLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ session: FeynmanSession; attemptHistory: FeynmanSession[] }>(
        `/api/units/${selectedUnit.id}/feynman`,
        {
          method: "POST",
          body: JSON.stringify({ studentId, topic: feynmanTopic, explanationText: feynmanExplanation }),
        },
      );
      setFeynmanEvaluation(res.session.evaluation);
      setFeynmanHistory(res.attemptHistory);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to evaluate explanation");
    } finally {
      setFeynmanLoading(false);
    }
  }

  async function submitPaper() {
    if (!selectedUnit) return;
    setSubmitting(true);
    setError(null);
    try {
      const answerList = selectedUnit.paper.questions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] ?? "",
      }));
      const res = await apiFetch<{ submission: { grade: PaperGrade } }>("/api/submissions", {
        method: "POST",
        body: JSON.stringify({ unitId: selectedUnit.id, studentId, answers: answerList }),
      });
      setGrade(res.submission.grade);
      const weakRes = await apiFetch<{ topicStats: TopicStats[] }>(
        `/api/students/${encodeURIComponent(studentId)}/weak-topics`,
      );
      setWeakTopics(weakRes.topicStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function getFollowUp(topic: string) {
    setFollowUpTopic(topic);
    setFollowUp(null);
    setFollowUpLoading(true);
    setRevealedAnswers({});
    setError(null);
    try {
      const res = await apiFetch<{ followUp: FollowUpMaterial }>(
        `/api/students/${encodeURIComponent(studentId)}/follow-up`,
        { method: "POST", body: JSON.stringify({ topic }) },
      );
      setFollowUp(res.followUp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get follow-up material");
    } finally {
      setFollowUpLoading(false);
    }
  }

  async function getHint() {
    setHintLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ hint: HintResponse }>("/api/hint", {
        method: "POST",
        body: JSON.stringify({
          problem: practiceProblem,
          studentAttempt: practiceAttempt || undefined,
          hintsGivenSoFar: hints,
        }),
      });
      setHints((h) => [...h, res.hint.hint]);
      setHintDone(res.hint.isFinalHint);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get hint");
    } finally {
      setHintLoading(false);
    }
  }

  return (
    <main className="page">
      <h1>Student</h1>

      {error && (
        <div className="error-box" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      <div className="card">
        <label htmlFor="studentId">Student ID</label>
        <div className="row">
          <input
            id="studentId"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="e.g. student-42"
          />
          <button className="primary" onClick={() => load(studentId)}>
            Load
          </button>
        </div>
      </div>

      {loaded && (
        <>
          <h2>Published units</h2>
          {units.length === 0 && <p className="muted">No published units yet.</p>}
          <div className="card">
            {units.map((u) => (
              <div
                key={u.id}
                className={`list-item${selectedUnitId === u.id ? " selected" : ""}`}
                onClick={() => selectUnit(u)}
              >
                {u.notes.title}
              </div>
            ))}
          </div>

          {selectedUnit && (
            <div className="card">
              <h3>{selectedUnit.notes.title}</h3>
              {selectedUnit.notes.sections.map((s, i) => (
                <div key={i}>
                  <strong>{s.heading}</strong>
                  <p>{s.content}</p>
                </div>
              ))}

              <h3>{selectedUnit.paper.title}</h3>
              <p className="muted">{selectedUnit.paper.instructions}</p>

              {selectedUnit.paper.questions.map((q) => (
                <div key={q.id} className="card">
                  <p>
                    <strong>{q.prompt}</strong>{" "}
                    <span className="badge">{q.topic}</span> <span className="muted">({q.points} pts)</span>
                  </p>
                  {q.type === "mcq" && q.options ? (
                    <div className="col">
                      {q.options.map((opt) => (
                        <label key={opt} style={{ fontWeight: "normal" }}>
                          <input
                            type="radio"
                            name={q.id}
                            checked={answers[q.id] === opt}
                            onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                          />{" "}
                          {opt}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    />
                  )}
                </div>
              ))}

              <button className="primary" disabled={submitting} onClick={submitPaper}>
                {submitting ? "Submitting..." : "Submit"}
              </button>

              {grade && (
                <div className="card">
                  <h3>
                    Result: {grade.totalScore} / {grade.maxScore}
                  </h3>
                  {grade.questionGrades.map((qg) => (
                    <p key={qg.questionId}>
                      <strong>
                        {qg.score}/{qg.maxScore}
                      </strong>{" "}
                      - {qg.feedback}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedUnit && (
            <>
              <h2>Feynman Mode — explain it back</h2>
              <div className="card">
                <p className="muted">
                  Teach a topic in your own words. The AI checks it against the unit&apos;s real
                  notes and questions - not multiple choice - and tells you what&apos;s still
                  unclear.
                </p>
                <label>Topic</label>
                <select
                  value={feynmanTopic}
                  onChange={(e) => {
                    setFeynmanTopic(e.target.value);
                    setFeynmanEvaluation(null);
                    setFeynmanHistory([]);
                    if (e.target.value) void loadFeynmanHistory(e.target.value);
                  }}
                >
                  <option value="">Select a topic...</option>
                  {Array.from(new Set(selectedUnit.paper.questions.map((q) => q.topic))).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                {feynmanTopic && (
                  <>
                    <label>Your explanation (attempt {feynmanHistory.length + 1})</label>
                    <textarea
                      value={feynmanExplanation}
                      onChange={(e) => setFeynmanExplanation(e.target.value)}
                      placeholder="Explain this topic as if you were teaching another student..."
                    />
                    <button
                      className="primary"
                      disabled={feynmanLoading || !feynmanExplanation.trim()}
                      onClick={submitFeynman}
                    >
                      {feynmanLoading ? "Evaluating..." : "Evaluate explanation"}
                    </button>
                  </>
                )}

                {feynmanEvaluation && (
                  <div className="card">
                    <h3>Clarity: {feynmanEvaluation.clarityPct.toFixed(0)}%</h3>
                    {feynmanEvaluation.understoodConstructs.length > 0 && (
                      <>
                        <p>
                          <strong>Understood:</strong>
                        </p>
                        {feynmanEvaluation.understoodConstructs.map((c, i) => (
                          <p key={i} className="muted">
                            ✓ {c}
                          </p>
                        ))}
                      </>
                    )}
                    {feynmanEvaluation.needsClarity.length > 0 && (
                      <>
                        <p>
                          <strong>Needs clarity:</strong>
                        </p>
                        {feynmanEvaluation.needsClarity.map((c, i) => (
                          <p key={i} className="muted">
                            ▲ {c}
                          </p>
                        ))}
                      </>
                    )}
                    {feynmanEvaluation.misconception && (
                      <div className="card">
                        <span className="badge weak">Misconception detected</span>
                        <p>{feynmanEvaluation.misconception.statement}</p>
                        <p className="muted">{feynmanEvaluation.misconception.deficiency}</p>
                      </div>
                    )}
                    <p>
                      <strong>Next prompt:</strong> {feynmanEvaluation.nextGuidedPrompt}
                    </p>
                  </div>
                )}

                {feynmanHistory.length > 0 && (
                  <div className="card">
                    <strong>Clarity trajectory</strong>
                    <FeynmanTrajectoryChart history={feynmanHistory} />
                    <table>
                      <thead>
                        <tr>
                          <th>Attempt</th>
                          <th>Clarity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feynmanHistory.map((s) => (
                          <tr key={s.id}>
                            <td>{s.attemptNumber}</td>
                            <td>{s.evaluation.clarityPct.toFixed(0)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          <h2>Your weak topics</h2>
          {weakTopics.length === 0 && (
            <p className="muted">No graded submissions yet - take a unit to see this.</p>
          )}
          {weakTopics.length > 0 && (
            <div className="card">
              <WeakTopicsBarChart topics={weakTopics} />
            </div>
          )}
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {weakTopics.map((t) => (
                  <tr key={t.topic}>
                    <td>{t.topic}</td>
                    <td>
                      <span className={`badge ${t.isWeak ? "weak" : "ok"}`}>
                        {t.avgScorePct.toFixed(0)}%
                      </span>
                    </td>
                    <td>
                      <button onClick={() => getFollowUp(t.topic)}>Get help</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {followUpTopic && (
            <div className="card">
              <h3>Follow-up: {followUpTopic}</h3>
              {followUpLoading && <p className="muted">Generating...</p>}
              {followUp && (
                <>
                  <p>{followUp.remedialNotes}</p>
                  {followUp.practiceQuestions.map((q) => (
                    <div key={q.id} className="card">
                      <p>{q.prompt}</p>
                      {revealedAnswers[q.id] ? (
                        <p className="muted">Answer: {q.answerKey}</p>
                      ) : (
                        <button
                          onClick={() => setRevealedAnswers((r) => ({ ...r, [q.id]: true }))}
                        >
                          Reveal answer
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          <h2>Practice with hints</h2>
          <div className="card">
            <label>Problem</label>
            <textarea
              value={practiceProblem}
              onChange={(e) => {
                setPracticeProblem(e.target.value);
                setHints([]);
                setHintDone(false);
              }}
              placeholder="Paste a practice problem here"
            />
            <label>Your attempt so far (optional)</label>
            <textarea value={practiceAttempt} onChange={(e) => setPracticeAttempt(e.target.value)} />
            <div className="row" style={{ marginTop: "0.5rem" }}>
              <button
                disabled={!practiceProblem.trim() || hintLoading || hintDone}
                onClick={getHint}
              >
                {hintLoading ? "Thinking..." : hints.length === 0 ? "Get a hint" : "Get another hint"}
              </button>
            </div>
            {hints.map((h, i) => (
              <p key={i}>
                <strong>Hint {i + 1}:</strong> {h}
              </p>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
