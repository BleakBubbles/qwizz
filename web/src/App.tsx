import { useState, useEffect, type FormEvent } from 'react'

type Option = {
  key: string
  text: string
}

type Question = {
  id: string
  prompt: string
  options: Option[]
}

type Session = {
  diffHash: string
  questions: Question[]
}

type SubmitResult = {
  passed: boolean
  explanations: Record<string, string>
}

function SiteLogo() {
  return (
    <img
      className="site-logo"
      src="/logo.svg"
      alt=""
      width={40}
      height={40}
      aria-hidden={true}
    />
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [passed, setPassed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/session.json')
      .then((r) => r.json())
      .then((data: Session) => {
        setSession(data)
        const initial: Record<string, string> = {}
        for (const q of data.questions) initial[q.id] = ''
        setAnswers(initial)
      })
  }, [])

  if (!session) {
    return (
      <>
        <SiteLogo />
        <div className="backdrop">
          <div className="container">
            <p className="loading">loading…</p>
          </div>
        </div>
      </>
    )
  }

  if (passed) {
    return (
      <>
        <SiteLogo />
        <div className="backdrop">
          <div className="container">
            <div className="header">
              <h1>qwizz</h1>
            </div>
            <div className="result result-pass">
              Passed — commit approved. You can close this tab.
            </div>
          </div>
        </div>
      </>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErrors({})

    const res = await fetch('/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ diffHash: session!.diffHash, answers }),
    })

    const result: SubmitResult = await res.json()
    setSubmitting(false)

    if (result.passed) {
      setPassed(true)
    } else {
      setErrors(result.explanations)
    }
  }

  return (
    <>
      <SiteLogo />
      <div className="backdrop">
        <div className="container">
          <div className="header">
            <h1>qwizz</h1>
          </div>

          <form onSubmit={handleSubmit}>
            {session.questions.map((q) => (
              <div key={q.id} className="question">
                <p className="question-prompt">{q.prompt}</p>
                <div className="options">
                  {q.options.map((opt) => (
                    <label
                      key={opt.key}
                      className={`option ${answers[q.id] === opt.key ? 'is-selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={opt.key}
                        checked={answers[q.id] === opt.key}
                        onChange={() =>
                          setAnswers((prev) => ({ ...prev, [q.id]: opt.key }))
                        }
                      />
                      <span className="option-text">{opt.text}</span>
                    </label>
                  ))}
                </div>
                {errors[q.id] && (
                  <p className="question-error">{errors[q.id]}</p>
                )}
              </div>
            ))}

            <div className="actions">
              <button type="submit" className="submit-btn" disabled={submitting}>
                {submitting ? 'checking…' : 'submit'}
              </button>
            </div>

            {Object.keys(errors).length > 0 && (
              <div className="result result-fail">
                Some answers need more detail. Try again.
              </div>
            )}
          </form>
        </div>
      </div>
    </>
  )
}
