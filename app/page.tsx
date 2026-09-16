import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <h1>ClassPilot AI</h1>
      <p className="muted">
        An autonomous management platform for small tutoring centers: syllabus in, lecture notes
        and a question paper out, grading and weak-topic tracking automatic.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Student</h2>
        <p>Take a published unit&apos;s paper, get graded, see your weak topics, get hints.</p>
        <Link href="/student">
          <button className="primary">Go to student view</button>
        </Link>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Teacher / Admin</h2>
        <p>
          Generate a unit from a syllabus, edit and publish it, ground it in reference material,
          watch class-wide weak topics, and trigger the weekly report.
        </p>
        <Link href="/teacher">
          <button className="primary">Go to teacher view</button>
        </Link>
      </div>
    </main>
  );
}
