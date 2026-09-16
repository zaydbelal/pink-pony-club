"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type {
  Unit,
  LectureNotes,
  QuestionPaper,
  TopicStats,
  Report,
  SyllabusInput,
  CohortMember,
  Assignment,
} from "@/lib/schemas";
import { WeakTopicsBarChart } from "@/lib/charts";

const TEACHER_ID_KEY = "classpilot.teacherId";

export default function TeacherPage() {
  const [teacherId, setTeacherId] = useState("demo-teacher");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<LectureNotes | null>(null);
  const [paperDraft, setPaperDraft] = useState<QuestionPaper | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState("");
  const [unitTitle, setUnitTitle] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [syllabusText, setSyllabusText] = useState("");
  const [numQuestions, setNumQuestions] = useState(6);

  const [docTitle, setDocTitle] = useState("");
  const [docText, setDocText] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [unitWeakTopics, setUnitWeakTopics] = useState<TopicStats[]>([]);

  const [remediationTopic, setRemediationTopic] = useState("");
  const [cohort, setCohort] = useState<CohortMember[]>([]);
  const [cohortLoading, setCohortLoading] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Record<string, boolean>>({});
  const [generatingRemediation, setGeneratingRemediation] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [recipientEmail, setRecipientEmail] = useState("teacher@example.com");
  const [sinceDays, setSinceDays] = useState(7);
  const [reports, setReports] = useState<Report[]>([]);
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(TEACHER_ID_KEY);
    if (saved) void load(saved);
  }, []);

  async function load(id: string) {
    if (!id.trim()) return;
    setError(null);
    try {
      setTeacherId(id);
      localStorage.setItem(TEACHER_ID_KEY, id);
      const [unitsRes, reportsRes] = await Promise.all([
        apiFetch<{ units: Unit[] }>(`/api/units?teacherId=${encodeURIComponent(id)}`),
        apiFetch<{ reports: Report[] }>(`/api/reports?teacherId=${encodeURIComponent(id)}`),
      ]);
      setUnits(unitsRes.units);
      setReports(reportsRes.reports);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  function selectUnit(unit: Unit) {
    setSelectedUnitId(unit.id);
    setNotesDraft(unit.notes);
    setPaperDraft(unit.paper);
    setRemediationTopic("");
    setCohort([]);
    setSelectedStudentIds({});
    void refreshUnitWeakTopics(unit.id);
    void refreshAssignments(unit.id);
  }

  async function refreshUnitWeakTopics(unitId: string) {
    try {
      const res = await apiFetch<{ topicStats: TopicStats[] }>(`/api/units/${unitId}/weak-topics`);
      setUnitWeakTopics(res.topicStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load weak topics");
    }
  }

  async function refreshAssignments(unitId: string) {
    try {
      const res = await apiFetch<{ assignments: Assignment[] }>(`/api/units/${unitId}/remediation`);
      setAssignments(res.assignments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load assignments");
    }
  }

  async function loadCohort(topic: string) {
    if (!selectedUnitId) return;
    setRemediationTopic(topic);
    setCohortLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ cohort: CohortMember[] }>(
        `/api/units/${selectedUnitId}/cohort?topic=${encodeURIComponent(topic)}`,
      );
      setCohort(res.cohort);
      setSelectedStudentIds(Object.fromEntries(res.cohort.map((c) => [c.studentId, true])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cohort");
    } finally {
      setCohortLoading(false);
    }
  }

  async function dispatchRemediation() {
    if (!selectedUnitId || !remediationTopic) return;
    const studentIds = Object.entries(selectedStudentIds)
      .filter(([, checked]) => checked)
      .map(([id]) => id);
    if (studentIds.length === 0) return;

    setGeneratingRemediation(true);
    setError(null);
    try {
      const res = await apiFetch<{ assignment: Assignment }>(`/api/units/${selectedUnitId}/remediation`, {
        method: "POST",
        body: JSON.stringify({ topic: remediationTopic, studentIds }),
      });
      setAssignments((a) => [res.assignment, ...a]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate remediation plan");
    } finally {
      setGeneratingRemediation(false);
    }
  }

  async function createUnit() {
    setCreating(true);
    setError(null);
    try {
      const syllabus: SyllabusInput = {
        subject,
        unitTitle,
        gradeLevel: gradeLevel || undefined,
        syllabusText,
      };
      const res = await apiFetch<{ unit: Unit }>("/api/units", {
        method: "POST",
        body: JSON.stringify({ teacherId, syllabus, numQuestions }),
      });
      setUnits((u) => [res.unit, ...u]);
      selectUnit(res.unit);
      setSubject("");
      setUnitTitle("");
      setGradeLevel("");
      setSyllabusText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create unit");
    } finally {
      setCreating(false);
    }
  }

  async function saveEdits() {
    if (!selectedUnitId || !notesDraft || !paperDraft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ unit: Unit }>(`/api/units/${selectedUnitId}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notesDraft, paper: paperDraft }),
      });
      setUnits((list) => list.map((u) => (u.id === res.unit.id ? res.unit : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!selectedUnitId) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await apiFetch<{ unit: Unit }>(`/api/units/${selectedUnitId}/publish`, {
        method: "POST",
      });
      setUnits((list) => list.map((u) => (u.id === res.unit.id ? res.unit : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  async function addDocument() {
    if (!selectedUnitId) return;
    setAddingDoc(true);
    setError(null);
    try {
      await apiFetch(`/api/units/${selectedUnitId}/documents`, {
        method: "POST",
        body: JSON.stringify({ title: docTitle, sourceText: docText }),
      });
      setDocTitle("");
      setDocText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add document");
    } finally {
      setAddingDoc(false);
    }
  }

  async function regenerate() {
    if (!selectedUnitId) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await apiFetch<{ unit: Unit }>(`/api/units/${selectedUnitId}/regenerate`, {
        method: "POST",
      });
      setUnits((list) => list.map((u) => (u.id === res.unit.id ? res.unit : u)));
      setNotesDraft(res.unit.notes);
      setPaperDraft(res.unit.paper);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to regenerate");
    } finally {
      setRegenerating(false);
    }
  }

  async function generateReport() {
    setGeneratingReport(true);
    setError(null);
    try {
      const res = await apiFetch<{ report: Report }>("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({ teacherId, recipientEmail, sinceDays }),
      });
      setReports((r) => [res.report, ...r]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  }

  function updateSection(i: number, field: "heading" | "content", value: string) {
    setNotesDraft((n) => {
      if (!n) return n;
      const sections = n.sections.map((s, idx) => (idx === i ? { ...s, [field]: value } : s));
      return { ...n, sections };
    });
  }

  function updateQuestion(
    qId: string,
    field: "prompt" | "topic" | "answerKey" | "rubric" | "points",
    value: string | number,
  ) {
    setPaperDraft((p) => {
      if (!p) return p;
      const questions = p.questions.map((q) => (q.id === qId ? { ...q, [field]: value } : q));
      return { ...p, questions };
    });
  }

  return (
    <main className="page">
      <h1>Teacher / Admin</h1>

      {error && (
        <div className="error-box" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      <div className="card">
        <label htmlFor="teacherId">Teacher ID</label>
        <div className="row">
          <input id="teacherId" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} />
          <button className="primary" onClick={() => load(teacherId)}>
            Load
          </button>
        </div>
      </div>

      {loaded && (
        <>
          <h2>Create a unit</h2>
          <div className="card col">
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
            <label>Unit title</label>
            <input value={unitTitle} onChange={(e) => setUnitTitle(e.target.value)} />
            <label>Grade level (optional)</label>
            <input value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} />
            <label>Syllabus text</label>
            <textarea value={syllabusText} onChange={(e) => setSyllabusText(e.target.value)} />
            <label>Number of questions</label>
            <input
              type="number"
              min={1}
              max={30}
              value={numQuestions}
              onChange={(e) => setNumQuestions(Number(e.target.value))}
              style={{ maxWidth: "6rem" }}
            />
            <button
              className="primary"
              disabled={creating || !subject || !unitTitle || !syllabusText}
              onClick={createUnit}
            >
              {creating ? "Generating..." : "Generate unit"}
            </button>
          </div>

          <h2>Units</h2>
          <div className="card">
            {units.length === 0 && <p className="muted">No units yet.</p>}
            {units.map((u) => (
              <div
                key={u.id}
                className={`list-item${selectedUnitId === u.id ? " selected" : ""}`}
                onClick={() => selectUnit(u)}
              >
                {u.notes.title} <span className={`badge ${u.status}`}>{u.status}</span>
              </div>
            ))}
          </div>

          {selectedUnitId && notesDraft && paperDraft && (
            <>
              <h2>Edit unit</h2>
              <div className="card">
                <h3>Lecture notes</h3>
                <label>Title</label>
                <input
                  value={notesDraft.title}
                  onChange={(e) => setNotesDraft({ ...notesDraft, title: e.target.value })}
                />
                {notesDraft.sections.map((s, i) => (
                  <div key={i} className="card">
                    <label>Heading</label>
                    <input value={s.heading} onChange={(e) => updateSection(i, "heading", e.target.value)} />
                    <label>Content</label>
                    <textarea value={s.content} onChange={(e) => updateSection(i, "content", e.target.value)} />
                  </div>
                ))}

                <h3>Question paper</h3>
                <label>Title</label>
                <input
                  value={paperDraft.title}
                  onChange={(e) => setPaperDraft({ ...paperDraft, title: e.target.value })}
                />
                {paperDraft.questions.map((q) => (
                  <div key={q.id} className="card">
                    <label>Prompt</label>
                    <textarea value={q.prompt} onChange={(e) => updateQuestion(q.id, "prompt", e.target.value)} />
                    <div className="row">
                      <div>
                        <label>Topic</label>
                        <input value={q.topic} onChange={(e) => updateQuestion(q.id, "topic", e.target.value)} />
                      </div>
                      <div>
                        <label>Points</label>
                        <input
                          type="number"
                          value={q.points}
                          onChange={(e) => updateQuestion(q.id, "points", Number(e.target.value))}
                          style={{ maxWidth: "5rem" }}
                        />
                      </div>
                    </div>
                    <label>Answer key</label>
                    <textarea value={q.answerKey} onChange={(e) => updateQuestion(q.id, "answerKey", e.target.value)} />
                    <label>Rubric</label>
                    <textarea value={q.rubric} onChange={(e) => updateQuestion(q.id, "rubric", e.target.value)} />
                  </div>
                ))}

                <div className="row">
                  <button disabled={saving} onClick={saveEdits}>
                    {saving ? "Saving..." : "Save edits"}
                  </button>
                  <button className="primary" disabled={publishing} onClick={publish}>
                    {publishing ? "Publishing..." : "Publish"}
                  </button>
                </div>
              </div>

              <h3>Knowledge base (RAG)</h3>
              <div className="card col">
                <p className="muted">
                  Add reference material (a textbook excerpt, past papers) for this unit, then
                  regenerate to ground the notes and paper in it instead of just the short
                  syllabus.
                </p>
                <label>Document title</label>
                <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
                <label>Source text</label>
                <textarea value={docText} onChange={(e) => setDocText(e.target.value)} />
                <div className="row">
                  <button disabled={addingDoc || !docTitle || !docText} onClick={addDocument}>
                    {addingDoc ? "Adding..." : "Add document"}
                  </button>
                  <button disabled={regenerating} onClick={regenerate}>
                    {regenerating ? "Regenerating..." : "Regenerate with knowledge base"}
                  </button>
                </div>
              </div>

              <h3>Class weak topics</h3>
              <div className="card">
                {unitWeakTopics.length === 0 && <p className="muted">No submissions yet.</p>}
                {unitWeakTopics.length > 0 && <WeakTopicsBarChart topics={unitWeakTopics} />}
                {unitWeakTopics.length > 0 && (
                  <table>
                    <thead>
                      <tr>
                        <th>Topic</th>
                        <th>Score</th>
                        <th>Sample mistakes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unitWeakTopics.map((t) => (
                        <tr key={t.topic}>
                          <td>{t.topic}</td>
                          <td>
                            <span className={`badge ${t.isWeak ? "weak" : "ok"}`}>
                              {t.avgScorePct.toFixed(0)}%
                            </span>
                          </td>
                          <td className="muted">{t.sampleMistakes.join("; ") || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <h3>Assign remediation</h3>
              <div className="card col">
                <p className="muted">
                  Pick a weak topic to see which students in this unit are struggling with it,
                  then generate and dispatch a 4-step remediation sequence to that cohort.
                </p>
                <div className="row">
                  {unitWeakTopics
                    .filter((t) => t.isWeak)
                    .map((t) => (
                      <button
                        key={t.topic}
                        onClick={() => loadCohort(t.topic)}
                        disabled={cohortLoading}
                        style={remediationTopic === t.topic ? { borderColor: "#2563eb" } : undefined}
                      >
                        {t.topic} ({t.avgScorePct.toFixed(0)}%)
                      </button>
                    ))}
                  {unitWeakTopics.filter((t) => t.isWeak).length === 0 && (
                    <p className="muted">No weak topics in this unit yet.</p>
                  )}
                </div>

                {remediationTopic && (
                  <>
                    {cohortLoading && <p className="muted">Loading cohort...</p>}
                    {!cohortLoading && cohort.length === 0 && (
                      <p className="muted">No students currently weak in this topic.</p>
                    )}
                    {cohort.length > 0 && (
                      <div className="col">
                        <strong>Cohort ({cohort.length} students)</strong>
                        {cohort.map((c) => (
                          <label key={c.studentId} style={{ fontWeight: "normal" }}>
                            <input
                              type="checkbox"
                              checked={selectedStudentIds[c.studentId] ?? false}
                              onChange={(e) =>
                                setSelectedStudentIds((s) => ({ ...s, [c.studentId]: e.target.checked }))
                              }
                            />{" "}
                            {c.studentId} ({c.avgScorePct.toFixed(0)}%)
                          </label>
                        ))}
                        <button
                          className="primary"
                          disabled={
                            generatingRemediation ||
                            Object.values(selectedStudentIds).every((v) => !v)
                          }
                          onClick={dispatchRemediation}
                        >
                          {generatingRemediation ? "Generating..." : "Generate & assign"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {assignments.length > 0 && (
                <div className="card">
                  <strong>Dispatched assignments</strong>
                  {assignments.map((a) => (
                    <div key={a.id} className="card">
                      <p>
                        <strong>{a.plan.topic}</strong>{" "}
                        <span className="muted">
                          - {a.studentIds.length} student{a.studentIds.length === 1 ? "" : "s"} -{" "}
                          {new Date(a.createdAt).toLocaleString()}
                        </span>
                      </p>
                      {a.plan.steps.map((step) => (
                        <p key={step.order} className="muted">
                          {step.order}. <strong>{step.title}</strong> ({step.estMinutes} min) -{" "}
                          {step.description}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <h2>Weekly reports</h2>
          <div className="card col">
            <p className="muted">
              Runs automatically on a schedule (see the scheduler in backend/scheduler.py), or
              trigger one now. Email delivery is stubbed for the demo - it&apos;s logged, not
              actually sent.
            </p>
            <div className="row">
              <div>
                <label>Recipient email</label>
                <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
              </div>
              <div>
                <label>Period (days)</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={sinceDays}
                  onChange={(e) => setSinceDays(Number(e.target.value))}
                  style={{ maxWidth: "6rem" }}
                />
              </div>
            </div>
            <button className="primary" disabled={generatingReport} onClick={generateReport}>
              {generatingReport ? "Generating..." : "Generate report now"}
            </button>
          </div>

          {reports.map((r) => (
            <div key={r.id} className="card">
              <h3>
                {r.content.subject}{" "}
                <span className={`badge ${r.emailSent ? "ok" : "weak"}`}>
                  {r.emailSent ? "sent (simulated)" : "not sent"}
                </span>
              </h3>
              <p className="muted">
                {new Date(r.periodStart).toLocaleDateString()} - {new Date(r.periodEnd).toLocaleDateString()}
              </p>
              <p>
                <strong>{r.content.headline}</strong>
              </p>
              <p>{r.content.classSummary}</p>
              {r.content.studentsNeedingAttention.length > 0 && (
                <>
                  <p>
                    <strong>Students needing attention:</strong>
                  </p>
                  {r.content.studentsNeedingAttention.map((s) => (
                    <p key={s.studentId}>
                      {s.studentId}: {s.reason}
                    </p>
                  ))}
                </>
              )}
              {r.content.recommendedActions.length > 0 && (
                <>
                  <p>
                    <strong>Recommended actions:</strong>
                  </p>
                  {r.content.recommendedActions.map((a, i) => (
                    <p key={i}>- {a}</p>
                  ))}
                </>
              )}
            </div>
          ))}
        </>
      )}
    </main>
  );
}
